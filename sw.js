// Rev 2.3.3 — Service Worker для "Бюджет-локально".
// Мета: (1) дозволити "Додати на головний екран" з коректною поведінкою
// (без цього браузери не пропонують PWA-встановлення), (2) застосунок
// відкривається і працює навіть без інтернету — критично, якщо це основний
// щоденний інструмент внесення витрат, а не мережа завжди стабільна.
//
// Версію кешу треба піднімати руками при кожному релізі HTML-файлу —
// інакше стара закешована версія може пережити оновлення на сервері.
const CACHE_NAME = 'budget-app-v2.32.3';
// Rev 2.6.1 — назви файлів іконок отримали суфікс "-v2" (cache-busting):
// та сама назва файлу під заміненим вмістом не гарантовано пробивала кеш
// CDN GitHub Pages / Cache Storage / кеш фавіконок Safari одночасно.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png'
];

self.addEventListener('install', function(event){
  // Rev 2.11.0 BugFix (P1, PWA-аудит) — раніше тут стояв self.skipWaiting(),
  // тому новий SW активувався одразу після встановлення, ще до того, як
  // користувач взагалі побачив банер "Доступне оновлення". Комбінація зі
  // self.clients.claim() у activate нижче означала, що новий SW брав
  // контроль над уже відкритою вкладкою МОВЧКИ — хоча UI обіцяв "оновлення
  // станеться лише після підтвердження". Тепер install НЕ форсує активацію:
  // новий SW встановлюється і чекає у стані "waiting", доки сторінка сама не
  // надішле команду SKIP_WAITING (див. обробник message нижче) — це
  // відбувається лише у відповідь на клік "Оновити зараз" в openUpdateModal().
  //
  // Rev 2.11.1 BugFix (P1, PWA-аудит) — cache.addAll(APP_SHELL) атомарний:
  // якщо ХОЧ ОДИН ресурс (напр. тимчасово недоступна іконка) не завантажився,
  // ціла операція відхилялась, і catch() нижче це мовчки ковтав — офлайн-
  // фолбек (caches.match('./index.html') у fetch-обробнику нижче) міг тоді
  // лишитись БЕЗ жодного закешованого index.html, хоча install формально
  // "успішно" завершився. Замість одного addAll кешуємо кожен ресурс
  // НЕЗАЛЕЖНО (Promise.allSettled) — і найкритичніший з них (index.html,
  // без якого офлайн-фолбек узагалі не спрацює) кешуємо окремим явним
  // запитом ПЕРШИМ, а не як частину загального списку.
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.add('./index.html')
        .catch(function(err){ console.error('[SW] Критично: не вдалося закешувати index.html —', err); })
        .then(function(){
          return Promise.allSettled(
            APP_SHELL.filter(function(url){ return url !== './index.html'; })
              .map(function(url){ return cache.add(url).catch(function(err){ console.warn('[SW] Не вдалося закешувати', url, err); }); })
          );
        });
    })
  );
});

