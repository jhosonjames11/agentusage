import { validAgent } from './agents.mjs';
import { translate } from '../i18n/messages.mjs';
export { AGENTS, AGENT_NAMES } from './agents.mjs';
export const REFRESH_INTERVAL = 20 * 60 * 1000;
export const TIMEZONE = 'Asia/Hong_Kong';

const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
const costValue = value => Number.isFinite(value) && value >= 0 ? value : null;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const utcDate = value => new Date(`${value}T00:00:00Z`);
const isoDate = value => value.toISOString().slice(0, 10);

export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(date, amount) {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return isoDate(value);
}

export function periodRange(period, anchor = today()) {
  const date = utcDate(anchor);
  if (period === 'week') {
    const start = addDays(anchor, -((date.getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  if (period === 'month') {
    return { start: isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))), end: isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
  }
  if (period === '30days') return { start: addDays(anchor, -29), end: anchor };
  if (period === 'all') return { start: '', end: '' };
  return { start: anchor, end: anchor };
}

export function shiftPeriod(anchor, period, direction) {
  if (period === 'month') {
    const date = utcDate(anchor);
    return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)));
  }
  return addDays(anchor, direction * (period === 'week' ? 7 : period === '30days' ? 30 : 1));
}

export function rollRelativeFilters(filters, previousDay, currentDay) {
  if (!['day', 'week', 'month', '30days'].includes(filters.period)) return filters;
  const before = periodRange(filters.period, previousDay);
  if (filters.start !== before.start || filters.end !== before.end) return filters;
  return { ...filters, anchor: currentDay, ...periodRange(filters.period, currentDay) };
}

function tokenFields(row) {
  const cacheRead = number(row.cacheReadTokens ?? row.cachedInputTokens);
  const cacheWrite = number(row.cacheCreationTokens);
  // Current ccusage reports use separate token categories across sources.
  // Earlier Codex reports used cachedInputTokens inside inputTokens.
  const legacyInclusive = row.cacheReadTokens === undefined && row.cachedInputTokens !== undefined;
  const freshInput = Math.max(0, number(row.inputTokens) - (legacyInclusive ? cacheRead + cacheWrite : 0));
  const output = number(row.outputTokens);
  const input = freshInput + cacheRead + cacheWrite;
  return { freshInput, cacheRead, cacheWrite, input, output, total: Number.isFinite(row.totalTokens) && row.totalTokens >= 0 ? row.totalTokens : input + output };
}

