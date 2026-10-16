import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePurchaseItem } from '../src/lib/purchaseItems.js';

test('purchased products expose the fields expected by retailer metrics', () => {
  const item = normalizePurchaseItem({ product_name: 'Pilot Shirt', quantity: 2, unit_price: '24.95', size_label: 'M' });
  assert.equal(item.name, 'Pilot Shirt');
  assert.equal(item.quantity, 2);
  assert.equal(item.price, 24.95);
  assert.equal(item.size_label, 'M');
});

test('missing legacy item fields have safe display defaults', () => {
  const item = normalizePurchaseItem({ product_name: null, quantity: null, unit_price: null });
  assert.equal(item.name, 'Item');
  assert.equal(item.quantity, 0);
  assert.equal(item.price, 0);
});
