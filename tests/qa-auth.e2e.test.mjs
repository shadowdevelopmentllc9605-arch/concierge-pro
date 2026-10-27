// Phase One isolated-QA authenticated API E2E checks.
// Run: QA_SUPABASE_URL=https://<qa-ref>.supabase.co QA_SUPABASE_ANON_KEY=... \
// QA_SHOPPER_EMAIL=... QA_SHOPPER_PASSWORD=... \
// QA_RETAILER_A_EMAIL=... QA_RETAILER_A_PASSWORD=... \
// QA_RETAILER_B_EMAIL=... QA_RETAILER_B_PASSWORD=... node --test tests/qa-auth.e2e.test.mjs
// Never provide production credentials. All requests are read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.QA_SUPABASE_URL;
const key = process.env.QA_SUPABASE_ANON_KEY;
const expectedRef = 'cbqxcbvjezehxowarkoq';
assert.equal(new URL(url || 'https://invalid.example').hostname, `${expectedRef}.supabase.co`,
  'Refusing to run outside the isolated Phase One QA Supabase project');
assert.ok(key, 'QA_SUPABASE_ANON_KEY is required');

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(role) {
  const email = process.env[`QA_${role}_EMAIL`], password = process.env[`QA_${role}_PASSWORD`];
  assert.ok(email && password, `QA_${role}_EMAIL and QA_${role}_PASSWORD are required`);
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.user?.id && data.session?.access_token, `${role} must have an actual authenticated session`);
  return { supabase, id: data.user.id };
}
async function rows(supabase, table) {
  const { data, error } = await supabase.from(table).select('*').limit(100);
  assert.ifError(error);
  return data;
}

test('anonymous visitor cannot list private businesses', async () => {
  assert.deepEqual(await rows(client(), 'businesses'), []);
});
test('real shopper login cannot read retailer business', async () => {
  const { supabase } = await login('SHOPPER');
  assert.deepEqual(await rows(supabase, 'businesses'), []);
});
test('two real retailer logins have isolated business visibility', async () => {
  const a = await login('RETAILER_A'), b = await login('RETAILER_B');
  const [aBusinesses, bBusinesses] = await Promise.all([
    rows(a.supabase, 'businesses'), rows(b.supabase, 'businesses')
  ]);
  assert.ok(aBusinesses.length > 0 && bBusinesses.length > 0, 'Each retailer must complete onboarding');
  assert.ok(aBusinesses.some(x => x.owner_user_id === a.id), 'Retailer A must own a business');
  assert.ok(bBusinesses.some(x => x.owner_user_id === b.id), 'Retailer B must own a business');
  const aIds = new Set(aBusinesses.map(x => x.id));
  assert.ok(bBusinesses.every(x => !aIds.has(x.id)), 'Retailers must not see each other\'s business');
  const [aInventory, bInventory] = await Promise.all([
    rows(a.supabase, 'inventory_items'), rows(b.supabase, 'inventory_items')
  ]);
  assert.ok(aInventory.every(x => aIds.has(x.business_id)), 'Retailer A inventory must belong to A');
  const bIds = new Set(bBusinesses.map(x => x.id));
  assert.ok(bInventory.every(x => bIds.has(x.business_id)), 'Retailer B inventory must belong to B');
});
