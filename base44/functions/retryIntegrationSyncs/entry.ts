import { createClientFromRequest } from "npm:@base44/sdk";
import { getActiveEmployee } from "../../shared/employeeAccess.ts";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getToken(base44: any) {
  const rows = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return rows[0]?.token || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.business_id) return Response.json({ error: "Vendor membership required" }, { status: 403 });

    // Employee.status is authoritative: reject deactivated/missing memberships.
    if (!(await getActiveEmployee(base44, user))) {
      return Response.json({ error: "Vendor membership is inactive" }, { status: 403 });
    }

    const token = await getToken(base44);
    if (!token) return Response.json({ error: "Integration is not configured" }, { status: 409 });

    const jobs = await base44.asServiceRole.entities.IntegrationSyncJob.filter({
      business_id: user.business_id,
      direction: "to_customer",
    });

    const pending = jobs
      .filter((job: any) => job.status !== "completed")
      .slice(0, 25);

    let completed = 0;
    const failures: any[] = [];

    for (const job of pending) {
      try {
        const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-concierge-sync-secret": token,
          },
          body: job.payload_json,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || `Sync failed (${response.status})`);

        await base44.asServiceRole.entities.IntegrationSyncJob.update(job.id, {
          status: "completed",
          attempts: Number(job.attempts || 0) + 1,
          last_error: "",
          last_attempt_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });

        if (job.action === "syncCatalog") {
          for (const mapping of result.mappings || []) {
            const inventory = await base44.asServiceRole.entities.InventoryItem.filter({
              id: mapping.inventoryId,
              business_id: user.business_id,
            });
            if (inventory[0]) {
              await base44.asServiceRole.entities.InventoryItem.update(inventory[0].id, {
                linked_product_id: mapping.productId,
              });
            }
          }
          await base44.asServiceRole.entities.Business.update(user.business_id, {
            linked_customer_app_id: CUSTOMER_APP_ID,
          });
        } else if (job.action === "completePurchase") {
          const payload = JSON.parse(job.payload_json || "{}");
          const purchases = await base44.asServiceRole.entities.Purchase.filter({
            business_id: user.business_id,
            external_purchase_id: payload.externalPurchaseId,
          });
          if (purchases[0]) {
            await base44.asServiceRole.entities.Purchase.update(purchases[0].id, {
              synced_to_customer: true,
              sync_error: "",
            });
          }
        } else if (job.action === "sendCampaign") {
          const notificationId = String(job.event_key || "").startsWith("campaign:")
            ? String(job.event_key).slice("campaign:".length)
            : "";
          if (notificationId) {
            const notifications = await base44.asServiceRole.entities.CustomerNotification.filter({
              id: notificationId,
              business_id: user.business_id,
            });
            if (notifications[0]) {
              await base44.asServiceRole.entities.CustomerNotification.update(notifications[0].id, {
                status: "sent",
                sent_at: new Date().toISOString(),
                delivery_error: "",
              });
            }
          }
        }

        completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        await base44.asServiceRole.entities.IntegrationSyncJob.update(job.id, {
          status: "pending",
          attempts: Number(job.attempts || 0) + 1,
          last_error: message,
          last_attempt_at: new Date().toISOString(),
        });
        failures.push({ eventKey: job.event_key, error: message });
      }
    }

    return Response.json({ success: true, attempted: pending.length, completed, failures });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}