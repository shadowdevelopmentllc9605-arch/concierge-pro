import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getSyncToken(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return configs[0]?.token || null;
}

function hasCheckoutAccess(user: any) {
  return Boolean(
    user?.business_id &&
    (user?.vendor_role === "manager" || user?.vendor_permissions?.process_checkout)
  );
}

function getVariant(item: any, size?: string, color?: string) {
  if (!Array.isArray(item.variants) || item.variants.length === 0) return null;
  return item.variants.find((variant: any) =>
    String(variant.size || "") === String(size || "") &&
    String(variant.color || "") === String(color || "")
  ) || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!hasCheckoutAccess(user)) {
      return Response.json({ error: "Checkout permission required" }, { status: 403 });
    }

    const body = await req.json();
    const customerId = body?.customerId;
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    const discountPercent = Math.min(100, Math.max(0, Number(body?.discountPercent || 0)));
    const paymentMethod = body?.paymentMethod || "cash";
    const locationId = body?.locationId || "";

    if (paymentMethod !== "cash") {
      return Response.json({
        error: "Card and mobile payments are not configured. No charge was attempted."
      }, { status: 409 });
    }
    if (!customerId || requestedItems.length === 0) {
      return Response.json({ error: "Customer and items are required" }, { status: 400 });
    }

    const customers = await base44.asServiceRole.entities.StoreCustomer.filter({
      id: customerId,
      business_id: user.business_id,
    });
    const customer = customers[0];
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

    const resolved: any[] = [];
    for (const requested of requestedItems) {
      const matches = await base44.asServiceRole.entities.InventoryItem.filter({
        id: requested.inventoryItemId,
        business_id: user.business_id,
      });
      const item = matches[0];
      if (!item) return Response.json({ error: "An inventory item could not be found" }, { status: 404 });

      const quantity = Math.max(1, Math.floor(Number(requested.quantity || 1)));
      const variant = getVariant(item, requested.size, requested.color);
      let available = Number(item.stock_quantity || 0);

      if (Array.isArray(item.variants) && item.variants.length > 0) {
        if (!variant) {
          return Response.json({ error: `Choose a valid size/color combination for ${item.name}` }, { status: 400 });
        }
        available = Number(variant.stock_quantity || 0);
      }

      if (quantity > available) {
        return Response.json({ error: `Not enough stock is available for ${item.name}` }, { status: 409 });
      }

      resolved.push({ item, requested, quantity, variant });
    }

    const subtotal = resolved.reduce((sum, row) => sum + Number(row.item.price || 0) * row.quantity, 0);
    const discountAmount = subtotal * (discountPercent / 100);

    let taxRate = 0;
    if (locationId) {
      const locations = await base44.asServiceRole.entities.BusinessLocation.filter({
        id: locationId,
        business_id: user.business_id,
      });
      taxRate = Number(locations[0]?.tax_rate ?? 0);
    }
    if (!taxRate) {
      const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
      taxRate = Number(businesses[0]?.tax_rate || 0);
    }

    const tax = (subtotal - discountAmount) * (Math.max(0, taxRate) / 100);
    const total = subtotal - discountAmount + tax;
    const externalPurchaseId = crypto.randomUUID();

    // Reserve stock first. If a later write fails, the error is surfaced for reconciliation.
    for (const row of resolved) {
      const item = row.item;
      const newTotalStock = Math.max(0, Number(item.stock_quantity || 0) - row.quantity);
      const update: any = { stock_quantity: newTotalStock };

      if (row.variant) {
        update.variants = item.variants.map((variant: any) =>
          variant === row.variant
            ? { ...variant, stock_quantity: Math.max(0, Number(variant.stock_quantity || 0) - row.quantity) }
            : variant
        );
      }

      await base44.asServiceRole.entities.InventoryItem.update(item.id, update);
    }

    const purchase = await base44.asServiceRole.entities.Purchase.create({
      customer_id: customer.id,
      employee_id: user.id,
      business_id: user.business_id,
      location_id: locationId,
      external_purchase_id: externalPurchaseId,
      items: resolved.map(row => ({
        inventory_item_id: row.item.id,
        name: row.item.name,
        quantity: row.quantity,
        price: Number(row.item.price || 0),
        size: row.requested.size || "",
        color: row.requested.color || "",
      })),
      subtotal,
      tax,
      discount: discountAmount,
      total,
      payment_method: "cash",
      payment_provider: "cash",
      status: "completed",
      synced_to_customer: false,
    });

    const purchasedIds = new Set(resolved.map(row => row.item.id));
    await base44.asServiceRole.entities.StoreCustomer.update(customer.id, {
      total_spent: Number(customer.total_spent || 0) + total,
      last_visit: new Date().toISOString(),
      in_store: false,
      wishlist_items: (customer.wishlist_items || []).filter((id: string) => !purchasedIds.has(id)),
    });

    const activeVisits = await base44.asServiceRole.entities.StoreVisit.filter({
      customer_id: customer.id,
      business_id: user.business_id,
      status: "active",
    });
    if (activeVisits[0]) {
      await base44.asServiceRole.entities.StoreVisit.update(activeVisits[0].id, {
        status: "completed",
        exited_at: new Date().toISOString(),
        purchase_id: purchase.id,
      });
    }

    let customerSync = { connected: false, reason: "customer_not_linked" };
    if (customer.linked_customer_id) {
      const token = await getSyncToken(base44);
      if (!token) {
        customerSync = { connected: false, reason: "integration_not_configured" };
      } else {
        try {
          const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
          const business = businesses[0];
          const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-concierge-sync-secret": token,
            },
            body: JSON.stringify({
              action: "completePurchase",
              userId: customer.linked_customer_id,
              businessId: user.business_id,
              businessName: business?.name || "",
              externalPurchaseId,
              locationId,
              items: resolved.map(row => ({
                inventory_item_id: row.item.id,
                product_id: row.item.linked_product_id || "",
                name: row.item.name,
                image: row.item.images?.[0] || "",
                price: Number(row.item.price || 0),
                quantity: row.quantity,
                size: row.requested.size || "",
                color: row.requested.color || "",
              })),
            }),
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result?.error || `Customer sync failed (${response.status})`);
          customerSync = { connected: true, ...result };
          await base44.asServiceRole.entities.Purchase.update(purchase.id, {
            synced_to_customer: true,
            sync_error: "",
          });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : "Customer sync failed";
          await base44.asServiceRole.entities.Purchase.update(purchase.id, { sync_error: message });
          customerSync = { connected: false, reason: message };
        }
      }
    }

    return Response.json({
      success: true,
      purchaseId: purchase.id,
      externalPurchaseId,
      subtotal,
      discount: discountAmount,
      tax,
      taxRate,
      total,
      customerSync,
    });
  } catch (error) {
    console.error("recordSale", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
