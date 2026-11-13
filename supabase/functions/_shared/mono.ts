// deno-lint-ignore-file no-explicit-any
// MONO-ACC: спільний код mono-webhook і mono-connect: шифрування токена, запити до банку, розбір списку рахунків.
// Формат шифртексту НЕ змінено (v1.<iv>.<ct>, AES-256-GCM, ключ = SHA-256(MONO_TOKEN_KEY), aad = user_id):
// токени, збережені до цієї зміни, розшифровуються як раніше (тест «формат шифртексту не змінився»).
// Модуль не звертається до Deno.* і не імпортує npm/jsr, тому його виконує й Node (тести tests/mono-webhook.test.js).

export const MONO_API = "https://api.monobank.ua";
// Ліміти банку (api.monobank.ua/docs, перевірено 13.11): client-info і statement кожен не частіше 1 разу на 60 с;
// максимум періоду виписки 31 доба + 1 година = 2 682 000 с; відповідь вебхука 5 с, строго HTTP 200.
export const STATEMENT_MAX_SECONDS = 2_682_000;
export const STATEMENT_LOOKBACK_SECONDS = 3600;
// Максимум записів у відповіді виписки: НЕ з документації (там не вказано), а відома практика. Евристика «≥ 500 = можливо неповно».
export const STATEMENT_PAGE_LIMIT = 500;
export const CLIENT_INFO_TIMEOUT_MS = 10_000;
export const STATEMENT_TIMEOUT_MS = 10_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
// Повертає Uint8Array<ArrayBuffer> (а не ArrayBufferLike): так вимагають типи BufferSource у свіжому Deno (deno check).
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("key_missing");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptToken(token: string, aad: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(token));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
export async function decryptToken(packed: string, aad: string, secret: string): Promise<string> {
  const [ver, ivB64, ctB64] = packed.split(".");
  if (ver !== "v1" || !ivB64 || !ctB64) throw new Error("bad_format");
  const key = await getKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64), additionalData: enc.encode(aad) }, key, unb64(ctB64));
  return dec.decode(pt);
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, max);

// Запит до банку з тайм-аутом. За замовчуванням 15 с, як було в mono-connect; вебхук передає 10 с.
export async function monoFetch(
  path: string,
  token: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 15000);
  try {
    return await (opts?.fetchImpl ?? fetch)(`${MONO_API}${path}`, {
      ...init,
      headers: { "X-Token": token, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Код причини невдачі для журналу й mono_backfill_release (лише латиниця, без даних користувача).
export function failureReason(e: unknown): string {
  if (typeof e === "number") {
    if (e === 429) return "bank_429";
    if (e >= 500) return "bank_5xx";
    return `bank_${e}`;
  }
  const name = (e as any)?.name;
  return name === "AbortError" || name === "TimeoutError" ? "bank_timeout" : "bank_error";
}

// Рядки для mono_apply_accounts: { id, masked_pan, type, currency_code, is_jar }. Для банок masked_pan = назва.
// Очищення рядків ті самі, що були у connect.
export function buildAccountRows(info: any): any[] {
  const rows: any[] = [];
  for (const a of (info?.accounts ?? [])) {
    const id = clean(a?.id, 64);
    if (!id) continue;
    rows.push({
      id,
      masked_pan: clean((a?.maskedPan ?? [])[0], 24).replace(/[^0-9*\- ]/g, ""),
      type: clean(a?.type, 20),
      currency_code: Number.isInteger(a?.currencyCode) ? a.currencyCode : null,
      is_jar: false,
    });
  }
  for (const j of (info?.jars ?? [])) {
    const id = clean(j?.id, 64);
    if (!id) continue;
    rows.push({
      id,
      masked_pan: clean(j?.title, 24),
      type: "jar",
      currency_code: Number.isInteger(j?.currencyCode) ? j.currencyCode : null,
      is_jar: true,
    });
  }
  return rows;
}

// Період виписки: from = позначка − 1 год, але не раніше за now − 2 682 000 с (документований максимум); to = now.
export function statementWindow(backfillFrom: string, nowMs: number): { from: number; to: number } | null {
  const bf = Date.parse(backfillFrom);
  if (!Number.isFinite(bf)) return null;
  const to = Math.floor(nowMs / 1000);
  let from = Math.floor(bf / 1000) - STATEMENT_LOOKBACK_SECONDS;
  from = Math.max(from, to - STATEMENT_MAX_SECONDS);
  if (from >= to) from = to - 1;
  return { from, to };
}
