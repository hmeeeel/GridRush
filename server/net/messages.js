'use strict';

const { VERSION, Server } = require('../../public/protocol');

const make = (type, payload) => ({ type, v: VERSION, ...payload });

/** Фабрики исходящих сообщений: гарантируют поле v и единый формат. */
module.exports = {
  welcome: ({ token, player, config, serverTime }) =>
    make(Server.WELCOME, { token, playerId: player.id, nick: player.nick, config, serverTime }),
  snapshot: (snap) => make(Server.SNAPSHOT, snap),
  delta: (d) => make(Server.DELTA, d),
  moveAck: ({ cseq, x, y }) => make(Server.MOVE_ACK, { cseq, x, y }),
  moveRejected: ({ cseq, reason, x, y }) => make(Server.MOVE_REJECTED, { cseq, reason, x, y }),
  ping: (t, rtt) => make(Server.PING, { t, rtt }),
  error: (code, message, fatal = false) => make(Server.ERROR, { code, message, fatal }),
  serverShutdown: (reason, retryAfterMs) => make(Server.SERVER_SHUTDOWN, { reason, retryAfterMs }),
  /** Параметры игры, нужные клиенту для отрисовки и предсказания. */
  clientConfig: (c) => ({
    W: c.BOARD_W, H: c.BOARD_H, cooldownMs: c.MOVE_COOLDOWN_MS, tickMs: c.TICK_MS,
    itemTtlMs: c.ITEM_TTL_MS, roundDurationMs: c.ROUND_DURATION_MS, maxPlayers: c.MAX_PLAYERS,
    nickMin: c.NICK_MIN, nickMax: c.NICK_MAX,
  }),
};
