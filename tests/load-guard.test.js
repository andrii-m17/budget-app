// STRUCT-3a2 (Rev 2.32.347): захист від білого екрана — порівняння списків файлів, позначки в js/*.js, перша дія основного скрипта, гілка sw.js для відповідей з помилкою.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSandbox } = require('./extract');
const root = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const c = buildSandbox({}, ['mtLoadCheck']);
const J = (v) => JSON.parse(JSON.stringify(v));
const FULL = require('./extract').readIndexWithCss(); // весь код (index.html + js/*.js): самописець живе в js/diag.js

test('mtLoadCheck: усе є / бракує одного / зайва позначка / не масив', function(){
  assert.deepEqual(J(c.mtLoadCheck(['a.js', 'b.js'], ['a.js', 'b.js'])), { missing: [], extra: [] });
  assert.deepEqual(J(c.mtLoadCheck(['a.js', 'b.js'], ['b.js'])), { missing: ['a.js'], extra: [] });
  assert.deepEqual(J(c.mtLoadCheck(['a.js'], ['a.js', 'z.js'])), { missing: [], extra: ['z.js'] }); // зайва позначка — не збій
  assert.deepEqual(J(c.mtLoadCheck(['a.js', 'b.js'], undefined)), { missing: ['a.js', 'b.js'], extra: [] }); // жоден файл не відзвітував
  assert.deepEqual(J(c.mtLoadCheck(['a.js'], 'не масив')), { missing: ['a.js'], extra: [] });
});
test('позначка завантаження — останній непорожній рядок кожного js/*.js, з назвою свого файлу', function(){
  const files = fs.readdirSync(path.join(root, 'js')).filter(function(f){ return /\.js$/.test(f); });
  assert.ok(files.length >= 5);
  files.forEach(function(f){
    const last = fs.readFileSync(path.join(root, 'js', f), 'utf8').replace(/\s+$/, '').split('\n').pop().trim();
    assert.equal(last, "(window.__MT_FILES = window.__MT_FILES || []).push('" + f + "');", f);
  });
});
test('основний скрипт починається з перевірки завантаження; збій зупиняє скрипт винятком; ключ mt-load-fail; без токенів у стилях екрана', function(){
  const main = INDEX.slice(INDEX.indexOf('<script>\n/* ============ Захист від білого екрана'));
  assert.ok(main.startsWith('<script>\n/* ============ Захист від білого екрана'), 'перевірка — першою в основному скрипті');
  const guard = main.slice(0, main.indexOf('function loadFailReport'));
  assert.match(guard, /throw new Error\('mt-load-fail: '/);
  assert.match(guard, /localStorage\.setItem\('mt-load-fail'/);
  assert.match(guard, /Не вдалося завантажити застосунок/); assert.match(guard, /Перевірте інтернет і спробуйте ще раз/); assert.match(guard, /textContent = 'Оновити'/);
  assert.match(guard, /prefers-color-scheme:dark/); assert.match(guard, /height:44px/); assert.match(guard, /border-radius:999px/); assert.match(guard, /safe-area-inset-top/);
  assert.ok(!/var\(--/.test(guard), 'без CSS-змінних: css/*.css міг не завантажитись');
  assert.ok(!/<input|createElement\('input'\)/.test(guard), 'полів вводу немає');
  assert.match(FULL, /const REC_ALLOWED_TYPES = \[[^\]]*'load-fail'[^\]]*\]/); assert.match(FULL, /const REC_ALLOWED_KEYS = \[[^\]]*'files', 'ageMin', 'loadVer', 'lenBefore', 'lenAfter', 'lenPost', 'same', 'composing', 'catFilled', 'sinceMs', 'inList', 'fieldFocus', 'picked', 'iosV', 'standalone', 'dpr', 'coarse'\]/);
  assert.match(FULL, /recBgListeners\(\);\n  loadFailReport\(\);/);
});
// sw.js: гілка css/js — мережа-спочатку; res.ok → кеш і відповідь; !res.ok → копія з кешу, немає копії → сама відповідь; збій мережі → кеш
function swFetch(opts){
  const handlers = {}; const put = []; const store = opts.cache || {};
  const caches = { open: async function(){ return { put: async function(req){ put.push(req.url); }, addAll: async function(){}, add: async function(){} }; }, match: async function(req, o){ const u = (typeof req === 'string' ? req : req.url).replace(/\?.*$/, ''); return o && o.ignoreSearch && store[u] ? store[u] : undefined; }, keys: async function(){ return []; }, delete: async function(){ return true; } };
  const self = { addEventListener: function(t, f){ handlers[t] = f; }, location: { origin: 'http://x.test' }, clients: { claim: async function(){} }, skipWaiting: function(){}, registration: {} };
  vm.runInNewContext(SW, { self: self, caches: caches, console: console, fetch: opts.fetch, Promise: Promise, URL: URL, Response: function(){}, setTimeout: setTimeout });
  let out; handlers.fetch({ request: { method: 'GET', mode: 'no-cors', url: 'http://x.test/js/util-date.js?v=1' }, respondWith: function(p){ out = p; } });
  return out.then(function(r){ return { r: r, put: put }; });
}
test('sw.js js/css: відповідь з помилкою (404/5xx) → копія з кешу; копії немає → сама відповідь; у кеш помилку не пишемо', async function(){
  const cached = { cached: true };
  const a = await swFetch({ fetch: async function(){ return { ok: false, status: 404 }; }, cache: { 'http://x.test/js/util-date.js': cached } });
  assert.equal(a.r, cached); assert.deepEqual(a.put, []);
  const err = { ok: false, status: 503 };
  const b = await swFetch({ fetch: async function(){ return err; } });
  assert.equal(b.r, err); assert.deepEqual(b.put, []);
});
test('sw.js js/css: успішна відповідь — у кеш і віддається; збій мережі — копія з кешу', async function(){
  const ok = { ok: true, status: 200, clone: function(){ return { copy: true }; } };
  const a = await swFetch({ fetch: async function(){ return ok; } });
  assert.equal(a.r, ok); assert.deepEqual(a.put, ['http://x.test/js/util-date.js?v=1']);
  const cached = { cached: 'offline' };
  const b = await swFetch({ fetch: async function(){ throw new Error('offline'); }, cache: { 'http://x.test/js/util-date.js': cached } });
  assert.equal(b.r, cached);
});
