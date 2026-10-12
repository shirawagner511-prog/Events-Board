import { useEffect, useState } from 'react';
import { fileUrl, listFiles } from '../lib/api';
import type { EventFile } from '../lib/types';

export const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
export const fileKind = (name: string) => (name.split('.').pop() ?? '').toUpperCase().slice(0, 4) || 'קובץ';

/** Attached files of an event, each opening in a new tab. */
export function FileList({ eventId, version }: { eventId: string; version?: string }) {
  const [files, setFiles] = useState<(EventFile & { url?: string })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listFiles(eventId)
      .then(async fs => {
        const withUrls = await Promise.all(fs.map(async f => ({ ...f, url: await fileUrl(f).catch(() => undefined) })));
        if (live) setFiles(withUrls);
      })
      .catch(e => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [eventId, version]);
  if (err) return <p className="text-sm text-danger">{err}</p>;
  if (!files.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-muted">קבצים מצורפים</h3>
      <div className="flex flex-col gap-2">
        {files.map(f => (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" download={f.url?.startsWith('blob:') ? f.name : undefined}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 hover:border-primary">
            <span className="grid h-9 w-11 shrink-0 place-items-center rounded-md bg-primary-soft text-[11px] font-extrabold text-primary-dark">{fileKind(f.name)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
            <span className="text-xs text-muted">{fileSize(f.size)}</span>
            <span className="text-sm font-bold text-primary">פתיחה</span>
          </a>
        ))}
      </div>
    </section>
  );
}
