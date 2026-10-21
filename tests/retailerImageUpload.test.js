import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setup = readFileSync(new URL('../src/pages/BusinessSetup.jsx', import.meta.url), 'utf8');

test('completed retailer setup offers an independent public test image upload', () => {
  assert.match(setup, /Store image/);
  assert.match(setup, /Upload test store image/);
  assert.match(setup, /onChange=\{e => handleFileUpload\(e, 'logo_url'\)\}/);
});

test('public store logo upload validates images and saves only the whitelisted field', () => {
  assert.match(setup, /'image\/jpeg', 'image\/png', 'image\/webp'/);
  assert.match(setup, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(setup, /if \(field !== 'logo_url'\)/);
  assert.match(setup, /if \(field === 'floor_plan_url'\)/);
  assert.match(setup, /Business\.update\(business\.id, \{ \[field\]: file_url \}\)/);
  assert.match(setup, /Store image uploaded and saved/);
});
