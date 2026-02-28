import { createClient } from "@supabase/supabase-js";

let supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://xxxxxxxxxxxxxxxxxxxx.supabase.co";

// If using proxy on Vercel, dynamically construct full URL if using a relative path like '/supabase'
if (supabaseUrl.startsWith("/")) {
  supabaseUrl = window.location.origin + supabaseUrl;
}

const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "public-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey);
