import React from 'react';
import { compact, fullNumber, usd, percent } from '../domain/usage.mjs';
import { agentName, agentColor } from '../domain/agents.mjs';
import { useI18n } from '../i18n/I18n.jsx';

export function AgentBreakdown({ view }) {
  const { t, locale } = useI18n();
  return <section className="agent-section"><div className="section-heading"><div><h2>{t('sourcesTitle')}</h2><p>{t('filterNote')}</p></div></div><div className="agent-list">{view.agents.map(agent => <div className="agent-row" key={agent.agent}><div className="agent-name"><i className="agent-dot" style={{ background: agentColor(agent.agent) }}/><strong>{agentName(agent.agent)}</strong></div><div className="agent-share"><div className="share-track"><div style={{ background: agentColor(agent.agent), width: `${view.totals.total ? agent.total / view.totals.total * 100 : 0}%` }}/></div><span>{percent(view.totals.total ? agent.total / view.totals.total : null)}</span></div><div className="agent-count"><strong title={fullNumber(agent.total, locale)}>{compact(agent.total, locale)}</strong><span>{t('tokens')}</span></div><div className="agent-cost"><strong>{usd(agent.cost)}</strong><span>{t(agent.partialCost && agent.total > 0 ? 'partialKnown' : 'estimatedCost')}</span></div></div>)}{!view.agents.length && <div className="small-empty">{t('noRows')}</div>}</div></section>;
}

export function CacheBreakdown({ totals }) {
  const { t, locale } = useI18n();
  const parts = [{ key: 'freshInput', value: totals.freshInput, color: '#8b79bc' }, { key: 'cacheRead', value: totals.cacheRead, color: '#22755c' }, { key: 'cacheWrite', value: totals.cacheWrite, color: '#c88b43' }, { key: 'output', value: totals.output, color: '#6c9eaa' }];
  const classified = parts.reduce((sum, part) => sum + part.value, 0);
  return <section className="cache-section"><div className="section-heading"><div><h2>{t('compositionTitle')}</h2><p>{t('cacheFormula')}</p></div></div><div className="composition-bar" aria-label={t('compositionTitle')}>{parts.map(part => <div key={part.key} style={{ background: part.color, width: `${Math.max(classified, totals.total) ? part.value / Math.max(classified, totals.total) * 100 : 0}%` }} title={`${t(part.key)} ${fullNumber(part.value, locale)}`}/>)}</div><div className="composition-values">{parts.map(part => <div key={part.key}><span><i style={{ background: part.color }}/>{t(part.key)}</span><strong title={fullNumber(part.value, locale)}>{compact(part.value, locale)}</strong><small>{t('totalShare', { share: percent(totals.total ? part.value / totals.total : null) })}</small></div>)}</div>{classified !== totals.total && <p className="breakdown-note">{t('breakdownNotice')}</p>}</section>;
}

export function ModelBreakdown({ models }) {
  const { t, locale } = useI18n();
  const max = models[0]?.total || 1;
  return <section className="model-section"><div className="section-heading"><div><h2>{t('modelUsage')}</h2><p>{t('modelsSort')}</p></div><span className="section-meta">{t('modelCount', { count: models.length })}</span></div>{models.length ? <div className="model-list">{models.slice(0, 8).map(model => <div className="model-row" key={`${model.agent}:${model.name}`}><div className="model-name"><strong title={model.name}>{model.name}</strong><span>{agentName(model.agent)}</span></div><div className="model-bar"><div style={{ background: agentColor(model.agent), width: `${model.total / max * 100}%` }}/></div><strong className="model-total" title={fullNumber(model.total, locale)}>{compact(model.total, locale)}</strong><span className="model-hit">{t('cachedShare', { share: percent(model.hitRate) })}</span></div>)}</div> : <div className="small-empty">{t('noModels')}</div>}</section>;
}

export function PeriodDetails({ buckets, group }) {
  const { t, locale } = useI18n();
  return <section className="detail-section"><div className="section-heading"><div><h2>{t('periodDetails')}</h2><p>{t('aggregation', { group: t(group) })} · {t('recentFirst')}</p></div><span className="section-meta">{t('rowCount', { count: buckets.length })}</span></div><div className="table-scroll"><table><thead><tr>{['period', 'inputTotal', 'output', 'cacheRead', 'cacheWrite', 'hitRate', 'estimatedCost'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{[...buckets].reverse().map(row => <tr key={row.date}><td>{group === 'month' ? row.date.slice(0, 7) : group === 'week' ? t('weekStart', { date: row.date }) : row.date}</td>{['input', 'output', 'cacheRead', 'cacheWrite'].map(key => <td key={key} title={fullNumber(row[key], locale)}>{compact(row[key], locale)}</td>)}<td>{percent(row.hitRate)}</td><td className="cost-cell">{usd(row.cost)}{row.partialCost && <small>{t('partialKnown')}</small>}</td></tr>)}</tbody></table>{!buckets.length && <div className="small-empty">{t('noRows')}</div>}</div></section>;
}
