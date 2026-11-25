import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeRetailerOffers } from '../retailerCatalogOffers.js';

const businessId = '48af6de4-bb66-4464-a3ce-c68a5d82b400';
const products = [{ id: 'pm-1', product_name: 'Phase One TEST Tee (Synthetic)', brand_name: 'Concierge Synthetic' }];
const variants = [{ id: 'pv-1', size_label: 'M', color_name: 'Blue', sku: 'TEE-M' }];

test('shopper catalog offer is visible to its own retailer with checkout stock intact', () => {
  const offers = [{ id: 'o-1', product_master_id: 'pm-1', product_variant_id: 'pv-1', business_id: businessId, active: true,
    stock_quantity: 7, current_price: '25.00', availability: 'in_stock', channel: 'online' }];
  const rendered = normalizeRetailerOffers(offers, products, variants, businessId);
  assert.equal(rendered.length, 1);
  assert.deepEqual(
    [rendered[0].name, rendered[0].variant, rendered[0].price, rendered[0].stock, rendered[0].source],
    ['Phase One TEST Tee (Synthetic)', 'M / Blue', 25, 7, 'retailer_offer']
  );
  assert.equal(offers[0].stock_quantity, 7, 'reading an offer must not alter stock');
});

test('never display another business offer, an inactive offer or invented stock', () => {
  const offers = [
    { id: 'foreign', business_id: 'other-business', product_master_id: 'pm-1', active: true, stock_quantity: 99 },
    { id: 'inactive', business_id: businessId, product_master_id: 'pm-1', active: false, stock_quantity: 4 },
    { id: 'unknown', business_id: businessId, product_master_id: 'pm-1', active: true, stock_quantity: null }
  ];
  const rows = normalizeRetailerOffers(offers, products, [], businessId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'unknown');
  assert.equal(rows[0].stock, null);
  assert.deepEqual(normalizeRetailerOffers(offers, products, [], null), []);
});

test('uses discounted price only when sale is active, preserves zero stock', () => {
  const base = { id: 'o-2', business_id: businessId, product_master_id: 'pm-1', active: true,
    regular_price: '30', current_price: '25', sale_price: '20', stock_quantity: 0 };
  assert.equal(normalizeRetailerOffers([{ ...base, sale_active: true }], products, [], businessId)[0].price, 20);
  const row = normalizeRetailerOffers([{ ...base, sale_active: false }], products, [], businessId)[0];
  assert.equal(row.price, 25);
  assert.equal(row.stock, 0);
});

test('retailer inventory screen reads canonical offers without merging editable stock rows', () => {
  const ui = readFileSync('src/pages/Inventory.jsx', 'utf8');
  assert.match(ui, /supabase\.from\('retailer_offer'\)/);
  assert.match(ui, /eq\('business_id', String\(context\.businessId\)\)/);
  assert.match(ui, /normalizeRetailerOffers\(/);
  assert.match(ui, /Online storefront offers/);
  assert.match(ui, /Read-only/);
  assert.match(ui, /base44\.entities\.InventoryItem\.filter/);
});
