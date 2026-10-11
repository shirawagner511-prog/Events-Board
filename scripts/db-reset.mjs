// Drops and rebuilds the public schema from supabase/migrations + seed.sql.
// Against a plain local Postgres it first creates a minimal stand-in for Supabase's
// auth schema and roles, so the RLS tests run without the Supabase stack.
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const LOCAL_SUPABASE_STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
`;

const RESET_SQL = `
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
`;

// Wipes the whole public schema, so it only ever runs against a local database
// unless explicitly allowed (e.g. a dedicated test project).
export function assertSafeTarget(url = process.env.DATABASE_URL ?? '') {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_REMOTE_DB_RESET !== '1') {
    throw new Error(`refusing to reset non-local database "${host}" (set ALLOW_REMOTE_DB_RESET=1 to override)`);
  }
}

export async function resetDb() {
  assertSafeTarget();
  const client = new pg.Client(process.env.DATABASE_URL);
  await client.connect();
  try {
    const { rows } = await client.query(`select to_regprocedure('auth.uid()') is not null as has_auth`);
    if (!rows[0].has_auth) await client.query(LOCAL_SUPABASE_STUB);
    await client.query(RESET_SQL);
    const dir = join(root, 'supabase', 'migrations');
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(dir, f), 'utf8'));
    }
    await client.query(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));
    await client.query(`notify pgrst, 'reload schema';`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetDb().then(() => console.log('db reset complete')).catch(e => { console.error(e); process.exit(1); });
}
