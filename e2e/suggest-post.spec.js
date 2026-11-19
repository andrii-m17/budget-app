// BUG-SUGGEST (Rev 2.32.427): після вибору підказки значення назви лишається підставленим після focusout/focusin; самописець фіксує set/post/comp/input лише довжинами й ознаками (без тексту). Мок, синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test('підказка: після pick і focusout/focusin назва лишається; події set/post/input/comp без тексту', async ({ page }) => {
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => document.querySelector('.tabbar-glass') && window.MockCloud);
  await page.evaluate(() => { switchTab('vytraty'); });
  await page.waitForSelector('#expfielda7', { state: 'attached' });
  const r = await page.evaluate(async () => {
    recBuf.length = 0;
    nameHistoryMap['Синтетична назва підказки'] = { count: 3, lastDate: '2026-11-01', lastCategory: '', lastSubcategory: '' };
    const inp = document.getElementById('expfielda7'); suggestSuppressed = false;
    inp.value = 'Синтет'; updateNameSuggestions('Синтет');
    inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    pickSuggestionNow(0);
    inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); inp.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    await new Promise(r => setTimeout(r, 450));
    return { value: inp.value, ev: recBuf.filter(e => e.type === 'suggest-tap').map(e => e) };
  });
  expect(r.value).toBe('Синтетична назва підказки');
  const by = k => r.ev.filter(e => e.ev === k);
  expect(by('set').length).toBe(1); expect(by('set')[0]).toMatchObject({ lenBefore: 6, lenAfter: 25, composing: true });
  expect(by('post')[0]).toMatchObject({ same: true, lenPost: 25, composing: true });
  expect(by('input')[0]).toMatchObject({ inputType: 'insertReplacementText', lenBefore: 25, lenAfter: 25 });
  expect(by('comp').length).toBeGreaterThan(0);
  expect(JSON.stringify(r.ev)).not.toContain('Синтет');
});
