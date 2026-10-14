// Rev 2.32.45 (FB) — варіант кнопки діалогу підтвердження: звичайні дії зелені, руйнівні червоні.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['confirmButtonClass']);
test('confirmButtonClass: primary — зелена, решта (типово) — руйнівна', function(){
  assert.equal(c.confirmButtonClass('primary'), 'submit-btn');
  assert.equal(c.confirmButtonClass(), 'submit-btn danger'); assert.equal(c.confirmButtonClass('danger'), 'submit-btn danger');
});
test('кнопки «Заповнити», «Додати», «Оновити зараз», часткове «Врахувати» — primary; руйнівні лишаються червоними', function(){
  assert.match(SRC, /'Заповнити', 'primary'\)/);
  assert.match(SRC, /runMonoAddAll, 'Додати', 'primary'\)/);
  assert.match(SRC, /'Оновити зараз',\s*'primary'/);
  assert.match(SRC, /=== 'Видалити' \? 'danger' : 'primary'/);
  assert.ok(!/confirm-btn'\)\.className = 'submit-btn'; \/\/ основна дія/.test(SRC), 'нема пізнього перезапису класу');
  assert.match(SRC, /'Так, видалити'\)/); assert.match(SRC, /'Так, відновити'\n/);
  // руйнівні виклики не отримали primary
  assert.ok(!/'Так, видалити', 'primary'|'Очистити', 'primary'|'Так, відновити'\s*,\s*'primary'/.test(SRC));
});
