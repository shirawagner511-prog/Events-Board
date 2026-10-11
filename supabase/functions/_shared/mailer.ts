// Sends a raw MIME message. Two transports, chosen by MAIL_TRANSPORT:
//  - "graph":   Microsoft 365 mailbox via Graph sendMail (app registration with Mail.Send)
//  - "mailgun": Mailgun messages.mime endpoint
// "log" (default) only prints, so the app works before mail is configured.
import { base64Utf8 } from './mime.ts';

type Env = (k: string) => string | undefined;

async function graphToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: env('GRAPH_CLIENT_ID')!, client_secret: env('GRAPH_CLIENT_SECRET')!,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  const r = await fetch(`https://login.microsoftonline.com/${env('GRAPH_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!r.ok) throw new Error(`graph token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

export async function sendMime(mime: string, to: string, env: Env): Promise<void> {
  const transport = env('MAIL_TRANSPORT') ?? 'log';
  if (transport === 'graph') {
    const token = await graphToken(env);
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env('MAIL_FROM')!)}/sendMail`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: base64Utf8(mime),
    });
    if (!r.ok) throw new Error(`graph sendMail: ${r.status} ${await r.text()}`);
  } else if (transport === 'mailgun') {
    const form = new FormData();
    form.append('to', to);
    form.append('message', new Blob([mime], { type: 'message/rfc822' }), 'message.mime');
    const r = await fetch(`https://${env('MAILGUN_HOST') ?? 'api.mailgun.net'}/v3/${env('MAILGUN_DOMAIN')}/messages.mime`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`api:${env('MAILGUN_API_KEY')}`)}` }, body: form,
    });
    if (!r.ok) throw new Error(`mailgun: ${r.status} ${await r.text()}`);
  } else {
    console.log(`[mail:log] to=${to}\n${mime.slice(0, 400)}…`);
  }
}
