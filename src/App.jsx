import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RefreshCw, ChartNoAxesColumnIncreasing, CircleCheck, CircleAlert, Clock3, Languages } from 'lucide-react';
import useUsage from './useUsage.js';
import { buildView, periodRange, rollRelativeFilters, today } from './domain/usage.mjs';
import { AGENTS, agentCatalog, agentName, validAgent } from './domain/agents.mjs';
import { useI18n } from './i18n/I18n.jsx';
import Filters from './components/Filters.jsx';
import Metrics from './components/Metrics.jsx';
import TrendChart from './components/TrendChart.jsx';
import { AgentBreakdown, CacheBreakdown, ModelBreakdown, PeriodDetails } from './components/Details.jsx';

const initialFilters = () => ({ period: 'month', anchor: today(), ...periodRange('month'), agent: 'all', group: 'day' });
function readFilters() {
  const initial = initialFilters();
  try {
    const saved = JSON.parse(localStorage.getItem('usage-dashboard-filters'));
    if (!saved || !['day', 'week', 'month', '30days', 'all', 'custom'].includes(saved.period)) return initial;
    const agent = saved.agent === 'all' || validAgent(saved.agent) ? saved.agent : 'all';
    const group = ['day', 'week', 'month'].includes(saved.group) ? saved.group : 'day';
    return saved.period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(saved.start) && /^\d{4}-\d{2}-\d{2}$/.test(saved.end) && saved.start <= saved.end ? { ...initial, ...saved, agent, group } : { ...initial, period: saved.period, ...periodRange(saved.period), agent, group };
  } catch { return initial; }
}

export default function App() {
  const { t, language, setLanguage, locale } = useI18n();
  const { snapshot, error, busy, refresh } = useUsage();
  const [filters, setFilters] = useState(readFilters);
  const [tab, setTab] = useState('overview');
  const [metric, setMetric] = useState('tokens');
  const [now, setNow] = useState(Date.now());
  const currentDay = today();
  const previousDay = useRef(currentDay);
  const time = value => value ? new Intl.DateTimeFormat(locale, { timeZone: snapshot?.timezone ?? 'Asia/Hong_Kong', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : t('notCollected');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (previousDay.current === currentDay) return;
    const before = previousDay.current;
    previousDay.current = currentDay;
    setFilters(value => rollRelativeFilters(value, before, currentDay));
  }, [currentDay]);
  useEffect(() => { try { localStorage.setItem('usage-dashboard-filters', JSON.stringify(filters)); } catch { /* Storage is optional. */ } }, [filters]);
  const catalog = useMemo(() => agentCatalog(snapshot?.catalog?.map(agent => agent.id) ?? AGENTS), [snapshot]);
  const sources = useMemo(() => catalog.map(({ id }) => ({ ...snapshot?.sources?.[id], agent: id })), [catalog, snapshot]);
  const rows = useMemo(() => sources.flatMap(source => source.rows ?? []), [sources]);
  const view = useMemo(() => buildView(rows, filters), [rows, filters]);
  const activeSources = sources.filter(source => source.rows?.length);
  const staleSources = sources.filter(source => source.status === 'stale');
  const nextSeconds = snapshot?.nextRefreshAt ? Math.max(0, Math.ceil((new Date(snapshot.nextRefreshAt).getTime() - now) / 1000)) : null;
  const countdown = nextSeconds === null ? t('autoRefresh') : nextSeconds === 0 ? t('refreshSoon') : t('refreshIn', { time: `${String(Math.floor(nextSeconds / 60)).padStart(2, '0')}:${String(nextSeconds % 60).padStart(2, '0')}` });
  const loading = !snapshot || sources.every(source => source.status === 'loading');
  const datesInvalid = Boolean(filters.start && filters.end && filters.start > filters.end);
  const selectedEmpty = filters.agent !== 'all' && snapshot?.sources?.[filters.agent]?.status === 'empty';

  return <div className="app-shell">
    <header className="app-header"><a href="/" className="brand" aria-label={t('home')}><span className="brand-icon"><ChartNoAxesColumnIncreasing size={24} strokeWidth={1.8}/></span><div><h1>{t('appName')}</h1><span>{t('tagline')}</span></div></a><div className="header-actions"><span className="local-label"><span/>{t('localData')}</span><button className="language-button" title={t('language')} onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}><Languages size={16}/><span lang={language === 'zh' ? 'en' : 'zh-CN'}>{language === 'zh' ? 'English' : '中文'}</span></button><button className="refresh-button" onClick={refresh} disabled={busy}><RefreshCw size={16} className={busy ? 'spinning' : ''}/>{busy ? t('collecting') : t('refresh')}</button></div></header>
    <nav className="page-tabs" aria-label={t('navLabel')}><button className={tab === 'overview' ? 'active' : ''} aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}><span>01</span>{t('overview')}</button><button className={tab === 'cache' ? 'active' : ''} aria-current={tab === 'cache' ? 'page' : undefined} onClick={() => setTab('cache')}><span>02</span>{t('cacheTab')}</button><div className="refresh-status"><Clock3 size={15}/><span>{busy ? t('collecting') : countdown}</span></div></nav>
    <Filters filters={filters} onChange={setFilters} catalog={catalog} sources={snapshot?.sources}/>
    <div className="notices" aria-live="polite">
      {error && <div className="notice"><CircleAlert size={16}/>{t('connectionError')}</div>}
      {snapshot?.collectionError && <div className="notice"><CircleAlert size={16}/>{t(snapshot.collectionError)}</div>}
      {staleSources.map(source => <div className="notice" key={source.agent}><CircleAlert size={16}/><span>{agentName(source.agent)} · {t('preservedAt', { time: time(source.updatedAt) })}</span></div>)}
      {snapshot?.persistenceError && <div className="notice"><CircleAlert size={16}/>{t('persistenceFailed')}</div>}
      {snapshot?.catalogWarning && <div className="notice"><CircleAlert size={16}/>{t('catalogWarning')}</div>}
      {snapshot?.ccusageWarning && <div className="notice"><CircleAlert size={16}/>{t('ccusageWarning')}</div>}
      {view.totals.unpricedModels.length > 0 && <div className="notice"><CircleAlert size={16}/><span>{t('unpricedModels', { models: view.totals.unpricedModels.join(', ') })}</span></div>}
      {datesInvalid && <div className="notice"><CircleAlert size={16}/>{t('invalidDate')}</div>}
      {selectedEmpty && <div className="source-empty-note">{t('noSourceData', { name: agentName(filters.agent) })}</div>}
    </div>
    {loading ? <div className="loading-state" role="status"><RefreshCw size={24} className="spinning"/><h3>{t('loadingTitle')}</h3><p>{t('loadingBody')}</p></div> : <main><Metrics totals={view.totals}/><TrendChart view={view} filters={filters} tab={tab} metric={metric} setMetric={setMetric}/>{tab === 'cache' ? <CacheBreakdown totals={view.totals}/> : <AgentBreakdown view={view}/>}<ModelBreakdown models={view.models}/><PeriodDetails buckets={view.buckets} group={filters.group}/></main>}
    <footer className="app-footer"><div className="source-status">{activeSources.map(source => <span key={source.agent}>{source.status === 'ready' ? <CircleCheck size={13}/> : <CircleAlert size={13}/>}<b>{agentName(source.agent)}</b><span>{time(source.updatedAt)}</span></span>)}</div><p>{t('sourcesSummary', { supported: catalog.length, active: activeSources.length })}</p><p>{t('footerBilling')}</p><p>{t('footerScope')}</p></footer>
  </div>;
}
