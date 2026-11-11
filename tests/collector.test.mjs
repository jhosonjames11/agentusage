import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollector } from '../server/collector.mjs';

const row = (agent, value) => ({ agent, inputTokens: value, cacheReadTokens: 40, cacheCreationTokens: 10, outputTokens: 5, totalCost: 0.1 });
const report = (value, agents = ['codex', 'hermes']) => ({ daily: [{ period: '2026-11-11', agents: agents.map(agent => row(agent, value)) }] });

test('warned unified report retains a disappeared source while other sources update', async () => {
  let round = 0;
  const collector = createCollector({ loadReport: async () => round ? { ...report(200, ['codex']), _ccusageWarning: true } : report(100) });
  await collector.refresh(); round = 1;
  const snapshot = await collector.refresh();
  assert.equal(snapshot.sources.codex.rows[0].freshInput, 200);
  assert.equal(snapshot.sources.hermes.rows[0].freshInput, 100);
  assert.equal(snapshot.sources.hermes.status, 'stale');
  assert.equal(snapshot.sources.codex.status, 'ready');
  assert.equal(snapshot.ccusageWarning, true);
});

test('all supported namespaces appear; unused agents are empty rather than errors', async () => {
  const collector = createCollector({ discoverAgents: async () => ['claude', 'codex', 'hermes', 'new-agent'], loadReport: async () => report(100) });
  const snapshot = await collector.refresh();
  assert.equal(snapshot.catalog.length, 4);
  assert.equal(snapshot.sources['new-agent'].status, 'empty');
  assert.deepEqual(snapshot.sources.claude.rows, []);
  assert.equal(snapshot.sources.claude.errorCode, null);
});

test('detected future agent is retained if help discovery fails', async () => {
  const collector = createCollector({ discoverAgents: async () => { throw new Error('help unavailable'); }, loadReport: async () => report(100, ['future-agent']) });
  const snapshot = await collector.refresh();
  assert.equal(snapshot.sources['future-agent'].status, 'ready');
  assert.ok(snapshot.catalog.some(agent => agent.id === 'future-agent'));
  assert.equal(snapshot.catalogWarning, true);
});

test('concurrent refreshes share one unified collection and one persisted snapshot', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let loads = 0, saves = 0;
  const collector = createCollector({ loadReport: async () => { loads++; await gate; return report(100); }, persist: async () => { saves++; } });
  const a = collector.refresh(), b = collector.refresh(); release();
  assert.deepEqual(await a, await b);
  assert.equal(loads, 1); assert.equal(saves, 1);
});

test('background collector refreshes after 20 minutes without browser requests', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  let loads = 0;
  const collector = createCollector({ loadReport: async () => { loads++; return report(100); } });
  await collector.refresh(); collector.start();
  t.mock.timers.tick(1_199_999); await new Promise(resolve => setImmediate(resolve)); assert.equal(loads, 1);
  t.mock.timers.tick(1); await new Promise(resolve => setImmediate(resolve)); assert.equal(loads, 2);
  collector.stop();
});

test('first collection failure is an error with no fabricated zero rows', async () => {
  const collector = createCollector({ loadReport: async () => { throw Object.assign(new Error('private path'), { code: 'ccusage_missing' }); } });
  const snapshot = await collector.refresh();
  assert.equal(snapshot.sources.codex.status, 'error');
  assert.deepEqual(snapshot.sources.codex.rows, []);
  assert.equal(snapshot.sources.codex.updatedAt, null);
  assert.equal(snapshot.collectionError, 'ccusage_missing');
  assert.ok(!JSON.stringify(snapshot).includes('private path'));
});

test('reloading v1 persisted data keeps it when the unified collection fails', async () => {
  const first = createCollector({ loadReport: async () => report(100) });
  const previous = { ...(await first.refresh()), version: 1 }; delete previous.catalog;
  const next = createCollector({ previous, loadReport: async () => { throw new Error('offline'); } });
  assert.equal(next.snapshot().sources.hermes.rows.length, 1);
  const snapshot = await next.refresh();
  assert.equal(snapshot.sources.hermes.rows[0].input, 150);
  assert.equal(snapshot.sources.hermes.status, 'stale');
  assert.equal(snapshot.version, 2);
});

test('manual refresh restarts the 20-minute deadline shown to the user', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  let loads = 0;
  const collector = createCollector({ loadReport: async () => { loads++; return report(100); } });
  await collector.refresh(); collector.start();
  t.mock.timers.tick(600_000); await collector.refresh();
  assert.equal(collector.snapshot().nextRefreshAt, '1970-01-01T00:30:00.000Z');
  t.mock.timers.tick(600_000); await new Promise(resolve => setImmediate(resolve)); assert.equal(loads, 2);
  t.mock.timers.tick(600_000); await new Promise(resolve => setImmediate(resolve)); assert.equal(loads, 3);
  collector.stop();
});

test('a clean empty report clears removed local history', async () => {
  const previous = await createCollector({ loadReport: async () => report(100) }).refresh();
  const snapshot = await createCollector({ previous, loadReport: async () => ({ daily: [] }) }).refresh();
  assert.deepEqual(snapshot.sources.hermes.rows, []);
  assert.equal(snapshot.sources.hermes.status, 'empty');
});

test('persistence failure leaves collected rows available', async () => {
  const snapshot = await createCollector({ loadReport: async () => report(100), persist: async () => { throw new Error('not writable'); } }).refresh();
  assert.equal(snapshot.persistenceError, true);
  assert.equal(snapshot.sources.codex.status, 'ready');
});

test('invalid unified schemas produce a translated error code and keep history', async () => {
  const previous = await createCollector({ loadReport: async () => report(100) }).refresh();
  const snapshot = await createCollector({ previous, loadReport: async () => ({ daily: [{ date: '2026-11-11', inputTokens: 999 }] }) }).refresh();
  assert.equal(snapshot.collectionError, 'report_invalid');
  assert.equal(snapshot.sources.codex.rows[0].freshInput, 100);
  assert.equal(snapshot.sources.codex.status, 'stale');
});
