import React from 'react';
import { compact, fullNumber, usd, percent } from '../domain/usage.mjs';
import { useI18n } from '../i18n/I18n.jsx';

export default function Metrics({ totals }) {
  const { t, locale } = useI18n();
  const metrics = [
    { label: t('estimatedCost'), value: usd(totals.cost), note: t(totals.partialCost ? 'costKnown' : 'costEstimate'), primary: true, title: t('costHelp') },
    { label: t('inputTokens'), value: compact(totals.input, locale), note: t('inputNote'), title: fullNumber(totals.input, locale) },
    { label: t('outputTokens'), value: compact(totals.output, locale), note: t('outputNote'), title: fullNumber(totals.output, locale) },
    { label: t('cacheHitRate'), value: percent(totals.hitRate), note: t('cacheNote', { tokens: compact(totals.cacheRead, locale) }), title: t('cacheHelp') },
  ];
  return <section className="metrics" aria-label={t('periodMetrics')}>{metrics.map(metric => <div className={`metric ${metric.primary ? 'primary' : ''}`} key={metric.label} title={metric.title}><span className="metric-label">{metric.label}</span><strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span></div>)}</section>;
}
