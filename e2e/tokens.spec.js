// DS-1 (Rev 2.32.334): нові назви токенів дорівнюють своїм старим іменам в обох темах (псевдоніми не змінюють значень).
const { test, expect } = require('@playwright/test');
// Rev 2.32.339 (DS-N1): палітра — власні значення нових назв, старі назви дорівнюють своїм новим (--color-bg = --bg тощо); решта псевдонімів (DS-1) — нова назва = стара.
const OLD_TO_NEW = { '--color-bg': '--bg', '--color-surface': '--surface', '--color-surface-hover': '--surface-2', '--color-border': '--line', '--color-border-strong': '--line-strong', '--color-text-primary': '--text', '--color-text-secondary': '--text-2', '--color-text-tertiary': '--text-3', '--color-primary': '--accent', '--ui-accent-text': '--accent-text', '--ui-accent-bg': '--accent-bg', '--ui-accent-border': '--accent-line', '--color-glass-bg': '--glass', '--color-glass-pressed-bg': '--glass-press', '--color-glass-border': '--glass-edge', '--color-glass-shimmer': '--glass-edge-2', '--shadow-glass': '--glass-shadow' };
const NEW_TO_OLD = { '--income': '--color-success', '--expense': '--color-error', '--debt': '--color-warning', '--inst': '--color-info', '--r-s': '--ui-r-small', '--r-m': '--ui-r-control', '--r-pill': '--ui-r-pill', '--t-micro': '--motion-micro', '--t-s': '--motion-s', '--t-m': '--motion-m', '--t-l': '--motion-l', '--t-count': '--motion-count' };
const PAIRS = Object.assign({}, NEW_TO_OLD); Object.keys(OLD_TO_NEW).forEach(o => { PAIRS[o] = OLD_TO_NEW[o]; }); // для кожної пари значення мають збігатися
test('кожна стара назва дорівнює своїй новій (палітра), решта псевдонімів — старим, у світлій і темній темі; стилі підключено з мітками версії', async ({ page }) => {
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => typeof APP_VERSION !== 'undefined');
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel=stylesheet][href^="./css/"]')).map(l => l.getAttribute('href')));
  const ver = await page.evaluate(() => APP_VERSION);
  expect(links).toEqual(['./css/tokens.css?v=' + ver, './css/app.css?v=' + ver]);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const bad = await page.evaluate((pairs) => { const cs = getComputedStyle(document.documentElement); return Object.keys(pairs).filter(n => { const a = cs.getPropertyValue(n).trim(), b = cs.getPropertyValue(pairs[n]).trim(); return !a || a !== b; }); }, PAIRS);
    expect(bad, theme).toEqual([]);
  }
});
