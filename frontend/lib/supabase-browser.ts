// Lazy, memoized browser Supabase client. Extracted verbatim from app/page.tsx
// during the Phase A foundation refactor. Client-only (guards on window).

let supabaseClientPromise: Promise<any> | null = null;

export async function getSharedSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  if (typeof window === 'undefined') return null;
  const globalKey = '__bullseyeSupabaseClient';
  const browserWindow = window as any;
  if (browserWindow[globalKey]) return browserWindow[globalKey];
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      if (!browserWindow[globalKey]) {
        browserWindow[globalKey] = createClient(supabaseUrl, supabaseKey);
      }
      return browserWindow[globalKey];
    });
  }
  return supabaseClientPromise;
}
