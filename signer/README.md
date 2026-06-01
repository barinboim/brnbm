# Подписатор PDF

Веб-приложение для размещения PNG-подписей на страницах PDF и скачивания подписанного файла. Работает целиком в браузере — без сервера. Хостится на GitHub Pages.

## Локальный запуск

GitHub Pages — это статика, но из-за `fetch('signatures/manifest.json')` файл нельзя открывать как `file://`. Запускайте через любой статический сервер:

```bash
python3 -m http.server 8000
# или
npx serve .
```

Откройте: `http://127.0.0.1:8000`.

## Добавление новых подписей

1. Положите `.png` в папку `signatures/`.
2. Закоммитьте и запушьте.
3. GitHub Action `Update signatures manifest` сам пересоберёт `signatures/manifest.json` и сделает commit. После следующей публикации Pages новая подпись появится в выпадающем списке.

Локально пересобрать manifest вручную:

```bash
node scripts/build-manifest.mjs
```

## Деплой на GitHub Pages

1. Создайте репозиторий и запушьте этот код в `main`.
2. В **Settings → Pages** выберите источник `Deploy from a branch` → `main` → `/ (root)`.
3. Через минуту приложение будет доступно по адресу `https://<user>.github.io/<repo>/`.

## Стэк

- [pdf.js](https://github.com/mozilla/pdf.js) — рендер страниц в canvas
- [pdf-lib](https://github.com/Hopding/pdf-lib) — вставка PNG-подписей и сохранение PDF
- Чистый ES-модуль, без bundler-а

## Структура

```
index.html                    — точка входа
app.js                        — вся логика
styles.css                    — стили
signatures/                   — PNG-подписи
  manifest.json               — список (генерируется автоматически)
scripts/build-manifest.mjs    — локальная пересборка manifest
.github/workflows/manifest.yml — авто-пересборка при push
```

Старая Flask-версия (`server.py`, `templates/`, `static/`, `requirements.txt`) больше не нужна — можно удалить.
