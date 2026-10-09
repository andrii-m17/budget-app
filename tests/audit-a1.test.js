// Аудит A1 (docs/AUDIT.md): тести, що ДОКУМЕНТУЮТЬ знайдені вади. Код застосунку не змінювався.
// Тести з { todo: true } зараз провалюються за задумом (node --test лишається зеленим); коли ваду виправлено,
// прибрати todo — тест стане охоронним. Тести без todo описують поточну (задокументовану) поведінку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ---------- A1-1: вихід з акаунта і вхід в інший (витік між акаунтами) ----------
{
  const ctx = buildSandbox({}, ['isDirty', 'applyCensus', 'planCategoriesPush']);
  test('A1-1 (поточна поведінка): категорії акаунта A після входу в родину B стають dirty і підуть у push у родину B', function(){
    const catsOfA = [
      { name: 'Мої секретні', cloudId: 'a-1', syncedUpdatedAt: 't1', updatedAt: 't1' },
      { name: 'Житло', cloudId: 'a-2', syncedUpdatedAt: 't1', updatedAt: 't1' },
    ];
    const censusOfB = ['b-1', 'b-2']; // id категорій родини B
    const res = ctx.applyCensus(catsOfA, censusOfB);
    assert.equal(res.reset, 2);
    const plan = ctx.planCategoriesPush(catsOfA, null);
    assert.equal(plan.push.length, 2); // обидві підуть у Cloud родини B
  });
  test('A1-1: signOutCloudAccount очищає локальні дані попереднього акаунта', { todo: true }, function(){
    const m = SRC.match(/async function signOutCloudAccount\(\)\{([\s\S]*?)\n\}/);
    assert.ok(m);
    assert.ok(/clear|reset|purge|removeItem/.test(m[1]), 'вихід лише викликає auth.signOut() і нічого не чистить');
  });
  test('A1-1: вихід видаляє push-підписку пристрою (push_subscriptions) або позначає її як відкликану', { todo: true }, function(){
    const m = SRC.match(/async function signOutCloudAccount\(\)\{([\s\S]*?)\n\}/);
    assert.ok(/push_subscriptions|unsubscribe/.test(m[1]));
  });
}

// ---------- A1-4: відновлення з бекапу воскрешає витрати/доходи, видалені назавжди ----------
{
  const ctx = buildSandbox({
    expenses: [], isCloudSessionReady: function(){ return false; },
    UUID_FORMAT_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    pulled: 0, pushedIds: [],
    saveExpenses: async function(){ return { success: true }; },
    ensureExpenseIdentity: async function(){},
    pushExpensesBatched: async function(list){ list.forEach(function(r){ ctx.pushedIds.push(r.id); }); return { pushed: list.length, failed: 0 }; },
    pullExpensesCore: async function(){},
  }, ['restoreExpensesFromBackup']);
  test('A1-4 (поточна поведінка): витрата, видалена назавжди, повертається і пушиться з бекапу', async function(){
    const purgedId = '11111111-1111-4111-8111-111111111111';
    const backup = JSON.stringify([{ id: purgedId, date: '2026-09-01', name: 'Видалена назавжди', amount: 100, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' }]);
    const res = await ctx.restoreExpensesFromBackup(backup);
    assert.equal(res.added, 1);
    assert.deepEqual(ctx.pushedIds, [purgedId]); // воскресла в Cloud
  });
  test('A1-4: для витрат/доходів/окремих слів є журнал видалених назавжди (як для рахунків і таксономії)', { todo: true }, function(){
    assert.ok(/budget_purged_(expenses|records|words)_v1/.test(SRC));
  });
}

// ---------- A1-5: екранування тексту (XSS) ----------
test('A1-5 (виправлено в 2.32.19): імена категорій/підкатегорій/слів вставляються в innerHTML лише екранованими', function(){
  const unescaped = [
    '<span class="s-name">${c.name}</span>',
    '<span class="kw-tag">${d.kw}</span>',
    '<span class="t-name">${name}</span>',
    '<span class="t-name">${r.name}</span>',
    '<span class="chip">${chipText}</span>', // chipText = e.subcategory || e.category
    '<option value="${c.name}">${c.name}</option>',
  ];
  const left = unescaped.filter(function(s){ return SRC.indexOf(s) !== -1; });
  assert.deepEqual(left, [], 'неекрановані підстановки: ' + left.join(' | '));
});
test('A1-5 (охорона): імена карток, ОЧ, доходів, боргів, підказки, тости й діалоги екрануються', function(){
  [
    'escapeHtml(stripLeadingEmoji(name))',
    '<div class="exp-name">${escapeHtml(e.name)}</div>',
    "escapeHtml(event.actorName)",
    '<span class="nsi-name">${escapeHtml(n)}</span>',
    "escapeHtml(trashDisplayTitle(item))",
  ].forEach(function(s){ assert.ok(SRC.indexOf(s) !== -1, 'зник екранований шаблон: ' + s); });
});
test('A1-5: у index.html немає Content-Security-Policy (XSS отримує повний доступ до сесії)', { todo: true }, function(){
  assert.ok(/Content-Security-Policy/i.test(SRC));
});

// ---------- A1-6: офлайн -> онлайн ----------
test('A1-6: після повернення онлайн застосунок автоматично пушить витрати, створені офлайн', { todo: true }, function(){
  const m = SRC.match(/window\.addEventListener\('online', function\(\)\{ updateOnlineStatusUI\(\);([^\n]*)\}\);/);
  assert.ok(m);
  assert.ok(/pushExpensesBatched|syncAllPilotManual|flushUnsynced/.test(m[1]), 'online-обробник лише тягне (pull), не пушить: ' + m[1]);
});

// ---------- A1-8: подвійне натискання ----------
test('A1-8 (виправлено в 2.32.20): addExpense має захист від повторного виклику', function(){
  const m = SRC.match(/async function addExpense\(\)\{([\s\S]*?)\n\}/);
  assert.ok(/actionGateEnter/.test(m[1]), 'нема busy-прапорця: другий виклик створює другу витрату з новим UUID');
});
