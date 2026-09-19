/**
 * i18n.js — Ananke v3.0
 *
 * Responsabilité unique (S) : Gestion centralisée des traductions (i18n),
 * chargement dynamique des locales JSON depuis /lang/{lang}.json,
 * interpolation de paramètres et mise à jour dynamique du DOM.
 */

import { getFullUrl } from './state.js';

let _currentLang = 'en';
const _translationsCache = {};
const _listeners = new Set();

/**
 * Fetch and cache a JSON locale file from /lang/{lang}.json
 * @param {'en'|'fr'} lang
 * @returns {Promise<object>}
 */
export async function loadLocale(lang) {
    if (_translationsCache[lang]) {
        return _translationsCache[lang];
    }

    try {
        const url = getFullUrl(`/lang/${lang}.json`);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to load locale ${lang}: ${res.status}`);
        }
        const data = await res.json();
        _translationsCache[lang] = data;
        return data;
    } catch (err) {
        console.error(`[i18n] Error loading locale ${lang}:`, err);
        return _translationsCache.en || {};
    }
}

/**
 * Initialize internationalization system.
 * Loads fallback 'en' and preferred language.
 */
export async function initI18n() {
    const saved = localStorage.getItem('lang');
    let preferred = 'en';
    if (saved && (saved === 'fr' || saved === 'en')) {
        preferred = saved;
    } else {
        const browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        preferred = browserLang.startsWith('fr') ? 'fr' : 'en';
    }

    // Always ensure English fallback is loaded into cache
    await loadLocale('en');
    if (preferred !== 'en') {
        await loadLocale(preferred);
    }

    await setLanguage(preferred, { notify: true });
}

/**
 * Get current active language code ('en' or 'fr').
 * @returns {'en'|'fr'}
 */
export function getLanguage() {
    return _currentLang;
}

/**
 * Translate a dotted key with optional parameters.
 * @param {string} key e.g. 'dashboard.my_boards'
 * @param {object} [params] e.g. { count: 3, name: 'Noa' }
 * @returns {string}
 */
export function t(key, params = {}) {
    if (!key) return '';

    const getNested = (obj, path) => {
        if (!obj) return undefined;
        return path.split('.').reduce((prev, curr) => (prev ? prev[curr] : undefined), obj);
    };

    const activeDict = _translationsCache[_currentLang] || {};
    const fallbackDict = _translationsCache.en || {};

    let template;

    // Handle pluralization shorthand if param has `count`
    if (typeof params?.count === 'number') {
        const countKey = params.count === 0 ? `${key}_zero` : (params.count === 1 ? `${key}_one` : `${key}_other`);
        template = getNested(activeDict, countKey) ?? getNested(fallbackDict, countKey);
    }

    if (template === undefined) {
        template = getNested(activeDict, key) ?? getNested(fallbackDict, key);
    }

    if (template === undefined) {
        return key;
    }

    if (typeof template !== 'string') return key;

    // Interpolate {paramName}
    return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

/**
 * Switch the application language.
 * Loads the locale JSON if not yet cached, updates DOM and notifies listeners.
 * @param {'en'|'fr'} lang
 * @param {{ notify?: boolean }} [options]
 */
export async function setLanguage(lang, { notify = true } = {}) {
    if (lang !== 'fr' && lang !== 'en') lang = 'en';
    
    // Ensure the target locale is loaded
    if (!_translationsCache[lang]) {
        await loadLocale(lang);
    }

    _currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;

    // Update buttons with class .lang-btn
    document.querySelectorAll('.lang-btn').forEach(btn => {
        const isActive = btn.dataset.lang === lang;
        btn.style.background = isActive ? 'var(--clr-primary)' : 'none';
        btn.style.color      = isActive ? 'white' : 'var(--clr-text)';
    });

    // Auto-translate DOM elements
    translateDOM();

    // Notify registered listeners
    if (notify) {
        _listeners.forEach(fn => {
            try { fn(_currentLang); } catch (e) { console.error('[i18n] listener error', e); }
        });
    }
}

/**
 * Register a listener called whenever the language changes.
 * @param {(lang: string) => void} fn
 * @returns {() => void} unsubscribe function
 */
export function registerLanguageListener(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

/**
 * Translate all elements with data-i18n attributes inside a container.
 * @param {HTMLElement|Document} [root=document]
 */
export function translateDOM(root = document) {
    if (!root || !root.querySelectorAll) return;

    // Inner text / HTML
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) {
            el.innerHTML = t(key);
        }
    });

    // Placeholders
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (key) {
            el.placeholder = t(key);
        }
    });

    // Titles / Tooltips
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        if (key) {
            el.title = t(key);
        }
    });

    // Aria Labels
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.dataset.i18nAria;
        if (key) {
            el.setAttribute('aria-label', t(key));
        }
    });
}
