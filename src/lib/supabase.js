// =============================================================================
// Supabase client factories — single entry point for browser + server.
//
// `getServerClient()` uses a dynamic import of `next/headers` so consumer
// modules tagged `"use client"` don't pull the server-only `next/headers`
// module into the browser bundle. This keeps one file viable for both
// runtimes, which matches how Next.js App Router resolves imports.
// =============================================================================

import { createBrowserClient, createServerClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced lazily at first call — see getBrowserClient/getServerClient below.
  // Defining the constants up front lets us validate once.
}

let browserSingleton;

/**
 * Returns a browser-scoped Supabase client. Singleton — safe to call from
 * any client component. Reads/writes auth state to cookies via `@supabase/ssr`.
 *
 * Do not call from a Server Component, Server Action, or Route Handler —
 * use `getServerClient()` there instead.
 */
export function getBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error(
      'getBrowserClient() was called server-side. Use getServerClient() ' +
      'from a Server Component or Route Handler.'
    );
  }
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'in .env.local'
    );
  }
  if (!browserSingleton) {
    browserSingleton = createBrowserClient(url, anonKey);
  }
  return browserSingleton;
}

/**
 * Returns a server-scoped Supabase client wired to Next.js cookies().
 * Only callable from a Server Component, Server Action, or Route Handler.
 *
 * Async because it dynamically imports `next/headers` to keep that module
 * out of the client bundle.
 */
export async function getServerClient() {
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'in .env.local'
    );
  }
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component context — cookie writes are forbidden here.
          // The root middleware refreshes the session on every request so
          // this is safe to swallow.
        }
      },
    },
  });
}

// `getServiceRoleClient` moved to ./supabase-admin so it can be guarded by
// `import 'server-only'`. Importing it from this file would let a client
// component silently pull SUPABASE_SERVICE_ROLE_KEY into the browser bundle.
// Import directly from '@/lib/supabase-admin' in server routes / actions.