export function normalizeReport(report, agent) {
  if (!validAgent(agent) || !Array.isArray(report?.daily)) throw new Error('无法识别 ccusage 每日报表格式，请检查版本。');
  return report.daily.map(row => {
    const date = row.date ?? row.period;
    if (!datePattern.test(date) || !Number.isFinite(utcDate(date).getTime()) || isoDate(utcDate(date)) !== date) throw new Error('ccusage 报表日期无效。');
    const modelEntries = row.modelBreakdowns ?? Object.entries(row.models ?? {}).map(([modelName, entry]) => ({ ...entry, modelName }));
    const models = modelEntries.map(model => ({
      name: model.modelName,
      agent,
      ...tokenFields(model),
      cost: costValue(model.cost ?? model.costUSD),
      missingPricing: Boolean(model.missingPricing),
      fallback: Boolean(model.isFallback),
    }));
    const unpricedModels = [...new Set([
      ...models.filter(model => model.missingPricing).map(model => model.name),
      ...(report.totals?.unpricedModels ?? []).filter(name => models.some(model => model.name === name) || (row.modelsUsed ?? []).includes(name)),
    ])].sort();
    return { date, agent, ...tokenFields(row), cost: costValue(row.totalCost ?? row.costUSD), models, unpricedModels };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeUnifiedReport(report) {
  if (!Array.isArray(report?.daily)) throw new Error('Invalid ccusage daily report.');
  const grouped = Object.create(null);
  for (const period of report.daily) {
    if (!Array.isArray(period.agents)) throw new Error('Missing per-agent breakdown. Run ccusage daily --by-agent --json.');
    const seen = new Set();
    for (const row of period.agents) {
      if (!validAgent(row.agent) || seen.has(row.agent)) throw new Error('Invalid or duplicate agent in ccusage report.');
      seen.add(row.agent);
      const normalized = normalizeReport({ daily: [{ ...row, date: period.period ?? period.date }], totals: report.totals }, row.agent);
      (grouped[row.agent] ??= []).push(...normalized);
    }
  }
  return grouped;
}

function emptyTotals() {
  return { freshInput: 0, cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0, cost: null, hitRate: null, partialCost: false, unpricedModels: [], recordedDays: 0 };
}

function accumulate(target, row) {
  for (const key of ['freshInput', 'cacheRead', 'cacheWrite', 'input', 'output', 'total']) target[key] += row[key];
  if (row.cost !== null) target.cost = (target.cost ?? 0) + row.cost;
  else target.partialCost = true;
  target.unpricedModels.push(...(row.unpricedModels ?? []));
  if (row.unpricedModels?.length) target.partialCost = true;
}

export function buildView(rows, { start = '', end = '', agent = 'all', group = 'day' } = {}) {
  const filtered = rows.filter(row => (!start || row.date >= start) && (!end || row.date <= end) && (agent === 'all' || row.agent === agent));
  const totals = emptyTotals();
  const buckets = new Map();
  const modelMap = new Map();
  const agentIds = [...new Set(filtered.map(row => row.agent))];
  const agentMap = Object.fromEntries(agentIds.map(name => [name, { ...emptyTotals(), agent: name }]));
  for (const row of filtered) {
    accumulate(totals, row);
    accumulate(agentMap[row.agent], row);
    const key = group === 'month' ? `${row.date.slice(0, 7)}-01` : group === 'week' ? periodRange('week', row.date).start : row.date;
    if (!buckets.has(key)) buckets.set(key, { ...emptyTotals(), date: key, tokensByAgent: Object.fromEntries(agentIds.map(id => [id, 0])), costByAgent: Object.fromEntries(agentIds.map(id => [id, null])), lastDate: row.date });
    const bucket = buckets.get(key);
    accumulate(bucket, row);
    bucket.tokensByAgent[row.agent] += row.total;
    if (row.cost !== null) bucket.costByAgent[row.agent] = (bucket.costByAgent[row.agent] ?? 0) + row.cost;
    bucket.lastDate = row.date > bucket.lastDate ? row.date : bucket.lastDate;
    for (const model of row.models) {
      const modelKey = `${row.agent}:${model.name}`;
      if (!modelMap.has(modelKey)) modelMap.set(modelKey, { ...emptyTotals(), name: model.name, agent: row.agent, fallback: false });
      const entry = modelMap.get(modelKey);
      accumulate(entry, { ...model, unpricedModels: model.missingPricing ? [model.name] : [] });
      entry.fallback ||= model.fallback;
    }
  }
  const finish = value => {
    value.hitRate = value.input > 0 ? value.cacheRead / value.input : null;
    value.unpricedModels = [...new Set(value.unpricedModels)].sort();
    return value;
  };
  totals.recordedDays = new Set(filtered.map(row => row.date)).size;
  return {
    totals: finish(totals),
    buckets: [...buckets.values()].map(finish).sort((a, b) => a.date.localeCompare(b.date)),
    models: [...modelMap.values()].map(finish).sort((a, b) => b.total - a.total),
    agents: agentIds.map(name => finish(agentMap[name])),
    rows: filtered,
  };
}

export function compact(value, locale = 'zh-CN') {
  if (value === null || value === undefined) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return new Intl.NumberFormat(locale).format(value);
}

export const fullNumber = (value, locale = 'zh-CN') => value == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
export const usd = value => value == null ? '—' : `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
export const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;

export function exportCsv(buckets, language = 'zh') {
  const header = ['csvPeriod', 'csvFresh', 'csvRead', 'csvWrite', 'csvInput', 'csvOutput', 'csvTotal', 'csvHit', 'csvCost', 'csvComplete'].map(key => translate(language, key));
  const lines = buckets.map(row => [row.date, row.freshInput, row.cacheRead, row.cacheWrite, row.input, row.output, row.total, row.hitRate === null ? '' : (row.hitRate * 100).toFixed(2) + '%', row.cost === null ? '' : row.cost.toFixed(6), translate(language, row.partialCost ? 'csvPartial' : 'csvKnown')]);
  return '\uFEFF' + [header, ...lines].map(line => line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
