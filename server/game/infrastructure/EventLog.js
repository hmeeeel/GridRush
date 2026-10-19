'use strict';

/** Доменные события текущего тика. Сервисы эмитят, движок забирает и упаковывает в DELTA. */
class EventLog {
  #pending = [];

  emit(type, payload = {}) { this.#pending.push({ type, ...payload }); }
  drain() { const out = this.#pending; this.#pending = []; return out; }
  get size() { return this.#pending.length; }
}

module.exports = { EventLog };
