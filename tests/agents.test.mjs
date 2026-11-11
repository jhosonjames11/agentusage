import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSupportedAgents, agentCatalog } from '../src/domain/agents.mjs';
import { normalizeUnifiedReport, buildView } from '../src/domain/usage.mjs';

test('discovers source namespaces from installed ccusage, excluding report commands', () => {
  const help = 'USAGE:\n  ccusage <COMMANDS>\n\nCOMMANDS:\n  daily       Daily report\n  monthly     Monthly report\n  blocks      Blocks report\n  statusline  Status line\n  claude      Show Claude usage commands\n  codex       Show Codex usage commands\n  new-agent   Show future usage commands\n\nFor more info:\n  ccusage codex --help\n\nOPTIONS:\n  --json      JSON\n';
  assert.deepEqual(parseSupportedAgents(help), ['claude', 'codex', 'new-agent']);
  const catalog = agentCatalog(['codex', 'new-agent']);
  assert.equal(catalog[0].name, 'Codex');
  assert.equal(catalog[1].id, 'new-agent');
  assert.match(catalog[1].color, /^(#|hsl)/);
});

test('unrecognized CLI help fails instead of falsely reporting zero supported agents', () => {
  assert.throws(() => parseSupportedAgents('broken output'), /agent|source/i);
});

test('unified rows count each agent once and do not bill the aggregate again', () => {
  const report = { daily: [{ period: '2026-11-11', agent: 'all', inputTokens: 9999, totalCost: 999, agents: [
    { agent: 'claude', inputTokens: 100, cacheReadTokens: 200, cacheCreationTokens: 20, outputTokens: 30, totalCost: 0.4, modelBreakdowns: [{ modelName: 'sonnet', inputTokens: 100, cacheReadTokens: 200, cacheCreationTokens: 20, outputTokens: 30, cost: 0.4 }] },
    { agent: 'pi', inputTokens: 40, cacheReadTokens: 60, cacheCreationTokens: 0, outputTokens: 10, totalCost: 0.1 },
    { agent: 'future-agent', inputTokens: 70, cacheReadTokens: 30, cacheCreationTokens: 0, outputTokens: 20, totalCost: 0.2 },
  ] }] };
  const normalized = normalizeUnifiedReport(report);
  const view = buildView(Object.values(normalized).flat(), { agent: 'all', group: 'day' });
  assert.equal(view.totals.input, 520);
  assert.equal(view.totals.output, 60);
  assert.equal(view.totals.total, 580);
  assert.ok(Math.abs(view.totals.cost - 0.7) < 1e-10);
  assert.equal(view.buckets[0].tokensByAgent.claude, 350);
  assert.equal(view.buckets[0].tokensByAgent.pi, 110);
  assert.equal(view.buckets[0].costByAgent['future-agent'], 0.2);
  assert.equal(buildView(Object.values(normalized).flat(), { agent: 'pi' }).totals.total, 110);
  assert.deepEqual(view.agents.map(agent => agent.agent), ['claude', 'pi', 'future-agent']);
});

test('unified reports keep missing prices associated with the correct source', () => {
  const grouped = normalizeUnifiedReport({ daily: [{ period: '2026-11-11', agents: [{ agent: 'gemini', inputTokens: 30, outputTokens: 10, totalCost: 0, modelBreakdowns: [{ modelName: 'unknown', inputTokens: 30, outputTokens: 10, missingPricing: true }] }, { agent: 'codex', inputTokens: 10, outputTokens: 5, totalCost: 0.2 }] }] });
  assert.deepEqual(buildView(Object.values(grouped).flat(), { agent: 'gemini' }).totals.unpricedModels, ['unknown']);
  assert.deepEqual(buildView(Object.values(grouped).flat(), { agent: 'codex' }).totals.unpricedModels, []);
});

test('missing per-agent breakdown cannot masquerade as an empty report', () => {
  assert.throws(() => normalizeUnifiedReport({ daily: [{ period: '2026-11-11', totalCost: 5 }] }), /agent|报表/i);
});

test('reported total is preserved when source token categories are incomplete', () => {
  const rows = Object.values(normalizeUnifiedReport({ daily: [{ period: '2026-11-11', agents: [{ agent: 'antigravity', inputTokens: 10, outputTokens: 5, totalTokens: 30 }] }] })).flat();
  assert.equal(buildView(rows).totals.total, 30);
});

test('every shipped namespace can be normalized, filtered, and charted independently', async () => {
  const { AGENTS } = await import('../src/domain/agents.mjs');
  const rows = Object.values(normalizeUnifiedReport({ daily: [{ period: '2026-11-11', agents: AGENTS.map((agent, index) => ({ agent, inputTokens: index + 1, cacheReadTokens: 10, outputTokens: 2, totalCost: 0.01 })) }] })).flat();
  const view = buildView(rows);
  assert.equal(view.agents.length, 18);
  for (const [index, id] of AGENTS.entries()) {
    assert.equal(view.buckets[0].tokensByAgent[id], index + 13);
    assert.equal(buildView(rows, { agent: id }).totals.total, index + 13);
  }
});
