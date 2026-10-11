// Request helpers shared by the edge functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const env = (k: string) => Deno.env.get(k);

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Allows the cron job (service-role bearer) or a signed-in admin of the app. */
export async function requireAdminOrService(req: Request): Promise<void> {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`) return;
  const user = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await user.rpc('is_admin');
  if (error || data !== true) throw new Response('forbidden', { status: 403, headers: cors });
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return json({ error: String((e as Error)?.message ?? e) }, 500);
    }
  };
}
