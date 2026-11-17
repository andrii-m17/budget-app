// Екранування, безпечні ідентифікатори й рядкові утиліти (STRUCT-2). escapeHtml створює лише тимчасовий елемент, DOM застосунку не чіпає.
// Перенесено з index.html дослівно, без змін (Rev 2.32.345, STRUCT-2). Звичайний скрипт: функції й константи лишаються глобальними; підключається в index.html перед основним <script>.

function escapeLikeExact(text){
  return String(text).replace(/[\\%_]/g, '\\$&');
}

/* ============ Структура: списки в стилі «Налаштувань» (Rev 2.32.48, S1) ============ */
// Перший емодзі на початку назви → плитка; решта — назва. Без емодзі: emoji = '' (плитка з першою літерою).
function splitLeadingEmoji(name){
  const str = String(name == null ? '' : name);
  const m = str.match(/^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)/u);
  if(!m) return { emoji: '', text: str.trim() };
  return { emoji: m[0], text: str.slice(m[0].length).trim() || str.trim() };
}

function stripLeadingEmoji(name){
  return (name||'').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/gu, '').trim() || name;
}

function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function escapeAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function safeId(id){ return String(id==null?'':id).replace(/[^0-9A-Za-z_-]/g,''); }
(window.__MT_FILES = window.__MT_FILES || []).push('util-safe.js');
