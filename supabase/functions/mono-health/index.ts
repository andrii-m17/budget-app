// deno-lint-ignore-file no-explicit-any
// MB-2: службова перевірка ключа шифрування токена Monobank. Не показує значення ключа:
// повертає лише «є ключ», «довжина достатня» і результат тесту «зашифрувати і розшифрувати».
// Викликати можна лише із внутрішнім секретом x-push-secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const enc = new TextEncoder();
const dec = new TextDecoder();
const JSON_HEADERS = { "Content-Type": "application/json" };

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const provided = req.headers.get("x-push-secret") ?? "";
  const { data: authorized, error: authError } = await admin.rpc("verify_push_secret", { p_secret: provided });
  if (authError || authorized !== true) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const secret = Deno.env.get("MONO_TOKEN_KEY") ?? "";
  const keyPresent = secret.length > 0;
  const keyLengthOk = secret.length >= 32;
  let roundTrip = false;
  if (keyLengthOk) {
    try {
      const key = await getKey(secret);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = enc.encode("health");
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, enc.encode("probe-value"));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b64(iv)), additionalData: aad }, key, ct);
      roundTrip = dec.decode(pt) === "probe-value";
    } catch (_) {
      roundTrip = false;
    }
  }
  return new Response(JSON.stringify({ keyPresent, keyLengthOk, roundTrip }), { status: 200, headers: JSON_HEADERS });
});
