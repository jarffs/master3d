import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const catalogs = Object.fromEntries(await Promise.all(['en', 'pt'].map(async language => [
  language, JSON.parse(await readFile(path.join(root, 'locales', `${language}.json`), 'utf8'))
])));
const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, entry]) =>
  typeof entry === 'string' ? [[`${prefix}${key}`, entry]] : flatten(entry, `${prefix}${key}.`)
);

test('translation catalogs cover active source keys and matching interpolation parameters', async () => {
  const files = [];
  const collect = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(filename);
      else if (/\.(js|html)$/.test(entry.name)) files.push(filename);
    }
  };
  await collect(path.join(root, 'src'));
  for (const filename of ['index.html', 'app.html', 'hub.html', 'main.js', 'auth.js', 'profile.js']) files.push(path.join(root, filename));
  const used = new Map();
  for (const filename of files) {
    const source = await readFile(filename, 'utf8');
    for (const match of source.matchAll(/["'`]((?:app|hub|nav|hero|features|pricing|footer|auth|profile|common|landing|js|cropper)\.[a-zA-Z0-9_]+)["'`]/g)) {
      if (match[1].endsWith('.html')) continue;
      used.set(match[1], path.relative(root, filename));
    }
    if (filename.includes(`${path.sep}engines${path.sep}`)) {
      for (const match of source.matchAll(/category:\s*['"]([^'"]+)['"]/g)) used.set(`app.category_${match[1]}`, path.relative(root, filename));
    }
  }
  const entries = Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [language, Object.fromEntries(flatten(catalog))]));
  const issues = [];
  for (const [language, catalog] of Object.entries(entries)) {
    for (const [key, filename] of used) if (!catalog[key]?.trim()) issues.push(`${language}: ${key} (${filename})`);
    for (const key of Object.keys(entries.en)) if (!(key in catalog)) issues.push(`${language}: missing ${key}`);
    for (const key of Object.keys(entries.pt)) if (!(key in catalog)) issues.push(`${language}: missing ${key}`);
  }
  for (const [key, value] of Object.entries(entries.en)) {
    const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    if (entries.pt[key]) expect(parameters(value), key).toEqual(parameters(entries.pt[key]));
  }
  expect(issues).toEqual([]);
});

test('translations handle invalid saved language, attributes and preserve form values', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('language', 'invalid'));
  await page.goto('/tests/vectorization.html');
  const result = await page.evaluate(async () => {
    const i18n = await import('/i18n.js');
    document.body.innerHTML = `
      <select class="language-selector"><option value="en">English</option><option value="pt">Portugues</option></select>
      <select class="language-selector" id="color"><option value="red" selected>Red</option></select>
      <input id="text" value="User text" data-i18n-placeholder="app.text_input_placeholder">
      <button data-i18n-title="app.back" data-i18n-aria-label="app.back"><span data-i18n="app.back"></span></button>`;
    const initial = i18n.t('app.back');
    i18n.setLanguage('pt');
    return { initial, placeholder: document.querySelector('#text').placeholder,
      text: document.querySelector('#text').value, color: document.querySelector('#color').value,
      title: document.querySelector('button').title,
      aria: document.querySelector('button').getAttribute('aria-label'),
      translated: document.querySelector('span').textContent,
      optional: i18n.t(undefined) };
  });
  expect(result.initial).not.toBe('app.back');
  expect(result.placeholder).toBe(catalogs.pt.app.text_input_placeholder);
  expect(result.text).toBe('User text');
  expect(result.color).toBe('red');
  expect(result.title).toBe(catalogs.pt.app.back);
  expect(result.aria).toBe(catalogs.pt.app.back);
  expect(result.translated).toBe(catalogs.pt.app.back);
  expect(result.optional).toBe('');
});

test('all generator controls translate live without resetting values', async ({ page }) => {
  await page.goto('/tests/vectorization.html');
  const issues = await page.evaluate(async () => {
    const { t, setLanguage } = await import('/i18n.js');
    const { ControlBuilder } = await import('/src/ui/ControlBuilder.js');
    const { THREE } = window.testAPI;
    const problems = [];
    for (const name of ['CookieCutter', 'Keychain', 'Coloring', 'BigLetters', 'Stamp', 'Thermoform', 'BrigadeiroEjector']) {
      const module = await import(`/src/engines/${name}Engine.js`);
      const engine = new module[`${name}Engine`](new THREE.Scene());
      document.body.innerHTML = '<div id="controls"></div>';
      const builder = new ControlBuilder('controls', () => {});
      builder.build(engine.getControlSchema(), t);
      await new Promise(resolve => setTimeout(resolve, 0));
      const inputs = [...document.querySelectorAll('input,select,textarea')];
      const values = inputs.map(input => [input.value, input.checked]);
      for (const language of ['pt', 'en']) {
        setLanguage(language);
        for (const element of document.querySelectorAll('[data-i18n]')) {
          const key = element.dataset.i18n;
          if (key.startsWith('app.') && element.textContent === key) problems.push(`${name}/${language}/${key}`);
          if (element.textContent !== t(key)) problems.push(`${name}/${language}/stale/${key}`);
        }
        inputs.forEach((input, index) => {
          if (input.value !== values[index][0] || input.checked !== values[index][1]) problems.push(`${name}/${language}/reset/${input.id}`);
        });
      }
      engine.dispose();
    }
    return problems;
  });
  expect(issues).toEqual([]);
});

test('active page HTML has no untranslated prose', async ({ page }) => {
  await page.goto('/tests/vectorization.html');
  const issues = [];
  for (const filename of ['index.html', 'app.html', 'hub.html']) {
    const html = await readFile(path.join(root, filename), 'utf8');
    const missing = await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, 'text/html');
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('script,style,svg,[data-i18n]')) continue;
        const text = node.textContent.trim();
        if (!/[a-zA-ZÀ-ÿ]{3}/.test(text)) continue;
        if (/^(MasterWorld|CutterMaker3D|\d+ STLs?|[\d.,]+\s*€|Google|[^\s@]+@[^\s@]+)$/.test(text)) continue;
        texts.push(text);
      }
      return texts;
    }, html);
    issues.push(...missing.map(text => `${filename}: ${text}`));
  }
  expect(issues).toEqual([]);
});

test('live pages switch language on desktop and mobile without showing translation keys', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const filename of ['index.html', 'hub.html', 'app.html?tool=stamp', 'app.html?tool=keychain', 'app.html?tool=big_letters']) {
    await page.goto(`/${filename}`, { waitUntil: 'domcontentloaded' });
    const selector = page.locator('select.language-selector').first();
    await expect(selector).toBeVisible();
    if (filename.includes('tool=')) await expect(page.locator('#dynamic-controls')).not.toBeEmpty();
    for (const language of ['en', 'pt']) {
      await selector.selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('body')).not.toContainText(/\b(?:app|auth|landing|profile|common|hub|js)\.[a-z_]+\b/);
      if (filename === 'index.html') {
        await page.locator('[data-register-cta]').first().click();
        await expect(page.locator('#auth-title')).toHaveText(catalogs[language].auth.register_title);
        await page.locator('#close-modal-btn').click();
      }
    }
    if (filename === 'hub.html' || filename === 'app.html?tool=stamp') {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.screenshot({ path: testInfo.outputPath(`${filename.replace(/\W/g, '-')}-${viewport.width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  expect(errors).toEqual([]);
});