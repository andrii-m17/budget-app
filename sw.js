// Rev 2.3.3 — Service Worker для "Бюджет-локально".
// Мета: (1) дозволити "Додати на головний екран" з коректною поведінкою
// (без цього браузери не пропонують PWA-встановлення), (2) застосунок
// відкривається і працює навіть без інтернету — критично, якщо це основний
// щоденний інструмент внесення витрат, а не мережа завжди стабільна.
//
// Версію кешу треба піднімати руками при кожному релізі HTML-файлу —
// інакше стара закешована версія може пережити оновлення на сервері.
const CACHE_NAME = 'budget-app-v2.21.58';
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
