const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL =
  process.env.WEB_APP_URL || "https://sharlayvlad.github.io/adaptlink_support/webapp/";
const API_BASE_URL = process.env.API_BASE_URL || "";
const API_PORT = Number(process.env.API_PORT || 3001);
const API_CORS_ORIGINS = process.env.API_CORS_ORIGINS || "*";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN not found. Create .env and set BOT_TOKEN=...");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const usersDbPath = path.join(__dirname, "users.json");
const requestsDbPath = path.join(__dirname, "requests.json");
const suggestionsDbPath = path.join(__dirname, "suggestions.json");
const messagesDbPath = path.join(__dirname, "messages.json");
const instructionsDirPath = path.join(__dirname, "instructions_html");

const USER_REQUEST_BUTTON = "Оставить заявку";
const SUGGESTIONS_BUTTON = "Предложения по доработке!";
const INSTRUCTIONS_BUTTON = "Инструкции";
const OPEN_WEB_APP_BUTTON = "Открыть приложение";
const START_REGISTRATION_BUTTON = "Регистрация";
const ADMIN_LIST_REQUESTS_BUTTON = "Список заявок";
const ADMIN_TAKE_REQUEST_BUTTON = "Принять в работу";
const ADMIN_OPEN_DIALOG_BUTTON = "Открыть диалог";
const ADMIN_FINISH_REQUEST_BUTTON = "Завершить заявку";
const USER_WELCOME_MESSAGE = [
  "Техническая поддержка программного продукта AdaptLink.",
  "Добро пожаловать! Здесь Вы можете оставить заявку специалисту. А так же просмотреть подробные инструкции по настройке программы"
].join("\n");

const registrationSessions = new Map();

