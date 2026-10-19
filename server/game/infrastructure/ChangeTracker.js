'use strict';

//Копит «что изменилось» (какие игроки, какие начисления) для записи в БД
class ChangeTracker {
  #players = new Map();
  #awards = [];
  #meta = false;

  markPlayer(player) { this.#players.set(player.id, player); }
  recordAward(award) { this.#awards.push(award); }
  markMeta() { this.#meta = true; }

  drain() {
    const batch = { players: [...this.#players.values()], awards: this.#awards, meta: this.#meta };
    this.#players = new Map();
    this.#awards = [];
    this.#meta = false;
    return batch;
  }

  /** Возвращает неудавшуюся пачку обратно (после ошибки сохранения). */
  restore(batch) {
    for (const p of batch.players) this.#players.set(p.id, p);
    this.#awards = [...batch.awards, ...this.#awards];
    this.#meta = this.#meta || batch.meta;
  }
}

module.exports = { ChangeTracker };
