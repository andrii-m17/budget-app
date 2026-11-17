// Структура: вкладка, категорії, підкатегорії, словник (рендер і допоміжні функції)
// Перенесено з index.html дослівно, без змін (Rev 2.32.346, STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.

// Rev 2.11.24 — перемикач вкладок Категорії/Підкатегорії/Словник: та сама
// розмітка карток, лише показуємо одну панель за раз замість суцільного списку.
function switchStructureTab(tab){
  // Rev 2.32.56 (W): кожен вхід у «Словник» і вихід із нього — чистий стан (групи згорнуті, пошук очищено, прокрутка на початку); повернення застосунку з фону стан не скидає (тут немає обробників visibilitychange)
  const wasDictionary = !document.getElementById('struct-tab-panel-dictionary').classList.contains('hidden');
  if(tab === 'dictionary' || wasDictionary){ structDictReset(); renderStructureDictionary(); const mc = document.getElementById('main-col'); if(mc) mc.scrollTop = 0; }
  if(false){ structDictReset(); renderStructureDictionary(); } // Rev 2.32.50 (S3): при відкритті «Словника» усі групи згорнуті, нічого не запам'ятовується
  ['categories','subcategories','dictionary'].forEach(t=>{
    document.getElementById(`struct-tab-panel-${t}`).classList.toggle('hidden', t!==tab);
    document.getElementById(`struct-tab-btn-${t}`).classList.toggle('active', t===tab);
  });
}

const STRUCT_TYPE_GROUPS = [{ type: "Обов'язкова", label: "Обов'язкові" }, { type: 'Гнучка', label: 'Гнучкі' }, { type: 'Скорочувана', label: 'Скорочувані' }];

// Групи за типом: «Обов'язкові», «Гнучкі», «Скорочувані»; порожні типи не повертаються; відносний порядок усередині типу зберігається.
function groupCategoriesByType(cats){
  return STRUCT_TYPE_GROUPS.map(function(g){ return { type: g.type, label: g.label, items: (cats || []).filter(function(c){ return c.type === g.type; }) }; }).filter(function(g){ return g.items.length; });
}

function structTileHtml(name){
  const sp = splitLeadingEmoji(name);
  const inner = sp.emoji ? escapeHtml(sp.emoji) : escapeHtml((sp.text.charAt(0) || '?').toUpperCase());
  return '<span class="struct-tile' + (sp.emoji ? '' : ' letter') + '" aria-hidden="true">' + inner + '</span>';
}

const STRUCT_CHEVRON_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

function structRowHtml(name, onclick, label){
  const sp = splitLeadingEmoji(name);
  return '<button type="button" class="struct-row" onclick="' + onclick + '" aria-label="' + escapeAttr(label + ' ' + sp.text) + '">' + structTileHtml(name) + '<span class="struct-row-name">' + escapeHtml(sp.text) + '</span><span class="struct-row-chev">' + STRUCT_CHEVRON_SVG + '</span></button>';
}

// Група «Додати …» із підписом під нею (є в усіх станах: порожньо, один елемент, багато).
function structAddGroupHtml(label, onclick, caption){
  return '<div class="struct-section"><div class="struct-group"><button type="button" class="struct-row accent" onclick="' + onclick + '"><span class="struct-add-plus" aria-hidden="true">+</span><span class="struct-row-name">' + escapeHtml(label) + '</span></button></div><div class="struct-caption">' + escapeHtml(caption) + '</div></div>';
}

const STRUCT_CAPTION_CAT = 'Торкніться рядка, щоб змінити або видалити. Зміни не зачіпають вже додані витрати.';

const STRUCT_CAPTION_CAT_EMPTY = 'Витрати можна вносити й без категорії. Зміни не зачіпають вже додані витрати.';

function structEmptyHtml(title, sub, btnLabel, onclick, caption, extra){
  return '<div class="struct-empty"><div class="empty-state"><div class="glyph"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div><div class="es-title">' + escapeHtml(title) + '</div><div class="es-sub">' + escapeHtml(sub) + '</div></div><button type="button" class="submit-btn pill" onclick="' + onclick + '">' + escapeHtml(btnLabel) + '</button><div class="struct-caption center">' + escapeHtml(caption) + '</div>' + (extra || '') + '</div>';
}

