// Minimal app-wide notice: toast('...') shows a message at the bottom for a few seconds.
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: message }));
}

/** Human summary of an invites sync result. */
export function invitesNote(r: { sent: number; recipients?: string[] } | { error: string }): string | null {
  if ('error' in r) return `האירוע נשמר, אבל הזימונים ל-Outlook לא נשלחו: ${r.error}`;
  if (!r.sent) return null;
  return r.recipients?.length ? `📅 זימוני Outlook: ${r.recipients.join(', ')}` : `📅 נשלחו ${r.sent} זימונים/עדכונים ל-Outlook`;
}
