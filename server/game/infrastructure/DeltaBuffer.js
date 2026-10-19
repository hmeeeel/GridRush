'use strict';

/** Кольцевой буфер последних дельт - для догона клиента после переподключения. */
class DeltaBuffer {
  #capacity;
  #deltas = [];

  constructor(capacity) {
    this.#capacity = capacity;
  }

  push(delta) {
    this.#deltas.push(delta);
    if (this.#deltas.length > this.#capacity) this.#deltas.shift();
  }

  /** События после версии `version` до `current`; null - если догнать нельзя (нужен SNAPSHOT). */
  eventsSince(version, current) {
    if (version === current) return [];
    if (!Number.isInteger(version) || version > current) return null;
    const oldest = this.#deltas[0];
    if (!oldest || version < oldest.baseVersion) return null;
    return this.#deltas.filter((d) => d.stateVersion > version).flatMap((d) => d.events);
  }
}

module.exports = { DeltaBuffer };
