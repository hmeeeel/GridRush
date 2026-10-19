'use strict';

/** GET /health - 200 {"ok":true,"players":N,"uptime":S} для мониторинга хостинга. */
class HealthRoute {
  #getPlayers;
  #startedAt;

  constructor({ getPlayers, startedAt = Date.now() }) {
    this.#getPlayers = getPlayers;
    this.#startedAt = startedAt;
  }

  async handle(req, res) {
    if (new URL(req.url, 'http://localhost').pathname !== '/health') return false;
    const body = JSON.stringify({
      ok: true,
      players: this.#getPlayers(),
      uptime: Math.floor((Date.now() - this.#startedAt) / 1000),
    });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
}

module.exports = { HealthRoute };
