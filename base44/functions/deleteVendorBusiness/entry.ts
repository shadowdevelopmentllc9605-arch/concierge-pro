import { createClientFromRequest } from "npm:@base44/sdk";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.business_id || user?.vendor_role !== "manager") {
      return Response.json({ error: "Manager access required" }, { status: 403 });
    }

    const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
    const business = businesses[0];
    if (!business || business.owner_user_id !== user.id) {
      return Response.json({ error: "Only the business owner can delete the business" }, { status: 403 });
    }

    const entityNames = [
      "CustomerNotification",
      "Purchase",
      "FittingRoom",
      "StoreVisit",
      "StoreCustomer",
      "InventoryItem",
      "BusinessLocation",
      "Employee",
    ];

    for (const entityName of entityNames) {
      const entity = (base44.asServiceRole.entities as any)[entityName];
      try {
        const rows = await entity.filter({ business_id: user.business_id });
        for (const row of rows) await entity.delete(row.id);
      } catch (error) {
        console.warn(`Could not clean ${entityName}`, error);
      }
    }

    await base44.asServiceRole.entities.Business.delete(user.business_id);
    await base44.asServiceRole.entities.User.update(user.id, {
      business_id: "",
      vendor_role: "",
      vendor_permissions: {},
    });

    return Response.json({
      success: true,
      authAccountDeleted: false,
      uploadedFilesDeleted: false,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
