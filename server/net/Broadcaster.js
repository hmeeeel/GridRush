'use strict';

const msg = require('./messages');

/** Рассылка всем вошедшим клиентам; сообщение сериализуется один раз. */
class Broadcaster {
  #sessions;

  constructor({ sessions }) {
    this.#sessions = sessions;
  }

  broadcastDelta(delta) { this.#broadcast(msg.delta(delta)); }
  broadcastShutdown(reason, retryAfterMs) { this.#broadcast(msg.serverShutdown(reason, retryAfterMs)); }

  closeAll(code, reason) { for (const s of this.#sessions.all()) s.close(code, reason); }

  #broadcast(message) {
    const text = JSON.stringify(message);
    for (const s of this.#sessions.joined()) s.sendRaw(text);
  }
}

module.exports = { Broadcaster };
