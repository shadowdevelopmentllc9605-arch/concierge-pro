import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImageUpload, MAX_PUBLIC_IMAGE_BYTES, MAX_PRIVATE_IMAGE_BYTES } from '../src/lib/imageUploadValidation.js';

const adapter = readFileSync(new URL('../src/api/base44Client.js', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../src/pages/BusinessSetup.jsx', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('../src/pages/Inventory.jsx', import.meta.url), 'utf8');
const sample = (type, size) => ({ name: 'test.jpg', type, size });

test('public images accept only JPEG/PNG/WebP with nonempty size at or below 10 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const image = sample(type, MAX_PUBLIC_IMAGE_BYTES);
    assert.equal(validateImageUpload(image), image);
  }
  assert.throws(() => validateImageUpload(sample('image/jpeg', 0)), /non-empty/);
  assert.throws(() => validateImageUpload(sample('image/jpeg', MAX_PUBLIC_IMAGE_BYTES + 1)), /10 MB/);
  for (const mime of ['text/html', 'image/svg+xml', 'application/pdf', '', 'application/javascript']) {
    assert.throws(() => validateImageUpload(sample(mime, 512)), /JPEG, PNG, or WebP/);
  }
});

test('private images permit up to 15 MB but reject oversized files', () => {
  assert.doesNotThrow(() => validateImageUpload(sample('image/jpeg', MAX_PRIVATE_IMAGE_BYTES), MAX_PRIVATE_IMAGE_BYTES));
  assert.throws(() => validateImageUpload(sample('image/jpeg', MAX_PRIVATE_IMAGE_BYTES + 1), MAX_PRIVATE_IMAGE_BYTES), /15 MB/);
});

test('retailer uploader fails closed for private images before auth and Storage calls', () => {
  const start = adapter.indexOf('async UploadPrivateFile({ file })');
  const end = adapter.indexOf('async CreateFileSignedUrl', start);
  assert.ok(start > 0 && end > start);
  const privateUploader = adapter.slice(start, end);
  const gate = privateUploader.indexOf("import.meta.env.VITE_PRIVATE_UPLOADS_ENABLED !== 'true'");
  const userLookup = privateUploader.indexOf('supabase.auth.getUser()');
  const put = privateUploader.indexOf("supabase.storage.from('concierge-sensitive').upload");
  assert.ok(gate >= 0 && gate < userLookup && userLookup < put);
  assert.match(privateUploader, /validateImageUpload\(file, MAX_PRIVATE_IMAGE_BYTES\)/);
  assert.match(privateUploader, /temporarily unavailable until secure image backups/);
  assert.doesNotMatch(privateUploader, /getPublicUrl/);
});

test('public store images continue to use the public bucket after validation', () => {
  const start = adapter.indexOf('async UploadFile({ file })');
  const end = adapter.indexOf('async UploadPrivateFile', start);
  const publicUploader = adapter.slice(start, end);
  assert.match(publicUploader, /validateImageUpload\(file, MAX_PUBLIC_IMAGE_BYTES\)/);
  assert.match(publicUploader, /supabase.storage.from\('concierge-uploads'\).upload/);
  assert.match(publicUploader, /getPublicUrl\(path\)/);
  assert.match(inventory, /Core.UploadFile\(\{ file \}\)/);
});

test('floor plan upload is hard-blocked and removed from retailer setup UI', () => {
  assert.match(setup, /if \(field === 'floor_plan_url'\)/);
  assert.match(setup, /Floor plan uploads are paused/);
  assert.match(setup, /if \(field !== 'logo_url'\)/);
  assert.match(setup, /floor plans may contain sensitive/i);
  assert.doesNotMatch(setup, /onChange=\{\(e\) => handleFileUpload\(e, 'floor_plan_url'\)\}/);
  assert.match(setup, /Upload test store image/);
  assert.match(setup, /You can continue setting up your business/);
});
