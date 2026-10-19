'use strict';

/** Очередь команд в порядке поступления. Порядок = порядок событий message в event loop. */
class CommandQueue {
  #entries = [];

  /** @param {object} cmd команда @param {(result:object)=>void} [onResult] вызывается после обработки тика */
  enqueue(cmd, onResult = null) {
    this.#entries.push({ cmd, onResult });
  }

  drain() {
    const out = this.#entries;
    this.#entries = [];
    return out;
  }
}

module.exports = { CommandQueue };
