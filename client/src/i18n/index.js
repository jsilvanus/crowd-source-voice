import en from './en.js';
import fi from './fi.js';
import sv from './sv.js';

export const languages = {
  en: { name: 'English', flag: '🇬🇧', translations: en },
  fi: { name: 'Suomi', flag: '🇫🇮', translations: fi },
  sv: { name: 'Svenska', flag: '🇸🇪', translations: sv },
};

export const defaultLanguage = 'en';

export function getTranslations(lang) {
  return languages[lang]?.translations || languages[defaultLanguage].translations;
}

export function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}