function renderStructureCategories(){
  const catEl = document.getElementById('struct-categories');
  if(!catEl) return;
  const activeCats = CATEGORIES.map(function(c, i){ return Object.assign({ idx: i }, c); }).filter(function(c){ return c.active; });
  const deletedN = CATEGORIES.filter(function(c){ return !c.active; }).length;
  if(!activeCats.length){
    const trashRow = deletedN ? '<div class="struct-section"><div class="struct-group"><button type="button" class="struct-row" onclick="structOpenTrash()"><span class="struct-row-name">Видалені дані</span><span class="struct-row-side">' + deletedN + '</span><span class="struct-row-chev">' + STRUCT_CHEVRON_SVG + '</span></button></div></div>' : '';
    catEl.innerHTML = structEmptyHtml('Категорій ще немає', 'Категорії групують витрати. Додайте першу або поверніть видалені.', 'Додати категорію', 'openAddCategoryModal()', STRUCT_CAPTION_CAT_EMPTY, trashRow);
    return;
  }
  const parts = groupCategoriesByType(activeCats).map(function(g){
    return '<div class="struct-section"><div class="struct-group-label">' + escapeHtml(g.label) + '</div><div class="struct-group">' + g.items.map(function(c){ return structRowHtml(c.name, 'editCategory(' + c.idx + ')', 'Категорія'); }).join('') + '</div></div>';
  });
  parts.push(structAddGroupHtml('Додати категорію', 'openAddCategoryModal()', STRUCT_CAPTION_CAT));
  catEl.innerHTML = parts.join('');
}

const STRUCT_CAPTION_SUB_EMPTY = 'Підкатегорії необов\'язкові. Зміни не зачіпають вже додані витрати.';

// Групи за батьківською категорією (порядок категорій як у «Категоріях»); категорія без підкатегорій не повертається; підкатегорії з невідомою/неактивною батьківською — окремими групами в кінці.
function groupSubcategoriesByParent(subs, cats){
  const list = subs || [];
  const names = (cats || []).map(function(c){ return c.name; });
  const extra = [];
  list.forEach(function(x){ if(names.indexOf(x.category) === -1 && extra.indexOf(x.category) === -1) extra.push(x.category); });
  return names.concat(extra).map(function(n){ return { category: n, items: list.filter(function(x){ return x.category === n; }) }; }).filter(function(g){ return g.items.length; });
}

function renderStructureSubcategories(){
  const el = document.getElementById('struct-subcategories');
  if(!el) return;
  const activeCats = CATEGORIES.filter(function(c){ return c.active; });
  const activeSubs = SUBCATEGORIES.map(function(x, i){ return Object.assign({ idx: i }, x); }).filter(function(x){ return x.active; });
  if(!activeSubs.length){
    el.innerHTML = structEmptyHtml('Підкатегорій немає', 'Підкатегорії уточнюють категорію, наприклад «Кава» у «Харчуванні». Це необов\'язково.', 'Додати підкатегорію', 'openAddSubcategoryModal()', STRUCT_CAPTION_SUB_EMPTY);
    return;
  }
  const parts = groupSubcategoriesByParent(activeSubs, activeCats).map(function(g){
    return '<div class="struct-section"><div class="struct-group-label">' + escapeHtml(splitLeadingEmoji(g.category).text) + '</div><div class="struct-group">' + g.items.map(function(x){ return structRowHtml(x.name, 'editSubcategory(' + x.idx + ')', 'Підкатегорія'); }).join('') + '</div></div>';
  });
  parts.push(structAddGroupHtml('Додати підкатегорію', 'openAddSubcategoryModal()', STRUCT_CAPTION_CAT));
  el.innerHTML = parts.join('');
}

/* ============ Структура: «Словник» (Rev 2.32.50, S3) ============ */
const STRUCT_CAPTION_DICT = 'Слова допомагають автоматично визначати категорію під час додавання витрати. Торкніться рядка, щоб змінити або видалити.';

const STRUCT_CAPTION_DICT_EMPTY = 'Слова допомагають автоматично визначати категорію під час додавання витрати.';

