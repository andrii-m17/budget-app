// deno-lint-ignore-file no-explicit-any
// MB-2: приймає операції від Monobank (вебхук). Це свідомо verify_jwt = false: банк не може відправляти JWT.
// Захист: адреса містить довгий випадковий секрет (256 біт); у базі лише його SHA-256.
// Невідома адреса отримує 404. Функція нічого не створює, окрім «Вхідних» (через базу).
// MONO-ACC: уся робота з базою на подію це один виклик mono_webhook_ingest; оновлення рахунків і добір пропущеного
// виконуються у фоні після відповіді 200. Логіка в ../_shared/webhook.ts (тести: tests/mono-webhook.test.js).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleWebhook } from "../_shared/webhook.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) =>
  handleWebhook(req, {
    rpc: (name, args) => admin.rpc(name, args),
    fetch: (input, init) => fetch(input, init),
    secret: () => Deno.env.get("MONO_TOKEN_KEY") ?? "",
    waitUntil: (p) => {
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(p);
    },
    now: () => Date.now(),
    log: (code) => console.log(`mono-webhook: ${code}`),
  })
);
