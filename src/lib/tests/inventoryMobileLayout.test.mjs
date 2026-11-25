import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync('src/pages/Inventory.jsx','utf8');
const layout=readFileSync('src/Layout.jsx','utf8');
test('inventory mobile controls wrap and online stock has a non-scrolling mobile card',()=>{
 assert.match(layout,/flex-1 min-w-0 overflow-auto/);
 assert.match(ui,/grid min-w-0 grid-cols-2 gap-2/);
 assert.match(ui,/relative col-span-2 min-w-0/);
 assert.match(ui,/space-y-2 md:hidden/);
 assert.match(ui,/offer.stock \+ ' units'/);
 assert.match(ui,/hidden md:block overflow-x-auto/);
 assert.match(ui,/No local items found/);
});
test('optional inventory prerequisites cannot suppress canonical offer loading',()=>{
 assert.match(ui,/Promise\.allSettled\(/);
 assert.match(ui,/sizingData\.status === 'fulfilled'/);
 assert.match(ui,/Online offers are loaded separately/);
 assert.match(ui,/setOfferError\('No retailer business is linked/);
 assert.match(ui,/supabase\.from\('retailer_offer'\)/);
});