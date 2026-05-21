/* jshint esversion: 6 */
const fs = require('fs');
const path = require('path');

const STORAGE_KEY = 'fliphtml5-locale';
const SUPPORTED = ['tr', 'en', 'es', 'de', 'ru', 'zh', 'ar'];
const FALLBACK = 'en';
const RTL_LOCALES = ['ar'];

const LOCALE_PREFIX_MAP = [
    ['zh', 'zh'],
    ['ar', 'ar'],
    ['ru', 'ru'],
    ['de', 'de'],
    ['es', 'es'],
    ['tr', 'tr'],
];

let currentLocale = FALLBACK;
const catalogs = {};

function loadCatalog(locale) {
    if (catalogs[locale]) {
        return catalogs[locale];
    }
    const filePath = path.join(__dirname, 'locales', `${locale}.json`);
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    catalogs[locale] = JSON.parse(raw);
    return catalogs[locale];
}

function detectLocale() {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED.includes(saved)) {
            return saved;
        }
    }
    const nav = ((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
    for (let i = 0; i < LOCALE_PREFIX_MAP.length; i += 1) {
        const prefix = LOCALE_PREFIX_MAP[i][0];
        if (nav.startsWith(prefix)) {
            return LOCALE_PREFIX_MAP[i][1];
        }
    }
    return FALLBACK;
}

function setLocale(locale) {
    if (!SUPPORTED.includes(locale)) {
        return;
    }
    currentLocale = locale;
    loadCatalog(locale);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, locale);
    }
    if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
        document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
        applyToDocument();
    }
}

function getLocale() {
    return currentLocale;
}

function t(key, params) {
    const catalog = loadCatalog(currentLocale);
    let text = catalog[key];
    if (text === undefined) {
        const fb = loadCatalog(FALLBACK);
        text = fb[key];
    }
    if (text === undefined) {
        return key;
    }
    if (params) {
        Object.keys(params).forEach((name) => {
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(params[name]));
        });
    }
    return text;
}

function applyToDocument() {
    if (typeof document === 'undefined') {
        return;
    }
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = t(key);
        }
    });
    const titleKey = document.documentElement.getAttribute('data-i18n-title');
    if (titleKey) {
        document.title = t(titleKey);
    }
}

function init(locale) {
    const chosen = locale || detectLocale();
    setLocale(SUPPORTED.includes(chosen) ? chosen : FALLBACK);
    SUPPORTED.forEach(loadCatalog);
    return currentLocale;
}

module.exports = {
    SUPPORTED,
    init,
    setLocale,
    getLocale,
    t,
    applyToDocument,
};
