 //Протокол обмена - единый источник правды для сервера (require) и клиента (<script>).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Protocol = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  //ни клиент, ни сервер случайно не изменят константы протокола во время работы приложения
  const freeze = Object.freeze; // неизменяемым само содержимое объекта
  return freeze({
    VERSION: 1,
    Client: freeze({ HELLO: 'HELLO', MOVE: 'MOVE', SET_NICK: 'SET_NICK', PONG: 'PONG' }),
    Server: freeze({
      WELCOME: 'WELCOME', SNAPSHOT: 'SNAPSHOT', DELTA: 'DELTA', MOVE_ACK: 'MOVE_ACK',
      MOVE_REJECTED: 'MOVE_REJECTED', PING: 'PING', ERROR: 'ERROR', SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
    }),
    Event: freeze({
      PLAYER_MOVED: 'PLAYER_MOVED', PLAYER_JOINED: 'PLAYER_JOINED', PLAYER_LEFT: 'PLAYER_LEFT',
      PLAYER_OFFLINE: 'PLAYER_OFFLINE', PLAYER_ONLINE: 'PLAYER_ONLINE', PLAYER_AFK: 'PLAYER_AFK',
      SCORE: 'SCORE', ITEM_SPAWNED: 'ITEM_SPAWNED', NICK_CHANGED: 'NICK_CHANGED',
      ROUND_ENDED: 'ROUND_ENDED', ROUND_STARTED: 'ROUND_STARTED',
    }),
    Dir: freeze({ U: 'U', D: 'D', L: 'L', R: 'R' }),
    DirVector: freeze({
      U: freeze({ dx: 0, dy: -1 }), D: freeze({ dx: 0, dy: 1 }),
      L: freeze({ dx: -1, dy: 0 }), R: freeze({ dx: 1, dy: 0 }),
    }),
    ErrorCode: freeze({
      ROOM_FULL: 'ROOM_FULL', BAD_NICK: 'BAD_NICK', PROTOCOL_VERSION: 'PROTOCOL_VERSION',
      INVALID_MESSAGE: 'INVALID_MESSAGE', RATE_LIMIT: 'RATE_LIMIT',
      SESSION_REPLACED: 'SESSION_REPLACED', INTERNAL: 'INTERNAL',
    }),
    RejectReason: freeze({ COOLDOWN: 'COOLDOWN', OUT_OF_BOUNDS: 'OUT_OF_BOUNDS', AFK: 'AFK', INVALID_DIR: 'INVALID_DIR' }),
    CloseCode: freeze({
      NORMAL: 1000, GOING_AWAY: 1001, HEARTBEAT_TIMEOUT: 4000, PROTOCOL_VIOLATION: 4001,
      RATE_LIMIT: 4002, PROTOCOL_VERSION: 4003, ROOM_FULL: 4004, SESSION_REPLACED: 4005,
    }),
  });
});
