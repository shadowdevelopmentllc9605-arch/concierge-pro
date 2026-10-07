import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";

const TEST_STANDARD_PRICE_ID = "price_1UMzzk5kebGL5ByX1hXf55vL";
const TEST_FOUNDING_PRICE_ID = "price_1UMzzl5kebGL5ByXLQyUeJPv";
const LIVE_STANDARD_PRICE_ID = "price_1UN1i45ty13mCGMMULwHuQhz";
const LIVE_FOUNDING_PRICE_ID = "price_1UN1i65ty13mCGMMBjRkViha";
const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function ownedBusiness(base44: any, user: any) {
  let rows = await base44.asServiceRole.entities.Business.filter({ owner_user_id: user.id });
  if (!rows[0] && user?.data?.business_id) {
    rows = await base44.asServiceRole.entities.Business.filter({ id: user.data.business_id });
  }
  return rows[0] || null;
}

function configuredPrices(stripeSecret: string) {
  const isTest = stripeSecret.startsWith("sk_test_");
  return {
    standard:
      secrets.get("CONCIERGE_PRO_STANDARD_PRICE_ID") ||
      (isTest ? TEST_STANDARD_PRICE_ID : LIVE_STANDARD_PRICE_ID),
    founding:
      secrets.get("CONCIERGE_PRO_FOUNDING_PRICE_ID") ||
      (isTest ? TEST_FOUNDING_PRICE_ID : LIVE_FOUNDING_PRICE_ID),
  };
}

async function syncPaymentState(base44: any, business: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({
    key: "cross_app_sync",
    enabled: true,
  });
  const token = configs[0]?.token;
  if (!token) return { success: false, reason: "integration_not_configured" };

  try {
    const response = await fetch(
      `https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-concierge-sync-secret": token,
        },
        body: JSON.stringify({ action: "updateVendorPayments", business }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Customer app payment-status sync failed");
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Customer app payment-status sync failed",
    };
  }
}

function addUtcMonths(unixSeconds: number, months: number) {
  const date = new Date(unixSeconds * 1000);
  date.setUTCMonth(date.getUTCMonth() + months);
  return Math.floor(date.getTime() / 1000);
}

async function ensureFoundingSchedule(
  stripe: Stripe,
  subscription: any,
  standardPriceId: string,
  foundingPriceId: string,
  quantity: number,
) {
  if (!subscription?.id || !standardPriceId || !foundingPriceId) return null;
  if (subscription.schedule) return null;

  try {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    } as any);

    const phaseStart =
      Number((schedule as any)?.phases?.[0]?.start_date) ||
      Number(subscription.start_date) ||
      Math.floor(Date.now() / 1000);
    const foundingEnd = addUtcMonths(phaseStart, 12);

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          start_date: phaseStart,
          end_date: foundingEnd,
          items: [{ price: foundingPriceId, quantity }],
          metadata: { concierge_pro_plan: "founding" },
        },
        {
          start_date: foundingEnd,
          items: [{ price: standardPriceId, quantity }],
          metadata: { concierge_pro_plan: "standard" },
        },
      ],
    } as any);

    return foundingEnd;
  } catch (error) {
    console.warn("Unable to create founding subscription schedule", error);
    return null;
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const business = await ownedBusiness(base44, user);
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

    const key = secrets.get("STRIPE_SECRET_KEY");
    if (!key) {
      return Response.json({
        error: "Stripe is not configured",
        code: "stripe_not_configured",
      }, { status: 409 });
    }

    const stripe = new Stripe(key);
    const update: any = { platform_fee_percent: 4 };

    if (business.stripe_connected_account_id) {
      const account: any = await stripe.accounts.retrieve(business.stripe_connected_account_id);
      update.stripe_onboarding_complete = Boolean(account.details_submitted);
      update.stripe_charges_enabled = Boolean(account.charges_enabled);
      update.stripe_payouts_enabled = Boolean(account.payouts_enabled);
      update.stripe_transfers_enabled =
        account.capabilities?.transfers === "active" || Boolean(account.payouts_enabled);
    } else {
      update.stripe_onboarding_complete = false;
      update.stripe_charges_enabled = false;
      update.stripe_payouts_enabled = false;
      update.stripe_transfers_enabled = false;
    }

    let subscription: any = null;
    if (business.stripe_customer_id) {
      const subscriptions = await stripe.subscriptions.list({
        customer: business.stripe_customer_id,
        status: "all",
        limit: 20,
      });
      subscription =
        subscriptions.data.find((row: any) =>
          row.metadata?.concierge_pro_business_id === business.id &&
          !["canceled", "incomplete_expired"].includes(row.status)
        ) ||
        subscriptions.data.find((row: any) =>
          !["canceled", "incomplete_expired"].includes(row.status)
        ) ||
        subscriptions.data[0] ||
        null;
    }

    if (subscription) {
      const plan =
        subscription.metadata?.concierge_pro_plan ||
        business.billing_plan ||
        "standard";
      const quantity = Math.max(
        1,
        Number(
          subscription.metadata?.concierge_pro_location_quantity ||
          subscription.items?.data?.[0]?.quantity ||
          business.billing_location_quantity ||
          1
        )
      );
      const currentPeriodEnd =
        Number(subscription.current_period_end) ||
        Number(subscription.items?.data?.[0]?.current_period_end) ||
        0;

      update.stripe_subscription_id = subscription.id;
      update.stripe_subscription_status = subscription.status;
      update.billing_plan = plan;
      update.billing_price_id = subscription.items?.data?.[0]?.price?.id || "";
      update.billing_location_quantity = quantity;
      update.stripe_subscription_cancel_at_period_end = Boolean(subscription.cancel_at_period_end);
      if (currentPeriodEnd) {
        update.stripe_subscription_current_period_end = new Date(currentPeriodEnd * 1000).toISOString();
      }

      if (plan === "founding") {
        const start = Number(subscription.start_date) || Math.floor(Date.now() / 1000);
        let foundingEnd = addUtcMonths(start, 12);
        const prices = configuredPrices(key);
        const scheduledEnd = await ensureFoundingSchedule(
          stripe,
          subscription,
          prices.standard,
          prices.founding,
          quantity,
        );
        if (scheduledEnd) foundingEnd = scheduledEnd;
        update.founding_started_at = new Date(start * 1000).toISOString();
        update.founding_expires_at = new Date(foundingEnd * 1000).toISOString();
      }
    } else {
      update.stripe_subscription_status = "";
    }

    await base44.asServiceRole.entities.Business.update(business.id, update);
    const currentBusiness = { ...business, ...update };
    const customerAppSync = await syncPaymentState(base44, currentBusiness);

    return Response.json({
      success: true,
      connected: Boolean(currentBusiness.stripe_connected_account_id),
      subscriptionActive: ["active", "trialing"].includes(String(update.stripe_subscription_status || "")),
      customerAppSync,
      ...update,
    });
  } catch (error) {
    console.error("refreshStripeBusinessStatus", error);
    return Response.json({
      error: error instanceof Error ? error.message : "Status refresh failed",
    }, { status: 500 });
  }
}
