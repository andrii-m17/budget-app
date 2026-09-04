// Rev 2.3.3 — Service Worker для "Бюджет-локально".
// Мета: (1) дозволити "Додати на головний екран" з коректною поведінкою
// (без цього браузери не пропонують PWA-встановлення), (2) застосунок
// відкривається і працює навіть без інтернету — критично, якщо це основний
// щоденний інструмент внесення витрат, а не мережа завжди стабільна.
//
// Версію кешу треба піднімати руками при кожному релізі HTML-файлу —
// інакше стара закешована версія може пережити оновлення на сервері.
const CACHE_NAME = 'budget-app-v2.6.1';
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL).catch(function(err){
        // Якщо якийсь файл shell недоступний під час першого деплою — не
        // валимо всю інсталяцію SW, краще мати частковий кеш, ніж жодного.
        console.warn('[SW] Не вдалося закешувати частину app shell:', err);
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
