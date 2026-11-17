// STRUCT-3: після кожного перенесення області — жодних помилок виконання (pageerror, console.error) на всіх вкладках і в основних шторках/екранах.
const { test, expect } = require('@playwright/test');
test('жодних помилок виконання: вкладки, шторки, екрани', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e))); page.on('console', m => { if(m.type() === 'error') errs.push(m.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.getElementById('f-date').value);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const tab of ['analytics', 'accounting', 'vytraty', 'structure', 'service']){ await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(700); }
    await page.evaluate(() => { switchTab('structure'); switchStructureTab('subcategories'); switchStructureTab('dictionary'); switchStructureTab('categories'); });
    for (const [open, close] of [[() => openSettings(), () => { const b = document.querySelector('.drawer.open .drawer-close'); if(b) b.click(); }], [() => openNotifArchive(), () => closeNotifArchive()], [() => openProfileMenu(), () => closeProfileMenu()], [() => openMonoScreen(), () => closeMonoScreen()], [() => openMonoInbox({ tab: 'new' }), () => closeMonoInbox()], [() => openTrashScreen(), () => closeTrashScreen()], [() => openJournal(), () => { const b = document.querySelector('#journal-screen .journal-back-btn, .journal-back-btn'); if(b) b.click(); }]]){
      await page.evaluate(open).catch(() => {}); await page.waitForTimeout(500); await page.evaluate(close).catch(() => {}); await page.waitForTimeout(250);
    }
    await page.evaluate(() => switchTab('analytics')); await page.waitForTimeout(500);
  }
  await page.evaluate(() => { try{ renderAll(); }catch(e){ throw e; } }); await page.waitForTimeout(500);
  expect(errs.filter(e => !/Failed to load resource|googleapis|cdnjs|supabase|ERR_/i.test(e))).toEqual([]);
});
