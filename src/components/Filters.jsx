import React from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { periodRange, shiftPeriod, today, TIMEZONE } from '../domain/usage.mjs';
import { useI18n } from '../i18n/I18n.jsx';

const PERIODS = [['day', 'today'], ['week', 'thisWeek'], ['month', 'thisMonth'], ['30days', 'last30'], ['all', 'allHistory'], ['custom', 'custom']];
export default function Filters({ filters, onChange, catalog, sources }) {
  const { t } = useI18n();
  const setPeriod = period => {
    const anchor = today();
    onChange({ ...filters, period, anchor, ...(period === 'custom' ? {} : periodRange(period, anchor)) });
  };
  const shift = direction => {
    const anchor = shiftPeriod(filters.anchor, filters.period, direction);
    onChange({ ...filters, anchor, ...periodRange(filters.period, anchor) });
  };
  const withData = catalog.filter(agent => sources?.[agent.id]?.rows?.length);
  const withoutData = catalog.filter(agent => !sources?.[agent.id]?.rows?.length);
  return <section className="filter-bar" aria-label={t('filtersLabel')}>
    <div className="filter-top"><div className="period-buttons" role="group" aria-label={t('dateRange')}>{PERIODS.map(([value, key]) => <button key={value} className={filters.period === value ? 'selected' : ''} onClick={() => setPeriod(value)} aria-pressed={filters.period === value}>{t(key)}</button>)}</div>
      <div className="filter-selects"><label>{t('tool')}<select aria-label={t('tool')} value={filters.agent} onChange={event => onChange({ ...filters, agent: event.target.value })}><option value="all">{t('allAgents')}</option>{[[withData, 'withData'], [withoutData, 'withoutData']].filter(([agents]) => agents.length).map(([agents, key]) => <optgroup key={key} label={t(key)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</optgroup>)}</select></label><label>{t('grouping')}<select aria-label={t('grouping')} value={filters.group} onChange={event => onChange({ ...filters, group: event.target.value })}>{['day', 'week', 'month'].map(group => <option key={group} value={group}>{t(group)}</option>)}</select></label></div>
    </div><div className="filter-bottom"><div className="date-display"><CalendarDays size={16} aria-hidden="true"/>{filters.period === 'custom' ? <div className="custom-dates"><input type="date" aria-label={t('startDate')} value={filters.start} max={filters.end || undefined} onInput={event => onChange({ ...filters, start: event.currentTarget.value })}/><span>{t('to')}</span><input type="date" aria-label={t('endDate')} value={filters.end} min={filters.start || undefined} onInput={event => onChange({ ...filters, end: event.currentTarget.value })}/></div> : <span>{filters.start ? `${filters.start.replaceAll('-', '.')} — ${filters.end.replaceAll('-', '.')}` : t('allSavedHistory')}</span>}{!['custom', 'all'].includes(filters.period) && <div className="period-nav"><button className="icon-button" aria-label={t('previousPeriod')} onClick={() => shift(-1)}><ChevronLeft size={16}/></button><button className="icon-button" aria-label={t('nextPeriod')} disabled={filters.end >= today()} onClick={() => shift(1)}><ChevronRight size={16}/></button></div>}</div><span className="timezone">{t('timezone', { zone: TIMEZONE })}</span></div>
  </section>;
}
