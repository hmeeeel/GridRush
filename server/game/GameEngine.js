'use strict';

const { CommandType } = require('./infrastructure/commands'); 
const { Item } = require('./entities');

/**  Движок не знает про сеть и БД: он принимает команды и выдаёт дельты.
 */
class GameEngine {
  #state;
  #events;
  #handlers;
  #deltas;
  #items;
  #leaderboard;
  #board;
  #rules;

  constructor({ state, events, handlers, deltas, items, leaderboard, board, rules }) {
    this.#state = state;
    this.#events = events;
    this.#handlers = new Map(handlers.map((h) => [h.type, h]));
    this.#deltas = deltas;
    this.#items = items;
    this.#leaderboard = leaderboard;
    this.#board = board;
    this.#rules = rules;
  }

  get state() { return this.#state; }
  get stateVersion() { return this.#state.stateVersion; }

  /** Единственная точка изменения состояния. 
   * находит обработчик по типу и вызывает его и решает конфликты
  */
  applyCommand(cmd) {
    const handler = this.#handlers.get(cmd.type);
    if (!handler) throw new Error(`Unknown command type: ${cmd.type}`);
    return handler.execute(cmd);
  }

  /** Упаковывает события тика в дельту (только если что-то изменилось). */
  flushDelta() {
    if (this.#events.size === 0) return null;
    const baseVersion = this.#state.stateVersion;
    this.#state.stateVersion += 1;
    this.#state.changes.markMeta();
    const delta = { stateVersion: this.#state.stateVersion, baseVersion, events: this.#events.drain() };
    this.#deltas.push(delta);
    return delta;
  }

  snapshot(now) {
    const s = this.#state;
    return {
      stateVersion: s.stateVersion,
      players: s.players.onField().map((p) => p.toDto()),
      item: s.item ? s.item.toDto() : null,
      leaderboardAllTime: this.#leaderboard.allTime(),
      round: { number: s.roundNumber, endsAt: s.roundEndsAt },
      serverTime: now,
    };
  }

  eventsSince(version) { return this.#deltas.eventsSince(version, this.#state.stateVersion); }

  exportMeta() {
    const s = this.#state;
    return {
      stateVersion: s.stateVersion,
      totalItemsCollected: s.totalItemsCollected,
      schemaVersion: 1,
      roundNumber: s.roundNumber,
      item: s.item ? { id: s.item.id, x: s.item.x, y: s.item.y } : null,
    };
  }

  /**
   * Восстановление при старте процесса (до запуска игрового цикла, конкурентности нет).
   * Игроки, бывшие на поле, считаются отключившимися: у них есть RECONNECT_GRACE_MS на возвращение.
   */
  restore({ meta, players }, now) {
    const s = this.#state;
    if (meta) {
      s.stateVersion = meta.stateVersion + this.#rules.BOOT_VERSION_JUMP;
      s.totalItemsCollected = meta.totalItemsCollected;
      s.roundNumber = meta.roundNumber;
      if (meta.item && this.#board.contains(meta.item.x, meta.item.y)) {
        s.item = new Item({ ...meta.item, spawnedAt: now, expiresAt: now + this.#rules.ITEM_TTL_MS });
      }
    }
    for (const p of players) {
      if (p.onField && !this.#board.contains(p.x, p.y)) p.removeFromField();
      if (p.onField) {
        p.markOffline(now);
        p.lastActiveAt = now;
      }
      s.players.add(p);
    }
    s.roundEndsAt = now + this.#rules.ROUND_DURATION_MS;
    s.changes.markMeta();
  }

  /** Первый тик: гарантирует наличие предмета до прихода первых игроков. */
  start(now) {
    this.applyCommand({ type: CommandType.TICK, now });
  }
}

module.exports = { GameEngine };
