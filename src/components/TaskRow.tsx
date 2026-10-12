import { useState } from 'react';
import { markTask } from '../lib/api';
import { taskState, type TaskState } from '../lib/board';
import type { EventRow, TaskRow as Task } from '../lib/types';
import { Btn, DeptBadge, useApp } from './ui';

const STATE: Record<TaskState, { label: string; cls: string }> = {
  new: { label: 'חדש', cls: 'bg-warning-soft text-warning' },
  updated: { label: 'עודכן מאז שאישרת', cls: 'bg-danger-soft text-danger' },
  seen: { label: 'ראיתי', cls: 'bg-primary-soft text-primary-dark' },
  done: { label: 'בוצע', cls: 'bg-success-soft text-success' },
};

export function TaskStateBadge({ state }: { state: TaskState }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE[state].cls}`}>{STATE[state].label}</span>;
}

export function TaskRow({ task, event, onChanged }: { task: Task; event: EventRow; onChanged?: () => void }) {
  const { me, people } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = me.departments.includes(task.department_id);
  const canMark = (mine || me.is_admin) && event.status === 'published';
  const state = taskState(task, event);
  const who = (id: string | null) => people.find(p => p.id === id)?.name;

  async function act(a: 'seen' | 'done' | 'undo') {
    setBusy(true); setErr(null);
    try { await markTask(task.id, a); onChanged?.(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-xl border p-3 ${mine ? 'border-primary/40 bg-primary-soft/40' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <DeptBadge id={task.department_id} />
        {event.status === 'published' && <TaskStateBadge state={state} />}
        {mine && <span className="text-[11px] font-bold text-primary">שלי</span>}
      </div>
      {task.description && <p className="mt-1.5 whitespace-pre-line text-[15px] leading-snug">{task.description}</p>}
      {(task.seen_by || task.done_by) && (
        <p className="mt-1 text-xs text-muted">
          {task.done_by ? `בוצע ע״י ${who(task.done_by) ?? ''}` : `אושר ע״י ${who(task.seen_by) ?? ''}`}
        </p>
      )}
      {canMark && (
        <div className="mt-2 flex gap-2">
          {(state === 'new' || state === 'updated') && <Btn kind="primary" disabled={busy} onClick={() => act('seen')}>ראיתי</Btn>}
          {state !== 'done' && <Btn kind="ghost" disabled={busy} onClick={() => act('done')}>בוצע ✓</Btn>}
          {state === 'done' && <Btn kind="ghost" disabled={busy} onClick={() => act('undo')}>ביטול "בוצע"</Btn>}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
