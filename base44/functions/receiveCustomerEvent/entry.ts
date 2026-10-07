import { createClientFromRequest } from "npm:@base44/sdk";

// Constant-time comparison: hash both values and compare every byte of the
// digests regardless of where a mismatch occurs, so response timing leaks
// nothing about the stored token.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

async function authorize(base44: any, req: Request) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  const expected = configs[0]?.token;
  const provided = req.headers.get("x-concierge-sync-secret");
  if (!expected || !provided) return false;
  const [expectedHash, providedHash] = await Promise.all([sha256(expected), sha256(provided)]);
  return timingSafeEqual(expectedHash, providedHash);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await authorize(base44, req))) {
      return Response.json({ error: "Unauthorized integration request" }, { status: 401 });
    }

    const body = await req.json();
    const action = body?.action;
    const eventKey = body?.eventKey || "";

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
      const visits = externalCheckinId
        ? await base44.asServiceRole.entities.StoreVisit.filter({ external_checkin_id: externalCheckinId, business_id: businessId })
        : [];
      const isNewVisit = !visits[0];

      const now = new Date().toISOString();
      const data = {
        name: customer.name,
        email: customer.email || "",
        photo_url: customer.photo_url || "",
        linked_customer_id: customer.user_id,
        in_store: true,
        location_id: locationId || "",
        entered_at: existing[0]?.entered_at || now,
        wishlist_items: wishlistItems,
        birthday: customer.birthday || undefined,
        preferences: customer.preferences || {},
        last_visit: isNewVisit ? now : (existing[0]?.last_visit || now),
        business_id: businessId,
      };

      let storeCustomer;
      if (existing[0]) {
        const visitCount = Number(existing[0].visit_count || 0) + (isNewVisit ? 1 : 0);
        await base44.asServiceRole.entities.StoreCustomer.update(existing[0].id, { ...data, visit_count: visitCount });
        storeCustomer = { ...existing[0], ...data, visit_count: visitCount };
      } else {
        storeCustomer = await base44.asServiceRole.entities.StoreCustomer.create({ ...data, visit_count: isNewVisit ? 1 : 0 });
      }

      if (isNewVisit) {
        await base44.asServiceRole.entities.StoreVisit.create({
          business_id: businessId,
          location_id: locationId || "",
          customer_id: storeCustomer.id,
          external_checkin_id: externalCheckinId || "",
          entered_at: now,
          status: "active",
        });
        const alertKey = eventKey || `checkin:${externalCheckinId || storeCustomer.id}`;
        const alerts = await base44.asServiceRole.entities.StoreAlert.filter({
          business_id: businessId,
          external_event_key: alertKey,
        });
        if (!alerts[0]) {
          await base44.asServiceRole.entities.StoreAlert.create({
            business_id: businessId,
            location_id: locationId || "",
            customer_id: storeCustomer.id,
            title: "Customer entered the store",
            message: `${customer.name} checked in and is ready for assistance.`,
            type: "customer_entry",
            read_by: [],
            external_event_key: alertKey,
          });
        }
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
      const alertKey = eventKey || `tryOn:${businessId}:${customer.id}:${productIds.slice().sort().join(",")}`;
      const alerts = await base44.asServiceRole.entities.StoreAlert.filter({
        business_id: businessId,
        external_event_key: alertKey,
      });
      if (!alerts[0]) {
        await base44.asServiceRole.entities.StoreAlert.create({
          business_id: businessId,
          location_id: customer.location_id || "",
          customer_id: customer.id,
          title: "Try-on request",
          message: `${customer.name} requested ${inventoryIds.length} item${inventoryIds.length === 1 ? "" : "s"} for try-on.`,
          type: "try_on_request",
          read_by: [],
          external_event_key: alertKey,
        });
      }
      return Response.json({ success: true, requestedItems: inventoryIds.length });
    }

    if (action === "onlinePurchase") {
      const { businessId, externalOrderId, customer, items = [], orderTotals = {}, attribution = {} } = body;
      if (!businessId || !externalOrderId || !customer?.user_id || !items.length) {
        return Response.json({ error: "Missing online purchase data" }, { status: 400 });
      }

      const customerMatches = await base44.asServiceRole.entities.StoreCustomer.filter({
        linked_customer_id: customer.user_id,
        business_id: businessId,
      });

      let storeCustomer = customerMatches[0] || null;
      if (!storeCustomer) {
        storeCustomer = await base44.asServiceRole.entities.StoreCustomer.create({
          name: customer.name || customer.email || "Online customer",
          email: customer.email || "",
          linked_customer_id: customer.user_id,
          in_store: false,
          business_id: businessId,
          total_spent: 0,
          visit_count: 0,
          processed_purchase_events: [],
        });
      }

      const existingPurchases = await base44.asServiceRole.entities.Purchase.filter({
        business_id: businessId,
        external_purchase_id: externalOrderId,
      });
      let purchase = existingPurchases[0] || null;

      if (!purchase) {
        purchase = await base44.asServiceRole.entities.Purchase.create({
          customer_id: storeCustomer.id,
          employee_id: "",
          items: [],
          subtotal: Number(orderTotals.subtotal || 0),
          tax: Number(orderTotals.tax || 0),
          shipping: Number(orderTotals.shipping || 0),
          discount: Number(orderTotals.discount || 0),
          total: Number(orderTotals.total || 0),
          payment_method: "credit_card",
          payment_provider: "stripe",
          status: "processing",
          business_id: businessId,
          external_purchase_id: externalOrderId,
          concierge_attributed: Boolean(attribution.attributed),
          attribution_source: attribution.source || "concierge_online",
          attribution_event_id: externalOrderId,
          platform_fee_percent: Number(attribution.platformFeePercent || 4),
          platform_fee_amount: Number(attribution.platformFeeAmount || 0),
          platform_fee_status: attribution.platformFeeStatus || "collected",
          synced_to_customer: true,
        });
      } else if (purchase.status === "completed") {
        return Response.json({ success: true, duplicate: true, purchaseId: purchase.id });
      }

      const purchaseItems: any[] = [];
      const warnings: string[] = [];

      for (const incoming of items) {
        const inventoryMatches = await base44.asServiceRole.entities.InventoryItem.filter({
          linked_product_id: incoming.product_id,
          business_id: businessId,
        });
        const inventory = inventoryMatches[0];
        if (!inventory) {
          warnings.push(`Inventory mapping missing for ${incoming.name || incoming.product_id}`);
          continue;
        }

        const quantity = Math.max(1, Math.floor(Number(incoming.quantity || 1)));
        const price = Number(incoming.price ?? inventory.price ?? 0);
        const stockEventKey = `online:${externalOrderId}:${incoming.line_key || [incoming.product_id, incoming.size, incoming.width_code, incoming.color].join(":")}`;
        const processed = Array.isArray(inventory.processed_stock_events)
          ? inventory.processed_stock_events
          : [];

        if (!processed.includes(stockEventKey)) {
          const update: any = {
            processed_stock_events: [...processed, stockEventKey].slice(-250),
          };

          if (Array.isArray(inventory.variants) && inventory.variants.length > 0) {
            let matched = false;
            update.variants = inventory.variants.map((variant: any) => {
              if (
                String(variant.size || "") === String(incoming.size || "") &&
                String(variant.width_code || "") === String(incoming.width_code || "") &&
                String(variant.color || "") === String(incoming.color || "")
              ) {
                matched = true;
                const before = Math.max(0, Number(variant.stock_quantity || 0));
                if (quantity > before) warnings.push(`Oversold ${inventory.name} ${incoming.size || ""} ${incoming.width_code || ""} ${incoming.color || ""}`.trim());
                return { ...variant, stock_quantity: Math.max(0, before - quantity) };
              }
              return variant;
            });
            if (!matched) warnings.push(`Variant mapping missing for ${inventory.name}`);
            update.stock_quantity = update.variants.reduce(
              (sum: number, variant: any) => sum + Math.max(0, Number(variant.stock_quantity || 0)),
              0,
            );
          } else {
            const before = Math.max(0, Number(inventory.stock_quantity || 0));
            if (quantity > before) warnings.push(`Oversold ${inventory.name}`);
            update.stock_quantity = Math.max(0, before - quantity);
          }

          await base44.asServiceRole.entities.InventoryItem.update(inventory.id, update);
        }

        purchaseItems.push({
          inventory_item_id: inventory.id,
          name: inventory.name,
          quantity,
          price,
          size: incoming.size || "",
          width_code: incoming.width_code || "",
          color: incoming.color || "",
        });
      }

      if (!purchaseItems.length) {
        await base44.asServiceRole.entities.Purchase.update(purchase.id, {
          status: "cancelled",
          sync_error: "No linked vendor inventory items were found",
        });
        return Response.json({ error: "No linked vendor inventory items were found" }, { status: 409 });
      }

      await base44.asServiceRole.entities.Purchase.update(purchase.id, {
        items: purchaseItems,
        subtotal: Number(orderTotals.subtotal || 0),
        tax: Number(orderTotals.tax || 0),
        shipping: Number(orderTotals.shipping || 0),
        discount: Number(orderTotals.discount || 0),
        total: Number(orderTotals.total || 0),
        concierge_attributed: Boolean(attribution.attributed),
        attribution_source: attribution.source || "concierge_online",
        attribution_event_id: externalOrderId,
        platform_fee_percent: Number(attribution.platformFeePercent || 4),
        platform_fee_amount: Number(attribution.platformFeeAmount || 0),
        platform_fee_status: attribution.platformFeeStatus || "collected",
        status: "completed",
        sync_error: warnings.join(" | "),
      });

      const spendEvent = `online:${externalOrderId}`;
      const processedSpends = Array.isArray(storeCustomer.processed_purchase_events)
        ? storeCustomer.processed_purchase_events
        : [];
      if (!processedSpends.includes(spendEvent)) {
        await base44.asServiceRole.entities.StoreCustomer.update(storeCustomer.id, {
          total_spent: Number(storeCustomer.total_spent || 0) + Number(orderTotals.total || 0),
          last_visit: new Date().toISOString(),
          processed_purchase_events: [...processedSpends, spendEvent].slice(-250),
        });
      }

      return Response.json({
        success: true,
        purchaseId: purchase.id,
        warnings,
      });
    }

    if (action === "onlineRefund") {
      const { businessId, externalOrderId, platformFeeStatus, platformFeeAmount } = body;
      if (!businessId || !externalOrderId) {
        return Response.json({ error: "Missing online refund data" }, { status: 400 });
      }
      const purchases = await base44.asServiceRole.entities.Purchase.filter({
        business_id: businessId,
        external_purchase_id: externalOrderId,
      });
      if (purchases[0]) {
        await base44.asServiceRole.entities.Purchase.update(purchases[0].id, {
          status: "refunded",
          platform_fee_status: platformFeeStatus || "refunded",
          platform_fee_amount: Number(platformFeeAmount ?? purchases[0].platform_fee_amount ?? 0),
        });
      }
      return Response.json({ success: true, purchaseId: purchases[0]?.id || "" });
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