import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const setup = readFileSync(new URL('../src/pages/BusinessSetup.jsx',import.meta.url),'utf8');

test('temporary storage denial check uses signed-in retailer credentials',()=>{
  assert.match(setup,/supabase\.auth\.getUser\(\)/);
  assert.match(setup,/auth\?\.user\?\.email !== 'concierge-phase1-retailer@example.com'/);
  assert.match(setup,/storage\.from\('concierge-sensitive'\)\.download\(target\)/);
  assert.match(setup,/storage\.from\('concierge-sensitive'\)\.list\(shopperPrefix/);
  assert.match(setup,/storage\.from\('concierge-sensitive'\)\.upload\(disposablePath, pngBytes/);
  assert.match(setup,/private folder|private image/i);
});

test('security audit is not an elevated backend access path',()=>{
  const start=setup.indexOf('const runCrossAccountStorageAudit');
  const end=setup.indexOf('const handleFileUpload',start);
  const audit=setup.slice(start,end);
  assert.doesNotMatch(audit,/service_role|serviceRole|createSignedUrl|admin|fetch\(/);
  assert.match(audit,/UNSAFE — foreign file was created/);
});
