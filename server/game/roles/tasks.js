'use strict';

const { Event } = require('../../../public/protocol');

/** Конец раунда по таймеру: итоги, сброс очков раунда, старт следующего. */
class RoundTimerTask {
  #state; #leaderboard; #events; #durationMs;

  constructor({ state, leaderboard, events, durationMs }) {
    this.#state = state;
    this.#leaderboard = leaderboard;
    this.#events = events;
    this.#durationMs = durationMs;
  }

  run(now) {
    const s = this.#state;
    if (now < s.roundEndsAt) return;
    this.#events.emit(Event.ROUND_ENDED, { round: s.roundNumber, ranking: this.#leaderboard.roundRanking() });
    s.roundNumber += 1;
    for (const p of s.players.all()) p.roundScore = 0;
    s.roundEndsAt = now + this.#durationMs;
    s.changes.markMeta();
    this.#events.emit(Event.ROUND_STARTED, { round: s.roundNumber, endsAt: s.roundEndsAt });
  }
}

/** Гарантирует «ровно один предмет» и убирает его по таймауту. */
class ItemExpiryTask {
  #state; #items;

  constructor({ state, items }) {
    this.#state = state;
    this.#items = items;
  }

  run(now) {
    const item = this.#state.item;
    if (!item) this.#items.spawn(now, 'INIT');
    else if (now >= item.expiresAt) this.#items.spawn(now, 'EXPIRED');
  }
}

/** AFK-пометка, удаление AFK-игроков и отключившихся после grace-периода (счёт сохраняется). */
class PresenceTask {
  #state; #events; #rules;

  constructor({ state, events, rules }) {
    this.#state = state;
    this.#events = events;
    this.#rules = rules;
  }

  run(now) {
    const { RECONNECT_GRACE_MS, IDLE_TIMEOUT_MS, AFK_REMOVE_MS } = this.#rules;
    for (const p of this.#state.players.onField()) {
      if (!p.isOnline) {
        if (now - p.offlineSince >= RECONNECT_GRACE_MS) this.#leave(p, 'DISCONNECTED');
        continue;
      }
      const idle = now - p.lastActiveAt;
      if (idle >= AFK_REMOVE_MS) {
        this.#leave(p, 'AFK');
      } else if (idle >= IDLE_TIMEOUT_MS && !p.afk) {
        p.afk = true;
        this.#events.emit(Event.PLAYER_AFK, { playerId: p.id, afk: true });
      }
    }
  }

  #leave(player, reason) {
    player.removeFromField();
    this.#state.changes.markPlayer(player);
    this.#events.emit(Event.PLAYER_LEFT, { playerId: player.id, nick: player.nick, reason });
  }
}

module.exports = { RoundTimerTask, ItemExpiryTask, PresenceTask };