function readUsers() {
  if (!fs.existsSync(usersDbPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(usersDbPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Cannot read users.json:", error.message);
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(usersDbPath, JSON.stringify(users, null, 2), "utf-8");
}

function findUser(telegramId) {
  const users = readUsers();
  return users.find((user) => user.telegramId === telegramId);
}

function getAdmins() {
  const users = readUsers();
  return users.filter((user) => user.role === "ADMIN");
}

function registerUser(telegramUser, role, extraData = {}) {
  const users = readUsers();
  const exists = users.find((user) => user.telegramId === telegramUser.id);

  if (exists) {
    return exists;
  }

  const newUser = {
    telegramId: telegramUser.id,
    username: telegramUser.username || null,
    firstName: telegramUser.first_name || null,
    lastName: telegramUser.last_name || null,
    role,
    fullName: extraData.fullName || null,
    organization: extraData.organization || null,
    registeredAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsers(users);

  return newUser;
}

function readRequests() {
  if (!fs.existsSync(requestsDbPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(requestsDbPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Cannot read requests.json:", error.message);
    return [];
  }
}

function writeRequests(requests) {
  fs.writeFileSync(requestsDbPath, JSON.stringify(requests, null, 2), "utf-8");
}

function readSuggestions() {
  if (!fs.existsSync(suggestionsDbPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(suggestionsDbPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Cannot read suggestions.json:", error.message);
    return [];
  }
}

function writeSuggestions(suggestions) {
  fs.writeFileSync(suggestionsDbPath, JSON.stringify(suggestions, null, 2), "utf-8");
}

function readMessages() {
  if (!fs.existsSync(messagesDbPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(messagesDbPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Cannot read messages.json:", error.message);
    return [];
  }
}

function writeMessages(messages) {
  fs.writeFileSync(messagesDbPath, JSON.stringify(messages, null, 2), "utf-8");
}

function createRequestMessage(requestId, senderRole, senderTelegramId, text) {
  const messages = readMessages();
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  const newMessage = {
    id: lastId + 1,
    requestId,
    senderRole,
    senderTelegramId,
    text,
    createdAt: new Date().toISOString()
  };
  messages.push(newMessage);
  writeMessages(messages);
  return newMessage;
}

function getRequestMessages(requestId) {
  return readMessages()
    .filter((message) => message.requestId === requestId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function resolveWebAppUrl() {
  if (!API_BASE_URL) {
    return WEB_APP_URL;
  }

  try {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set("api", API_BASE_URL);
    return url.toString();
  } catch (error) {
    console.error("Cannot compose WEB_APP_URL with API_BASE_URL:", error.message);
    return WEB_APP_URL;
  }
}

function createSuggestion(telegramUser, userProfile, text) {
  const suggestions = readSuggestions();
  const lastId = suggestions.length ? suggestions[suggestions.length - 1].id : 0;
  const suggestion = {
    id: lastId + 1,
    userTelegramId: telegramUser.id,
    username: telegramUser.username || null,
    fullName:
      userProfile?.fullName ||
      [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ").trim() ||
      null,
    organization: userProfile?.organization || null,
    text,
    createdAt: new Date().toISOString()
  };

  suggestions.push(suggestion);
  writeSuggestions(suggestions);
  return suggestion;
}

function createRequest(fromUser, text) {
  const requests = readRequests();
  const lastId = requests.length ? requests[requests.length - 1].id : 0;
  const newRequest = {
    id: lastId + 1,
    userTelegramId: fromUser.id,
    userUsername: fromUser.username || null,
    userFirstName: fromUser.first_name || null,
    userLastName: fromUser.last_name || null,
    text,
    status: "NEW",
    createdAt: new Date().toISOString(),
    inProgressAt: null,
    completedAt: null,
    assignedAdminTelegramId: null
  };

  requests.push(newRequest);
  writeRequests(requests);
  return newRequest;
}

function getPendingRequests() {
  return readRequests().filter((request) => request.status === "NEW");
}

function getInProgressRequests() {
  return readRequests().filter((request) => request.status === "IN_PROGRESS");
}

function findRequestById(requestId) {
  return readRequests().find((request) => request.id === requestId);
}

function updateRequest(requestId, updater) {
  const requests = readRequests();
  const index = requests.findIndex((request) => request.id === requestId);
  if (index === -1) {
    return null;
  }

  requests[index] = updater(requests[index]);
  writeRequests(requests);
  return requests[index];
}

function takeRequestInWork(requestId, adminTelegramId) {
  return updateRequest(requestId, (request) => ({
    ...request,
    status: "IN_PROGRESS",
    inProgressAt: new Date().toISOString(),
    assignedAdminTelegramId: adminTelegramId
  }));
}

function completeRequest(requestId) {
  return updateRequest(requestId, (request) => ({
    ...request,
    status: "COMPLETED",
    completedAt: new Date().toISOString()
  }));
}

function findUserActiveRequest(userTelegramId) {
  const inProgress = readRequests().filter(
    (request) =>
      request.userTelegramId === userTelegramId && request.status === "IN_PROGRESS"
  );

  if (!inProgress.length) {
    return null;
  }

  return inProgress[inProgress.length - 1];
}

function unregisteredKeyboard() {
  return Markup.keyboard([[START_REGISTRATION_BUTTON]]).resize();
}

function userMenuKeyboard() {
  return Markup.keyboard([
    [USER_REQUEST_BUTTON],
    [SUGGESTIONS_BUTTON],
    [OPEN_WEB_APP_BUTTON],
    [INSTRUCTIONS_BUTTON]
  ]).resize();
}

function adminMenuKeyboard() {
  return Markup.keyboard([
    [ADMIN_LIST_REQUESTS_BUTTON],
    [ADMIN_TAKE_REQUEST_BUTTON, ADMIN_OPEN_DIALOG_BUTTON],
    [ADMIN_FINISH_REQUEST_BUTTON],
    [SUGGESTIONS_BUTTON],
    [OPEN_WEB_APP_BUTTON],
    [INSTRUCTIONS_BUTTON]
  ]).resize();
}

function openWebAppKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("Открыть Mini App", resolveWebAppUrl())]
  ]);
}

function instructionsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Настройки", "instructions:settings")],
    [Markup.button.callback("Виджеты", "instructions:widgets")],
    [Markup.button.callback("Страницы", "instructions:pages")],
    [Markup.button.callback("Кнопки", "instructions:buttons")],
    [Markup.button.callback("Установка на Windows 11", "instructions:windows11setup")]
  ]);
}

function instructionFilePath(key) {
  const files = {
    settings: "settings.html",
    widgets: "widgets.html",
    pages: "pages.html",
    buttons: "buttons.html",
    windows11setup: "windows11-setup.html"
  };
  return files[key] ? path.join(instructionsDirPath, files[key]) : null;
}

async function sendInstructionFile(ctx, key, title) {
  const filePath = instructionFilePath(key);
  if (!filePath || !fs.existsSync(filePath)) {
    await ctx.reply("Инструкция пока недоступна.");
    return;
  }

  await ctx.replyWithDocument(
    {
      source: filePath,
      filename: `${title}.html`
    },
    {
      caption:
        `Инструкция: ${title}\n` +
        "Если Telegram покажет предупреждение при открытии HTML, это стандартная защита клиента."
    }
  );
}

function formatSenderName(telegramUser) {
  const fullName = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || telegramUser.username || `ID ${telegramUser.id}`;
}

function getOrCreateSession(telegramId) {
  const existing = registrationSessions.get(telegramId) || {};
  registrationSessions.set(telegramId, existing);
  return existing;
}

function clearSessionStep(telegramId) {
  const session = getOrCreateSession(telegramId);
  delete session.step;
  delete session.requestId;
  registrationSessions.set(telegramId, session);
}

async function notifyAdminsOfRequest(ctx, request) {
  const admins = getAdmins();
  if (!admins.length) {
    return 0;
  }

  const senderName = formatSenderName(ctx.from);
  const senderUsername = ctx.from.username ? `@${ctx.from.username}` : "нет";
  const senderId = ctx.from.id;
  const message = [
    "Новая заявка от пользователя:",
    `Заявка #${request.id}`,
    `Имя: ${senderName}`,
    `Username: ${senderUsername}`,
    `Telegram ID: ${senderId}`,
    "",
    "Текст заявки:",
    request.text
  ].join("\n");

  let deliveredCount = 0;
  for (const admin of admins) {
    try {
      await bot.telegram.sendMessage(admin.telegramId, message);
      deliveredCount += 1;
    } catch (error) {
      console.error(`Cannot notify admin ${admin.telegramId}:`, error.message);
    }
  }

  return deliveredCount;
}

async function notifyAdminsOfSuggestion(suggestion) {
  const admins = getAdmins();
  if (!admins.length) {
    return 0;
  }

  const message = [
    "Новое предложение по доработке:",
    `#${suggestion.id}`,
    `Имя: ${suggestion.fullName || "не указано"}`,
    `Организация: ${suggestion.organization || "не указана"}`,
    `Username: ${suggestion.username ? `@${suggestion.username}` : "нет"}`,
    `Telegram ID: ${suggestion.userTelegramId}`,
    "",
    "Текст предложения:",
    suggestion.text
  ].join("\n");

  let deliveredCount = 0;
  for (const admin of admins) {
    try {
      await bot.telegram.sendMessage(admin.telegramId, message);
      deliveredCount += 1;
    } catch (error) {
      console.error(`Cannot notify admin ${admin.telegramId}:`, error.message);
    }
  }

  return deliveredCount;
}

function toTelegramFromUser(user) {
  return {
    id: user.telegramId,
    username: user.username || undefined,
    first_name: user.firstName || undefined,
    last_name: user.lastName || undefined
  };
}

async function notifyAdminsOfRequestFromUser(user, request) {
  const admins = getAdmins();
  if (!admins.length) {
    return 0;
  }

  const senderName =
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    `ID ${user.telegramId}`;
  const senderUsername = user.username ? `@${user.username}` : "нет";
  const message = [
    "Новая заявка от пользователя:",
    `Заявка #${request.id}`,
    `Имя: ${senderName}`,
    `Username: ${senderUsername}`,
    `Telegram ID: ${user.telegramId}`,
    "",
    "Текст заявки:",
    request.text
  ].join("\n");

  let deliveredCount = 0;
  for (const admin of admins) {
    try {
      await bot.telegram.sendMessage(admin.telegramId, message);
      deliveredCount += 1;
    } catch (error) {
      console.error(`Cannot notify admin ${admin.telegramId}:`, error.message);
    }
  }
  return deliveredCount;
}

function parseTelegramId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

bot.start(async (ctx) => {
  const user = findUser(ctx.from.id);
  if (user) {
    await ctx.reply(
      `Вы уже зарегистрированы.\nРоль: ${user.role === "ADMIN" ? "Админ" : "Пользователь"}`
    );

    if (user.role === "USER") {
      await ctx.reply("Меню пользователя:", userMenuKeyboard());
    } else if (user.role === "ADMIN") {
      await ctx.reply("Меню администратора:", adminMenuKeyboard());
    }
    return;
  }

  registrationSessions.delete(ctx.from.id);
  await ctx.reply(
    "Добро пожаловать! Для начала нажмите кнопку Регистрация.",
    unregisteredKeyboard()
  );
});

bot.action("instructions:settings", async (ctx) => {
  await ctx.answerCbQuery();
  await sendInstructionFile(ctx, "settings", "Настройки");
});

bot.action("instructions:widgets", async (ctx) => {
  await ctx.answerCbQuery();
  await sendInstructionFile(ctx, "widgets", "Виджеты");
});

bot.action("instructions:pages", async (ctx) => {
  await ctx.answerCbQuery();
  await sendInstructionFile(ctx, "pages", "Страницы");
});

bot.action("instructions:buttons", async (ctx) => {
  await ctx.answerCbQuery();
  await sendInstructionFile(ctx, "buttons", "Кнопки");
});

bot.action("instructions:windows11setup", async (ctx) => {
  await ctx.answerCbQuery();
  await sendInstructionFile(ctx, "windows11setup", "Установка на Windows 11");
});

bot.on("text", async (ctx) => {
  const existing = findUser(ctx.from.id);

  if (existing) {
    if (existing.role === "USER") {
      const text = ctx.message.text.trim();
      const session = getOrCreateSession(ctx.from.id);

      if (text === SUGGESTIONS_BUTTON) {
        session.step = "WAITING_SUGGESTION_TEXT";
        registrationSessions.set(ctx.from.id, session);
        await ctx.reply("Напишите ваше предложение по доработке одним сообщением:");
        return;
      }

      if (text === INSTRUCTIONS_BUTTON) {
        await ctx.reply("Выберите раздел инструкций:", instructionsKeyboard());
        return;
      }

      if (text === OPEN_WEB_APP_BUTTON) {
        await ctx.reply("Откройте Mini App:", openWebAppKeyboard());
        return;
      }

      if (text === USER_REQUEST_BUTTON) {
        session.step = "WAITING_REQUEST_TEXT";
        registrationSessions.set(ctx.from.id, session);
        await ctx.reply("Введите текст заявки одним сообщением:");
        return;
      }

      if (session.step === "WAITING_REQUEST_TEXT") {
        if (!text) {
          await ctx.reply("Текст заявки пустой. Введите заявку еще раз.");
          return;
        }

        const request = createRequest(ctx.from, text);
        const deliveredCount = await notifyAdminsOfRequest(ctx, request);
        clearSessionStep(ctx.from.id);

        if (deliveredCount > 0) {
          await ctx.reply(
            `Заявка #${request.id} отправлена администратору. Ожидайте обратной связи.`,
            userMenuKeyboard()
          );
        } else {
          await ctx.reply(
            `Заявка #${request.id} сохранена, но администраторы пока не зарегистрированы в боте.`,
            userMenuKeyboard()
          );
        }
        return;
      }

      if (session.step === "WAITING_SUGGESTION_TEXT") {
        if (!text) {
          await ctx.reply("Текст предложения пустой. Введите предложение еще раз.");
          return;
        }

        const suggestion = createSuggestion(ctx.from, existing, text);
        const deliveredCount = await notifyAdminsOfSuggestion(suggestion);
        clearSessionStep(ctx.from.id);

        if (deliveredCount > 0) {
          await ctx.reply(
            "Спасибо! Ваше предложение отправлено администраторам.",
            userMenuKeyboard()
          );
        } else {
          await ctx.reply(
            "Спасибо! Предложение сохранено, но администраторы пока не зарегистрированы в боте.",
            userMenuKeyboard()
          );
        }
        return;
      }

      const activeRequest = findUserActiveRequest(ctx.from.id);
      if (activeRequest && activeRequest.assignedAdminTelegramId) {
        try {
          await bot.telegram.sendMessage(
            activeRequest.assignedAdminTelegramId,
            [
              `Сообщение от пользователя по заявке #${activeRequest.id}:`,
              "",
              text
            ].join("\n")
          );
        } catch (error) {
          console.error(
            `Cannot send user message to admin ${activeRequest.assignedAdminTelegramId}:`,
            error.message
          );
          await ctx.reply(
            "Не удалось отправить сообщение администратору. Попробуйте позже.",
            userMenuKeyboard()
          );
        }
        return;
      }
    }

    if (existing.role === "ADMIN") {
      const text = ctx.message.text.trim();
      const session = getOrCreateSession(ctx.from.id);

      if (text === SUGGESTIONS_BUTTON) {
        const suggestions = readSuggestions();
        if (!suggestions.length) {
          await ctx.reply("Пока нет предложений по доработке.", adminMenuKeyboard());
          return;
        }

        const list = suggestions
          .slice(-30)
          .reverse()
          .map((item) =>
            [
              `#${item.id} | ${item.fullName || "не указано"}`,
              `Организация: ${item.organization || "не указана"}`,
              `Username: ${item.username ? `@${item.username}` : "нет"}`,
              `Telegram ID: ${item.userTelegramId}`,
              `Текст: ${item.text}`
            ].join("\n")
          )
          .join("\n\n");

        await ctx.reply(`Предложения по доработке:\n\n${list}`, adminMenuKeyboard());
        return;
      }

      if (text === INSTRUCTIONS_BUTTON) {
        await ctx.reply("Выберите раздел инструкций:", instructionsKeyboard());
        return;
      }

      if (text === OPEN_WEB_APP_BUTTON) {
        await ctx.reply("Откройте Mini App:", openWebAppKeyboard());
        return;
      }

      if (text === ADMIN_LIST_REQUESTS_BUTTON) {
        const pendingRequests = getPendingRequests();
        const inProgressRequests = getInProgressRequests();

        if (!pendingRequests.length && !inProgressRequests.length) {
          await ctx.reply("Сейчас нет заявок.", adminMenuKeyboard());
          return;
        }

        const formatItem = (request) => {
          const senderName = [request.userFirstName, request.userLastName]
            .filter(Boolean)
            .join(" ")
            .trim() || request.userUsername || `ID ${request.userTelegramId}`;
          const assigned = request.assignedAdminTelegramId
            ? `\nАдмин: ${request.assignedAdminTelegramId}`
            : "";
          return [
            `#${request.id} | ${senderName}`,
            `Статус: ${request.status}`,
            `Текст: ${request.text}${assigned}`
          ].join("\n");
        };

        const pendingBlock = pendingRequests.length
          ? `Новые:\n${pendingRequests.slice(-20).reverse().map(formatItem).join("\n\n")}`
          : "Новые:\nНет";

        const inProgressBlock = inProgressRequests.length
          ? `В работе:\n${inProgressRequests
              .slice(-20)
              .reverse()
              .map(formatItem)
              .join("\n\n")}`
          : "В работе:\nНет";

        await ctx.reply(`${pendingBlock}\n\n${inProgressBlock}`, adminMenuKeyboard());
        return;
      }

      if (text === ADMIN_TAKE_REQUEST_BUTTON) {
        session.step = "WAITING_TAKE_REQUEST_ID";
        delete session.requestId;
        registrationSessions.set(ctx.from.id, session);
        await ctx.reply(
          "Введите номер новой заявки, которую хотите принять в работу (например: 12).",
          adminMenuKeyboard()
        );
        return;
      }

      if (text === ADMIN_OPEN_DIALOG_BUTTON) {
        session.step = "WAITING_OPEN_DIALOG_REQUEST_ID";
        delete session.requestId;
        registrationSessions.set(ctx.from.id, session);
        await ctx.reply(
          "Введите номер заявки в статусе IN_PROGRESS, чтобы открыть диалог.",
          adminMenuKeyboard()
        );
        return;
      }

      if (text === ADMIN_FINISH_REQUEST_BUTTON) {
        session.step = "WAITING_FINISH_REQUEST_ID";
        delete session.requestId;
        registrationSessions.set(ctx.from.id, session);
        await ctx.reply(
          "Введите номер заявки, которую нужно завершить.",
          adminMenuKeyboard()
        );
        return;
      }

      if (session.step === "WAITING_TAKE_REQUEST_ID") {
        const requestId = Number(text);

        if (!Number.isInteger(requestId) || requestId <= 0) {
          await ctx.reply(
            "Номер заявки должен быть положительным числом. Попробуйте еще раз.",
            adminMenuKeyboard()
          );
          return;
        }

        const request = findRequestById(requestId);
        if (!request) {
          await ctx.reply("Заявка с таким номером не найдена.", adminMenuKeyboard());
          return;
        }

        if (request.status !== "NEW") {
          await ctx.reply(
            "Эту заявку уже нельзя принять в работу. Выберите NEW-заявку.",
            adminMenuKeyboard()
          );
          return;
        }

        const updatedRequest = takeRequestInWork(requestId, ctx.from.id);
        session.activeDialogRequestId = updatedRequest.id;
        clearSessionStep(ctx.from.id);

        try {
          await bot.telegram.sendMessage(
            updatedRequest.userTelegramId,
            `Ваша заявка #${updatedRequest.id} принята в работу администратором.`
          );
        } catch (error) {
          console.error(
            `Cannot notify user ${updatedRequest.userTelegramId} about IN_PROGRESS:`,
            error.message
          );
        }

        await ctx.reply(
          `Заявка #${updatedRequest.id} переведена в статус IN_PROGRESS. Диалог открыт.`,
          adminMenuKeyboard()
        );
        return;
      }

      if (session.step === "WAITING_OPEN_DIALOG_REQUEST_ID") {
        const requestId = Number(text);
        if (!Number.isInteger(requestId) || requestId <= 0) {
          await ctx.reply("Введите корректный номер заявки.", adminMenuKeyboard());
          return;
        }

        const request = findRequestById(requestId);
        if (!request) {
          await ctx.reply("Заявка с таким номером не найдена.", adminMenuKeyboard());
          return;
        }

        if (request.status !== "IN_PROGRESS") {
          await ctx.reply(
            "Диалог можно открыть только для заявок со статусом IN_PROGRESS.",
            adminMenuKeyboard()
          );
          return;
        }

        if (request.assignedAdminTelegramId !== ctx.from.id) {
          await ctx.reply(
            "Эта заявка закреплена за другим администратором.",
            adminMenuKeyboard()
          );
          return;
        }

        session.activeDialogRequestId = request.id;
        clearSessionStep(ctx.from.id);
        await ctx.reply(`Диалог по заявке #${request.id} открыт.`, adminMenuKeyboard());
        return;
      }

      if (session.step === "WAITING_FINISH_REQUEST_ID") {
        const requestId = Number(text);
        if (!Number.isInteger(requestId) || requestId <= 0) {
          await ctx.reply("Введите корректный номер заявки.", adminMenuKeyboard());
          return;
        }

        const request = findRequestById(requestId);
        if (!request) {
          await ctx.reply("Заявка с таким номером не найдена.", adminMenuKeyboard());
          return;
        }

        if (request.status !== "IN_PROGRESS") {
          await ctx.reply(
            "Завершить можно только заявку в статусе IN_PROGRESS.",
            adminMenuKeyboard()
          );
          return;
        }

        if (request.assignedAdminTelegramId !== ctx.from.id) {
          await ctx.reply(
            "Вы не можете завершить заявку, которая назначена другому администратору.",
            adminMenuKeyboard()
          );
          return;
        }

        const updatedRequest = completeRequest(request.id);
        clearSessionStep(ctx.from.id);

        if (session.activeDialogRequestId === updatedRequest.id) {
          delete session.activeDialogRequestId;
          registrationSessions.set(ctx.from.id, session);
        }

        try {
          await bot.telegram.sendMessage(
            updatedRequest.userTelegramId,
            "Администратор завершил работу. Спасибо за обращение!"
          );
        } catch (error) {
          console.error(
            `Cannot notify user ${updatedRequest.userTelegramId} about COMPLETED:`,
            error.message
          );
        }

        await ctx.reply(`Заявка #${updatedRequest.id} завершена.`, adminMenuKeyboard());
        return;
      }

      if (session.activeDialogRequestId) {
        const request = findRequestById(session.activeDialogRequestId);
        if (!request || request.status !== "IN_PROGRESS") {
          delete session.activeDialogRequestId;
          registrationSessions.set(ctx.from.id, session);
          await ctx.reply(
            "Активный диалог закрыт. Откройте диалог снова через меню.",
            adminMenuKeyboard()
          );
          return;
        }

        if (request.assignedAdminTelegramId !== ctx.from.id) {
          await ctx.reply("Эта заявка больше не закреплена за вами.", adminMenuKeyboard());
          return;
        }

        try {
          await bot.telegram.sendMessage(
            request.userTelegramId,
            [`Сообщение администратора по заявке #${request.id}:`, "", text].join("\n")
          );
        } catch (error) {
          console.error(
            `Cannot deliver admin message to user ${request.userTelegramId}:`,
            error.message
          );
          await ctx.reply(
            "Не удалось отправить сообщение пользователю.",
            adminMenuKeyboard()
          );
        }
        return;
      }
    }

    return;
  }

  const session = registrationSessions.get(ctx.from.id);
  const text = ctx.message.text.trim();

  if ((!session || !session.step) && text === START_REGISTRATION_BUTTON) {
    registrationSessions.set(ctx.from.id, { step: "WAITING_USER_FULL_NAME" });
    await ctx.reply("Введите ваше ФИО:");
    return;
  }

  if (!session || !session.step) {
    await ctx.reply(
      "Для начала регистрации нажмите кнопку Регистрация.",
      unregisteredKeyboard()
    );
    return;
  }

  if (session.step === "WAITING_USER_FULL_NAME") {
    if (!text) {
      await ctx.reply("ФИО не может быть пустым. Введите ФИО:");
      return;
    }

    registrationSessions.set(ctx.from.id, {
      ...session,
      step: "WAITING_USER_ORGANIZATION",
      pendingRegistration: {
        fullName: text
      }
    });
    await ctx.reply("Введите вашу организацию:");
    return;
  }

  if (session.step === "WAITING_USER_ORGANIZATION") {
    if (!text) {
      await ctx.reply("Организация не может быть пустой. Введите организацию:");
      return;
    }

    const fullName = session.pendingRegistration?.fullName || null;
    registerUser(ctx.from, "USER", {
      fullName,
      organization: text
    });
    registrationSessions.delete(ctx.from.id);
    await ctx.reply("Регистрация завершена. Ваша роль: Пользователь.");
    await ctx.reply(USER_WELCOME_MESSAGE);
    await ctx.reply("Меню пользователя:", userMenuKeyboard());
    return;
  }

  await ctx.reply("Для начала регистрации используйте команду /start.");
});

const api = express();
const corsOptions =
  API_CORS_ORIGINS === "*"
    ? { origin: true, credentials: false }
    : {
        origin: API_CORS_ORIGINS.split(",").map((origin) => origin.trim()),
        credentials: false
      };

api.use(cors(corsOptions));
api.use(express.json({ limit: "1mb" }));

function getUserFromRequest(req) {
  const idFromHeader = parseTelegramId(req.headers["x-telegram-id"]);
  const idFromQuery = parseTelegramId(req.query.telegramId);
  const idFromBody = parseTelegramId(req.body?.telegramId);
  const telegramId = idFromHeader || idFromQuery || idFromBody;
  if (!telegramId) {
    return null;
  }
  return findUser(telegramId) || null;
}

function mapRequestForClient(request) {
  return {
    ...request,
    canOpenDialog: request.status === "IN_PROGRESS"
  };
}

api.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

api.get("/api/bootstrap", (req, res) => {
  const user = getUserFromRequest(req);
  const telegramId = parseTelegramId(req.query.telegramId);
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId is required" });
  }

  const requests = readRequests();
  const suggestions = readSuggestions();
  const instructionKeys = [
    { key: "settings", title: "Настройки" },
    { key: "widgets", title: "Виджеты" },
    { key: "pages", title: "Страницы" },
    { key: "buttons", title: "Кнопки" },
    { key: "windows11setup", title: "Установка на Windows 11" }
  ];

  const payload = {
    registered: Boolean(user),
    user: user || null,
    role: user?.role || null,
    instructions: instructionKeys
      .filter((item) => fs.existsSync(instructionFilePath(item.key)))
      .map((item) => ({
        ...item,
        url: `/api/instructions/${item.key}`
      }))
  };

  if (!user) {
    return res.json(payload);
  }

  if (user.role === "ADMIN") {
    payload.requests = {
      new: requests.filter((item) => item.status === "NEW").map(mapRequestForClient),
      inProgress: requests
        .filter((item) => item.status === "IN_PROGRESS")
        .map(mapRequestForClient),
      completed: requests
        .filter((item) => item.status === "COMPLETED")
        .map(mapRequestForClient)
    };
    payload.suggestions = suggestions.slice(-100).reverse();
  } else {
    payload.requests = requests
      .filter((item) => item.userTelegramId === user.telegramId)
      .map(mapRequestForClient)
      .sort((a, b) => b.id - a.id);
    payload.stats = {
      open: payload.requests.filter((item) => item.status === "NEW").length,
      inProgress: payload.requests.filter((item) => item.status === "IN_PROGRESS").length
    };
  }

  return res.json(payload);
});

api.post("/api/register", (req, res) => {
  const telegramId = parseTelegramId(req.body?.telegramId);
  const fullName = String(req.body?.fullName || "").trim();
  const organization = String(req.body?.organization || "").trim();
  const username = String(req.body?.username || "").trim() || null;
  const firstName = String(req.body?.firstName || "").trim() || null;
  const lastName = String(req.body?.lastName || "").trim() || null;

  if (!telegramId || !fullName || !organization) {
    return res.status(400).json({ error: "telegramId, fullName and organization are required" });
  }

  const existing = findUser(telegramId);
  if (existing) {
    return res.json({ user: existing, alreadyExists: true });
  }

  const user = registerUser(
    {
      id: telegramId,
      username: username || undefined,
      first_name: firstName || undefined,
      last_name: lastName || undefined
    },
    "USER",
    { fullName, organization }
  );

  return res.status(201).json({ user });
});

api.post("/api/requests", async (req, res) => {
  const user = getUserFromRequest(req);
  const text = String(req.body?.text || "").trim();
  if (!user) {
    return res.status(401).json({ error: "User is not registered" });
  }
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const request = createRequest(toTelegramFromUser(user), text);
  const deliveredCount = await notifyAdminsOfRequestFromUser(user, request);

  return res.status(201).json({
    request,
    adminNotified: deliveredCount > 0
  });
});

api.get("/api/requests/:id/messages", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "User is not registered" });
  }

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: "Invalid request id" });
  }

  const request = findRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  if (user.role === "USER" && request.userTelegramId !== user.telegramId) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (user.role === "ADMIN") {
    const isAssignee = request.assignedAdminTelegramId === user.telegramId;
    const canReadShared = request.status === "NEW";
    if (!isAssignee && !canReadShared) {
      return res.status(403).json({ error: "Access denied" });
    }
  }

  return res.json({ request, messages: getRequestMessages(requestId) });
});

