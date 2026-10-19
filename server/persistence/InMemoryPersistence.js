'use strict';

const { Persistence } = require('./Persistence');
const m = require('./mappers');

/**  REST через fetch
 * 
 * Хранилище в памяти процесса - для локальной разработки и тестов (данные теряются при выходе). */
class InMemoryPersistence extends Persistence {
  #players = new Map();
  #awards = new Map();
  #meta = null;

  async load() {
    return {
      meta: this.#meta ? m.metaFromRecord(this.#meta) : null,
      players: [...this.#players.values()].map(m.playerFromRecord),
    };
  }

  async savePlayers(players) { for (const p of players) this.#players.set(p.id, m.playerToRecord(p)); }

  async appendAwards(awards) {
    for (const a of awards) if (!this.#awards.has(a.itemId)) this.#awards.set(a.itemId, m.awardToRecord(a));
  }

  async saveMeta(meta) { this.#meta = m.metaToRecord(meta); }

  get awardCount() { return this.#awards.size; }
}

module.exports = { InMemoryPersistence };
