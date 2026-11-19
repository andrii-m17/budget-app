// Rev 2.32.376 (DS-4c): охоронні перевірки підтвердження закриття зміненої форми (розмітка, єдиний шлях, самописець)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readIndexWithCss } = require('./extract');
const HTML = readIndexWithCss();
const SHEETS = fs.readFileSync(path.join(__dirname, '..', 'js', 'sheets.js'), 'utf8');
const DIAG = fs.readFileSync(path.join(__dirname, '..', 'js', 'diag.js'), 'utf8');
const FORMS = { 'card-debt': 'card-debt-drawer', 'installment': 'installment-drawer', 'income': 'income-drawer', 'struct': 'struct-drawer', 'mono-detail': 'mono-detail-drawer', 'debug-record': 'debug-record-drawer' };
test('затемнення шести форм і «Закрити» ідуть через requestCloseSheet; форма входу й довідкові шторки — як раніше', () => {
  Object.keys(FORMS).forEach(function(k){
    assert.ok(HTML.indexOf('id="' + k + '-backdrop" onclick="requestCloseSheet(\'' + FORMS[k] + '\',\'backdrop\')"') !== -1, k + ': затемнення');
  });
  assert.ok(/id="profile-backdrop" onclick="closeProfileLoginDrawer\(\)"/.test(HTML), 'вхід без діалогу');
  ['card-debt', 'installment', 'income', 'mono-detail', 'debug-record'].forEach(function(k){
    const i = HTML.indexOf('id="' + FORMS[k] + '"'); const x = HTML.indexOf('class="drawer-close"', i);
    assert.ok(HTML.slice(x, x + 90).indexOf("requestCloseSheet('" + FORMS[k] + "','close')") !== -1, k + ': «×»');
  });
});
test('Esc і свайп: closeTopSheet викликає requestCloseSheet; змінена форма — пружина, потім діалог; охоплені рівно 6 форм', () => {
  assert.ok(/function closeTopSheet\(\)\{[\s\S]*requestCloseSheet\(ids\[k\], 'esc'\)/.test(SHEETS));
  assert.ok(/askDiscard/.test(SHEETS) && /requestCloseSheet\(drawer\.id, 'swipe'\)/.test(SHEETS));
  const m = SHEETS.match(/const SHEET_DISCARD_FORMS = \{([^}]*)\}/)[1];
  assert.equal((m.match(/-drawer'/g) || []).length, 6);
  assert.ok(m.indexOf('profile') === -1);
});
test('діалог: app-modal, тексти ТЗ, без системного confirm; збереження викликає власне закриття, а не requestCloseSheet', () => {
  assert.ok(/Скасувати зміни\?/.test(SHEETS) && /Внесені зміни не буде збережено\./.test(SHEETS) && /Продовжити редагування/.test(SHEETS));
  assert.ok(!/\bconfirm\(/.test(SHEETS.replace(/showSheetDiscardConfirm|sheetDiscard/g, '')));
  assert.ok(/danger-outline/.test(SHEETS) && /aria-labelledby/.test(SHEETS));
  assert.ok(!/requestCloseSheet/.test(HTML.slice(HTML.indexOf('async function saveCardDebtDrawer'), HTML.indexOf('async function saveCardDebtDrawer') + 6000)));
});
test('самописець: тип sheet-discard і ключ choice дозволені у REC_ALLOWED_TYPES/REC_ALLOWED_KEYS; кінцівки списків не зсунуті', () => {
  assert.ok(/const REC_ALLOWED_TYPES = \[[^\]]*'sheet-discard'[^\]]*'echo-skip', 'pull-skip', 'suggest-tap', 'push-toast'\]/.test(DIAG));
  const k = DIAG.indexOf('const REC_ALLOWED_KEYS = ['); const keys = DIAG.slice(k, DIAG.indexOf('];', k));
  assert.ok(keys.indexOf("'choice'") !== -1 && /^const REC_ALLOWED_KEYS = \['sinceClose', 'idShort',/.test(keys));
});
