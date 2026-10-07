import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getSyncToken(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({
    key: "cross_app_sync",
    enabled: true,
  });
  return configs[0]?.token || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.business_id || user?.vendor_role !== "manager") {
      return Response.json({ error: "Manager access required" }, { status: 403 });
    }

    const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
    const business = businesses[0];
    // Ownership is verified against the built-in creator stamp (created_by_id),
    // which app users cannot edit — a manager who rewrote the client-settable
    // owner_user_id field (e.g. from the settings form) fails this check.
    const isOwner = Boolean(
      business &&
      business.created_by_id === user.id &&
      (!business.owner_user_id || business.owner_user_id === user.id),
    );
    if (!isOwner) {
      return Response.json({ error: "Only the business owner can delete the business" }, { status: 403 });
    }

    const employees = await base44.asServiceRole.entities.Employee.filter({
      business_id: user.business_id,
    });

    for (const employee of employees) {
      if (!employee.user_id || employee.user_id === user.id) continue;
      try {
        await base44.asServiceRole.entities.User.update(employee.user_id, {
          business_id: "",
          vendor_role: "",
          vendor_permissions: {},
        });
      } catch (error) {
        console.warn("Could not revoke employee user membership", error);
      }
    }

    let customerAppCleaned = false;
    const token = await getSyncToken(base44);
    if (token) {
      try {
        const response = await fetch(
          `https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-concierge-sync-secret": token,
            },
            body: JSON.stringify({
              action: "deleteVendor",
              businessId: user.business_id,
            }),
          },
        );
        customerAppCleaned = response.ok;
      } catch (error) {
        console.warn("Customer app vendor cleanup failed", error);
      }
    }

    const entityNames = [
      "StoreAlert",
      "CustomerNotification",
      "Purchase",
      "PayrollRecord",
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
    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({
      success: true,
      authAccountDeleted: true,
      uploadedFilesDeleted: false,
      customerAppCleaned,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}