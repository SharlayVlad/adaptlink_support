const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE_NAME = "adaptlink.db";
const PRIORITY_MAP = {
  HIGH: 4,
  MEDIUM: 12,
  LOW: 24
};

let db = null;

function parseJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parsePriority(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "HIGH" || normalized === "LOW" || normalized === "MEDIUM") {
    return normalized;
  }
  if (normalized === "ВЫСОКИЙ") return "HIGH";
  if (normalized === "НИЗКИЙ") return "LOW";
  return "MEDIUM";
}

function inferPriorityFromText(text) {
  const match = String(text || "").match(/Приоритет:\s*([^\n\r]+)/i);
  if (!match) return "MEDIUM";
  return parsePriority(match[1]);
}

function computeSlaDueAt(createdAtIso, priority, customHours) {
  const created = new Date(createdAtIso || Date.now());
  const hours = Number.isFinite(Number(customHours))
    ? Number(customHours)
    : PRIORITY_MAP[priority] || PRIORITY_MAP.MEDIUM;
  return new Date(created.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function rowToUser(row) {
  return {
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    fullName: row.full_name,
    organization: row.organization,
    registeredAt: row.registered_at
  };
}

function rowToRequest(row) {
  return {
    id: row.id,
    userTelegramId: row.user_telegram_id,
    userUsername: row.user_username,
    userFirstName: row.user_first_name,
    userLastName: row.user_last_name,
    text: row.text,
    status: row.status,
    priority: row.priority,
    slaDueAt: row.sla_due_at,
    createdAt: row.created_at,
    inProgressAt: row.in_progress_at,
    completedAt: row.completed_at,
    assignedAdminTelegramId: row.assigned_admin_telegram_id
  };
}

function rowToSuggestion(row) {
  return {
    id: row.id,
    userTelegramId: row.user_telegram_id,
    username: row.username,
    fullName: row.full_name,
    organization: row.organization,
    text: row.text,
    createdAt: row.created_at
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    senderRole: row.sender_role,
    senderTelegramId: row.sender_telegram_id,
    text: row.text,
    attachmentPath: row.attachment_path,
    attachmentName: row.attachment_name,
    attachmentMime: row.attachment_mime,
    createdAt: row.created_at
  };
}

function ensureDb() {
  if (!db) {
    throw new Error("Database is not initialized. Call initDatabase() first.");
  }
}

function initDatabase(baseDir) {
  const dbPath = path.join(baseDir, DB_FILE_NAME);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL,
      full_name TEXT,
      organization TEXT,
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_telegram_id INTEGER NOT NULL,
      user_username TEXT,
      user_first_name TEXT,
      user_last_name TEXT,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      sla_due_at TEXT,
      created_at TEXT NOT NULL,
      in_progress_at TEXT,
      completed_at TEXT,
      assigned_admin_telegram_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_telegram_id INTEGER NOT NULL,
      username TEXT,
      full_name TEXT,
      organization TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_telegram_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      attachment_path TEXT,
      attachment_name TEXT,
      attachment_mime TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_notification_settings (
      telegram_id INTEGER PRIMARY KEY,
      admin_new_request INTEGER NOT NULL DEFAULT 1,
      admin_suggestion INTEGER NOT NULL DEFAULT 1,
      user_request_taken INTEGER NOT NULL DEFAULT 1,
      user_request_completed INTEGER NOT NULL DEFAULT 1,
      user_chat_message INTEGER NOT NULL DEFAULT 1,
      admin_chat_message INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  migrateFromJson(baseDir);
}

function migrateFromJson(baseDir) {
  ensureDb();

  const usersCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  const requestsCount = db.prepare("SELECT COUNT(*) as count FROM requests").get().count;
  const suggestionsCount = db.prepare("SELECT COUNT(*) as count FROM suggestions").get().count;
  const messagesCount = db.prepare("SELECT COUNT(*) as count FROM messages").get().count;

  const usersJsonPath = path.join(baseDir, "users.json");
  const requestsJsonPath = path.join(baseDir, "requests.json");
  const suggestionsJsonPath = path.join(baseDir, "suggestions.json");
  const messagesJsonPath = path.join(baseDir, "messages.json");

  const importUsers = db.prepare(`
    INSERT OR REPLACE INTO users (
      telegram_id, username, first_name, last_name, role, full_name, organization, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const importRequest = db.prepare(`
    INSERT OR REPLACE INTO requests (
      id, user_telegram_id, user_username, user_first_name, user_last_name, text, status,
      priority, sla_due_at, created_at, in_progress_at, completed_at, assigned_admin_telegram_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const importSuggestion = db.prepare(`
    INSERT OR REPLACE INTO suggestions (
      id, user_telegram_id, username, full_name, organization, text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const importMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (
      id, request_id, sender_role, sender_telegram_id, text, attachment_path, attachment_name, attachment_mime, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (!usersCount) {
    const users = parseJsonArray(usersJsonPath);
    const tx = db.transaction((items) => {
      for (const item of items) {
        importUsers.run(
          item.telegramId,
          item.username || null,
          item.firstName || null,
          item.lastName || null,
          item.role || "USER",
          item.fullName || null,
          item.organization || null,
          item.registeredAt || new Date().toISOString()
        );
      }
    });
    tx(users);
  }

  if (!requestsCount) {
    const requests = parseJsonArray(requestsJsonPath);
    const tx = db.transaction((items) => {
      for (const item of items) {
        const priority = parsePriority(item.priority || inferPriorityFromText(item.text));
        const createdAt = item.createdAt || new Date().toISOString();
        importRequest.run(
          item.id,
          item.userTelegramId,
          item.userUsername || null,
          item.userFirstName || null,
          item.userLastName || null,
          item.text || "",
          item.status || "NEW",
          priority,
          item.slaDueAt || computeSlaDueAt(createdAt, priority),
          createdAt,
          item.inProgressAt || null,
          item.completedAt || null,
          item.assignedAdminTelegramId || null
        );
      }
    });
    tx(requests);
  }

  if (!suggestionsCount) {
    const suggestions = parseJsonArray(suggestionsJsonPath);
    const tx = db.transaction((items) => {
      for (const item of items) {
        importSuggestion.run(
          item.id,
          item.userTelegramId,
          item.username || null,
          item.fullName || null,
          item.organization || null,
          item.text || "",
          item.createdAt || new Date().toISOString()
        );
      }
    });
    tx(suggestions);
  }

  if (!messagesCount) {
    const messages = parseJsonArray(messagesJsonPath);
    const tx = db.transaction((items) => {
      for (const item of items) {
        importMessage.run(
          item.id,
          item.requestId,
          item.senderRole,
          item.senderTelegramId,
          item.text || "",
          item.attachmentPath || null,
          item.attachmentName || null,
          item.attachmentMime || null,
          item.createdAt || new Date().toISOString()
        );
      }
    });
    tx(messages);
  }
}

function readUsers() {
  ensureDb();
  return db.prepare("SELECT * FROM users ORDER BY registered_at ASC").all().map(rowToUser);
}

function writeUsers(users) {
  ensureDb();
  const insert = db.prepare(`
    INSERT INTO users (
      telegram_id, username, first_name, last_name, role, full_name, organization, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items) => {
    db.prepare("DELETE FROM users").run();
    for (const item of items) {
      insert.run(
        item.telegramId,
        item.username || null,
        item.firstName || null,
        item.lastName || null,
        item.role,
        item.fullName || null,
        item.organization || null,
        item.registeredAt || new Date().toISOString()
      );
    }
  });
  tx(users);
}

function findUser(telegramId) {
  ensureDb();
  const row = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  return row ? rowToUser(row) : null;
}

function getAdmins() {
  ensureDb();
  return db
    .prepare("SELECT * FROM users WHERE role = 'ADMIN' ORDER BY registered_at ASC")
    .all()
    .map(rowToUser);
}

function registerUser(telegramUser, role, extraData = {}) {
  ensureDb();
  const existing = findUser(telegramUser.id);
  if (existing) return existing;

  const registeredAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (
      telegram_id, username, first_name, last_name, role, full_name, organization, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    telegramUser.id,
    telegramUser.username || null,
    telegramUser.first_name || null,
    telegramUser.last_name || null,
    role,
    extraData.fullName || null,
    extraData.organization || null,
    registeredAt
  );
  return findUser(telegramUser.id);
}

function readRequests() {
  ensureDb();
  return db.prepare("SELECT * FROM requests ORDER BY id ASC").all().map(rowToRequest);
}

function writeRequests(requests) {
  ensureDb();
  const insert = db.prepare(`
    INSERT INTO requests (
      id, user_telegram_id, user_username, user_first_name, user_last_name, text, status, priority,
      sla_due_at, created_at, in_progress_at, completed_at, assigned_admin_telegram_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items) => {
    db.prepare("DELETE FROM requests").run();
    for (const item of items) {
      const priority = parsePriority(item.priority || inferPriorityFromText(item.text));
      const createdAt = item.createdAt || new Date().toISOString();
      insert.run(
        item.id,
        item.userTelegramId,
        item.userUsername || null,
        item.userFirstName || null,
        item.userLastName || null,
        item.text || "",
        item.status,
        priority,
        item.slaDueAt || computeSlaDueAt(createdAt, priority),
        createdAt,
        item.inProgressAt || null,
        item.completedAt || null,
        item.assignedAdminTelegramId || null
      );
    }
  });
  tx(requests);
}

function createRequest(fromUser, text, meta = {}) {
  ensureDb();
  const createdAt = new Date().toISOString();
  const priority = parsePriority(meta.priority || inferPriorityFromText(text));
  const slaDueAt = computeSlaDueAt(createdAt, priority, meta.slaHours);
  const info = db.prepare(`
    INSERT INTO requests (
      user_telegram_id, user_username, user_first_name, user_last_name, text, status, priority,
      sla_due_at, created_at, in_progress_at, completed_at, assigned_admin_telegram_id
    ) VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?, NULL, NULL, NULL)
  `).run(
    fromUser.id,
    fromUser.username || null,
    fromUser.first_name || null,
    fromUser.last_name || null,
    text,
    priority,
    slaDueAt,
    createdAt
  );
  const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(info.lastInsertRowid);
  return rowToRequest(row);
}

function findRequestById(requestId) {
  ensureDb();
  const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId);
  return row ? rowToRequest(row) : null;
}

function readSuggestions() {
  ensureDb();
  return db.prepare("SELECT * FROM suggestions ORDER BY id ASC").all().map(rowToSuggestion);
}

function writeSuggestions(suggestions) {
  ensureDb();
  const insert = db.prepare(`
    INSERT INTO suggestions (
      id, user_telegram_id, username, full_name, organization, text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items) => {
    db.prepare("DELETE FROM suggestions").run();
    for (const item of items) {
      insert.run(
        item.id,
        item.userTelegramId,
        item.username || null,
        item.fullName || null,
        item.organization || null,
        item.text || "",
        item.createdAt || new Date().toISOString()
      );
    }
  });
  tx(suggestions);
}

function createSuggestion(telegramUser, userProfile, text) {
  ensureDb();
  const createdAt = new Date().toISOString();
  const fullName =
    userProfile?.fullName ||
    [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ").trim() ||
    null;
  const info = db.prepare(`
    INSERT INTO suggestions (
      user_telegram_id, username, full_name, organization, text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    telegramUser.id,
    telegramUser.username || null,
    fullName,
    userProfile?.organization || null,
    text,
    createdAt
  );
  const row = db.prepare("SELECT * FROM suggestions WHERE id = ?").get(info.lastInsertRowid);
  return rowToSuggestion(row);
}

function readMessages() {
  ensureDb();
  return db.prepare("SELECT * FROM messages ORDER BY id ASC").all().map(rowToMessage);
}

function writeMessages(messages) {
  ensureDb();
  const insert = db.prepare(`
    INSERT INTO messages (
      id, request_id, sender_role, sender_telegram_id, text, attachment_path, attachment_name, attachment_mime, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((items) => {
    db.prepare("DELETE FROM messages").run();
    for (const item of items) {
      insert.run(
        item.id,
        item.requestId,
        item.senderRole,
        item.senderTelegramId,
        item.text || "",
        item.attachmentPath || null,
        item.attachmentName || null,
        item.attachmentMime || null,
        item.createdAt || new Date().toISOString()
      );
    }
  });
  tx(messages);
}

function createRequestMessage(requestId, senderRole, senderTelegramId, text, attachment = null) {
  ensureDb();
  const createdAt = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO messages (
      request_id, sender_role, sender_telegram_id, text, attachment_path, attachment_name, attachment_mime, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requestId,
    senderRole,
    senderTelegramId,
    text,
    attachment?.path || null,
    attachment?.name || null,
    attachment?.mime || null,
    createdAt
  );
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
  return rowToMessage(row);
}

function getRequestMessages(requestId) {
  ensureDb();
  return db
    .prepare("SELECT * FROM messages WHERE request_id = ? ORDER BY datetime(created_at) ASC, id ASC")
    .all(requestId)
    .map(rowToMessage);
}

function getUserNotificationSettings(telegramId) {
  ensureDb();
  const row = db.prepare("SELECT * FROM user_notification_settings WHERE telegram_id = ?").get(telegramId);
  if (!row) {
    return {
      telegramId,
      adminNewRequest: true,
      adminSuggestion: true,
      userRequestTaken: true,
      userRequestCompleted: true,
      userChatMessage: true,
      adminChatMessage: true
    };
  }
  return {
    telegramId,
    adminNewRequest: Boolean(row.admin_new_request),
    adminSuggestion: Boolean(row.admin_suggestion),
    userRequestTaken: Boolean(row.user_request_taken),
    userRequestCompleted: Boolean(row.user_request_completed),
    userChatMessage: Boolean(row.user_chat_message),
    adminChatMessage: Boolean(row.admin_chat_message)
  };
}

function upsertUserNotificationSettings(telegramId, patch = {}) {
  ensureDb();
  const current = getUserNotificationSettings(telegramId);
  const merged = { ...current, ...patch };
  db.prepare(`
    INSERT INTO user_notification_settings (
      telegram_id, admin_new_request, admin_suggestion, user_request_taken, user_request_completed, user_chat_message, admin_chat_message, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      admin_new_request=excluded.admin_new_request,
      admin_suggestion=excluded.admin_suggestion,
      user_request_taken=excluded.user_request_taken,
      user_request_completed=excluded.user_request_completed,
      user_chat_message=excluded.user_chat_message,
      admin_chat_message=excluded.admin_chat_message,
      updated_at=excluded.updated_at
  `).run(
    telegramId,
    merged.adminNewRequest ? 1 : 0,
    merged.adminSuggestion ? 1 : 0,
    merged.userRequestTaken ? 1 : 0,
    merged.userRequestCompleted ? 1 : 0,
    merged.userChatMessage ? 1 : 0,
    merged.adminChatMessage ? 1 : 0,
    new Date().toISOString()
  );
  return getUserNotificationSettings(telegramId);
}

function isTelegramNotificationEnabled(telegramId, key) {
  const settings = getUserNotificationSettings(telegramId);
  return Boolean(settings[key]);
}

module.exports = {
  initDatabase,
  parsePriority,
  computeSlaDueAt,
  readUsers,
  writeUsers,
  findUser,
  getAdmins,
  registerUser,
  readRequests,
  writeRequests,
  createRequest,
  findRequestById,
  readSuggestions,
  writeSuggestions,
  createSuggestion,
  readMessages,
  writeMessages,
  createRequestMessage,
  getRequestMessages,
  getUserNotificationSettings,
  upsertUserNotificationSettings,
  isTelegramNotificationEnabled
};
