import { useState, useEffect, useCallback, useRef } from 'react';

export default function useUsage() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  const request = useCallback(async (refresh = false) => {
    if (pending.current) return;
    pending.current = true;
    if (refresh) setBusy(true);
    try {
      const response = await fetch(refresh ? '/api/refresh' : '/api/usage', { method: refresh ? 'POST' : 'GET', signal: AbortSignal.timeout(refresh ? 190_000 : 10_000) });
      if (!response.ok) throw new Error('本地服务暂时不可用');
      const data = await response.json();
      if (alive.current) { setSnapshot(data); setError(''); }
    } catch {
      if (alive.current) setError('connectionError');
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void request();
    // Read the cached snapshot only; the server owns the 20-minute collection.
    const timer = setInterval(() => { if (!document.hidden) void request(); }, 15_000);
    const visibility = () => { if (!document.hidden) void request(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [request]);
  return { snapshot, error, busy: busy || Boolean(snapshot?.refreshing), refresh: () => request(true) };
}
