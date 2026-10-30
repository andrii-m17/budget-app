# FIELDS-SNAP (Rev 2.32.217, клас A): «Структура → Словник», Крок 0 і діагностика

Лише діагностика при записі; поведінка й атрибути полів не змінені.

## Діагностика (розробницький запис)
- `fields-snapshot` (`snapWhy` = start / mark / stop): усі `input`/`textarea` у DOM (id, type, name, autocomplete, vis/hid — без значень, до 80), `fieldsCount`, `activeElement*`, екран (`fieldScreen`, напр. `view-structure/dictionary` + відкрита шторка).
- `field-added` / `field-removed` (`MutationObserver` по `body`): id, type, name, autocomplete, екран. uuid в id → `<uuid>`.

## Крок 0: поля у «Структура → Словник» (з коду; підтверджено E2E 27)
| Момент | Що в DOM |
|---|---|
| Вхід у вкладку «Словник» | `fldstr2` (type=search, aria/placeholder «Пошук слова», autocomplete=off, autocorrect=off, spellcheck=false) лежить у розмітці ПОСТІЙНО; приховується класом `hidden` панелі й `display:none` обгортки, коли слів немає. Нових полів не з'являється. |
| Пошук | Поле те саме; `renderStructureDictionary` міняє лише список кнопок `.struct-row` (полів у них немає). |
| Вибір слова / редагування | `openStructForm` робить `sf-body.textContent = ''` і СТВОРЮЄ `fldstr3` (type=text, name=`fldstr3` після 2.32.216, autocomplete=off, aria-label «Слово», placeholder немає); це єдине додавання поля. Старий `fldstr3` (якщо був) видаляється в цей момент. |
| Закриття шторки | `fldstr3` лишається в DOM (шторка `inert`) до наступного відкриття форми «Структури»; після збереження викликається `renderStructure()` (список перемальовується, поля не чіпає). |

Кандидати в тригери: підпис/`aria-label` «Слово» (fldstr3), «Пошук слова» (fldstr2, `type=search`), у сусідніх полях «Назва витрати»/«Назва». Спостереження: при кожному виборі слова поле `fldstr3` видаляється й створюється заново (підтримує гіпотезу «зміна набору полів → перерахунок Safari»); перевірити по `field-added`/`field-removed` у записі з iPhone: чи збігається поява панелі з цим моментом.

## Що перевірити на iPhone
Крок 2.32.217-1: запис діагностики → «Структура → Словник» → слово → «Мітка» → «Нова витрата» → поля «Назва», «Сума» → «Мітка» → «Стоп». У записі дивитись `fields-snapshot` і `field-added/removed`.