api.post("/api/requests/:id/messages", async (req, res) => {
  const user = getUserFromRequest(req);
  const text = String(req.body?.text || "").trim();
  if (!user) {
    return res.status(401).json({ error: "User is not registered" });
  }
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: "Invalid request id" });
  }

  const request = findRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (request.status !== "IN_PROGRESS") {
    return res.status(409).json({ error: "Dialog is available only for IN_PROGRESS requests" });
  }

  if (user.role === "USER") {
    if (request.userTelegramId !== user.telegramId || !request.assignedAdminTelegramId) {
      return res.status(403).json({ error: "Access denied" });
    }
    try {
      await bot.telegram.sendMessage(
        request.assignedAdminTelegramId,
        [`Сообщение от пользователя по заявке #${request.id}:`, "", text].join("\n")
      );
    } catch (error) {
      return res.status(502).json({ error: "Cannot deliver message to admin now" });
    }
  } else if (user.role === "ADMIN") {
    if (request.assignedAdminTelegramId !== user.telegramId) {
      return res.status(403).json({ error: "Request is assigned to another admin" });
    }
    try {
      await bot.telegram.sendMessage(
        request.userTelegramId,
        [`Сообщение администратора по заявке #${request.id}:`, "", text].join("\n")
      );
    } catch (error) {
      return res.status(502).json({ error: "Cannot deliver message to user now" });
    }
  } else {
    return res.status(403).json({ error: "Unsupported role" });
  }

  const message = createRequestMessage(request.id, user.role, user.telegramId, text);
  return res.status(201).json({ message });
});

