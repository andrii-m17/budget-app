// TEST-CLEAN (Rev 2.32.432): шторка «Для розробника»: групи в порядку Самописець → Діагностика → Дані (→ Експерименти лише за активних експериментів); лабораторії входу нема. Мок; дані вигадані.
// Знімки «до/після» (темна тема, 390 pt): SHOTS=before|after → docs/ui/test-clean/dev-<SHOTS>.png
const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('шторка «Для розробника»: порядок груп, рядок «Повідомити про проблему», групи «Експерименти» нема, лабораторії входу нема', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(800);
  await page.evaluate(() => { switchTab('service'); openTestingDrawer(); });
  await page.waitForTimeout(900);
  const tag = process.env.SHOTS;
  if (tag) { fs.mkdirSync('docs/ui/test-clean', { recursive: true }); await page.screenshot({ path: 'docs/ui/test-clean/dev-' + tag + '.png' }); await page.evaluate(() => { document.getElementById('testing-drawer').scrollTop = 400; }); await page.waitForTimeout(200); await page.screenshot({ path: 'docs/ui/test-clean/dev-' + tag + '-scrolled.png' }); }
  if (tag === 'before') return;
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#testing-drawer > .chk-label')).filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim()));
  // «Середовище» (лише поза робочим origin) іде останнім; на моку воно є
  expect(labels.slice(0, 3)).toEqual(['Самописець', 'Діагностика', 'Дані']); expect(labels).not.toContain('Експерименти'); // Rev 2.32.440: експеримент kb-resume завершено
  expect(labels).not.toContain('Лабораторія входу'); expect(labels).not.toContain('Варіанти для перевірки');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#testing-drawer .chk-row')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ['Записує постійно', 'Повідомити про проблему', 'Надіслані звіти', 'Скопіювати запис', 'Розширена діагностика', 'Перевірка цілісності даних'].forEach(t => expect(rows.some(r => r.indexOf(t) === 0), t).toBe(true));
  expect(await page.evaluate(() => !!document.getElementById('login-lab-link'))).toBe(false);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('#testing-drawer [data-test-id]')).map(x => x.getAttribute('data-test-id')))).toEqual([]);
  // «Повідомити про проблему» з цього екрана відкриває шторку звіту
  await page.evaluate(() => document.getElementById('rec-report-row').click());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.getElementById('rec-report-drawer').classList.contains('open'))).toBe(true);
  // механізм варіантів на місці: порожній реєстр → групи нема; додати експеримент → група з’являється
  await page.evaluate(() => { closeRecReport(); window.__saved = TEST_VARIANTS.splice(0); renderTestingDrawer(); });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('testing-variants-label')).display)).toBe('none');
  await page.evaluate(() => { TEST_VARIANTS.push({ id: 'x-test', title: 'Тестовий експеримент', what: 'перевірка структури', variants: [{ key: 'control', label: 'Як зараз', hint: 'a' }, { key: 'b', label: 'Б', hint: 'b' }], defaultVariant: 'control', addedIn: 'тест', cleanupBy: 'тест', checkSteps: ['1', '2'] }); renderTestingDrawer(); });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('testing-variants-label')).display)).not.toBe('none');
  expect(await page.evaluate(() => document.querySelectorAll('#testing-variants-list [data-test-id="x-test"]').length)).toBe(1);
  await page.evaluate(() => { TEST_VARIANTS.length = 0; renderTestingDrawer(); });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('testing-variants-label')).display)).toBe('none');
  await page.evaluate(() => { window.__saved.forEach(x => TEST_VARIANTS.push(x)); renderTestingDrawer(); });
});
