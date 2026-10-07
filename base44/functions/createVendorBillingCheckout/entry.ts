import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";

const TEST_STANDARD_PRICE_ID = "price_1UMzzk5kebGL5ByX1hXf55vL";
const TEST_FOUNDING_PRICE_ID = "price_1UMzzl5kebGL5ByXLQyUeJPv";
const LIVE_STANDARD_PRICE_ID = "price_1UN1i45ty13mCGMMULwHuQhz";
const LIVE_FOUNDING_PRICE_ID = "price_1UN1i65ty13mCGMMBjRkViha";
const FOUNDING_RETAILER_LIMIT = 20;
const PLATFORM_FEE_PERCENT = 4;

function safeOrigin(req: Request) {
  try {
    const url = new URL(req.headers.get("origin") || "");
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

async function businessFor(base44: any, user: any) {
  let rows = await base44.asServiceRole.entities.Business.filter({ owner_user_id: user.id });
  if (!rows[0] && user?.data?.business_id) {
    rows = await base44.asServiceRole.entities.Business.filter({ id: user.data.business_id });
  }
  return rows[0] || null;
}

function priceIds(stripeSecret: string) {
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

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const business = await businessFor(base44, user);
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

    const stripeSecret = secrets.get("STRIPE_SECRET_KEY");
    const origin = safeOrigin(req);
    if (!stripeSecret) {
      return Response.json({
        error: "Stripe Billing is not configured. Add the appropriate Stripe secret key for the current environment.",
        code: "billing_not_configured",
      }, { status: 409 });
    }
    if (!origin) return Response.json({ error: "Valid app origin required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    let requestedPlan = body?.plan === "standard" ? "standard" : "founding";

    if (["active", "trialing", "past_due", "unpaid"].includes(String(business.stripe_subscription_status || ""))) {
      return Response.json({
        error: "This business already has a Stripe subscription.",
        code: "subscription_exists",
        subscriptionStatus: business.stripe_subscription_status,
      }, { status: 409 });
    }

    if (requestedPlan === "founding" && business.billing_plan !== "founding") {
      const foundingBusinesses = await base44.asServiceRole.entities.Business.filter({ billing_plan: "founding" });
      if (foundingBusinesses.length >= FOUNDING_RETAILER_LIMIT) requestedPlan = "standard";
    }

    const prices = priceIds(stripeSecret);
    const priceId = requestedPlan === "founding" ? prices.founding : prices.standard;
    if (!priceId) {
      return Response.json({
        error: `The ${requestedPlan} Concierge Pro price is not configured for this Stripe mode.`,
        code: "price_not_configured",
      }, { status: 409 });
    }

    const locations = await base44.asServiceRole.entities.BusinessLocation.filter({
      business_id: business.id,
      active: true,
    });
    const locationQuantity = Math.max(1, locations.length);

    const stripe = new Stripe(stripeSecret);
    let customerId = business.stripe_customer_id || "";
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: business.email || user.email || undefined,
        name: business.name,
        metadata: { concierge_pro_business_id: business.id },
      });
      customerId = customer.id;
      await base44.asServiceRole.entities.Business.update(business.id, {
        stripe_customer_id: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: locationQuantity }],
      automatic_tax: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      allow_promotion_codes: false,
      subscription_data: {
        metadata: {
          concierge_pro_business_id: business.id,
          concierge_pro_plan: requestedPlan,
          concierge_pro_location_quantity: String(locationQuantity),
          concierge_platform_fee_percent: String(PLATFORM_FEE_PERCENT),
        },
      },
      metadata: {
        concierge_pro_business_id: business.id,
        concierge_pro_plan: requestedPlan,
        concierge_pro_location_quantity: String(locationQuantity),
      },
      success_url: `${origin}/BusinessSetup?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/BusinessSetup?billing=cancel`,
    });

    return Response.json({
      success: true,
      url: session.url,
      sessionId: session.id,
      plan: requestedPlan,
      monthlyPerLocation: requestedPlan === "founding" ? 99 : 149,
      locationQuantity,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      foundingLimit: FOUNDING_RETAILER_LIMIT,
    });
  } catch (error) {
    console.error("createVendorBillingCheckout", error);
    return Response.json({
      error: error instanceof Error ? error.message : "Billing checkout failed",
    }, { status: 500 });
  }
}
