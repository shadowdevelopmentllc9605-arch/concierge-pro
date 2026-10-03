import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getToken(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return configs[0]?.token || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.business_id || user?.vendor_role !== "manager") {
      return Response.json({ error: "Manager access required" }, { status: 403 });
    }

    const token = await getToken(base44);
    if (!token) return Response.json({ error: "Customer app integration is not configured" }, { status: 409 });

    const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
    const business = businesses[0];
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

    const [locations, items] = await Promise.all([
      base44.asServiceRole.entities.BusinessLocation.filter({ business_id: user.business_id, active: true }),
      base44.asServiceRole.entities.InventoryItem.filter({ business_id: user.business_id }),
    ]);

    const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-concierge-sync-secret": token,
      },
      body: JSON.stringify({
        action: "syncCatalog",
        business: {
          ...business,
          style_categories: Array.from(new Set(items.map((item: any) => item.style_type).filter(Boolean))),
        },
        locations,
        items,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || `Customer app sync failed (${response.status})`);

    for (const mapping of result.mappings || []) {
      const inventory = await base44.asServiceRole.entities.InventoryItem.filter({ id: mapping.inventoryId, business_id: user.business_id });
      if (inventory[0]) {
        await base44.asServiceRole.entities.InventoryItem.update(inventory[0].id, { linked_product_id: mapping.productId });
      }
    }

    await base44.asServiceRole.entities.Business.update(user.business_id, {
      linked_customer_app_id: CUSTOMER_APP_ID,
    });

    return Response.json({ success: true, vendorId: result.vendorId, syncedItems: (result.mappings || []).length });
  } catch (error) {
    console.error("syncVendorCatalog", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
