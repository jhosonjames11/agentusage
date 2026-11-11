import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { readLanguage, translate } from './messages.mjs';

const Context = createContext(null);
export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => { try { return readLanguage(localStorage); } catch { return 'zh'; } });
  const value = useMemo(() => ({ language, setLanguage, locale: language === 'en' ? 'en-US' : 'zh-CN', t: (key, values) => translate(language, key, values) }), [language]);
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = translate(language, 'pageTitle');
    try { localStorage.setItem('usage-dashboard-language', language); } catch { /* Optional storage. */ }
  }, [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('I18nProvider is required.');
  return value;
}
