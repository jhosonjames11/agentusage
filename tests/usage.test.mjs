import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReport, buildView, periodRange, rollRelativeFilters, usd } from '../src/domain/usage.mjs';

// Catches billing cached input twice and using the wrong denominator.
test('Codex input already contains cached tokens', () => {
  const rows = normalizeReport({ daily: [{ date: '2026-11-10', inputTokens: 1000, cachedInputTokens: 600, outputTokens: 200, totalTokens: 1200, costUSD: 0.02 }] }, 'codex');
  const { totals } = buildView(rows, { start: '2026-11-01', end: '2026-11-30', agent: 'all', group: 'day' });
  assert.equal(totals.freshInput, 400);
  assert.equal(totals.input, 1000);
  assert.equal(totals.total, 1200);
  assert.equal(totals.hitRate, 0.6);
  assert.equal(totals.cost, 0.02);
});

test('Hermes cache categories are separate from fresh input', () => {
  const rows = normalizeReport({ daily: [{ agent: 'hermes', period: '2026-11-10', inputTokens: 400, cacheReadTokens: 600, cacheCreationTokens: 100, outputTokens: 200, totalTokens: 1300, totalCost: 0.03 }] }, 'hermes');
  const { totals } = buildView(rows, { agent: 'all', group: 'day' });
  assert.equal(totals.freshInput, 400);
  assert.equal(totals.input, 1100);
  assert.equal(totals.cacheWrite, 100);
  assert.equal(totals.hitRate, 600 / 1100);
});

test('current ccusage Codex reports contain separate fresh and cache categories', () => {
  const rows = normalizeReport({ daily: [{ date: '2026-11-11', inputTokens: 153, cacheReadTokens: 541332, cacheCreationTokens: 244359, outputTokens: 3392, totalTokens: 789236, costUSD: 0.0379, models: { 'gpt-6-luna': { inputTokens: 153, cacheReadTokens: 541332, cacheCreationTokens: 244359, outputTokens: 3392 } } }] }, 'codex');
  const view = buildView(rows, { group: 'day' });
  assert.equal(view.totals.input, 785844);
  assert.equal(view.totals.total, 789236);
  assert.equal(view.models[0].input, 785844);
  assert.equal(view.models[0].name, 'gpt-6-luna');
});

test('unknown costs stay unavailable; missing prices are retained', () => {
  const rows = normalizeReport({ daily: [{ agent: 'hermes', period: '2026-11-10', inputTokens: 200, outputTokens: 10, modelBreakdowns: [{ modelName: 'unknown-model', inputTokens: 200, outputTokens: 10, missingPricing: true }] }], totals: { unpricedModels: ['unknown-model'] } }, 'hermes');
  const { totals } = buildView(rows, { group: 'day', agent: 'all' });
  assert.equal(totals.cost, null);
  assert.deepEqual(totals.unpricedModels, ['unknown-model']);
  assert.equal(totals.partialCost, true);
});

test('filtering excludes other agents and dates before aggregation', () => {
  const rows = ['codex', 'hermes'].flatMap(agent => normalizeReport({ daily: [{ date: '2026-10-31', inputTokens: 20, outputTokens: 2, totalCost: 9 }, { date: '2026-11-01', inputTokens: 100, outputTokens: 10, totalCost: 1 }, { date: '2026-11-02', inputTokens: 200, outputTokens: 20, totalCost: 2 }] }, agent));
  const view = buildView(rows, { start: '2026-11-01', end: '2026-11-01', agent: 'codex', group: 'month' });
  assert.equal(view.totals.input, 100);
  assert.equal(view.totals.cost, 1);
  assert.equal(view.buckets.length, 1);
  assert.equal(view.buckets[0].tokensByAgent.codex, 110);
  assert.equal(view.buckets[0].tokensByAgent.hermes, undefined);
});

test('weekly aggregation starts Monday across a year boundary', () => {
  const rows = normalizeReport({ daily: [{ date: '2025-12-31', inputTokens: 100, outputTokens: 10, totalCost: 1 }, { date: '2026-01-04', inputTokens: 200, outputTokens: 20, totalCost: 2 }, { date: '2026-01-05', inputTokens: 300, outputTokens: 30, totalCost: 3 }] }, 'codex');
  const view = buildView(rows, { group: 'week', agent: 'all' });
  assert.deepEqual(view.buckets.map(row => [row.date, row.total]), [['2025-12-29', 330], ['2026-01-05', 330]]);
});

test('month aggregation and calendar ranges handle leap days', () => {
  assert.deepEqual(periodRange('month', '2024-02-12'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(periodRange('week', '2026-11-11'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(periodRange('day', '2026-11-11'), { start: '2026-11-11', end: '2026-11-11' });
});

test('empty usage has no fabricated cache hit rate or cost', () => {
  const { totals } = buildView([], { group: 'day', agent: 'all' });
  assert.equal(totals.hitRate, null);
  assert.equal(totals.cost, null);
  assert.equal(totals.total, 0);
});

test('rejects unrelated report schemas instead of silently showing empty usage', () => {
  assert.throws(() => normalizeReport({ unexpected: [] }, 'codex'), /报表/);
});

test('relative month rolls at midnight; historical and custom ranges stay fixed', () => {
  const current = { period: 'month', anchor: '2026-11-11', start: '2026-11-01', end: '2026-11-30', agent: 'codex', group: 'week' };
  assert.deepEqual(rollRelativeFilters(current, '2026-11-30', '2026-12-01'), { ...current, anchor: '2026-12-01', start: '2026-12-01', end: '2026-12-31' });
  const history = { ...current, start: '2026-10-01', end: '2026-10-31' };
  assert.deepEqual(rollRelativeFilters(history, '2026-11-30', '2026-12-01'), history);
  const custom = { ...current, period: 'custom' };
  assert.deepEqual(rollRelativeFilters(custom, '2026-11-30', '2026-12-01'), custom);
});


test('USD formatting distinguishes zero, small costs, and missing values', () => {
  assert.equal(usd(null), '—');
  assert.equal(usd(0), '$0.00');
  assert.equal(usd(12345.678), '$12,345.68');
  assert.equal(usd(0.0043), '$0.0043');
  assert.equal(usd(0.00001), '<$0.0001');
});
