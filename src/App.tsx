import { useEffect, useMemo, useState } from 'react';
import { DEMO, joinWithToken, loadMe, loadReference } from './lib/api';
import type { Department, Me, Person } from './lib/types';
import { AppCtx } from './components/ui';
import { Board } from './screens/Board';
import { DemoBar } from './components/DemoBar';
import { Toaster } from './components/Toaster';

type State =
  | { kind: 'loading' }
  | { kind: 'guest'; error?: string }
  | { kind: 'ready'; me: Me; departments: Department[]; people: Person[] };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(location.search);
      const token = params.get('join');
      try {
        if (token) {
          await joinWithToken(token);
          params.delete('join');
          history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
        }
        const me = await loadMe();
        if (!me) return setState({ kind: 'guest' });
        const ref = await loadReference();
        setState({ kind: 'ready', me, ...ref });
      } catch (e) {
        setState({ kind: 'guest', error: token ? 'הקישור לא תקין או שהוחלף. בקשו קישור חדש.' : (e as Error).message });
      }
    })();
  }, []);

  const ctx = useMemo(() => state.kind === 'ready'
    ? { me: state.me, departments: state.departments, people: state.people, dept: (id: string) => state.departments.find(d => d.id === id) }
    : null, [state]);

  if (state.kind === 'loading') return <div className="grid h-full place-items-center text-muted">טוען…</div>;
  if (state.kind === 'guest') return <Welcome error={state.error} />;
  return (
    <AppCtx.Provider value={ctx!}>
      {DEMO && <DemoBar />}
      <Board />
      <Toaster />
    </AppCtx.Provider>
  );
}

export function Welcome({ error }: { error?: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-4 h-20 w-20" />
        <h1 className="text-2xl font-extrabold">לוח אירועים</h1>
        <p className="mt-2 text-muted">הכניסה היא עם קישור אישי. בקשו מיהלי את הקישור שלכם ופתחו אותו בטלפון.</p>
        <p className="mt-2 text-sm text-muted">טיפ: אחרי הכניסה, "הוספה למסך הבית" תהפוך את הלוח לאפליקציה.</p>
        {error && <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