// Групи за категорією, до якої веде слово (порядок категорій як у «Категоріях», невідомі в кінці); усередині — порядок відображення словника (compareDictionaryForDisplay).
function groupWordsByCategory(words, cats){
  const list = (words || []).slice().sort(compareDictionaryForDisplay);
  const names = (cats || []).map(function(c){ return c.name; });
  const extra = [];
  list.forEach(function(w){ if(names.indexOf(w.cat) === -1 && extra.indexOf(w.cat) === -1) extra.push(w.cat); });
  return names.concat(extra).map(function(n){ return { category: n, items: list.filter(function(w){ return w.cat === n; }) }; }).filter(function(g){ return g.items.length; });
}

// Що видно у «Словнику»: без пошуку — усі групи, розкрита лише openId (акордеон); з пошуком — акордеон вимкнено, групи зі збігом розкриті, решта ховаються. noResults — пошук нічого не знайшов.
function dictionaryView(words, cats, query, openId){
  const q = String(query || '').trim().toLowerCase();
  const groups = groupWordsByCategory(words, cats);
  if(!q) return { searching: false, noResults: false, groups: groups.map(function(g){ return { category: g.category, count: g.items.length, items: g.items, open: g.category === openId }; }) };
  const found = groups.map(function(g){ const items = g.items.filter(function(w){ return String(w.kw || '').toLowerCase().indexOf(q) !== -1; }); return { category: g.category, count: items.length, items: items, open: true }; }).filter(function(g){ return g.items.length; });
  return { searching: true, noResults: found.length === 0, groups: found };
}

// Компенсація прокрутки при акордеоні: заголовок, по якому торкнулись, лишається на тому самому місці екрана (повертає, на скільки змістити scrollTop).
function accordionAnchorDelta(before, after){ return (Number(after) || 0) - (Number(before) || 0); }

let structDict = { openId: null, query: '' };

// Вихід із вкладки «Структура» (перехід на іншу вкладку застосунку), коли активний сегмент «Словник»: скидання стану й збереженої прокрутки (щоб при поверненні вона не вказувала «в нікуди»).
function structDictLeave(){
  const dictActive = !document.getElementById('struct-tab-panel-dictionary').classList.contains('hidden');
  if(!dictActive) return;
  structDictReset(); renderStructureDictionary();
  tabScrollPositions['structure'] = 0;
}

function structDictReset(){
  structDict = { openId: null, query: '' };
  const inp = document.getElementById('fldstr2'); if(inp) inp.value = '';
}

const STRUCT_DICT_CHEV_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

// Rev 2.32.56 (W): рядок слова — слово зліва; підкатегорія (якщо є) — невеликий підпис-значок праворуч (емодзі + назва); без підкатегорії праворуч порожньо. Другого рівня розкриття немає.
function wordRowModel(word, subcategories){
  const sub = word && word.sub ? String(word.sub) : '';
  if(!sub) return { text: word ? word.kw : '', badge: null };
  const sp = splitLeadingEmoji(sub);
  return { text: word.kw, badge: { emoji: sp.emoji, name: sp.text } };
}

function structDictWordRow(w){
  // Rev 2.32.60 (W, варіант A): слово 17 пт зліва; підкатегорія (якщо є) — дрібний вторинний підпис ПІД словом (13 пт, емодзі + назва); праворуч стрілка ›. Без значків праворуч і без підпису-заглушки; другого розкриття немає.
  const m = wordRowModel(w, SUBCATEGORIES);
  const sub = m.badge ? '<span class="struct-word-sub">' + (m.badge.emoji ? escapeHtml(m.badge.emoji) + '\u00a0' : '') + escapeHtml(m.badge.name) + '</span>' : '';
  return '<button type="button" class="struct-row" onclick="editDictionaryEntry(\'' + safeId(w.id) + '\')" aria-label="' + escapeAttr('Слово ' + w.kw + (m.badge ? ', ' + m.badge.name : '')) + '"><span class="struct-word-main"><span class="struct-word-text">' + escapeHtml(m.text) + '</span>' + sub + '</span><span class="struct-row-chev">' + STRUCT_CHEVRON_SVG + '</span></button>';
}

