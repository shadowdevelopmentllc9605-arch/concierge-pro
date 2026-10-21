import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../../pages/BusinessSetup.jsx', import.meta.url)), 'utf8');

test('retailer business setup does not falsely promise automatic account deletion', () => {
  assert.match(source, /Automatic deletion is not available yet/);
  assert.match(source, /verify ownership/);
  assert.match(source, /Nothing is deleted just by opening this page or sending a request/);
  assert.doesNotMatch(source, /Yes, Delete Everything|This permanently deletes this business|Base44 owner sign-in account/);
  assert.doesNotMatch(source, /functions\.invoke\(['"]deleteVendorBusiness['"]/);
});

test('retailer can explicitly open the support request with no automatic mutation', () => {
  assert.match(source, /mailto:shadowdevelopmentllc9605@gmail\.com\?subject=Concierge%20Pro%20data%20removal%20request/);
  assert.match(source, /Request data removal by email/);
  assert.doesNotMatch(source, /onClick=\{deleteAccount\}/);
});
