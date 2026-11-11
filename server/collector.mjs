import { normalizeUnifiedReport, REFRESH_INTERVAL, TIMEZONE } from '../src/domain/usage.mjs';
import { AGENTS, agentCatalog } from '../src/domain/agents.mjs';

const emptySource = () => ({ rows: [], status: 'loading', errorCode: null, updatedAt: null });
const failureCode = error => ['collection_timeout', 'ccusage_missing', 'report_invalid'].includes(error?.code) ? error.code : 'collection_failed';

export function createCollector({ loadReport, discoverAgents = async () => AGENTS, persist = async () => {}, previous, now = () => Date.now() }) {
  const initialIds = [...(previous?.catalog?.map(agent => agent.id) ?? AGENTS), ...Object.keys(previous?.sources ?? {})];
  let data = {
    version: 2, timezone: TIMEZONE, refreshIntervalMs: REFRESH_INTERVAL,
    lastAttemptAt: previous?.lastAttemptAt ?? null, nextRefreshAt: null,
    catalog: agentCatalog(initialIds),
    sources: Object.fromEntries(agentCatalog(initialIds).map(({ id }) => [id, previous?.sources?.[id] ?? emptySource()])),
  };
  let running = null;
  let timer = null;
  const snapshot = () => ({ ...data, refreshing: Boolean(running) });

  function refresh() {
    if (running) return running;
    running = (async () => {
      const started = new Date(now()).toISOString();
      const [discovery, collection] = await Promise.allSettled([
        discoverAgents(),
        Promise.resolve().then(loadReport).then(report => {
          try { return { rows: normalizeUnifiedReport(report), warning: Boolean(report._ccusageWarning) }; }
          catch { throw Object.assign(new Error('report_invalid'), { code: 'report_invalid' }); }
        }),
      ]);
      const fallbackIds = data.catalog.map(agent => agent.id);
      const ids = discovery.status === 'fulfilled' && discovery.value.length ? discovery.value : fallbackIds;
      const detected = collection.status === 'fulfilled' ? Object.keys(collection.value.rows) : [];
      // Keep previously recorded sources when upgrading ccusage or recovering from an error.
      const retained = Object.keys(data.sources).filter(id => data.sources[id].rows.length);
      const catalog = agentCatalog([...ids, ...detected, ...retained]);
      const updated = new Date(now()).toISOString();
      const sources = Object.fromEntries(catalog.map(({ id }) => {
        const old = data.sources[id] ?? emptySource();
        if (collection.status === 'rejected') return [id, { ...old, status: old.rows.length ? 'stale' : 'error', errorCode: failureCode(collection.reason) }];
        const rows = collection.value.rows[id] ?? [];
        // Unified ccusage warnings are not attributed to individual sources. Preserve a
        // disappeared source until a clean report confirms that it has no records.
        if (collection.value.warning && !rows.length && old.rows.length) return [id, { ...old, status: 'stale', errorCode: 'collection_failed' }];
        return [id, { rows, status: rows.length ? 'ready' : 'empty', errorCode: null, updatedAt: updated }];
      }));
      data = { ...data, catalog, sources, lastAttemptAt: started,
        collectionError: collection.status === 'rejected' ? failureCode(collection.reason) : null,
        catalogWarning: discovery.status === 'rejected' || !discovery.value?.length,
        ccusageWarning: collection.status === 'fulfilled' && collection.value.warning,
        nextRefreshAt: new Date(now() + REFRESH_INTERVAL).toISOString(),
      };
      try { await persist(data); data.persistenceError = false; }
      catch { data.persistenceError = true; }
      return { ...data, refreshing: false };
    })().finally(() => {
      running = null;
      if (timer) {
        clearInterval(timer);
        timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL);
      }
    });
    return running;
  }

  return { snapshot, refresh,
    start() { if (!timer) timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
