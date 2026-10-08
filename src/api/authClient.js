import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';

const USE_SUPABASE_AUTH = import.meta.env.VITE_AUTH_BACKEND === 'supabase';

async function getSupabaseUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError') return null;
    throw error;
  }

  const authUser = data?.user;
  if (!authUser) return null;

  const [{ data: profile, error: profileError }, { data: employee, error: employeeError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', authUser.id)
        .maybeSingle(),
      supabase
        .from('employees')
        .select('legacy_base44_user_id,name,role,permissions,status,business_id')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('business_memberships')
        .select('business_id,role,permissions,status')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (employeeError) throw employeeError;
  if (membershipError) throw membershipError;

  const supabaseBusinessId = membership?.business_id || employee?.business_id || null;
  let business = null;

  if (supabaseBusinessId) {
    const { data: businessRecord, error: businessError } = await supabase
      .from('businesses')
      .select('id,legacy_base44_id')
      .eq('id', supabaseBusinessId)
      .maybeSingle();
    if (businessError) throw businessError;
    business = businessRecord;
  }

  return {
    id: employee?.legacy_base44_user_id || authUser.id,
    supabase_id: authUser.id,
    email: authUser.email || '',
    full_name:
      employee?.name ||
      profile?.display_name ||
      authUser.user_metadata?.full_name ||
      authUser.email ||
      'User',
    role: 'user',
    business_id: business?.legacy_base44_id || supabaseBusinessId,
    supabase_business_id: supabaseBusinessId,
    vendor_role: membership?.role || employee?.role || null,
    vendor_permissions: membership?.permissions || employee?.permissions || {},
    auth_provider: 'supabase',
  };
}

async function updateSupabaseUser(fields = {}) {
  const metadata = {};
  if (typeof fields.full_name === 'string') metadata.full_name = fields.full_name.trim();

  if (Object.keys(metadata).length > 0) {
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
  }

  return getSupabaseUser();
}

export const authClient = {
  async me() {
    if (USE_SUPABASE_AUTH) return getSupabaseUser();
    return base44.auth.me();
  },

  async updateMe(fields) {
    if (USE_SUPABASE_AUTH) return updateSupabaseUser(fields);
    return base44.auth.updateMe(fields);
  },

  async logout(redirectTo) {
    if (USE_SUPABASE_AUTH) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      if (redirectTo && typeof window !== 'undefined') window.location.assign(redirectTo);
      return;
    }
    return base44.auth.logout(redirectTo);
  },

  async redirectToLogin(returnTo) {
    if (USE_SUPABASE_AUTH) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      if (returnTo && typeof window !== 'undefined') window.location.assign(returnTo);
      return;
    }
    return base44.auth.redirectToLogin(returnTo);
  },
};
