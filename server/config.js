'use strict';

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
const list = (name) => (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);

function loadConfig(overrides = {}) {
  return Object.freeze({

    // HTTP / WebSocket
    PORT: num('PORT', 3000),
    ALLOWED_ORIGINS: list('ALLOWED_ORIGINS'), // пусто = только тот же хост; '*' = любой
    WS_PATH: '/ws',
    MAX_FRAME_BYTES: 16 * 1024,
    MAX_MESSAGE_BYTES: 1024,

    // игровое поле и правила
    BOARD_W: num('BOARD_W', 16),
    BOARD_H: num('BOARD_H', 12),
    TICK_MS: num('TICK_MS', 50),
    MOVE_COOLDOWN_MS: num('MOVE_COOLDOWN_MS', 100),
    MAX_PLAYERS: num('MAX_PLAYERS', 5),
    MIN_SPAWN_DIST: num('MIN_SPAWN_DIST', 5),
    ITEM_TTL_MS: num('ITEM_TTL_MS', 15_000),
    ROUND_DURATION_MS: num('ROUND_DURATION_MS', 180_000),
    NICK_MIN: 2,
    NICK_MAX: 16,
    LEADERBOARD_SIZE: 10,

    // присутствие игроков
    IDLE_TIMEOUT_MS: num('IDLE_TIMEOUT_MS', 120_000),
    AFK_REMOVE_MS: num('AFK_REMOVE_MS', 300_000),
    RECONNECT_GRACE_MS: num('RECONNECT_GRACE_MS', 20_000),

    // защита соединения
    HEARTBEAT_INTERVAL_MS: 15_000,
    HEARTBEAT_TIMEOUT_MS: 30_000,
    HEARTBEAT_CHECK_MS: 5_000,
    HELLO_TIMEOUT_MS: 15_000,
    RATE_LIMIT_PER_SEC: 30,
    RATE_LIMIT_STRIKES: 3,
    MAX_VIOLATIONS_PER_MIN: 10,

    // состояние и хранение
    DELTA_BUFFER_SIZE: 300,
    BOOT_VERSION_JUMP: 100_000, // после рестарта клиенты со старой версией получают полный SNAPSHOT
    PERSIST_INTERVAL_MS: num('PERSIST_INTERVAL_MS', 2_000),
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
    SUPABASE_TIMEOUT_MS: 5_000,
    SHUTDOWN_TIMEOUT_MS: 5_000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ...overrides,
  });
}

module.exports = { loadConfig };
