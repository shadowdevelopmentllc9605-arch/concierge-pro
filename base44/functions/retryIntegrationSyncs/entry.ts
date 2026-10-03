import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getToken(base44: any) {
  const rows = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return rows[0]?.token || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.business_id) return Response.json({ error: "Vendor membership required" }, { status: 403 });

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
