import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";

function appOrigin(req: Request) {
  const raw = req.headers.get("origin") || "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

async function ownedBusiness(base44: any, user: any) {
  let rows = await base44.asServiceRole.entities.Business.filter({ owner_user_id: user.id });
  if (!rows[0] && user?.data?.business_id) {
    rows = await base44.asServiceRole.entities.Business.filter({ id: user.data.business_id });
  }
  return rows[0] || null;
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
        error: "Stripe Connect is not configured. Add the Stripe sandbox secret key before testing onboarding.",
        code: "stripe_not_configured",
      }, { status: 409 });
    }

    const origin = appOrigin(req);
    if (!origin) return Response.json({ error: "Valid app origin required" }, { status: 400 });

    const stripe = new Stripe(key);
    let accountId = business.stripe_connected_account_id || "";

    if (!accountId) {
      try {
        const account = await stripe.accounts.create({
          country: "US",
          email: business.email || user.email || undefined,
          controller: {
            stripe_dashboard: { type: "express" },
            fees: { payer: "application" },
            losses: { payments: "application" },
          },
          capabilities: {
            transfers: { requested: true },
          },
          metadata: {
            concierge_pro_business_id: business.id,
            concierge_connect_model: "marketplace_destination_charges",
          },
        });
        accountId = account.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connected account creation failed";
        if (/loss|liabil|platform profile/i.test(message)) {
          return Response.json({
            error: "Stripe requires the marketplace loss-liability acknowledgement in the Connect platform profile before new retailer accounts can be created.",
            code: "connect_platform_profile_required",
            detail: message,
          }, { status: 409 });
        }
        throw error;
      }

      await base44.asServiceRole.entities.Business.update(business.id, {
        stripe_connected_account_id: accountId,
        platform_fee_percent: 4,
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/BusinessSetup?stripe=refresh`,
      return_url: `${origin}/BusinessSetup?stripe=return`,
      type: "account_onboarding",
    });

    return Response.json({
      success: true,
      url: link.url,
      accountId,
      connectModel: "marketplace_destination_charges",
      platformFeePercent: 4,
    });
  } catch (error) {
    console.error("createConnectOnboarding", error);
    return Response.json({
      error: error instanceof Error ? error.message : "Stripe onboarding failed",
    }, { status: 500 });
  }
}
