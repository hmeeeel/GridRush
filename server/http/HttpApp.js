'use strict';

const http = require('node:http');

/** Цепочка маршрутов: первый, вернувший true, обрабатывает запрос. Добавить маршрут = передать ещё один объект. */
class HttpApp {
  #routes;
  #logger;

  constructor({ routes, logger }) {
    this.#routes = routes;
    this.#logger = logger;
  }

  createServer() {
    return http.createServer((req, res) => {
      this.#dispatch(req, res).catch((err) => {
        this.#logger.error('HTTP handler failed', err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
  }

  async #dispatch(req, res) {
    for (const route of this.#routes) {
      if (await route.handle(req, res)) return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

module.exports = { HttpApp };
