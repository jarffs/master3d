import en from './locales/en.json';
import pt from './locales/pt.json';

const translations = {
  en,
  pt
};

// 1. Get user preference or default to English
let currentLang = localStorage.getItem('language');
if (!Object.hasOwn(translations, currentLang)) {
  // Check browser language
  const browserLang = navigator.language.slice(0, 2);
  currentLang = (browserLang === 'pt') ? 'pt' : 'en';
  localStorage.setItem('language', currentLang);
}

/**
 * Get a translation string by key (e.g., 'hero.title')
 */
export function t(key, params = {}) {
  if (typeof key !== 'string') return '';
  const keys = key.split('.');
  const resolve = language => keys.reduce((value, part) =>
    value && Object.hasOwn(value, part) ? value[part] : undefined, translations[language]);
  let value = resolve(currentLang) ?? resolve('en');
  if (typeof value !== 'string') return key;
  
  // Replace parameters like {name}
  if (typeof value === 'string') {
    for (const [pKey, pVal] of Object.entries(params)) {
      value = value.replaceAll(`{${pKey}}`, () => String(pVal));
    }
  }
  
  return value;
}

/**
 * Translates all DOM elements with data-i18n attribute
 */
export function translateDOM() {
  document.documentElement.lang = currentLang;
  for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    });
  }
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    
    // Check if it's an input/textarea with placeholder
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
       if (el.hasAttribute('placeholder')) {
         el.placeholder = t(key);
       } else {
         el.value = t(key);
       }
    } else {
      // Normal element
      el.innerHTML = t(key);
    }
  });
}

/**
 * Changes language and re-translates DOM
 */
export function setLanguage(lang) {
  if (Object.hasOwn(translations, lang)) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    translateDOM();
    updateSelectors();
    // Dispatch event so other components can react
    window.dispatchEvent(new Event('language-changed'));
  }
}

/**
 * Updates UI of all language selectors to match current lang
 */
function updateSelectors() {
  const selectors = document.querySelectorAll('.language-selector');
  selectors.forEach(select => {
    if (!isLanguageSelector(select)) return;
    select.value = currentLang;
  });
}

function isLanguageSelector(select) {
  return [...select.options].some(option => option.value === 'en') &&
    [...select.options].some(option => option.value === 'pt');
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  translateDOM();
  
  // Bind all language selectors
  const selectors = document.querySelectorAll('.language-selector');
  selectors.forEach(select => {
    if (!isLanguageSelector(select)) return;
    select.value = currentLang;
    select.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  });
});

export { currentLang };
