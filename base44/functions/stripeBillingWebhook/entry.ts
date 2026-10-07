import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";
const TEST_STANDARD_PRICE_ID = "price_1UMzzk5kebGL5ByX1hXf55vL";
const TEST_FOUNDING_PRICE_ID = "price_1UMzzl5kebGL5ByXLQyUeJPv";
const LIVE_STANDARD_PRICE_ID = "price_1UN1i45ty13mCGMMULwHuQhz";
const LIVE_FOUNDING_PRICE_ID = "price_1UN1i65ty13mCGMMBjRkViha";

function pricesForMode(stripeSecret: string) {
  const testMode = stripeSecret.startsWith("sk_test_");
  return {
    standard:
      secrets.get("CONCIERGE_PRO_STANDARD_PRICE_ID") ||
      (testMode ? TEST_STANDARD_PRICE_ID : LIVE_STANDARD_PRICE_ID),
    founding:
      secrets.get("CONCIERGE_PRO_FOUNDING_PRICE_ID") ||
      (testMode ? TEST_FOUNDING_PRICE_ID : LIVE_FOUNDING_PRICE_ID),
  };
}

function addUtcMonths(unixSeconds: number, months: number) {
  const date = new Date(unixSeconds * 1000);
  date.setUTCMonth(date.getUTCMonth() + months);
  return Math.floor(date.getTime() / 1000);
}

async function syncPaymentState(base44: any, business: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({
    key: "cross_app_sync",
    enabled: true,
  });
  const token = configs[0]?.token;
  if (!token) return;

  try {
    await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-concierge-sync-secret": token,
      },
      body: JSON.stringify({ action: "updateVendorPayments", business }),
    });
  } catch (error) {
    console.warn("Customer app payment-state sync failed", error);
  }
}

async function findBusinessForSubscription(base44: any, subscription: any) {
  const businessId = subscription?.metadata?.concierge_pro_business_id;
  if (businessId) {
    const rows = await base44.asServiceRole.entities.Business.filter({ id: businessId });
    if (rows[0]) return rows[0];
  }

  if (subscription?.id) {
    const rows = await base44.asServiceRole.entities.Business.filter({
      stripe_subscription_id: subscription.id,
    });
    if (rows[0]) return rows[0];
  }

  const customerId =
    typeof subscription?.customer === "string"
      ? subscription.customer
      : subscription?.customer?.id;
  if (customerId) {
    const rows = await base44.asServiceRole.entities.Business.filter({
      stripe_customer_id: customerId,
    });
    if (rows[0]) return rows[0];
  }
  return null;
}

async function ensureFoundingSchedule(
  stripe: Stripe,
  subscription: any,
  plan: string,
  quantity: number,
  stripeSecret: string,
) {
  if (plan !== "founding" || subscription?.schedule) return null;
  const prices = pricesForMode(stripeSecret);
  if (!prices.standard || !prices.founding) return null;

  try {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    } as any);
    const start =
      Number((schedule as any)?.phases?.[0]?.start_date) ||
      Number(subscription.start_date) ||
      Math.floor(Date.now() / 1000);
    const foundingEnd = addUtcMonths(start, 12);

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          start_date: start,
          end_date: foundingEnd,
          items: [{ price: prices.founding, quantity }],
          metadata: { concierge_pro_plan: "founding" },
        },
        {
          start_date: foundingEnd,
          items: [{ price: prices.standard, quantity }],
          metadata: { concierge_pro_plan: "standard" },
        },
      ],
    } as any);
    return foundingEnd;
  } catch (error) {
    console.warn("Founding plan schedule could not be created automatically", error);
    return null;
  }
}

