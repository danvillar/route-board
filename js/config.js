/* ============================================================
   SETUP — paste your two Supabase values between the quotes.
   Find them in Supabase: Project Settings -> API
   ============================================================ */
const SUPABASE_URL      = "https://itgmgkhnwcztuwoetywv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WTLoaCG468syuAXr-BLY9g_wefu955j";
/* ============================================================ */

export const configured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 40;
export const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
