// Sends / updates / cancels Outlook invites for one event so each person's calendar matches
// the board. Called by the app after an admin saves, publishes or cancels an event.
import { env, handler, json, requireAdminOrService, serviceClient } from '../_shared/http.ts';
import { buildIcs } from '../_shared/ics.ts';
import { planInvites } from '../_shared/invites.ts';
import { sendMailMime } from './send.ts';
import { todayLocal } from '../_shared/time.ts';

Deno.serve(handler(async req => {
  await requireAdminOrService(req);
  const { event_id } = await req.json();
  const db = serviceClient();
  const [event, tasks, people, memberships, departments, log] = await Promise.all([
    db.from('events').select('*').eq('id', event_id).single(),
    db.from('event_tasks').select('*').eq('event_id', event_id).order('sort'),
    db.from('people').select('id, name, role_title, email, is_admin, active'),
    db.from('person_departments').select('*'),
    db.from('departments').select('*'),
    db.from('invite_log').select('*').eq('event_id', event_id),
  ]);
  for (const r of [event, tasks, people, memberships, departments, log]) if (r.error) throw r.error;

  const actions = await planInvites({
    event: event.data, tasks: tasks.data!, people: people.data!, memberships: memberships.data!,
    departments: departments.data!, log: log.data!, today: todayLocal(), appUrl: env('APP_URL') ?? '',
  });

  const organizer = { name: env('MAIL_FROM_NAME') ?? 'לוח אירועים', email: env('MAIL_FROM') ?? 'events@example.com' };
  const results: { email: string; kind: string; ok: boolean; error?: string }[] = [];
  for (const a of actions) {
    const name = a.kind === 'request' ? a.person.name : a.name;
    const personId = a.kind === 'request' ? a.person.id : a.personId;
    const method = a.kind === 'request' ? 'REQUEST' : 'CANCEL';
    const ics = buildIcs(a.content, { method, sequence: a.sequence, organizer, attendee: { name, email: a.email } });
    try {
      await sendMailMime({
        from: organizer, to: { name, email: a.email }, method, ics,
        subject: `${a.kind === 'cancel' ? 'בוטל: ' : a.sequence > 0 ? 'עודכן: ' : ''}${a.content.summary}`,
        text: a.content.description,
      });
      await db.from('invite_log').upsert({
        event_id, person_id: personId, email: a.email, sequence: a.sequence,
        fingerprint: a.kind === 'request' ? a.fingerprint : null,
        state: a.kind === 'request' ? 'sent' : 'cancelled', updated_at: new Date().toISOString(),
      });
      results.push({ email: a.email, kind: a.kind, ok: true });
    } catch (e) {
      results.push({ email: a.email, kind: a.kind, ok: false, error: String((e as Error).message) });
    }
  }
  return json({ sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok), results });
}));
