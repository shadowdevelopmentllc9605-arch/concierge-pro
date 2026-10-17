import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessVendorPage, shouldRedirectToBusinessSetup } from '../src/lib/vendorAccess.js';

const newRetailer = { businessId: null, vendorRole: null, isManager: false, permissions: {} };
const owner = { businessId: 'owned-store', vendorRole: 'manager', isManager: true, business: { setup_complete: true }, permissions: {} };
const incompleteOwner = { ...owner, business: { setup_complete: false } };
const associate = { businessId: 'another-store', vendorRole: 'sales_associate', isManager: false, permissions: {} };

test('new signed-in retailer is redirected from Home to setup but cannot access staff pages', () => {
  assert.equal(shouldRedirectToBusinessSetup('Home', newRetailer), true);
  assert.equal(shouldRedirectToBusinessSetup('BusinessSetup', newRetailer), false);
  assert.equal(canAccessVendorPage('BusinessSetup', newRetailer), true);
  for (const page of ['Home', 'Employees', 'Checkout', 'Inventory', 'Metrics', 'Customers']) {
    assert.equal(canAccessVendorPage(page, newRetailer), false, page);
  }
});

test('real business owner is manager even without a separate employee row', () => {
  assert.equal(shouldRedirectToBusinessSetup('Home', owner), false);
  for (const page of ['Home', 'BusinessSetup', 'Checkout', 'Employees', 'Inventory', 'Metrics']) {
    assert.equal(canAccessVendorPage(page, owner), true, page);
  }
});

test('verified business owner with incomplete onboarding must finish own setup first', () => {
  assert.equal(shouldRedirectToBusinessSetup('Home', incompleteOwner), true);
  assert.equal(shouldRedirectToBusinessSetup('BusinessSetup', incompleteOwner), false);
});

test('non-manager cannot open business setup or privileged store pages', () => {
  assert.equal(shouldRedirectToBusinessSetup('Home', associate), false);
  for (const page of ['BusinessSetup', 'Employees', 'Checkout', 'Inventory', 'Metrics']) {
    assert.equal(canAccessVendorPage(page, associate), false, page);
  }
  assert.equal(canAccessVendorPage('Customers', associate), true);
  assert.equal(canAccessVendorPage('Checkout', { ...associate, permissions: { process_checkout: true } }), true);
});