// Rev 2.11.0 — явна команда активації від сторінки (замість автоматичного
// skipWaiting вище). Сторінка надсилає це повідомлення лише після того, як
// користувач сам натиснув "Оновити зараз" у модалці оновлення.
self.addEventListener('message', function(event){
  if(event.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

// Rev 2.22.25 (6D.93) — Крок 2 push-інфраструктури: показ системного
// сповіщення при вхідному push-повідомленні (сервер шле {title, body} як
// JSON — Edge Function send-push-notification, 6D.92). Якщо event.data
// відсутній чи не JSON — тихий фолбек на дефолтний заголовок, не критично.
// Rev 2.22.27 (6D.99) — data.data (напр. {type:'daily-expense-reminder'},
// сервер) прокидається в options.data — notificationclick нижче читає
// його, щоб знати, куди саме вести клік.
// Rev 2.23.30 (6D.199) — ЖУРНАЛ ОТРИМАННЯ + "завжди показувати": на КОЖНУ подію push (до showNotification) у IndexedDB
// 'budget-app-push-log' пишеться {ts, type, title, shown:false}; після успішного showNotification shown:true; будь-яка
// помилка (парсингу, запису в журнал, самого показу) ловиться й лягає в поле error. iOS вимагає показувати сповіщення
// для КОЖНОГО push (інакше може відкликати дозвіл), тому НЕМАЄ жодної умови, за якої showNotification не викликається
// (зокрема коли вікно застосунку видиме — внутрішні картки на Realtime живуть окремо). Журнал — до 30 записів.
const PUSH_LOG_DB_NAME = 'budget-app-push-log';
const PUSH_LOG_STORE = 'log';
const PUSH_LOG_LIMIT = 30;
function openPushLogDb(){
  return new Promise(function(resolve, reject){
    const req = indexedDB.open(PUSH_LOG_DB_NAME, 1);
    req.onupgradeneeded = function(){
      if(!req.result.objectStoreNames.contains(PUSH_LOG_STORE)) req.result.createObjectStore(PUSH_LOG_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error); };
  });
}
function writePushLog(entry){
  return openPushLogDb().then(function(db){
    return new Promise(function(resolve, reject){
      const tx = db.transaction(PUSH_LOG_STORE, 'readwrite');
      const store = tx.objectStore(PUSH_LOG_STORE);
      const addReq = store.add(entry);
      addReq.onsuccess = function(){
        const id = addReq.result;
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = function(){
          const keys = keysReq.result || [];
          for(let i = 0; i < keys.length - PUSH_LOG_LIMIT; i++) store.delete(keys[i]); // найстаріші відкидаємо
          resolve(id);
        };
      };
      tx.onerror = function(){ reject(tx.error); };
      tx.oncomplete = function(){ db.close(); };
    });
  });
}
function patchPushLog(id, patch){
  if(id === null || id === undefined) return Promise.resolve();
  return openPushLogDb().then(function(db){
    return new Promise(function(resolve){
      const tx = db.transaction(PUSH_LOG_STORE, 'readwrite');
      const store = tx.objectStore(PUSH_LOG_STORE);
      const getReq = store.get(id);
      getReq.onsuccess = function(){ if(getReq.result) store.put(Object.assign(getReq.result, patch)); };
      tx.oncomplete = function(){ db.close(); resolve(); };
      tx.onerror = function(){ resolve(); };
    });
  }).catch(function(){});
}
self.addEventListener('push', function(event){
  let data = {};
  let problem = null;
  try{ data = event.data ? event.data.json() : {}; }catch(err){ problem = 'parse: ' + (err && err.message ? err.message : String(err)); data = {}; }
  if(!data || typeof data !== 'object') data = {};
  const title = (typeof data.title === 'string' && data.title) ? data.title : 'Money Tree';
  const inner = (data.data && typeof data.data === 'object') ? data.data : {};
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: './icons/icon-192-v2.png',
    badge: './icons/icon-192-v2.png',
    data: inner
  };
  // Rev 2.23.29 (6D.198) — tag (data.data.tag або data.tag) замінює попереднє сповіщення того ж виду; renotify:false — без
  // повторного звуку/вібрації при заміні.
  const notifTag = inner.tag || data.tag;
  if(notifTag){ options.tag = String(notifTag); options.renotify = false; }
  const logged = writePushLog({ ts: Date.now(), type: inner.type || null, title: title, shown: false, error: problem }).catch(function(){ return null; });
  event.waitUntil(
    logged.then(function(id){
      return self.registration.showNotification(title, options).then(function(){
        return patchPushLog(id, { shown: true });
      }, function(err){
        return patchPushLog(id, { error: 'show: ' + (err && err.message ? err.message : String(err)) }).then(function(){ throw err; });
      });
    })
  );
});

// Rev 2.22.25 (6D.93) — клік по сповіщенню: фокус уже відкритої вкладки,
// якщо є, інакше відкрити нову — стандартний PWA-паттерн.
// Rev 2.22.27 (6D.99), узагальнено в Rev 2.22.28 (6D.100) — маршрутизує
// за всім notification.data як є (не лише за одним полем "tab"), щоб той
// самий механізм обслуговував і "вкладка" (daily-expense-reminder), і
// "вкладка + конкретний запис" (installment-deadline, 6D.96, опційний
// installmentId). Відкритій вкладці шлемо postMessage (сама сторінка не
// може прочитати query-параметр нової навігації, вона вже завантажена);
// щойно відкритій/новій — ті самі поля як query-параметри (?pushAction=
// type&installmentId=...), які index.html читає при старті через
// handlePushAction(). Невідомий/відсутній type — лише фокус/відкриття.
// Rev 2.22.73 (6D.144) — коли iOS вивантажує PWA з памʼяті, релонч по
// кліку на сповіщення ІГНОРУЄ URL з clients.openWindow() нижче й завжди
// відкриває голий start_url з manifest.json — підтверджено живим тестом
// користувача (Журнал не відкрився по кліку на "нові записи Olga") і
// задокументовано як відома поведінка WebKit (Apple Developer Forums,
// GitHub firebase-js-sdk#7698). Тому дію ЗАВЖДИ дублюємо в окрему легку
// IndexedDB-базу (сирий IndexedDB API — доступний і в SW, і на сторінці,
// на відміну від localStorage) ПЕРЕД спробою focus()/openWindow() —
// index.html перевіряє цей запис на кожному старті незалежно від того,
// яку саме URL iOS реально відкрила. Один ключ 'pending' (не чергу) —
// найновіший клік перемагає.
const PUSH_ACTION_DB_NAME = 'budget-app-push-actions';
const PUSH_ACTION_STORE = 'pending';
function writePendingPushAction(action){
  return new Promise(function(resolve, reject){
    const openReq = indexedDB.open(PUSH_ACTION_DB_NAME, 1);
    openReq.onupgradeneeded = function(){
      if(!openReq.result.objectStoreNames.contains(PUSH_ACTION_STORE)) openReq.result.createObjectStore(PUSH_ACTION_STORE);
    };
    openReq.onsuccess = function(){
      const db = openReq.result;
      const tx = db.transaction(PUSH_ACTION_STORE, 'readwrite');
      tx.objectStore(PUSH_ACTION_STORE).put(action, 'pending');
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error); };
    };
    openReq.onerror = function(){ reject(openReq.error); };
  });
}

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const notifData = event.notification.data || {};
  // best-effort (приватний режим/квота IndexedDB — не критично, решта
  // (focus/openWindow) все одно має відпрацювати як і раніше).
  const persist = notifData.type ? writePendingPushAction(notifData).catch(function(){}) : Promise.resolve();

  event.waitUntil(
    persist.then(function(){
      return self.clients.matchAll({ type: 'window' }).then(function(clientsArr){
        for(const c of clientsArr){
          if('focus' in c){
            if(notifData.type) c.postMessage({ type: 'push-action', action: notifData });
            return c.focus();
          }
        }
        let url = './';
        if(notifData.type){
          url = './index.html?pushAction=' + encodeURIComponent(notifData.type);
          if(notifData.installmentId) url += '&installmentId=' + encodeURIComponent(notifData.installmentId);
          if(notifData.target) url += '&target=' + encodeURIComponent(notifData.target); // Rev 2.23.31 (6D.200): куди веде зведення (journal/accounting/debts)
        }
        if(self.clients.openWindow) return self.clients.openWindow(url);
      });
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  const req = event.request;
  if(req.method !== 'GET') return;

  // Навігаційні запити (сам HTML): мережа-спочатку, щоб онлайн завжди
  // показувалась найсвіжіша ревізія (нове "Зберегти"/фічі підхоплюються
  // одразу після наступного відкриття), а офлайн — фолбек на кеш.
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then(function(res){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put('./index.html', copy); });
          return res;
        })
        .catch(function(){ return caches.match('./index.html'); })
    );
    return;
  }

  // Решта (іконки, маніфест, шрифти, xlsx.js з CDN): кеш-спочатку — рідко
  // змінюються, а офлайн-доступність важливіша за миттєву свіжість.
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req)
        .then(function(res){
          if(res && res.ok && req.url.indexOf(self.location.origin) === 0){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
          }
          return res;
        })
        .catch(function(){
          // Офлайн і немає в кеші (напр. Google Fonts/xlsx.js без інтернету
          // при першому візиті) — просто мовчки падає, це не критично для
          // основної дії "внести витрату".
        });
    })
  );
});
