// DB test helpers. Tests always run against TEST_DATABASE_URL (default: local Postgres),
// never the app's DATABASE_URL.
import pg from 'pg';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/events_test';
export { resetDb } from '../../scripts/db-reset.mjs';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function q(sql, params = []) {
  return (await pool.query(sql, params)).rows;
}

// Runs fn(query) as an authenticated Supabase user with the given auth uid, inside a
// transaction that is rolled back unless commit is true.
export async function asUser(uid, fn, { commit = true } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await c.query('set local role authenticated');
    const run = async (sql, params = []) => (await c.query(sql, params)).rows;
    const out = await fn(run);
    await c.query(commit ? 'commit' : 'rollback');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Creates a person (as superuser) and binds a fresh device uid to them.
export async function makePerson({ name, isAdmin = false, departments = [] }) {
  const [p] = await q(`insert into people (name, is_admin) values ($1, $2) returning id, link_token`, [name, isAdmin]);
  for (const d of departments) await q(`insert into person_departments values ($1, $2)`, [p.id, d]);
  const uid = (await q(`select gen_random_uuid() as u`))[0].u;
  await asUser(uid, run => run(`select claim_link($1)`, [p.link_token]));
  return { id: p.id, uid, token: p.link_token };
}
