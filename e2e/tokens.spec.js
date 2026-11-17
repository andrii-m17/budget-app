// DS-1 (Rev 2.32.334): нові назви токенів дорівнюють своїм старим іменам в обох темах (псевдоніми не змінюють значень).
const { test, expect } = require('@playwright/test');
const PAIRS = { '--bg': '--color-bg', '--surface': '--color-surface', '--surface-2': '--color-surface-hover', '--line': '--color-border', '--line-strong': '--color-border-strong', '--text': '--color-text-primary', '--text-2': '--color-text-secondary', '--text-3': '--color-text-tertiary', '--accent': '--color-primary', '--accent-text': '--ui-accent-text', '--accent-bg': '--ui-accent-bg', '--accent-line': '--ui-accent-border', '--income': '--color-success', '--expense': '--color-error', '--debt': '--color-warning', '--inst': '--color-info', '--glass': '--color-glass-bg', '--glass-press': '--color-glass-pressed-bg', '--glass-edge': '--color-glass-border', '--glass-edge-2': '--color-glass-shimmer', '--glass-shadow': '--shadow-glass', '--r-s': '--ui-r-small', '--r-m': '--ui-r-control', '--r-pill': '--ui-r-pill', '--t-micro': '--motion-micro', '--t-s': '--motion-s', '--t-m': '--motion-m', '--t-l': '--motion-l', '--t-count': '--motion-count' };
test('псевдоніми токенів дорівнюють старим назвам у світлій і темній темі; стилі підключено з мітками версії', async ({ page }) => {
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
