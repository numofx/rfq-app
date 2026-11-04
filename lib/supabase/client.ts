import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const AUTH_KEY_PREFIX = "sb-";
const PAGE_LEFT_KEY = "numo:page-left";

function removeAuthKeys(storage: Storage) {
  Object.keys(storage)
    .filter((key) => key.startsWith(AUTH_KEY_PREFIX))
    .forEach((key) => storage.removeItem(key));
}

/**
 * Keeps the session in sessionStorage, so it ends with the tab. Browsers bring sessionStorage back when a closed tab
 * is reopened, and keep it through a reload, so any load after the page was left ends the session as well.
 */
function getTabStorage() {
  if (typeof window === "undefined") return undefined;

  try {
    const storage = window.sessionStorage;

    if (storage.getItem(PAGE_LEFT_KEY)) {
      removeAuthKeys(storage);
    }
    storage.removeItem(PAGE_LEFT_KEY);
    window.addEventListener("pagehide", () => storage.setItem(PAGE_LEFT_KEY, "1"));

    // Sessions from before this change would otherwise stay on disk.
    removeAuthKeys(window.localStorage);

    return storage;
  } catch {
    return undefined;
  }
}

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: getTabStorage() } })
  : null;
