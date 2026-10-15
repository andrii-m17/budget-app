# Набір роботи Money Tree v2 (чат · Claude Code)

## Що всередині
| Шлях | Призначення |
|---|---|
| `docs/CRITICAL_RULES.md` | 11 непорушних правил (з приватністю й матрицею сценаріїв); гачок показує їх на старті сесії |
| `docs/WORKFLOW.md` | ролі, класи ризику A/B/C, цикл задачі, «Готово», економія ресурсів, відкат |
| `docs/SCENARIOS.md` | осі сценаріїв (дані, пристрої, мережа, час…) і синтетичні набори даних |
| `docs/SUPABASE_POLICY.md` | сервер, тестові дані, зберігання, синхронізація, «24 год + маркер», місткість, нагляд |
| `docs/STATUS.md` | реєстр рішень і відкритих питань |
| `docs/UI_PATTERNS.md` | каркас; Claude Code заповнює вимірами (K2) |
| `docs/NOTION_BRIDGE.md` | міст чат ↔ Claude Code без копіювання |
| `.claude/skills/*` | 9 навичок: rev-release, task-report, step0-audit, scenario-matrix, ui-from-mockup, new-input-field, ios-keyboard-safety, supabase-safety, notion-bridge |
| `.claude/agents/spec-reviewer.md` | незалежна перевірка змін (ТЗ, сценарії, приватність) |
| `.claude/settings.json` + `scripts/hooks/` | гачки: правила на старті; тести й версії перед push; тести при завершенні (перевірено 9 сценаріїв) |
| `prompts/01–05`, `TEMPLATE-task.md` | встановлення, журнал помилок JS, чекліст iPhone, наскрізні тести й CI, міст Notion |
| `chat/PROJECT_INSTRUCTIONS.md` | текст для інструкцій Project у claude.ai |

## Порядок
0. (Якщо обрано Notion) налаштувати міст: `docs/NOTION_BRIDGE.md` + `prompts/05`.
1. Розпакувати в корінь репозиторію → `prompts/01-bootstrap.md` (K1, K2, K3).
2. Інструкції Project ← `chat/PROJECT_INSTRUCTIONS.md`; у Project-файли: `STATUS.md`, `WORKFLOW.md`, `SCENARIOS.md`, `UI_PATTERNS.md`.
3. `prompts/02-js-error.md`, потім `03-iphone-checklist.md`.
4. `prompts/04-e2e-ci.md` (тести, CI, гілка `dev`).