async function applySubscription(
  base44: any,
  stripe: Stripe,
  stripeSecret: string,
  subscription: any,
) {
  const business = await findBusinessForSubscription(base44, subscription);
  if (!business) return;

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

  const update: any = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    billing_plan: plan,
    billing_price_id: subscription.items?.data?.[0]?.price?.id || "",
    billing_location_quantity: quantity,
    platform_fee_percent: 4,
  };

  if (currentPeriodEnd) {
    update.stripe_subscription_current_period_end =
      new Date(currentPeriodEnd * 1000).toISOString();
  }

  if (plan === "founding") {
    const start = Number(subscription.start_date) || Math.floor(Date.now() / 1000);
    const scheduledEnd =
      await ensureFoundingSchedule(stripe, subscription, plan, quantity, stripeSecret);
    const foundingEnd = scheduledEnd || addUtcMonths(start, 12);
    update.founding_started_at = new Date(start * 1000).toISOString();
    update.founding_expires_at = new Date(foundingEnd * 1000).toISOString();
  }

  await base44.asServiceRole.entities.Business.update(business.id, update);
  await syncPaymentState(base44, { ...business, ...update });
}

async function applyPaidInvoice(base44: any, stripe: Stripe, invoice: any) {
  if (!invoice?.id) return;
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
  for (const line of lines.data as any[]) {
    if (line.metadata?.concierge_platform_fee !== "true") continue;
    const businessId = line.metadata?.concierge_pro_business_id;
    const externalPurchaseId = line.metadata?.concierge_external_purchase_id;
    if (!businessId || !externalPurchaseId) continue;

    const purchases = await base44.asServiceRole.entities.Purchase.filter({
      business_id: businessId,
      external_purchase_id: externalPurchaseId,
    });
    if (purchases[0]) {
      await base44.asServiceRole.entities.Purchase.update(purchases[0].id, {
        platform_fee_status: "collected",
      });
    }
  }
}

async function applyConnectedAccount(base44: any, account: any) {
  const rows = await base44.asServiceRole.entities.Business.filter({
    stripe_connected_account_id: account.id,
  });
  const business = rows[0];
  if (!business) return;

  const update = {
    stripe_onboarding_complete: Boolean(account.details_submitted),
    stripe_charges_enabled: Boolean(account.charges_enabled),
    stripe_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_transfers_enabled:
      account.capabilities?.transfers === "active" || Boolean(account.payouts_enabled),
    platform_fee_percent: 4,
  };

  await base44.asServiceRole.entities.Business.update(business.id, update);
  await syncPaymentState(base44, { ...business, ...update });
}

export default async function (req: Request): Promise<Response> {
  try {
    const stripeSecret = secrets.get("STRIPE_SECRET_KEY");
    const webhookSecrets = Array.from(new Set([
      secrets.get("STRIPE_BILLING_WEBHOOK_SECRET"),
      secrets.get("STRIPE_CONNECT_WEBHOOK_SECRET"),
      secrets.get("STRIPE_WEBHOOK_SECRET"),
    ].filter(Boolean)));

    if (!stripeSecret || webhookSecrets.length === 0) {
      return Response.json(
        { error: "Stripe billing webhook is not configured." },
        { status: 503 },
      );
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
    }

    const rawBody = await req.text();
    const stripe = new Stripe(stripeSecret);
    let event: Stripe.Event | null = null;
    for (const webhookSecret of webhookSecrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          signature,
          webhookSecret,
        );
        break;
      } catch {
        // Try the next authorized Stripe endpoint secret.
      }
    }
    if (!event) {
      console.warn("Stripe billing/connect webhook signature verification failed");
      return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    if (event.type === "checkout.session.completed") {
      const session: any = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(base44, stripe, stripeSecret, subscription);
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await applySubscription(base44, stripe, stripeSecret, event.data.object as any);
    } else if (event.type === "invoice.paid") {
      await applyPaidInvoice(base44, stripe, event.data.object as any);
    } else if (event.type === "account.updated") {
      await applyConnectedAccount(base44, event.data.object as any);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("stripeBillingWebhook", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 },
    );
  }
}
