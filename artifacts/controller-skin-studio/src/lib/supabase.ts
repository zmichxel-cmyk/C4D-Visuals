import { createClient } from "@supabase/supabase-js";

// Same Supabase project the main website uses (js/supabase-client.js there) —
// reused here so orders/customizations live alongside the rest of the site's
// data instead of a separate project. VITE_SUPABASE_* come from .env (see
// .env.example) and are safe to expose client-side — that's what an anon
// key is for; row-level security on the tables is what actually protects data.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabase) {
  console.warn("[supabase] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set — checkout will not work. See .env.example.");
}
