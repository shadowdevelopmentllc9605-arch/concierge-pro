import { createClientFromRequest } from "npm:@base44/sdk";

async function authorize(base44: any, req: Request) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  const expected = configs[0]?.token;
  const provided = req.headers.get("x-concierge-sync-secret");
  return Boolean(expected && provided && expected === provided);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await authorize(base44, req))) {
      return Response.json({ error: "Unauthorized integration request" }, { status: 401 });
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "checkin") {
      const { businessId, locationId, externalCheckinId, customer } = body;
      if (!businessId || !customer?.user_id) {
        return Response.json({ error: "Missing customer or business identity" }, { status: 400 });
      }

      const businesses = await base44.asServiceRole.entities.Business.filter({ id: businessId });
      if (!businesses[0]) return Response.json({ error: "Business not found" }, { status: 404 });

      const inventory = await base44.asServiceRole.entities.InventoryItem.filter({ business_id: businessId });
      const inventoryByProduct = new Map(
        inventory.filter((item: any) => item.linked_product_id).map((item: any) => [item.linked_product_id, item.id])
      );
      const wishlistItems = (customer.wishlist || [])
        .map((item: any) => inventoryByProduct.get(item.product_id))
        .filter(Boolean);

      const existing = await base44.asServiceRole.entities.StoreCustomer.filter({
        linked_customer_id: customer.user_id,
        business_id: businessId,
      });

      const now = new Date().toISOString();
      const data = {
        name: customer.name,
        email: customer.email || "",
        photo_url: customer.photo_url || "",
        linked_customer_id: customer.user_id,
        in_store: true,
        location_id: locationId || "",
        entered_at: now,
        wishlist_items: wishlistItems,
        birthday: customer.birthday || undefined,
        preferences: customer.preferences || {},
        last_visit: now,
        business_id: businessId,
      };

      let storeCustomer;
      if (existing[0]) {
        const visitCount = Number(existing[0].visit_count || 0) + 1;
        await base44.asServiceRole.entities.StoreCustomer.update(existing[0].id, { ...data, visit_count: visitCount });
        storeCustomer = { ...existing[0], ...data, visit_count: visitCount };
      } else {
        storeCustomer = await base44.asServiceRole.entities.StoreCustomer.create({ ...data, visit_count: 1 });
      }

      const visits = externalCheckinId
        ? await base44.asServiceRole.entities.StoreVisit.filter({ external_checkin_id: externalCheckinId, business_id: businessId })
        : [];
      if (!visits[0]) {
        await base44.asServiceRole.entities.StoreVisit.create({
          business_id: businessId,
          location_id: locationId || "",
          customer_id: storeCustomer.id,
          external_checkin_id: externalCheckinId || "",
          entered_at: now,
          status: "active",
        });
        await base44.asServiceRole.entities.StoreAlert.create({
          business_id: businessId,
          location_id: locationId || "",
          customer_id: storeCustomer.id,
          title: "Customer entered the store",
          message: `${customer.name} checked in and is ready for assistance.`,
          type: "customer_entry",
          read_by: [],
        });
      }

      return Response.json({ success: true, customerId: storeCustomer.id });
    }

    if (action === "tryOnRequest") {
      const { businessId, customerId, productIds = [] } = body;
      const customers = await base44.asServiceRole.entities.StoreCustomer.filter({
        linked_customer_id: customerId,
        business_id: businessId,
      });
      const customer = customers[0];
      if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

      const inventoryIds = [];
      for (const productId of productIds) {
        const items = await base44.asServiceRole.entities.InventoryItem.filter({
          linked_product_id: productId,
          business_id: businessId,
        });
        if (items[0]) inventoryIds.push(items[0].id);
      }

      await base44.asServiceRole.entities.StoreCustomer.update(customer.id, {
        try_on_request_items: inventoryIds,
      });
      await base44.asServiceRole.entities.StoreAlert.create({
        business_id: businessId,
        location_id: customer.location_id || "",
        customer_id: customer.id,
        title: "Try-on request",
        message: `${customer.name} requested ${inventoryIds.length} item${inventoryIds.length === 1 ? "" : "s"} for try-on.`,
        type: "try_on_request",
        read_by: [],
      });
      return Response.json({ success: true, requestedItems: inventoryIds.length });
    }

    if (action === "checkout") {
      const { businessId, externalCheckinId, customerId } = body;
      const customers = await base44.asServiceRole.entities.StoreCustomer.filter({
        linked_customer_id: customerId,
        business_id: businessId,
      });
      if (customers[0]) {
        await base44.asServiceRole.entities.StoreCustomer.update(customers[0].id, { in_store: false });
      }

      if (externalCheckinId) {
        const visits = await base44.asServiceRole.entities.StoreVisit.filter({
          external_checkin_id: externalCheckinId,
          business_id: businessId,
        });
        if (visits[0]) {
          await base44.asServiceRole.entities.StoreVisit.update(visits[0].id, {
            status: "completed",
            exited_at: new Date().toISOString(),
          });
        }
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("receiveCustomerEvent", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
