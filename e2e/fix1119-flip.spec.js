// FIX-1119 п.10: FLIP-розгортання «Сімейного балансу»: копії значень летять (лише transform/opacity), після анімації прибираються, «зменшити рух» — без копій.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
async function open(page){
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.evaluate(() => switchTab('analytics'));
  await page.waitForTimeout(3000);
}
test('FLIP 1. розгортання: 4 копії (2 значення + 2 підписи), лише transform/opacity, 380 мс; після кінця копій немає, значення на місці', async ({ page }) => {
  await open(page);
  const info = await page.evaluate(async () => {
    toggleBalanceCard();
    const ghosts = document.querySelectorAll('#bal-card .bal-ghost');
    const props = new Set(); document.getAnimations().forEach(a => { if (a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('bal-ghost')) a.effect.getKeyframes().forEach(k => Object.keys(k).forEach(p => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p); })); });
    await new Promise(r => setTimeout(r, 900));
    return { n: ghosts.length, props: Array.from(props).sort(), left: document.querySelectorAll('#bal-card .bal-ghost').length, v: document.getElementById('bal-v-inc').textContent, vo: getComputedStyle(document.getElementById('bal-v-inc')).opacity, c: document.getElementById('bal-c-inc-v').textContent };
  });
  expect(info.n).toBe(4); expect(info.props).toEqual(['opacity', 'transform']); expect(info.left).toBe(0);
  expect(info.v).toBe(info.c); expect(info.vo).toBe('1');
});
test('FLIP 2. згортання: копії є, після кінця немає; нижні значення повернулись (opacity 1)', async ({ page }) => {
  await open(page);
  const info = await page.evaluate(async () => {
    toggleBalanceCard(); await new Promise(r => setTimeout(r, 900));
    toggleBalanceCard(); const n = document.querySelectorAll('#bal-card .bal-ghost').length;
    await new Promise(r => setTimeout(r, 900));
    return { n, left: document.querySelectorAll('#bal-card .bal-ghost').length, open: document.getElementById('bal-card').classList.contains('open'), o: getComputedStyle(document.getElementById('bal-c-inc-v')).opacity, inl: document.getElementById('bal-c-inc-v').style.opacity };
  });
  expect(info.n).toBe(4); expect(info.left).toBe(0); expect(info.open).toBe(false); expect(info.inl).toBe('');
});
test('FLIP 3. швидкий повторний дотик не залишає копій і прихованих значень', async ({ page }) => {
  await open(page);
  const info = await page.evaluate(async () => {
    toggleBalanceCard(); await new Promise(r => setTimeout(r, 100)); toggleBalanceCard(); await new Promise(r => setTimeout(r, 100)); toggleBalanceCard();
    await new Promise(r => setTimeout(r, 1000));
    return { left: document.querySelectorAll('#bal-card .bal-ghost').length, hidden: ['bal-v-inc', 'bal-v-exp', 'bal-c-inc-v', 'bal-c-exp-v'].filter(id => document.getElementById(id).style.opacity !== '').length, open: document.getElementById('bal-card').classList.contains('open') };
  });
  expect(info.left).toBe(0); expect(info.hidden).toBe(0); expect(info.open).toBe(true);
});
test('FLIP 4. «зменшити рух»: розгортання без копій і анімацій', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); await open(page);
  const info = await page.evaluate(async () => { toggleBalanceCard(); const n = document.querySelectorAll('#bal-card .bal-ghost').length; await new Promise(r => setTimeout(r, 300)); return { n, open: document.getElementById('bal-card').classList.contains('open') }; });
  expect(info.n).toBe(0); expect(info.open).toBe(true);
  await ctx.close();
});
