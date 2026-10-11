import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, pool, q, asUser, makePerson } from './helpers/db.mjs';

let yahli, liel, sagi;
const stranger = '00000000-0000-0000-0000-00000000dead';

before(async () => {
  await resetDb();
  yahli = await makePerson({ name: 'יהלי', isAdmin: true, departments: ['events'] });
  liel = await makePerson({ name: 'ליאל', departments: ['mk'] });
  sagi = await makePerson({ name: 'שגיא', departments: ['kitchen'] });
});
after(() => pool.end());

const saveEvent = (uid, event, tasks = []) =>
  asUser(uid, run => run(`select save_event($1::jsonb, $2::jsonb) as id`, [JSON.stringify(event), JSON.stringify(tasks)]))
    .then(r => r[0].id);

test('device without a claimed link sees nothing', async () => {
  const rows = await asUser(stranger, run => run(`select * from departments`));
  assert.equal(rows.length, 0);
});

test('invalid link is rejected', async () => {
  await assert.rejects(asUser(stranger, run => run(`select claim_link(gen_random_uuid())`)), /invalid link/);
});

test('me() returns the claimed person with departments', async () => {
  const [{ me }] = await asUser(liel.uid, run => run(`select me()`));
  assert.equal(me.name, 'ליאל');
  assert.deepEqual(me.departments, ['mk']);
  assert.equal(me.is_admin, false);
});

test('link_token is not readable through the people table', async () => {
  await assert.rejects(asUser(liel.uid, run => run(`select link_token from people`)), /permission denied/);
});

test('only admins save events; drafts are hidden until published', async () => {
  await assert.rejects(saveEvent(liel.uid, { title: 'x', event_date: '2026-10-20' }), /admin only/);
  const id = await saveEvent(yahli.uid, { title: 'האפי אוור', event_date: '2026-10-20', start_time: '16:00' },
    [{ department_id: 'mk', description: 'שתייה' }, { department_id: 'kitchen', description: 'מגשי אירוח' }]);
  assert.equal((await asUser(liel.uid, run => run(`select id from events where id = $1`, [id]))).length, 0);
  await asUser(yahli.uid, run => run(`select set_event_status($1, 'published')`, [id]));
  const [e] = await asUser(liel.uid, run => run(`select title, published_at from events where id = $1`, [id]));
  assert.equal(e.title, 'האפי אוור');
  assert.ok(e.published_at);
  assert.equal((await asUser(liel.uid, run => run(`select * from event_tasks where event_id = $1`, [id]))).length, 2);
});

test('people mark only their own department tasks', async () => {
  const id = await saveEvent(yahli.uid, { title: 'פיקניק', event_date: '2026-10-21' },
    [{ department_id: 'mk', description: 'קיפול' }]);
  const [t] = await q(`select id from event_tasks where event_id = $1`, [id]);
  await assert.rejects(asUser(sagi.uid, run => run(`select mark_task($1, 'seen')`, [t.id])), /not your department/);
  await asUser(liel.uid, run => run(`select mark_task($1, 'done')`, [t.id]));
  const [row] = await q(`select seen_by, done_by, done_at from event_tasks where id = $1`, [t.id]);
  assert.equal(row.done_by, liel.id);
  assert.equal(row.seen_by, liel.id);
});

test('re-saving keeps marks on unchanged tasks and bumps changed ones', async () => {
  const id = await saveEvent(yahli.uid, { title: 'כיבוד', event_date: '2026-10-22' },
    [{ department_id: 'mk', description: 'פלטות' }, { department_id: 'kitchen', description: 'פירות' }]);
  const tasks = await q(`select id, department_id, content_updated_at from event_tasks where event_id = $1 order by sort`, [id]);
  await asUser(liel.uid, run => run(`select mark_task($1, 'seen')`, [tasks[0].id]));
  await saveEvent(yahli.uid, { id, title: 'כיבוד', event_date: '2026-10-22' },
    [{ id: tasks[0].id, department_id: 'mk', description: 'פלטות' }, { id: tasks[1].id, department_id: 'kitchen', description: 'פירות + ירקות' }]);
  const after = await q(`select id, seen_at, content_updated_at from event_tasks where event_id = $1 order by sort`, [id]);
  assert.ok(after[0].seen_at, 'seen mark kept');
  assert.equal(+after[0].content_updated_at, +tasks[0].content_updated_at);
  assert.ok(after[1].content_updated_at > tasks[1].content_updated_at);
  // dropping a task deletes it
  await saveEvent(yahli.uid, { id, title: 'כיבוד', event_date: '2026-10-22' }, [{ id: tasks[0].id, department_id: 'mk', description: 'פלטות' }]);
  assert.equal((await q(`select 1 from event_tasks where event_id = $1`, [id])).length, 1);
});