api.post("/api/requests/:id/take", async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admin can take request" });
  }
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: "Invalid request id" });
  }

  const request = findRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (request.status !== "NEW") {
    return res.status(409).json({ error: "Only NEW request can be taken" });
  }

  const updatedRequest = takeRequestInWork(requestId, user.telegramId);
  try {
    await bot.telegram.sendMessage(
      updatedRequest.userTelegramId,
      `Ваша заявка #${updatedRequest.id} принята в работу администратором.`
    );
  } catch (error) {
    console.error(
      `Cannot notify user ${updatedRequest.userTelegramId} about IN_PROGRESS:`,
      error.message
    );
  }

  return res.json({ request: updatedRequest });
});

api.post("/api/requests/:id/finish", async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admin can finish request" });
  }
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: "Invalid request id" });
  }

  const request = findRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (request.status !== "IN_PROGRESS") {
    return res.status(409).json({ error: "Only IN_PROGRESS request can be completed" });
  }
  if (request.assignedAdminTelegramId !== user.telegramId) {
    return res.status(403).json({ error: "Request is assigned to another admin" });
  }

  const updatedRequest = completeRequest(requestId);
  try {
    await bot.telegram.sendMessage(
      updatedRequest.userTelegramId,
      "Администратор завершил работу. Спасибо за обращение!"
    );
  } catch (error) {
    console.error(
      `Cannot notify user ${updatedRequest.userTelegramId} about COMPLETED:`,
      error.message
    );
  }

  return res.json({ request: updatedRequest });
});

api.post("/api/suggestions", async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "User is not registered" });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const suggestion = createSuggestion(toTelegramFromUser(user), user, text);
  const deliveredCount = await notifyAdminsOfSuggestion(suggestion);
  return res.status(201).json({ suggestion, adminNotified: deliveredCount > 0 });
});

api.get("/api/suggestions", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admin can read suggestions" });
  }
  return res.json({ suggestions: readSuggestions().slice(-200).reverse() });
});

api.get("/api/instructions/:key", (req, res) => {
  const filePath = instructionFilePath(req.params.key);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("Instruction not found");
  }
  return res.sendFile(filePath);
});

const apiServer = api.listen(API_PORT, () => {
  console.log(`Mini App API started on port ${API_PORT}`);
});

bot.launch().then(() => {
  console.log("Bot started");
});

function shutdown(signal) {
  bot.stop(signal);
  apiServer.close(() => process.exit(0));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
