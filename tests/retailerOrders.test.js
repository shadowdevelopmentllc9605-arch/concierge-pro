import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentOnlineOrders, getTodayCompletedSales, formatOnlineOrderItems } from '../src/lib/retailerOrders.js';

const b = 'synthetic-store';
const rows = [
  { id: 'sale1', business_id: b, order_id: 'order-123', purchase_type: 'online', status: 'completed', total: '34.99', created_date: '2026-10-17T04:20:26Z', platform_fee_amount: '1', items: [{product_name:'Phase One TEST Tee',size_label:'M',color_name:'Blue',quantity:1}] },
  { id: 'other-store', business_id: 'other', purchase_type: 'online', status: 'completed', total: 10000, created_date: '2026-10-17T04:30:26Z' },
  { id: 'instore', business_id: b, purchase_type: 'in_store', status: 'completed', total: 10, created_date: '2026-10-17T04:25:26Z' },
  { id: 'old', business_id: b, purchase_type: 'online', status: 'completed', total: 20, created_date: '2026-10-16T04:20:26Z' }
];

test('retailer recent online orders exclude other businesses and POS purchases', () => {
  const orders = getRecentOnlineOrders(rows, b);
  assert.deepEqual(orders.map(x => x.id), ['sale1', 'old']);
  assert.deepEqual(getRecentOnlineOrders(rows, null), []);
});

test('today sales use numeric amounts and completed purchases only', () => {
  const current = new Date('2026-10-17T12:00:00Z');
  const sales = getTodayCompletedSales(rows.filter(x => x.business_id === b), current);
  assert.equal(sales, 44.99);
  const noPending = getTodayCompletedSales([...rows.filter(x => x.business_id === b), {status:'processing',total:200,created_date:'2026-10-17T08:00:00Z'}], current);
  assert.equal(noPending, 44.99);
});

test('online order shows the purchased size, color, and quantity', () => {
  assert.equal(formatOnlineOrderItems(rows[0]), 'Phase One TEST Tee (M / Blue) ×1');
});
