import { buildInviteMime, type InviteMail } from '../_shared/mime.ts';
import { sendMime } from '../_shared/mailer.ts';

export async function sendMailMime(m: InviteMail): Promise<void> {
  await sendMime(buildInviteMime(m), m.to.email, k => Deno.env.get(k));
}
