import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { languages, defaultLanguage, getTranslations, getNestedValue } from '../i18n/index.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language');
    if (saved && languages[saved]) return saved;

    // Try to detect browser language
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang && languages[browserLang]) return browserLang;

    return defaultLanguage;
  });

  const [translations, setTranslations] = useState(() => getTranslations(language));

  useEffect(() => {
    setTranslations(getTranslations(language));
    localStorage.setItem('language', language);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  // Translation function
  const t = useCallback((key, params = {}) => {
    let value = getNestedValue(translations, key);

    if (value === undefined) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }

    // Replace placeholders like {name} with actual values
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
      });
    }

    return value;
  }, [translations]);

  const value = {
    language,
    setLanguage,
    t,
    languages: Object.entries(languages).map(([code, { name, flag }]) => ({
      code,
      name,
      flag,
    })),
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
