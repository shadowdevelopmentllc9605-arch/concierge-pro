import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getToken(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return configs[0]?.token || null;
}

function canSend(user: any) {
  return Boolean(
    user?.business_id &&
    (user?.vendor_role === "manager" || user?.vendor_permissions?.send_notifications)
  );
}

function isBirthdayToday(value?: string) {
  if (!value) return false;
  const birthday = new Date(value);
  const now = new Date();
  return birthday.getUTCMonth() === now.getUTCMonth() && birthday.getUTCDate() === now.getUTCDate();
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!canSend(user)) return Response.json({ error: "Notification permission required" }, { status: 403 });

    const body = await req.json();
    const campaign = body?.campaign || {};
    if (!campaign.title || !campaign.message) {
      return Response.json({ error: "Title and message are required" }, { status: 400 });
    }

    const customers = await base44.asServiceRole.entities.StoreCustomer.filter({ business_id: user.business_id });
    let selected = customers;

    if (campaign.target === "in_store") {
      selected = customers.filter((c: any) => c.in_store);
    } else if (campaign.target === "vip") {
      selected = customers.filter((c: any) => Number(c.total_spent || 0) >= 1000);
    } else if (campaign.target === "birthday") {
      selected = customers.filter((c: any) => isBirthdayToday(c.birthday));
    } else if (Array.isArray(campaign.customerIds) && campaign.customerIds.length > 0) {
      const wanted = new Set(campaign.customerIds);
      selected = customers.filter((c: any) => wanted.has(c.id));
    }

    const linkedUserIds = Array.from(new Set(
      selected.map((c: any) => c.linked_customer_id).filter(Boolean)
    ));

    const notification = await base44.asServiceRole.entities.CustomerNotification.create({
      title: campaign.title,
      message: campaign.message,
      type: campaign.type || "general",
      coupon_code: campaign.coupon_code || undefined,
      discount_percent: campaign.discount_percent ? Number(campaign.discount_percent) : undefined,
      valid_until: campaign.valid_until || undefined,
      target_customers: selected.map((c: any) => c.id),
      business_id: user.business_id,
      status: "draft",
    });

    if (linkedUserIds.length === 0) {
      await base44.asServiceRole.entities.CustomerNotification.update(notification.id, {
        delivery_error: "No selected customers are linked to The Concierge yet.",
      });
      return Response.json({
        success: false,
        saved: true,
        error: "No selected customers are linked to The Concierge yet.",
        notificationId: notification.id,
      }, { status: 409 });
    }

    const token = await getToken(base44);
    if (!token) {
      await base44.asServiceRole.entities.CustomerNotification.update(notification.id, {
        delivery_error: "Customer app integration is not configured.",
      });
      return Response.json({
        success: false,
        saved: true,
        error: "Customer app integration is not configured.",
        notificationId: notification.id,
      }, { status: 409 });
    }

    const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-concierge-sync-secret": token,
      },
      body: JSON.stringify({
        action: "sendCampaign",
        userIds: linkedUserIds,
        title: campaign.title,
        message: campaign.message,
        type: campaign.type || "general",
        couponCode: campaign.coupon_code || "",
        validUntil: campaign.valid_until || "",
        vendorBusinessId: user.business_id,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = result?.error || `Customer delivery failed (${response.status})`;
      await base44.asServiceRole.entities.CustomerNotification.update(notification.id, {
        delivery_error: errorMessage,
      });
      return Response.json({ success: false, saved: true, error: errorMessage }, { status: 502 });
    }

    await base44.asServiceRole.entities.CustomerNotification.update(notification.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      delivery_error: "",
    });

    return Response.json({
      success: true,
      notificationId: notification.id,
      selectedCustomers: selected.length,
      delivered: Number(result.delivered || linkedUserIds.length),
    });
  } catch (error) {
    console.error("sendCampaign", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
