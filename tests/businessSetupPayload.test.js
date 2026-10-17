import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBusinessSetupPayload } from '../src/lib/businessSetupPayload.js';

const identity = { userId: 'verified-retailer-user', email: 'concierge-phase1-retailer@example.com' };

test('creates a retailer with only valid Supabase fields and authenticated ownership', () => {
  const payload = buildBusinessSetupPayload({
    name: '  Phase One Test Merchant  ',
    address: 'Synthetic Address',
    tax_rate: '7.25',
    linked_customer_app_id: 'legacy-app-id',
    owner_user_id: 'attacker-controlled-owner',
    owner_email: 'not-a-column',
    stripe_charges_enabled: true,
    stripe_connected_account_id: 'forged',
    stripe_subscription_status: 'active',
  }, { ...identity, step: 1, creating: true });
  assert.equal(payload.name, 'Phase One Test Merchant');
  assert.equal(payload.owner_user_id, identity.userId);
  assert.equal(payload.linked_customer_app_legacy_id, 'legacy-app-id');
  assert.equal(payload.tax_rate, 7.25);
  assert.equal(payload.setup_complete, false);
  for (const field of ['owner_email', 'linked_customer_app_id', 'stripe_connected_account_id', 'stripe_charges_enabled', 'stripe_subscription_status']) {
    assert.equal(Object.hasOwn(payload, field), false, field);
  }
});

test('updates preserve database owner and Stripe fields rather than writing them', () => {
  const payload = buildBusinessSetupPayload({
    name: 'Shop',
    owner_user_id: 'other-owner',
    owner_email: 'obsolete',
    stripe_connected_account_id: 'forged',
    stripe_subscription_status: 'active',
    setup_complete: false,
  }, { ...identity, step: 3, creating: false });
  assert.equal(payload.setup_complete, true);
  for (const field of ['owner_user_id','owner_email','stripe_connected_account_id','stripe_subscription_status']) {
    assert.equal(Object.hasOwn(payload, field), false, field);
  }
});

test('blocks blank business names and unauthenticated creation', () => {
  assert.throws(() => buildBusinessSetupPayload({ name: ' ' }, { ...identity, step: 1, creating: true }), /business name/);
  assert.throws(() => buildBusinessSetupPayload({ name: 'Shop' }, { email: 'shop@example.com', creating: true }), /Sign in/);
});
test('validates nonnegative tax inputs and preserves an empty optional tax field', () => {
  assert.throws(() => buildBusinessSetupPayload({ name: 'Shop', tax_rate: '-1' }, identity), /tax rate/);
  assert.throws(() => buildBusinessSetupPayload({ name: 'Shop', tax_rate: 'not a number' }, identity), /tax rate/);
  assert.equal(buildBusinessSetupPayload({ name: 'Shop', tax_rate: '' }, identity).tax_rate, 0);
});