function renderStructureDictionary(){
  const el = document.getElementById('struct-dictionary');
  if(!el) return;
  const activeCats = CATEGORIES.filter(function(c){ return c.active; });
  const words = DICTIONARY.filter(function(d){ return !d.deletedAt; });
  const wrap = document.getElementById('struct-dict-search-wrap');
  if(wrap) wrap.style.display = words.length ? '' : 'none';
  if(!words.length){
    el.innerHTML = structEmptyHtml('Словник порожній', 'Додайте перше слово, наприклад «кава»: воно підставлятиме «Харчування · Кава».', 'Додати слово', 'openAddDictionaryModal()', STRUCT_CAPTION_DICT_EMPTY);
    return;
  }
  const view = dictionaryView(words, activeCats, structDict.query, structDict.openId);
  if(view.noResults){
    const q = structDict.query.trim();
    el.innerHTML = structEmptyHtml('Нічого не знайдено', 'Слова «' + q + '» немає у словнику.', 'Додати слово «' + q + '»', 'openAddDictionaryModal(structDict.query.trim())', STRUCT_CAPTION_DICT_EMPTY);
    return;
  }
  const parts = view.groups.map(function(g){
    const sp = splitLeadingEmoji(g.category);
    return '<div class="struct-group struct-dict-group' + (g.open ? ' open' : '') + '" data-cat="' + escapeAttr(g.category) + '">' +
      '<button type="button" class="struct-dict-head" aria-expanded="' + (g.open ? 'true' : 'false') + '">' + structTileHtml(g.category) + '<span class="struct-dict-title">' + escapeHtml(sp.text) + '</span><span class="struct-row-side">' + g.count + '</span><span class="struct-dict-chev">' + STRUCT_DICT_CHEV_SVG + '</span></button>' +
      '<div class="struct-dict-collapse"><div class="struct-dict-inner">' + g.items.map(structDictWordRow).join('') + '</div></div></div>';
  });
  parts.push(structAddGroupHtml('Додати слово', 'openAddDictionaryModal()', STRUCT_CAPTION_DICT));
  el.innerHTML = parts.join('');
}

function onStructDictSearch(v){ structDict.query = String(v || ''); structDict.openId = null; renderStructureDictionary(); } // очищення пошуку повертає всі групи згорнутими

function structDictGroupEl(cat){
  const groups = document.querySelectorAll('#struct-dictionary .struct-dict-group');
  for(let i = 0; i < groups.length; i++){ if(groups[i].getAttribute('data-cat') === cat) return groups[i]; }
  return null;
}

function structDictApplyOpen(){
  document.querySelectorAll('#struct-dictionary .struct-dict-group').forEach(function(g){
    const open = g.getAttribute('data-cat') === structDict.openId;
    g.classList.toggle('open', open);
    g.classList.toggle('just-opened', open);
    g.querySelector('.struct-dict-head').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Відкриття/закриття групи (акордеон: відкриття закриває попередню) з утриманням місця заголовка на екрані.
function toggleDictGroup(cat, forceOpen){
  if(structDict.query.trim()) return; // під час пошуку акордеон вимкнено
  const head = structDictGroupEl(cat);
  const main = document.getElementById('main-col');
  const beforeTop = head ? head.getBoundingClientRect().top : 0;
  structDict.openId = (forceOpen || structDict.openId !== cat) ? cat : null;
  structDictApplyOpen();
  if(!head || !main) return;
  const anchor = function(){ main.scrollTop += accordionAnchorDelta(beforeTop, head.getBoundingClientRect().top); };
  anchor();
  if(structDictDesktopAnim() && !motionReduced()){ // анімована висота: тримаємо місце на кожному кадрі
    const t0 = performance.now();
    (function frame(){ anchor(); if(performance.now() - t0 < 280) requestAnimationFrame(frame); })();
  }
}

function structDictDesktopAnim(){ try{ return !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches); }catch(e){ return false; } } // Rev 2.32.159: на десктопі словник анімує висоту незалежно від варіанта акордеона

function structOpenTrash(){ performSwitchTab('service'); openTrashScreen(); }

function renderStructure(){
  const catEl = document.getElementById('struct-categories');
  if(!catEl) return;
  renderStructureCategories(); // Rev 2.32.48 (S1)
  renderStructureSubcategories(); // Rev 2.32.49 (S2)
  renderStructureDictionary(); // Rev 2.32.50 (S3)
}

