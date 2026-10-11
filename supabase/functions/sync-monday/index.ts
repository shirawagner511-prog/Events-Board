// Pulls recently updated submissions of the monday event form into monday_requests.
// Runs every few minutes from pg_cron (see supabase/cron.sql) and on demand from the inbox.
import { env, handler, json, requireAdminOrService, serviceClient } from '../_shared/http.ts';
import { ALL_COLUMN_IDS, mapMondayItem, type MondayItem } from '../_shared/monday.ts';

const QUERY = `query ($board: [ID!], $cols: [String!], $cursor: String) {
  boards(ids: $board) {
    items_page(limit: 100, cursor: $cursor,
      query_params: { order_by: [{ column_id: "__last_updated__", direction: desc }] }) {
      cursor
      items { id name updated_at column_values(ids: $cols) { id text value } }
    }
  }
}`;

async function fetchRecent(sinceIso: string | null): Promise<(MondayItem & { updated_at: string })[]> {
  const out: (MondayItem & { updated_at: string })[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { Authorization: env('MONDAY_API_TOKEN')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { board: [env('MONDAY_BOARD_ID')], cols: ALL_COLUMN_IDS, cursor } }),
    });
    const body = await r.json();
    if (!r.ok || body.errors) throw new Error(`monday: ${JSON.stringify(body.errors ?? body)}`);
    const pageData = body.data.boards[0]?.items_page;
    if (!pageData) break;
    let reachedOld = false;
    for (const it of pageData.items) {
      if (sinceIso && it.updated_at < sinceIso) { reachedOld = true; break; }
      out.push(it);
    }
    cursor = pageData.cursor;
    if (reachedOld || !cursor) break;
  }
  return out;
}

Deno.serve(handler(async req => {
  await requireAdminOrService(req);
  const db = serviceClient();
  const { data: state } = await db.from('sync_state').select('value').eq('key', 'monday').maybeSingle();
  const since: string | null = state?.value?.since ?? null;
  const startedAt = new Date().toISOString();

  const items = await fetchRecent(since);
  const ids = items.map(i => i.id);
  const { data: existing } = await db.from('monday_requests').select('item_id, fields').in('item_id', ids.length ? ids : ['-']);
  const known = new Map((existing ?? []).map(r => [r.item_id, JSON.stringify(r.fields)]));

  let added = 0, updated = 0, skipped = 0;
  for (const it of items) {
    const fields = mapMondayItem(it);
    if (!fields) { skipped++; continue; }
    if (known.get(it.id) === JSON.stringify(fields)) continue;
    const { error } = await db.from('monday_requests').upsert({ item_id: it.id, fields, payload: it }, { onConflict: 'item_id' });
    if (error) throw error;
    known.has(it.id) ? updated++ : added++;
  }
  // Overlap by an hour so an item edited during the previous run is never missed.
  const next = new Date(new Date(startedAt).getTime() - 3600_000).toISOString();
  await db.from('sync_state').upsert({ key: 'monday', value: { since: next, last_run: startedAt, added, updated, skipped } });
  return json({ added, updated, skipped, scanned: items.length });
}));
