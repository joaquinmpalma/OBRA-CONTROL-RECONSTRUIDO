/* OBRA CONTROL v14 · Adaptador cloud con Supabase Auth + RLS */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://amdpkclysxctgtqmjrcc.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p9BCtqGwvVbc4WXV93HSUQ_WskjZYkd';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  async function getProfile(userId) {
    const { data, error } = await client.from('profiles')
      .select('id,full_name,username,role,active')
      .eq('id', userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function get(moduleName) {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await client.from('obra_control_v14_state')
      .select('state').eq('user_id', session.user.id).eq('module', moduleName).maybeSingle();
    if (error) throw error;
    return data ? data.state : null;
  }
  async function put(moduleName, state) {
    const session = await getSession();
    if (!session) return false;
    const { error } = await client.from('obra_control_v14_state').upsert({
      user_id: session.user.id,
      module: moduleName,
      state,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,module' });
    if (error) throw error;
    return true;
  }
  window.OBRA_CLOUD = { client, getSession, signIn, signOut, getProfile, get, put };
})();
