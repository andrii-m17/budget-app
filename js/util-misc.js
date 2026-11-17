// Дрібні утиліти без стану: безпечний виклик, кільцевий буфер, base64url, розбір кольору, яскравість (STRUCT-2).
// Перенесено з index.html дослівно, без змін (Rev 2.32.345, STRUCT-2). Звичайний скрипт: функції й константи лишаються глобальними; підключається в index.html перед основним <script>.

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// ringBufferPush(buffer, event, maxSize) — чиста функція: повертає НОВИЙ
// масив (immutable), найстаріші (з початку) відкидаються понад maxSize.
function ringBufferPush(buffer, event, maxSize){
  const next = buffer.concat([event]);
  if(next.length > maxSize) return next.slice(next.length - maxSize);
  return next;
}

function safeCall(fn, label){
  try{ fn(); }
  catch(err){ console.error(`[Money Tree] Помилка в ${label}:`, err); }
}

// Колір: 'rgb(r,g,b)' / 'rgba(r,g,b,a)' / '#rgb' / '#rrggbb' / [r,g,b(,a)] → [r,g,b,a].
function parseCssColor(c){
  if(Array.isArray(c)) return [c[0], c[1], c[2], c.length > 3 ? c[3] : 1];
  const str = String(c || '').trim();
  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(str);
  if(m){ let a = m[4] === undefined ? 1 : (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a]; }
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
  if(m){ let h = m[1]; if(h.length === 3) h = h.split('').map(x => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  return null;
}

function relativeLuminance(rgb){
  const ch = rgb.slice(0, 3).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
(window.__MT_FILES = window.__MT_FILES || []).push('util-misc.js');
