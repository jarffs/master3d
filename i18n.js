import en from './locales/en.json';
import pt from './locales/pt.json';

const translations = {
  en,
  pt
};

// 1. Get user preference or default to English
let currentLang = localStorage.getItem('language');
if (!currentLang) {
  // Check browser language
  const browserLang = navigator.language.slice(0, 2);
  currentLang = (browserLang === 'pt') ? 'pt' : 'en';
  localStorage.setItem('language', currentLang);
}

/**
 * Get a translation string by key (e.g., 'hero.title')
 */
export function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations[currentLang];
  
  for (const k of keys) {
    if (value && value[k]) {
      value = value[k];
    } else {
      return key; // return key if not found
    }
  }
  
  // Replace parameters like {name}
  if (typeof value === 'string') {
    for (const [pKey, pVal] of Object.entries(params)) {
      value = value.replace(new RegExp(`{${pKey}}`, 'g'), pVal);
    }
  }
  
  return value;
}

/**
 * Translates all DOM elements with data-i18n attribute
 */
export function translateDOM() {
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
  if (translations[lang]) {
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
    select.value = currentLang;
  });
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  translateDOM();
  
  // Bind all language selectors
  const selectors = document.querySelectorAll('.language-selector');
  selectors.forEach(select => {
    select.value = currentLang;
    select.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  });
});

export { currentLang };
