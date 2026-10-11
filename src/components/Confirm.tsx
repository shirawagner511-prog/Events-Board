import { useEffect, useState } from 'react';

// In-page confirmation dialog (the browser's confirm() is blocked in some embeds).
type Ask = { message: string; ok: string; danger?: boolean; resolve: (v: boolean) => void };

export function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('app-ask', { detail: { message, ok: opts.ok ?? 'אישור', danger: opts.danger, resolve } }));
  });
}

export function ConfirmHost() {
  const [q, setQ] = useState<Ask | null>(null);
  useEffect(() => {
    const on = (e: Event) => setQ((e as CustomEvent<Ask>).detail);
    window.addEventListener('app-ask', on);
    return () => window.removeEventListener('app-ask', on);
  }, []);
  if (!q) return null;
  const done = (v: boolean) => { q.resolve(v); setQ(null); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={() => done(false)}>
      <div role="alertdialog" aria-modal="true" className="sheet-in w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="text-[15px] font-semibold leading-snug">{q.message}</p>
        <div className="mt-4 flex gap-2">
          <button autoFocus onClick={() => done(true)} className={`min-h-10 flex-1 rounded-xl px-4 text-sm font-bold text-white ${q.danger ? 'bg-danger' : 'bg-primary'}`}>{q.ok}</button>
          <button onClick={() => done(false)} className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold">חזרה</button>
        </div>
      </div>
    </div>
  );
}
