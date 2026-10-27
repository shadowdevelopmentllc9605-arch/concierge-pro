// QA-only account provisioning using Supabase's public Authentication signup flow.
// Usage: QA_SUPABASE_URL=... QA_SUPABASE_ANON_KEY=... QA_RETAILER_B_EMAIL=... QA_RETAILER_B_PASSWORD=... node scripts/provision-qa-retailer.mjs
// Never run with production credentials. This script intentionally does NOT bypass email verification,
// change auth.users directly, or create a business with administrative privileges.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const ref='cbqxcbvjezehxowarkoq';
const url=process.env.QA_SUPABASE_URL;
assert.equal(new URL(url || 'https://invalid.example').hostname, ref+'.supabase.co', 'QA project required');
const key=process.env.QA_SUPABASE_ANON_KEY;
const email=process.env.QA_RETAILER_B_EMAIL;
const password=process.env.QA_RETAILER_B_PASSWORD;
assert.ok(key && email && password, 'Missing QA key or second retailer credentials');
assert.ok(email !== process.env.QA_RETAILER_A_EMAIL && email !== process.env.QA_SHOPPER_EMAIL,
  'Use a distinct second retailer email');
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await supabase.auth.signUp({email,password});
if(error)throw error;
if(!data.session){
  console.log('Signup submitted. Email verification or existing-account confirmation may be required. No business created.');
  process.exit(0);
}
const user=data.user;
assert.ok(user?.id,'Missing authenticated user ID');
const {data:business,error:insertError}=await supabase.from('businesses')
  .insert({name:'Phase One QA Retailer B',owner_user_id:user.id,setup_complete:false})
  .select('id').single();
if(insertError)throw insertError;
console.log('Second QA retailer created via authenticated signup and owner-scoped business insert:',business.id);
