"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para el navegador (usa la publishable/anon key).
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabase() {
  if (!supabaseConfigured()) return null;
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}
