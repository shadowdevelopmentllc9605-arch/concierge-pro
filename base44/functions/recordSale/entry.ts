import { createClientFromRequest } from "npm:@base44/sdk";
import Stripe from "npm:stripe@23.0.0";
import { secrets } from "base44:runtime";
import { getActiveEmployee } from "../../shared/employeeAccess.ts";

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

function getVariant(item: any, size?: string, color?: string, widthCode?: string) {
  if (!Array.isArray(item.variants) || item.variants.length === 0) return null;
  return item.variants.find((variant: any) =>
    String(variant.size || "") === String(size || "") &&
    String(variant.width_code || "") === String(widthCode || "") &&
    String(variant.color || "") === String(color || "")
  ) || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!hasCheckoutAccess(user)) {
      return Response.json({ error: "Checkout permission required" }, { status: 403 });
    }

    // Employee.status is authoritative: reject deactivated/missing memberships.
    if (!(await getActiveEmployee(base44, user))) {
      return Response.json({ error: "Vendor membership is inactive" }, { status: 403 });
    }

    const body = await req.json();
    const customerId = body?.customerId;
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    const discountPercent = Math.min(100, Math.max(0, Number(body?.discountPercent || 0)));
    const paymentMethod = body?.paymentMethod || "cash";
    const locationId = body?.locationId || "";
    const idempotencyKey = String(body?.idempotencyKey || "").trim();

    if (paymentMethod !== "cash") {
      return Response.json({
        error: "Card and mobile payments are not configured. No charge was attempted."
      }, { status: 409 });
    }
    if (!customerId || requestedItems.length === 0 || !idempotencyKey) {
      return Response.json({ error: "Customer, items, and an idempotency key are required" }, { status: 400 });
    }

    const priorPurchases = await base44.asServiceRole.entities.Purchase.filter({
      business_id: user.business_id,
      external_purchase_id: idempotencyKey,
    });
    if (priorPurchases[0]?.status === "completed") {
      return Response.json({
        success: true,
        duplicate: true,
        purchaseId: priorPurchases[0].id,
        externalPurchaseId: idempotencyKey,
        subtotal: Number(priorPurchases[0].subtotal || 0),
        discount: Number(priorPurchases[0].discount || 0),
        tax: Number(priorPurchases[0].tax || 0),
        total: Number(priorPurchases[0].total || 0),
      });
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
      const variant = getVariant(item, requested.size, requested.color, requested.width_code);
      let available = Number(item.stock_quantity || 0);

      if (Array.isArray(item.variants) && item.variants.length > 0) {
        if (!variant) {
          return Response.json({ error: `Choose a valid size/width/color combination for ${item.name}` }, { status: 400 });
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

    // A store sale is Concierge-attributed when the linked shopper visited this
    // retailer through The Concierge within the prior 7 days. The success fee is
    // charged on merchandise after discounts, never on tax.
    const attributionCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let attributedVisit: any = null;
    if (customer.linked_customer_id) {
      const visits = await base44.asServiceRole.entities.StoreVisit.filter({
        customer_id: customer.id,
        business_id: user.business_id,
      });
      attributedVisit = visits
        .filter((visit: any) => {
          const enteredAt = Date.parse(visit.entered_at || "");
          return Number.isFinite(enteredAt) && enteredAt >= attributionCutoff;
        })
        .sort((a: any, b: any) => Date.parse(b.entered_at || "") - Date.parse(a.entered_at || ""))[0] || null;
    }
    const conciergeAttributed = Boolean(attributedVisit);
    const platformFeePercent = conciergeAttributed ? 4 : 0;
    const platformFeeAmount = conciergeAttributed
      ? Math.round(Math.max(0, subtotal - discountAmount) * 0.04 * 100) / 100
      : 0;

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
    const externalPurchaseId = idempotencyKey;

    let purchase = priorPurchases[0] || null;
    if (!purchase) {
      purchase = await base44.asServiceRole.entities.Purchase.create({
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
          width_code: row.requested.width_code || "",
          color: row.requested.color || "",
        })),
        subtotal,
        tax,
        discount: discountAmount,
        total,
        payment_method: "cash",
        payment_provider: "cash",
        status: "processing",
        concierge_attributed: conciergeAttributed,
        attribution_source: conciergeAttributed ? "concierge_store_visit" : "none",
        attribution_event_id: attributedVisit?.id || attributedVisit?.external_checkin_id || "",
        platform_fee_percent: platformFeePercent,
        platform_fee_amount: platformFeeAmount,
        platform_fee_status: conciergeAttributed ? "accrued" : "not_applicable",
        synced_to_customer: false,
      });
    }

    for (const row of resolved) {
      const item = row.item;
      const stockEventKey = `cash:${externalPurchaseId}:${item.id}:${row.requested.size || ""}:${row.requested.width_code || ""}:${row.requested.color || ""}`;
      const processed = Array.isArray(item.processed_stock_events)
        ? item.processed_stock_events
        : [];
      if (processed.includes(stockEventKey)) continue;

      const update: any = {
        processed_stock_events: [...processed, stockEventKey].slice(-250),
      };

      if (row.variant) {
        update.variants = item.variants.map((variant: any) =>
          variant === row.variant
            ? { ...variant, stock_quantity: Math.max(0, Number(variant.stock_quantity || 0) - row.quantity) }
            : variant
        );
        update.stock_quantity = update.variants.reduce(
          (sum: number, variant: any) => sum + Math.max(0, Number(variant.stock_quantity || 0)),
          0,
        );
      } else {
        update.stock_quantity = Math.max(0, Number(item.stock_quantity || 0) - row.quantity);
      }

      await base44.asServiceRole.entities.InventoryItem.update(item.id, update);
    }

    await base44.asServiceRole.entities.Purchase.update(purchase.id, {
      items: resolved.map(row => ({
        inventory_item_id: row.item.id,
        name: row.item.name,
        quantity: row.quantity,
        price: Number(row.item.price || 0),
        size: row.requested.size || "",
        width_code: row.requested.width_code || "",
        color: row.requested.color || "",
      })),
      subtotal,
      tax,
      discount: discountAmount,
      total,
      concierge_attributed: conciergeAttributed,
      attribution_source: conciergeAttributed ? "concierge_store_visit" : "none",
      attribution_event_id: attributedVisit?.id || attributedVisit?.external_checkin_id || "",
      platform_fee_percent: platformFeePercent,
      platform_fee_amount: platformFeeAmount,
      platform_fee_status: conciergeAttributed ? "accrued" : "not_applicable",
      status: "completed",
    });

    if (conciergeAttributed && platformFeeAmount > 0) {
      try {
        const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
        const business = businesses[0];
        const stripeSecret = secrets.get("STRIPE_SECRET_KEY");
        if (business?.stripe_customer_id && stripeSecret) {
          const stripe = new Stripe(stripeSecret);
          const invoiceItem = await stripe.invoiceItems.create(
            {
              customer: business.stripe_customer_id,
              amount: Math.round(platformFeeAmount * 100),
              currency: "usd",
              description: `4% Concierge-attributed sale fee · sale ${externalPurchaseId}`,
              metadata: {
                concierge_platform_fee: "true",
                concierge_pro_business_id: user.business_id,
                concierge_external_purchase_id: externalPurchaseId,
                concierge_attribution_source: "concierge_store_visit",
                concierge_platform_fee_percent: "4",
              },
            },
            { idempotencyKey: `concierge-platform-fee-${externalPurchaseId}` },
          );
          await base44.asServiceRole.entities.Purchase.update(purchase.id, {
            platform_fee_invoice_item_id: invoiceItem.id,
            platform_fee_status: "accrued",
          });
        }
      } catch (feeError) {
        // The retail sale remains valid if fee invoicing is temporarily unavailable.
        // The accrued fee stays on the Purchase record so it can be reconciled/retried.
        console.warn("Unable to add attributed-sale fee to Stripe invoice", feeError);
      }
    }

    const purchasedIds = new Set(resolved.map(row => row.item.id));
    const spendEvent = `cash:${externalPurchaseId}`;
    const processedSpends = Array.isArray(customer.processed_purchase_events)
      ? customer.processed_purchase_events
      : [];
    const customerUpdate: any = {
      last_visit: new Date().toISOString(),
      in_store: false,
      wishlist_items: (customer.wishlist_items || []).filter((id: string) => !purchasedIds.has(id)),
    };
    if (!processedSpends.includes(spendEvent)) {
      customerUpdate.total_spent = Number(customer.total_spent || 0) + total;
      customerUpdate.processed_purchase_events = [...processedSpends, spendEvent].slice(-250);
    }
    await base44.asServiceRole.entities.StoreCustomer.update(customer.id, customerUpdate);

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
      const businesses = await base44.asServiceRole.entities.Business.filter({ id: user.business_id });
      const business = businesses[0];
      const eventKey = `purchase:${externalPurchaseId}`;
      const payloadJson = JSON.stringify({
        action: "completePurchase",
        eventKey,
        userId: customer.linked_customer_id,
        businessId: user.business_id,
        businessName: business?.name || "",
        externalPurchaseId,
        locationId,
        items: resolved.map(row => ({
          inventory_item_id: row.item.id,
          product_id: row.item.linked_product_id || "",
          line_key: `${externalPurchaseId}:${row.item.id}:${row.requested.size || ""}:${row.requested.width_code || ""}:${row.requested.color || ""}`,
          name: row.item.name,
          image: row.item.images?.[0] || "",
          price: Number(row.item.price || 0),
          quantity: row.quantity,
          size: row.requested.size || "",
          width_code: row.requested.width_code || "",
          color: row.requested.color || "",
        })),
      });

      const jobs = await base44.asServiceRole.entities.IntegrationSyncJob.filter({
        direction: "to_customer",
        event_key: eventKey,
      });
      let job = jobs[0] || null;
      if (!job) {
        job = await base44.asServiceRole.entities.IntegrationSyncJob.create({
          business_id: user.business_id,
          direction: "to_customer",
          action: "completePurchase",
          event_key: eventKey,
          payload_json: payloadJson,
          status: "pending",
          attempts: 0,
        });
      }

      const token = await getSyncToken(base44);
      if (!token) {
        customerSync = { connected: false, reason: "integration_not_configured" };
      } else {
        try {
          const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-concierge-sync-secret": token,
            },
            body: payloadJson,
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result?.error || `Customer sync failed (${response.status})`);
          customerSync = { connected: true, ...result };
          await base44.asServiceRole.entities.IntegrationSyncJob.update(job.id, {
            status: "completed",
            attempts: Number(job.attempts || 0) + 1,
            last_error: "",
            last_attempt_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          });
          await base44.asServiceRole.entities.Purchase.update(purchase.id, {
            synced_to_customer: true,
            sync_error: "",
          });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : "Customer sync failed";
          await base44.asServiceRole.entities.IntegrationSyncJob.update(job.id, {
            status: "pending",
            attempts: Number(job.attempts || 0) + 1,
            last_error: message,
            last_attempt_at: new Date().toISOString(),
          });
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
      conciergeAttributed,
      attributionSource: conciergeAttributed ? "concierge_store_visit" : "none",
      attributionWindowDays: 7,
      platformFeePercent,
      platformFeeAmount,
      platformFeeStatus: conciergeAttributed ? "accrued" : "not_applicable",
      customerSync,
    });
  } catch (error) {
    console.error("recordSale", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}