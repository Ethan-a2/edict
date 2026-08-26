const aliases = new Map([
  ['auto', 'auto'],
  ['detect', 'auto'],
  ['zh', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['zh-hans', 'zh-CN'],
  ['简体中文', 'zh-CN'],
  ['中文', 'zh-CN'],
  ['simplified chinese', 'zh-CN'],
  ['chinese', 'zh-CN'],
  ['zh-tw', 'zh-TW'],
  ['zh-hant', 'zh-TW'],
  ['繁体中文', 'zh-TW'],
  ['traditional chinese', 'zh-TW'],
  ['en', 'en'],
  ['英语', 'en'],
  ['英文', 'en'],
  ['english', 'en'],
  ['ja', 'ja'],
  ['日语', 'ja'],
  ['japanese', 'ja'],
  ['ko', 'ko'],
  ['韩语', 'ko'],
  ['korean', 'ko'],
  ['fr', 'fr'],
  ['法语', 'fr'],
  ['french', 'fr'],
  ['de', 'de'],
  ['德语', 'de'],
  ['german', 'de'],
  ['es', 'es'],
  ['西班牙语', 'es'],
  ['spanish', 'es'],
  ['pt', 'pt'],
  ['葡萄牙语', 'pt'],
  ['portuguese', 'pt'],
  ['it', 'it'],
  ['意大利语', 'it'],
  ['italian', 'it'],
  ['ru', 'ru'],
  ['俄语', 'ru'],
  ['russian', 'ru'],
  ['ar', 'ar'],
  ['阿拉伯语', 'ar'],
  ['th', 'th'],
  ['泰语', 'th'],
  ['nl', 'nl'],
  ['荷兰语', 'nl'],
  ['id', 'id'],
  ['印尼语', 'id'],
  ['vi', 'vi'],
  ['越南语', 'vi'],
  ['tr', 'tr'],
  ['土耳其语', 'tr'],
]);

export function normalizeLanguage(language, fallback = 'auto') {
  const raw = String(language || '').trim();
  if (!raw) return fallback;
  return aliases.get(raw.toLowerCase()) || aliases.get(raw) || raw;
}

export function youdaoLanguageCode(language) {
  const normalized = normalizeLanguage(language);
  const codes = {
    auto: 'auto',
    'zh-CN': 'zh-CHS',
    'zh-TW': 'zh-CHT',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    fr: 'fr',
    de: 'de',
    es: 'es',
    pt: 'pt',
    it: 'it',
    ru: 'ru',
    ar: 'ar',
    th: 'th',
    nl: 'nl',
    id: 'id',
    vi: 'vi',
  };
  return codes[normalized];
}

export function caiyunTransType(sourceLanguage, targetLanguage) {
  const source = normalizeLanguage(sourceLanguage);
  const target = normalizeLanguage(targetLanguage);
  const codes = {
    auto: 'auto',
    'zh-CN': 'zh',
    'zh-TW': 'zh-Hant',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    de: 'de',
    es: 'es',
    fr: 'fr',
    it: 'it',
    pt: 'pt',
    ru: 'ru',
    tr: 'tr',
    vi: 'vi',
  };
  if (source === target || !codes[source] || !codes[target]) return undefined;
  return `${codes[source]}2${codes[target]}`;
}

export function languageLabel(language) {
  const normalized = normalizeLanguage(language);
  return {
    auto: 'the detected source language',
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    it: 'Italian',
    ru: 'Russian',
    ar: 'Arabic',
    th: 'Thai',
    nl: 'Dutch',
    id: 'Indonesian',
    vi: 'Vietnamese',
    tr: 'Turkish',
  }[normalized] || normalized;
}
