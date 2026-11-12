import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download, BarChart3 } from 'lucide-react';
import { compact, usd, percent, exportCsv } from '../domain/usage.mjs';
import { agentColor, agentName } from '../domain/agents.mjs';
import { useI18n } from '../i18n/I18n.jsx';

const CACHE_COLORS = { freshInput: '#8b79bc', cacheRead: '#22755c', cacheWrite: '#c88b43', output: '#6c9eaa' };
function ChartTooltip({ active, payload, label, metric }) {
  const { t, locale } = useI18n();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map(entry => <div key={entry.name}><span><i style={{ background: entry.color }}/>{entry.name}</span><b>{metric === 'cost' ? usd(entry.value) : compact(entry.value, locale)}</b></div>)}<div className="tooltip-total"><span>{t(metric === 'cost' ? 'estimatedCost' : 'total')}</span><b>{metric === 'cost' ? usd(row.cost) : compact(row.total, locale)}</b></div><small>{t('cacheHitRate')} {percent(row.hitRate)}{row.partialCost ? ` · ${t('partialKnown')}` : ''}</small></div>;
}

export default function TrendChart({ view, filters, tab, metric, setMetric }) {
  const { t, language, locale } = useI18n();
  const cost = metric === 'cost';
  const cache = tab === 'cache' && !cost;
  const series = cache ? Object.entries(CACHE_COLORS).map(([key, color]) => ({ key, color, name: t(key), value: row => row[key] })) : view.agents.map(({ agent }) => ({ key: agent, color: agentColor(agent), name: agentName(agent), value: row => cost ? row.costByAgent[agent] : row.tokensByAgent[agent] }));
  const title = t(cache ? 'tokenAllocation' : cost ? 'costTrend' : 'tokenTrend');
  const dateLabel = view.buckets.length ? `${view.rows.reduce((min, row) => row.date < min ? row.date : min, view.rows[0].date)} — ${view.rows.reduce((max, row) => row.date > max ? row.date : max, view.rows[0].date)}` : t('noPeriodRecords');
  const download = () => {
    const blob = new Blob([exportCsv(view.buckets, language)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${t('exportPrefix')}-${filters.agent}-${filters.group}-${filters.start || 'all'}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="chart-panel"><div className="section-heading"><div><h2>{title}</h2><p>{dateLabel} · {t('aggregation', { group: t(filters.group) })}</p></div><div className="chart-controls"><div className="metric-switch" role="group" aria-label={t('chartMetric')}><button aria-pressed={!cost} className={!cost ? 'selected' : ''} onClick={() => setMetric('tokens')}>{t('tokens')}</button><button aria-pressed={cost} className={cost ? 'selected' : ''} onClick={() => setMetric('cost')}>{t('cost')}</button></div><button className="export-button" onClick={download} disabled={!view.buckets.length}><Download size={15}/>{t('export')}</button></div></div>
    <div className="chart-legend">{series.map(entry => <span key={entry.key}><i style={{ background: entry.color }}/>{entry.name}</span>)}<span className="legend-unit">{t(cost ? 'unitUSD' : 'unitTokens')}</span></div>
    <div className="chart-frame">{view.buckets.length === 0 ? <div className="empty-chart"><BarChart3 size={34} strokeWidth={1.3}/><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p></div> : <ResponsiveContainer width="100%" height="100%"><ComposedChart data={view.buckets} margin={{ top: 15, right: 12, bottom: 8, left: 4 }} accessibilityLayer><CartesianGrid vertical={false} stroke="#e9e9e7"/><XAxis dataKey="date" tickFormatter={value => filters.group === 'month' ? value.slice(0, 7) : value.slice(5).replace('-', '/')} tick={{ fill: '#777b82', fontSize: 12 }} axisLine={{ stroke: '#e2e3e5' }} tickLine={false} minTickGap={35} dy={12}/><YAxis tickFormatter={value => cost ? (value >= 1000 ? `$${compact(value, locale)}` : usd(value)) : compact(value, locale)} tick={{ fill: '#777b82', fontSize: 12 }} axisLine={false} tickLine={false} width={cost ? 84 : 66} tickCount={5}/><Tooltip content={<ChartTooltip metric={metric}/>} cursor={{ fill: '#f3f4f5', fillOpacity: .6 }}/>{series.map(entry => cost ? <Area key={entry.key} name={entry.name} type="monotone" dataKey={entry.value} stackId="cost" stroke={entry.color} strokeWidth={2} fill={entry.color} fillOpacity={.12} isAnimationActive={false} connectNulls={false}/> : <Bar key={entry.key} name={entry.name} dataKey={entry.value} stackId="tokens" fill={entry.color} maxBarSize={44} isAnimationActive={false}/>)}</ComposedChart></ResponsiveContainer>}</div>
    <div className="chart-footnote"><span>{t('totalSummary', { tokens: compact(view.totals.total, locale), days: view.totals.recordedDays })}</span><span>{t(filters.group === 'day' ? 'retainedLogs' : 'rangeEdges')}</span></div>
  </section>;
}
