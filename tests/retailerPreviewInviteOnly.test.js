import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const login = readFileSync('src/components/SupabaseLogin.jsx', 'utf8');

test('isolated retailer preview cannot silently self-register through email OTP', () => {
  assert.match(login, /shouldCreateUser:\s*false/);
  assert.match(login, /VITE_ENABLE_EMAIL_LINK_SIGNIN/);
  assert.match(login, /emailLinkEnabled\s*\?/);
  assert.match(login, /Phase One pilot access is by invitation/);
});

test('retailer sign-in routes to current app origin', () => {
  assert.match(login, /signInWithPassword/);
  assert.match(login, /emailRedirectTo:\s*window\.location\.origin/);
});
