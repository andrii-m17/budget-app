// Rev 2.32.13 — індикатор сегментів не зникає (динамічні сегменти «Нагадувати за»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = ex.buildSandbox({}, ['segmentIndicatorBox']);
const B = (b, i) => JSON.parse(JSON.stringify(c.segmentIndicatorBox(b, i)));
test('segmentIndicatorBox: вибраний сегмент → ненульовий бокс; не виміряний (ширина 0, рядок ще прихований) або немає вибраного → null', () => {
  const btns = [{ left: 0, top: 0, width: 90, height: 44 }, { left: 96, top: 0, width: 90, height: 44 }, { left: 192, top: 0, width: 90, height: 44 }];
  assert.deepEqual(B(btns, 1), { x: 96, y: 0, w: 90, h: 44 });
  btns.forEach((_, i) => assert.ok(B(btns, i).w > 0 && B(btns, i).h > 0, 'сегмент ' + i));
  assert.equal(B(btns, -1), null);
  assert.equal(B(btns, 3), null);
  assert.equal(B([{ left: 0, top: 0, width: 0, height: 0 }], 0), null);
  assert.equal(B(null, 0), null);
});
test('layoutSegment вимірює через segmentIndicatorBox після показу (ResizeObserver), початкове положення без анімації, далі transform; індикатор не отримує ширину 0', () => {
  const i = SRC.indexOf('function layoutSegment'), code = SRC.slice(i, SRC.indexOf('function initSegments', i));
  assert.match(code, /segmentIndicatorBox\(/);
  assert.match(code, /if\(instant \|\| first\) ind\.classList\.add\('no-anim'\)/);
  assert.match(code, /setProperty\('--seg-x'/);
  assert.match(SRC, /new ResizeObserver\(function\(\)\{ layoutSegment\(c, true\); \}\)\.observe\(c\)/);
});
test('«Нагадувати за»: initSegments() після побудови екрана; вибір змінюється на місці (індикатор ковзає), без перемальовування (silent)', () => {
  const r = SRC.slice(SRC.indexOf('function renderNotificationsDrawer'), SRC.indexOf('let notificationDiagOpen'));
  assert.match(r, /body\.appendChild\(gt\);[\s\S]*?initSegments\(\);/);
  assert.match(r, /saveNotificationSetting\(\{ installment_days: n \}, \{ silent: true \}\)/);
  assert.match(SRC, /if\(!\(opts && opts\.silent\)\) renderNotificationsDrawer\(\);/);
});
test('усі контейнери сегментів покриті одним селектором; СSS: індикатор transform, без зміни ширини при русі; reduced-motion — миттєво', () => {
  assert.match(SRC, /const SEGMENT_SELECTOR = '\.struct-tabs, \.theme-toggle, \.n-days';/);
  assert.match(SRC, /html:root \.seg-indicator\.on\{ opacity:1; \}/);
});
