# Telegram bot + Mini App

## Что реализовано

- При первом `/start` бот предлагает регистрацию.
- При регистрации запрашиваются `ФИО` и `Организация`.
- Все новые пользователи регистрируются с ролью `Пользователь`.
- После успешной регистрации пользователь сохраняется в `users.json`.
- При повторном `/start` бот пишет, что пользователь уже зарегистрирован и показывает роль.
- Для роли `Пользователь` доступна кнопка `Оставить заявку`.
- Для роли `Пользователь` доступна кнопка `Предложения по доработке!`:
  - пользователь отправляет предложение одним сообщением,
  - предложение сохраняется в `suggestions.json`,
  - админы получают уведомление о новом предложении.
- Для ролей `Пользователь` и `Админ` доступна кнопка `Инструкции` с подпунктами:
  - `Настройки`
  - `Виджеты`
  - `Страницы`
  - `Кнопки`
  - `Установка на Windows 11`
- По каждому подпункту бот отправляет HTML-файл инструкции.
- Для ролей `Пользователь` и `Админ` доступна кнопка `Открыть приложение`,
  которая открывает Telegram Mini App по URL из `WEB_APP_URL`.
- Добавлен API для Mini App: регистрация, заявки, предложения, статусы, диалоги, инструкции.
- После отправки текста заявки бот уведомляет всех зарегистрированных админов.
- Для роли `Админ` добавлено меню:
  - `Список заявок` (показывает `NEW` и `IN_PROGRESS`),
  - `Принять в работу` (переводит заявку в `IN_PROGRESS`),
  - `Открыть диалог` (только для своих заявок в `IN_PROGRESS`),
  - `Завершить заявку` (переводит в `COMPLETED` и закрывает диалог),
  - `Предложения по доработке!` (показывает все присланные предложения).
- Перед диалогом админ обязан принять заявку в работу.
- При смене статуса пользователь получает уведомление: заявка принята в работу / заявка завершена.
- Диалог между админом и пользователем работает только пока статус заявки `IN_PROGRESS`.

## Запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать файл `.env` на основе `.env.example` и прописать токен:

```env
BOT_TOKEN=ваш_токен_бота
WEB_APP_URL=https://ваш-miniapp-url.vercel.app
API_BASE_URL=https://ваш-api-url.example.com
API_PORT=3001
API_CORS_ORIGINS=*
MINIAPP_FORWARD_TO_TELEGRAM=false
```

3. Запустить (с автоперезапуском при изменениях кода):

```bash
npm start
```

## Структура

- `index.js` - логика бота
- `apps/web/` - новый фронтенд Telegram Mini App (React + TypeScript + Vite)
- `webapp/index.html` - старая версия Mini App (legacy)
- `deploy/nginx/adaptlink-api.conf.example` - шаблон nginx-конфига для API
- `users.json` - база зарегистрированных пользователей (создается автоматически)
- `requests.json` - список заявок пользователей (создается автоматически)
- `suggestions.json` - список предложений по доработке (создается автоматически)
- `messages.json` - история сообщений в диалогах заявок (создается автоматически)
- `instructions_html/` - тестовые HTML-инструкции для разделов

## Nginx + HTTPS для API (Ubuntu)

Пример для домена `api.example.com` и локального API на порту `3001`.

1. Установить nginx и certbot:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. Скопировать конфиг и включить сайт:

```bash
sudo cp deploy/nginx/adaptlink-api.conf.example /etc/nginx/sites-available/adaptlink-api.conf
sudo nano /etc/nginx/sites-available/adaptlink-api.conf
sudo ln -s /etc/nginx/sites-available/adaptlink-api.conf /etc/nginx/sites-enabled/adaptlink-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

3. Выпустить TLS-сертификат:

```bash
sudo certbot --nginx -d api.example.com
```

4. Проверить `.env` на сервере:

```env
WEB_APP_URL=https://your-miniapp.vercel.app
API_BASE_URL=https://api.example.com
API_PORT=3001
API_CORS_ORIGINS=https://your-miniapp.vercel.app
MINIAPP_FORWARD_TO_TELEGRAM=false
```

5. Перезапустить бота:

```bash
pm2 restart adaptlink-bot
pm2 logs adaptlink-bot --lines 100
```

## Деплой Mini App (Vercel, apps/web)

Переключаем прод-деплой Mini App на React-версию из `apps/web`.

1. Войти в Vercel (один раз):

```bash
vercel login
```

2. Задеплоить прод из папки `apps/web`:

```bash
cd apps/web
vercel --prod
```

3. Скопировать выданный `Production URL` и вставить его в `.env` на сервере:

```env
WEB_APP_URL=https://your-new-miniapp.vercel.app
API_BASE_URL=https://your-api-domain.example.com
API_CORS_ORIGINS=https://your-new-miniapp.vercel.app
MINIAPP_FORWARD_TO_TELEGRAM=false
```

4. Перезапустить бота на сервере:

```bash
pm2 restart adaptlink-bot --update-env
pm2 logs adaptlink-bot --lines 100
```

5. Проверить:
- открыть Mini App только через кнопку `Открыть приложение` в боте;
- в адресе Mini App должен быть параметр `?api=...`;
- регистрация/заявки/чат/админ-пользователи должны работать как раньше.
