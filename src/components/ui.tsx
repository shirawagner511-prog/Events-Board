import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Department, Me, Person } from '../lib/types';

export interface AppData { me: Me; departments: Department[]; people: Person[]; dept: (id: string) => Department | undefined }
export const AppCtx = createContext<AppData>(null!);
export const useApp = () => useContext(AppCtx);

export function Sheet({ onClose, children, title, full }: { onClose: () => void; children: ReactNode; title?: ReactNode; full?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`sheet-in flex w-full flex-col bg-surface shadow-2xl sm:max-w-xl sm:rounded-2xl ${full ? 'h-[100dvh] sm:h-[90dvh]' : 'max-h-[92dvh] rounded-t-2xl'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 text-lg font-bold">{title}</div>
          <button aria-label="סגירה" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-xl text-muted hover:bg-surface-2">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

type BtnKind = 'primary' | 'ghost' | 'soft' | 'danger' | 'success';
const KIND: Record<BtnKind, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  soft: 'bg-primary-soft text-primary-dark hover:bg-primary-soft/70',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 border border-line',
  danger: 'bg-danger-soft text-danger hover:bg-danger-soft/70',
  success: 'bg-success text-white hover:brightness-95',
};
export function Btn({ kind = 'primary', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  return <button {...p} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${KIND[kind]} ${className}`} />;
}

export function DeptBadge({ id, small }: { id: string; small?: boolean }) {
  const d = useApp().dept(id);
  const color = d?.color ?? '#888';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}
      style={{ background: `${color}1f`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {d?.name ?? id}
    </span>
  );
}

export function Time({ t }: { t: string | null | undefined }) {
  return t ? <span className="ltr">{t.slice(0, 5)}</span> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-muted">{children}</div>;
}
