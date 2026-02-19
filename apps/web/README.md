# AdaptLink Mini App (React)

Фронтенд Telegram Mini App на `React + TypeScript + Vite`.

## Локальный запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run lint
npm run build
```

## Подключение API

Mini App берет API так:

1. сначала из query-параметра `?api=...` (передается ботом автоматически),
2. если параметра нет - из `VITE_API_BASE`.

Для локальной разработки можно создать `.env` в этой папке:

```env
VITE_API_BASE=https://your-api-domain.example.com
```

## Деплой на Vercel

Запускать из `apps/web`:

```bash
vercel --prod
```

После деплоя используй выданный `Production URL` как `WEB_APP_URL` в `.env` бота.
