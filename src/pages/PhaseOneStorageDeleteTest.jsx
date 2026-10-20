import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

// TEMPORARY PHASE ONE PREVIEW DIAGNOSTIC. Remove this component and its route after evidence capture.
// A deterministic 1x1 PNG is reproducible independently of Supabase and safe to discard.
// The original shopper and retailer images are never passed into Storage remove().
const EXPECTED_PROJECT = 'https://cbqxcbvjezehxowarkoq.supabase.co';
const SHOPPER_ID = '502c1322-0fe1-42ed-9337-25388a4cbd35';
const RETAILER_ID = 'a4df6bfb-cbf4-4c7b-a3f8-3afb3738974e';
const TEST_KEY = 'phase1:storage-delete-probe:20261020';
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/wwAAAABJRU5ErkJggg==';

const readState = () => {
  try { return JSON.parse(localStorage.getItem(TEST_KEY) || '{}'); } catch { return {}; }
};
const isSafePath = (p) => typeof p === 'string'
  && p.startsWith(SHOPPER_ID + '/phase1-delete-probe-')
  && /^[-a-zA-Z0-9_/]+\.png$/.test(p);
const roleLabel = (id) => id === SHOPPER_ID ? 'Synthetic shopper' : id === RETAILER_ID ? 'Synthetic retailer' : 'Unrecognized test identity';
const sha256 = async (bytes) => {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const probeBytes = () => Uint8Array.from(atob(ONE_PIXEL_PNG), x => x.charCodeAt(0));

export default function PhaseOneStorageDeleteTest() {
  const { user, logout } = useAuth();
  const [record, setRecord] = useState(readState);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const id = user?.id;
  const isCorrectProject = import.meta.env.VITE_SUPABASE_URL === EXPECTED_PROJECT;
  const isShopper = id === SHOPPER_ID;
  const isRetailer = id === RETAILER_ID;
  const ready = isCorrectProject && !!id && (isShopper || isRetailer);
  const safe = isSafePath(record.path);

  const persist = (next) => { localStorage.setItem(TEST_KEY, JSON.stringify(next)); setRecord(next); };
  const action = async (run) => {
    if (!ready) return;
    setWorking(true);
    setMessage('');
    try {
      // Re-check the actual live session before any Storage API call.
      const { data, error } = await supabase.auth.getUser();
      if (error || data?.user?.id !== id) throw new Error('Signed-in test identity could not be verified.');
      await run();
    } catch (e) { setMessage('CHECK STOPPED: ' + (e?.message || 'Unknown error')); }
    finally { setWorking(false); }
  };
  const create = () => action(async () => {
    if (!isShopper || safe) throw new Error('Only the test shopper can create the probe; finish the previous probe first.');
    const path = SHOPPER_ID + '/phase1-delete-probe-' + crypto.randomUUID() + '.png';
    if (!isSafePath(path)) throw new Error('Unsafe generated path.');
    const bytes = probeBytes();
    const { error } = await supabase.storage.from('concierge-sensitive')
      .upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (error) throw error;
    persist({ path, expectedHash: await sha256(bytes), attempted: false, denied: false });
    setMessage('CREATED disposable private PNG only. Sign out, sign in as synthetic retailer, then return here and tap Test unauthorized delete.');
  });
  const attempt = () => action(async () => {
    if (!isRetailer || !safe) throw new Error('Only the synthetic retailer can run this denial check on the recorded probe.');
    const { data, error } = await supabase.storage.from('concierge-sensitive').remove([record.path]);
    const removed = Array.isArray(data) && data.some(x => x?.name === record.path);
    const denied = !!error || !removed;
    persist({ ...record, attempted: true, denied, response: error?.message || (removed ? 'API reported deletion!' : 'No deleted object returned') });
    setMessage((denied ? 'DELETION NOT ACKNOWLEDGED by Storage API. ' : 'POTENTIAL SECURITY FAILURE: API reported a deletion! ')
      + 'Sign back in as synthetic shopper and use Verify owner recovery; that final read determines whether the PNG survived.');
  });
  const verify = () => action(async () => {
    if (!isShopper || !safe || !record.attempted) throw new Error('First complete the retailer unauthorized deletion attempt.');
    const { data, error } = await supabase.storage.from('concierge-sensitive').download(record.path);
    if (error || !data) {
      persist({ ...record, verified: false });
      throw new Error('FAIL: owner could not download the disposable image after the other user tried deleting it.');
    }
    const bytes = await data.arrayBuffer();
    const actualHash = await sha256(bytes);
    const verified = record.denied && actualHash === record.expectedHash;
    persist({ ...record, verified, recoveredHash: actualHash });
    setMessage(verified
      ? 'PASS — Retailer delete was not acknowledged; shopper downloaded the SAME disposable PNG after the attempt, SHA-256 matched. Original images untouched.'
      : 'NOT PASSED — Owner could download the probe but unauthorized response or SHA-256 did not satisfy acceptance criteria.');
  });
  const cleanup = () => action(async () => {
    if (!isShopper || !safe || !record.verified) throw new Error('Only shopper can clean up its verified disposable probe.');
    const { error } = await supabase.storage.from('concierge-sensitive').remove([record.path]);
    if (error) throw error;
    // A new download must fail. Do not trust DELETE's success response alone.
    const { data } = await supabase.storage.from('concierge-sensitive').download(record.path);
    if (data) throw new Error('Cleanup incomplete: disposable object still downloadable.');
    localStorage.removeItem(TEST_KEY);
    setRecord({});
    setMessage('CLEANUP VERIFIED — disposable test PNG removed by its owner. No original images were touched.');
  });

  return <main className="mx-auto max-w-xl min-h-screen p-6 bg-white text-slate-900 space-y-4">
    <h1 className="text-2xl font-semibold">Phase One: Storage deletion security</h1>
    <p className="text-sm">TEMPORARY test-branch-only utility. Operates solely on a new 1-pixel PNG named phase1-delete-probe. Never deletes original shopper or retailer images.</p>
    <p className="font-medium">Project: {isCorrectProject ? 'Phase One E2E test branch' : 'WRONG PROJECT — all actions disabled'}</p>
    <p>Signed in as: <strong>{roleLabel(id)}</strong></p>
    <p className="text-sm break-all">Disposable path: {safe ? record.path : 'Not yet created'}</p>
    <p className="text-sm">Step state: {record.verified ? 'Verified PASS' : record.attempted ? 'Unauthorized attempt complete; owner verification needed' : safe ? 'Probe exists; retailer attempt next' : 'Ready for shopper probe creation'}</p>
    <div className="space-y-3">
      <button type="button" className="w-full rounded-lg bg-blue-900 text-white p-3 disabled:opacity-40" disabled={!ready || working || !isShopper || safe} onClick={create}>1. Shopper: create disposable private image</button>
      <button type="button" className="w-full rounded-lg bg-blue-900 text-white p-3 disabled:opacity-40" disabled={!ready || working || !isRetailer || !safe || !!record.attempted} onClick={attempt}>2. Retailer: attempt unauthorized DELETE</button>
      <button type="button" className="w-full rounded-lg bg-blue-900 text-white p-3 disabled:opacity-40" disabled={!ready || working || !isShopper || !safe || !record.attempted || !!record.verified} onClick={verify}>3. Shopper: verify original probe survived (SHA-256)</button>
      <button type="button" className="w-full rounded-lg bg-emerald-900 text-white p-3 disabled:opacity-40" disabled={!ready || working || !isShopper || !record.verified} onClick={cleanup}>4. Shopper: remove verified disposable probe only</button>
      <button type="button" className="w-full rounded-lg border border-slate-400 p-3" onClick={() => logout()}>Sign out to switch synthetic test accounts</button>
    </div>
    {message && <p role="status" className="p-3 bg-slate-100 rounded-md whitespace-pre-wrap">{message}</p>}
    <p className="text-xs text-slate-500">No passwords, tokens, customer images, or photo bytes leave the authenticated browser session. No production operations. The disposable PNG is reproducible from code.</p>
  </main>;
}
