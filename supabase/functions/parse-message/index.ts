// Turns a pasted WhatsApp / email thread into a draft event the admin reviews before saving.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { z } from 'npm:zod@3';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import { handler, json, requireAdminOrService } from '../_shared/http.ts';
import { todayLocal } from '../_shared/time.ts';

const Draft = z.object({
  title: z.string(),
  event_date: z.string().describe('YYYY-MM-DD'),
  start_time: z.string().nullable().describe('HH:MM, 24h'),
  end_time: z.string().nullable(),
  prep_time: z.string().nullable().describe('when the team must leave / start setting up'),
  location: z.string().nullable(),
  guests: z.number().int().nullable(),
  menu: z.string().nullable().describe('one item per line'),
  requester: z.string().nullable(),
  lead: z.string().nullable().describe('who runs the event on site (מוציא)'),
  teardown: z.string().nullable().describe('who clears up (מקפל)'),
  suppliers: z.string().nullable().describe('external suppliers'),
  notes: z.string().nullable(),
  tasks: z.array(z.object({
    department_id: z.enum(['events', 'kitchen', 'mk', 'cafe', 'ops', 'site']),
    description: z.string(),
  })),
  uncertain: z.array(z.string()).describe('fields that were guessed or missing, in Hebrew'),
});

const SYSTEM = `You prepare event drafts for the catering team of a hi-tech campus (cafe, kitchenettes, breakfast, health bar, events).
The admin pastes a WhatsApp or email thread in Hebrew (sometimes English). Extract one event.
Write every text field in Hebrew, short, the way the team writes its weekly board.
Departments: events = אירועים (יהלי), kitchen = מטבח (שגיא השף, ענבר), mk = מטבחונים (ליאל: drinks, equipment, set-up and folding),
cafe = קפה ובר בריאות (לירן: staff for events, sweet/savory pastries), ops = אופרציה (שירה), site = ניהול אתר (ענת).
Only add a task when the thread implies work for that department. Resolve relative dates ("מחר", "ביום שלישי") against today's date.
Leave a field null rather than inventing it, and list guessed or missing fields in "uncertain".`;

const client = new Anthropic();

Deno.serve(handler(async req => {
  await requireAdminOrService(req);
  const { text } = await req.json();
  if (typeof text !== 'string' || !text.trim()) return json({ error: 'empty text' }, 400);
  const today = todayLocal();
  const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date());

  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: zodOutputFormat(Draft) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `היום ${weekday}, ${today}.\n\n<thread>\n${text}\n</thread>` }],
  });
  if (response.stop_reason === 'refusal') return json({ error: 'refused' }, 422);
  if (!response.parsed_output) return json({ error: 'could not parse' }, 422);
  return json({ draft: response.parsed_output });
}));
