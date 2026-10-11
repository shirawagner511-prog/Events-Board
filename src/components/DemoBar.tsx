import { ask } from './Confirm';
import { demoCurrent, demoPeople, demoReset, demoSwitch } from '../lib/demo/api';

/** Shown only in demo mode: switch who you are looking as, or start over. */
export function DemoBar() {
  const people = demoPeople();
  return (
    <div className="flex items-center gap-2 bg-[#23203a] px-3 py-1.5 text-xs text-white">
      <span className="rounded bg-warning px-1.5 py-0.5 font-bold text-ink">דמו</span>
      <label className="flex items-center gap-1">
        צפייה בתור
        <select className="rounded bg-white/15 px-1.5 py-1 text-white" value={demoCurrent()}
          onChange={e => { demoSwitch(e.target.value); location.reload(); }}>
          {people.map(p => <option key={p.id} value={p.id} className="text-ink">{p.name}{p.role_title ? ` · ${p.role_title}` : ''}</option>)}
        </select>
      </label>
      <button className="mr-auto underline opacity-80" onClick={async () => { if (await ask('לאפס את נתוני הדמו ולהתחיל מההתחלה?', { ok: 'איפוס', danger: true })) { demoReset(); location.reload(); } }}>איפוס נתונים</button>
    </div>
  );
}
