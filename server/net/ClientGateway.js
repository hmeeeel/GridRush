'use strict';

const msg = require('./messages');
const { Verdict } = require('./limiters');
const { Session } = require('./Session');
const { CommandType } = require('../game/infrastructure/commands.js');
const { Client, ErrorCode, CloseCode } = require('../../public/protocol');

/**
 * Шлюз между сетью и игровым ядром: лимиты - валидация - маршрутизация по типу.
 * Сам ничего не решает про игру - только превращает сообщения в команды и ответы.
 * 
 * Для MOVE он не меняет состояние, а кладёт команду в очередь с колбэком ответа. 
 * Для HELLO - команда JOIN, а в колбэке: привязать сессию, отправить WELCOME, затем либо дельту-догон, 
 * либо полный SNAPSHOT. При закрытии сокета ставит DISCONNECT.
 * 
 */
class ClientGateway {
  #engine; #queue; #sessions; #validator; #config; #clock; #logger;
  #routes;

  constructor({ engine, queue, sessions, validator, config, clock = Date.now, logger }) {
    this.#engine = engine;
    this.#queue = queue;
    this.#sessions = sessions;
    this.#validator = validator;
    this.#config = config;
    this.#clock = clock;
    this.#logger = logger;
    this.#routes = {
      [Client.HELLO]: (s, m) => this.#onHello(s, m),
      [Client.MOVE]: (s, m) => this.#onMove(s, m),
      [Client.SET_NICK]: (s, m) => this.#onSetNick(s, m),
      [Client.PONG]: (s, m) => s.onPong(m.t, this.#clock()),
    };
  }

  handleConnection(conn) {
    const session = new Session(conn, this.#config, this.#clock());
    this.#sessions.add(session);
    conn.on('message', (text) => this.#onMessage(session, text));
    conn.on('pong', () => { session.lastPongAt = this.#clock(); });
    conn.on('close', () => this.#onClose(session));
  }

  #onMessage(session, text) {
    const now = this.#clock();
    const verdict = session.rate.hit(now);
    if (verdict === Verdict.DROP) return;
    if (verdict === Verdict.DISCONNECT) {
      session.send(msg.error(ErrorCode.RATE_LIMIT, 'Too many messages', true));
      session.close(CloseCode.RATE_LIMIT, 'RATE_LIMIT');
      return;
    }

    const result = this.#validator.validate(text);
    if (!result.ok) return this.#reject(session, result, now);

    const { msg: message } = result;
    if (!session.joined && message.type !== Client.HELLO && message.type !== Client.PONG) {
      return this.#reject(session, { code: ErrorCode.INVALID_MESSAGE, message: 'HELLO required first', fatal: false }, now);
    }
    this.#routes[message.type](session, message);
  }

  #reject(session, { code, message, fatal }, now) {
    session.send(msg.error(code, message, fatal));
    if (fatal) {
      session.close(code === ErrorCode.PROTOCOL_VERSION ? CloseCode.PROTOCOL_VERSION : CloseCode.PROTOCOL_VIOLATION, code);
    } else if (session.violations.record(now)) {
      session.send(msg.error(ErrorCode.INVALID_MESSAGE, 'Too many protocol violations', true));
      session.close(CloseCode.PROTOCOL_VIOLATION, 'PROTOCOL_VIOLATION');
    }
  }

  // ── HELLO - JOIN ──────────────────────────────────────────────────────────
  #onHello(session, hello) {
    if (session.joined || session.helloPending) {
      return this.#reject(session, { code: ErrorCode.INVALID_MESSAGE, message: 'Already joined', fatal: false }, this.#clock());
    }
    session.helloPending = true;
    session.lastCseq = hello.lastCseq ?? 0;
    this.#queue.enqueue(
      { type: CommandType.JOIN, token: hello.token ?? null, nick: hello.nick ?? null },
      (result) => this.#onJoinResult(session, hello, result),
    );
  }

  #onJoinResult(session, hello, result) {
    session.helloPending = false;
    if (!result.ok) {
      const fatal = result.code === ErrorCode.ROOM_FULL;
      session.send(msg.error(result.code, result.message, fatal));
      if (fatal) session.close(CloseCode.ROOM_FULL, ErrorCode.ROOM_FULL);
      return;
    }
    const { player } = result;
    if (!session.isOpen) {
      // сокет закрылся, пока команда ждала тика: игрок на поле, но уже без соединения
      this.#enqueueDisconnect(player.id);
      return;
    }

    const replaced = this.#sessions.bind(session, player.id);
    if (replaced) {
      replaced.send(msg.error(ErrorCode.SESSION_REPLACED, 'Игра открыта в другой вкладке', true));
      replaced.close(CloseCode.SESSION_REPLACED, ErrorCode.SESSION_REPLACED);
    }

    const now = this.#clock();
    session.send(msg.welcome({
      token: result.token, player, serverTime: now, config: msg.clientConfig(this.#config),
    }));
    this.#sendCatchUp(session, hello, result.resumed, now);
    session.lastPingAt = now;
    session.send(msg.ping(now, session.rtt));
  }

  /** Клиент с актуальной историей получает только пропущенные события, иначе - полный SNAPSHOT. */
  #sendCatchUp(session, hello, resumed, now) {
    const events = resumed && hello.lastStateVersion !== undefined
      ? this.#engine.eventsSince(hello.lastStateVersion)
      : null;
    if (events) {
      session.send(msg.delta({ stateVersion: this.#engine.stateVersion, baseVersion: hello.lastStateVersion, events }));
    } else {
      session.send(msg.snapshot(this.#engine.snapshot(now)));
    }
  }

  // ── MOVE / SET_NICK ───────────────────────────────────────────────────────
  #onMove(session, move) {
    if (!session.acceptCseq(move.cseq)) return;
    this.#queue.enqueue(
      {
        type: CommandType.MOVE, playerId: session.playerId, dir: move.dir, cseq: move.cseq,
        clientTime: move.clientTime, receivedAt: this.#clock(),
      },
      (result) => session.send(result.ok ? msg.moveAck(result) : msg.moveRejected(result)),
    );
  }

  #onSetNick(session, req) {
    if (!session.acceptCseq(req.cseq)) return;
    this.#queue.enqueue(
      { type: CommandType.SET_NICK, playerId: session.playerId, nick: req.nick },
      (result) => { if (!result.ok) session.send(msg.error(result.code, result.message, false)); },
    );
  }

  // ── закрытие ──────────────────────────────────────────────────────────────
  #onClose(session) {
    const wasActive = session.joined;
    this.#sessions.remove(session);
    // вытесненная сессия (joined=false) не переводит игрока в offline
    if (wasActive && session.playerId) this.#enqueueDisconnect(session.playerId);
  }

  /** Отключение выполняется, только если к моменту тика у игрока нет другой активной сессии. */
  #enqueueDisconnect(playerId) {
    this.#queue.enqueue({
      type: CommandType.DISCONNECT, playerId, guard: () => !this.#sessions.byPlayer(playerId),
    });
  }
}

module.exports = { ClientGateway };
