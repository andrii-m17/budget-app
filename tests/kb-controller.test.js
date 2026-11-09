// KB-18 (Rev 2.32.272): інваріанти контролера руху форм з клавіатурою (юніт-частина). Геометрія — функція поточних вимірів, без збережених між відкриттями значень.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
function sb(win, ios){
  const ctx = buildSandbox({ window: Object.assign({ crypto: require('node:crypto').webcrypto }, win), IS_IOS_RUNTIME: ios !== false, kbSessionBase: 0 }, ['kbMeasureBase', 'getBaseViewportHeight']);
  return ctx;
}
test('KB-18/A (MT-1109-7870): збережена база не переживає наступної події — одиничний innerHeight 956 не міняє ціль наступних відкриттів', () => {
  const ctx = sb({ innerHeight: 894, innerWidth: 440, visualViewport: { height: 894, offsetTop: 0 } });
  assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 894);
  ctx.window.innerHeight = 956; // одиничний збій вимірювання (iOS)
  assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 956, 'у цю мить вимір поточний');
  ctx.window.innerHeight = 894;
  assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 894, 'наступне вимірювання знову 894: пам\'яті про 956 немає (раніше база лишалась 956 до кінця сеансу: kbInset 477, rest 842)');
  // легасі-модель (до KB-18): максимум усіх спостережень — показує, чому цілі зсувались на 62 пт
  let legacy = null; [894, 956, 894].forEach(h => { legacy = legacy === null ? h : Math.max(legacy, h); });
  assert.equal(legacy, 956);
  assert.equal(legacy - 479, 477, 'kbInset зі звіту: 956 − 479 = 477 замість 415');
});
test('KB-18/A: коли iOS панорамує сторінку, innerHeight зменшується на offsetTop (800 + 94, 740 + 154) — база лишається 894', () => {
  for(const [ih, top] of [[800, 94], [740, 154], [894, 0]]){
    const ctx = sb({ innerHeight: ih, innerWidth: 440, visualViewport: { height: 479, offsetTop: top } });
    assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 894, ih + ' + ' + top);
  }
  const andr = sb({ innerHeight: 894, innerWidth: 360, visualViewport: { height: 500, offsetTop: 330 } }, false);
  assert.equal(evalInSandbox(andr, 'getBaseViewportHeight()'), 894, 'Android: offsetTop не додається (Chrome прокручує видиму область, а не зменшує innerHeight)');
});
test('KB-18/A: на час одного відкриття база фіксується (захист від хибного innerHeight під час появи клавіатури, 6D.158) і скидається після', () => {
  const ctx = sb({ innerHeight: 894, innerWidth: 440, visualViewport: { height: 894, offsetTop: 0 } });
  evalInSandbox(ctx, 'kbSessionBase = kbMeasureBase()');
  ctx.window.innerHeight = 505; // одиничний хибний просідання під час появи клавіатури
  assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 894);
  evalInSandbox(ctx, 'kbSessionBase = 0');
  assert.equal(evalInSandbox(ctx, 'getBaseViewportHeight()'), 505, 'після закриття знову поточне вимірювання');
});

test('KB-18: самоконтроль спокою — 8 ± 2 пт над клавіатурою, одна анімація', () => {
  const c = buildSandbox({}, ['recSheetRestOff']);
  assert.equal(evalInSandbox(c, 'recSheetRestOff(8, 0)'), null);
  assert.equal(evalInSandbox(c, 'recSheetRestOff(10, 1)'), null);
  assert.equal(evalInSandbox(c, 'recSheetRestOff(14, 0)'), 'rest-gap');
  assert.equal(evalInSandbox(c, 'recSheetRestOff(2, 0)'), 'rest-gap');
  assert.equal(evalInSandbox(c, 'recSheetRestOff(8, 2)'), 'double-anim');
});
