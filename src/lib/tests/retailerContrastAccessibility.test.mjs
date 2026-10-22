import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notifications = readFileSync('src/pages/Notifications.jsx', 'utf8');
const settings = readFileSync('src/pages/BusinessSetup.jsx', 'utf8');

test('all four notification shortcuts retain white background and readable black labels', () => {
  const area = notifications.split('{/* Campaign Buttons */}')[1]?.split('{/* Recent Notifications */}')[0];
  assert.ok(area, 'campaign shortcut section exists');
  const entries = [
    ['new_arrival', 'New Arrivals'],
    ['promo', 'Promo / Sale'],
    ['birthday', 'Birthday Cards'],
    ['coupon', 'Send Coupon'],
  ];
  for (const [type, label] of entries) {
    assert.ok(area.includes("openDialog('" + type + "')"), 'shortcut retained: ' + type);
    assert.ok(area.includes('<span className="font-semibold text-black">' + label + '</span>'), 'dark text for ' + label);
  }
  assert.equal((area.match(/!bg-white !text-black/g) || []).length, 4);
  assert.equal((area.match(/hover:!bg-slate-50 hover:!text-black/g) || []).length, 4);
});

test('business data removal email request is visually red with black text and still non-automatic', () => {
  const area = settings.split('aria-labelledby="data-removal-heading"')[1]?.split('</section>')[0];
  assert.ok(area, 'business removal section exists');
  assert.match(area, /!bg-red-400/);
  assert.match(area, /!text-black/);
  assert.match(area, /hover:!bg-red-300/);
  assert.match(area, /Request data removal by email/);
  assert.match(area, /mailto:shadowdevelopmentllc9605@gmail.com/);
  assert.match(area, /Automatic deletion is not available yet/);
  assert.match(area, /Nothing is deleted just by opening this page or sending a request/);
});
