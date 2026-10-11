import { useEffect, useState } from 'react';

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => { setMsg((e as CustomEvent<string>).detail); clearTimeout(timer); timer = setTimeout(() => setMsg(null), 5000); };
    window.addEventListener('app-toast', on);
    return () => { window.removeEventListener('app-toast', on); clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div role="status" className="sheet-in pointer-events-auto max-w-md rounded-2xl bg-[#23203a] px-4 py-3 text-sm text-white shadow-xl" onClick={() => setMsg(null)}>{msg}</div>
    </div>
  );
}
