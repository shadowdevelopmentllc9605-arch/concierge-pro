import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setup = readFileSync(new URL('../src/pages/BusinessSetup.jsx', import.meta.url), 'utf8');

test('completed retailer setup offers an independent public test image upload', () => {
  assert.match(setup, /Store image/);
  assert.match(setup, /Upload test store image/);
  assert.match(setup, /onChange=\{e => handleFileUpload\(e, 'logo_url'\)\}/);
});

test('image upload has type, size validation and saves only whitelisted field', () => {
  assert.match(setup, /'image\/jpeg', 'image\/png', 'image\/webp'/);
  assert.match(setup, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(setup, /\['logo_url', 'floor_plan_url'\]\.includes\(field\)/);
  assert.match(setup, /Business\.update\(business\.id, \{ \[field\]: file_url \}\)/);
  assert.match(setup, /Store image uploaded and saved/);
});