test('editing an event bumps content_updated_at; unrelated saves do not', async () => {
  const id = await saveEvent(yahli.uid, { title: 'פוקר', event_date: '2026-10-23', location: 'קומה 5' });
  const [a] = await q(`select content_updated_at from events where id = $1`, [id]);
  await saveEvent(yahli.uid, { id, title: 'פוקר', event_date: '2026-10-23', location: 'קומה 5' });
  const [b] = await q(`select content_updated_at from events where id = $1`, [id]);
  assert.equal(+a.content_updated_at, +b.content_updated_at);
  await saveEvent(yahli.uid, { id, title: 'פוקר', event_date: '2026-10-23', location: 'קומה 4' });
  const [c] = await q(`select content_updated_at from events where id = $1`, [id]);
  assert.ok(c.content_updated_at > b.content_updated_at);
});

test('reset link signs out devices', async () => {
  const p = await makePerson({ name: 'ענבר', departments: ['kitchen'] });
  await asUser(yahli.uid, run => run(`select admin_reset_link($1)`, [p.id]));
  const [{ me }] = await asUser(p.uid, run => run(`select me()`));
  assert.equal(me, null);
});

test('admin cannot remove own admin rights', async () => {
  await assert.rejects(asUser(yahli.uid, run =>
    run(`select admin_save_person($1, 'יהלי', null, null, false, '{events}')`, [yahli.id])), /own admin/);
});

test('monday form suggests and links to a hand-entered event, filling only blanks', async () => {
  const id = await saveEvent(yahli.uid, { title: 'אוקטובר פסט', event_date: '2026-10-18', start_time: '13:00', location: 'מועדון' });
  await q(`insert into monday_requests (item_id, fields) values ('m1', $1)`, [JSON.stringify({
    title: 'Oktoberfest Hila', event_date: '2026-10-18', start_time: '13:00', location: 'Club', guests: 80, requester: 'הילה' })]);
  const [r] = await q(`select suggested_event_id from monday_requests where item_id = 'm1'`);
  assert.equal(r.suggested_event_id, id);
  await asUser(yahli.uid, run => run(`select admin_link_request('m1', $1)`, [id]));
  const [e] = await q(`select location, guests, requester, monday_item_id from events where id = $1`, [id]);
  assert.deepEqual(e, { location: 'מועדון', guests: 80, requester: 'הילה', monday_item_id: 'm1' });
  // the form is edited later -> event flagged
  await q(`update monday_requests set fields = fields || '{"guests": 100}' where item_id = 'm1'`);
  assert.equal((await q(`select monday_dirty from events where id = $1`, [id]))[0].monday_dirty, true);
});

test('monday form can become a new draft', async () => {
  await q(`insert into monday_requests (item_id, fields) values ('m2', $1)`, [JSON.stringify({
    title: 'Welcome breakfast', event_date: '2026-11-02', start_time: '09:00', guests: 30 })]);
  const [{ id }] = await asUser(yahli.uid, run => run(`select admin_create_from_request('m2') as id`));
  const [e] = await q(`select title, status, guests, source from events where id = $1`, [id]);
  assert.deepEqual(e, { title: 'Welcome breakfast', status: 'pending', guests: 30, source: 'monday' });
});

test('non-admins cannot see monday requests', async () => {
  assert.equal((await asUser(liel.uid, run => run(`select * from monday_requests`))).length, 0);
});
