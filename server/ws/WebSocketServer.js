'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { WebSocketConnection } = require('./WebSocketConnection');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * WebSocket-сервер на том же порту, что и HTTP: ловит событие 'upgrade',
 * делает рукопожатие и эмитит 'connection'(WebSocketConnection, req).
 */
class WebSocketServer extends EventEmitter {
  #path;
  #origins;
  #maxPayload;
  #logger;

  constructor({ path, originPolicy, maxPayload, logger }) {
    super();
    this.#path = path;
    this.#origins = originPolicy;
    this.#maxPayload = maxPayload;
    this.#logger = logger;
  }

  attach(httpServer) {
    httpServer.on('upgrade', (req, socket, head) => this.#handleUpgrade(req, socket, head));
  }

  #handleUpgrade(req, socket, head) {
    socket.on('error', () => socket.destroy());
    const { pathname } = new URL(req.url, 'http://localhost');
    const key = req.headers['sec-websocket-key'];

    if (pathname !== this.#path) return this.#reject(socket, 404, 'Not Found');
    if (req.method !== 'GET' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) {
      return this.#reject(socket, 400, 'Bad Request');
    }
    if (req.headers['sec-websocket-version'] !== '13') {
      return this.#reject(socket, 426, 'Upgrade Required', { 'Sec-WebSocket-Version': '13' });
    }
    if (!this.#origins.isAllowed(req)) {
      this.#logger.warn(`Origin rejected: ${req.headers.origin}`);
      return this.#reject(socket, 403, 'Forbidden');
    }

    // Главное - ответ на рукопожатие
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const conn = new WebSocketConnection(socket, { maxPayload: this.#maxPayload });
    this.emit('connection', conn, req);
    if (head && head.length) conn.feed(head);
  }

  #reject(socket, status, text, headers = {}) {
    const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n${extra}\r\n`);
  }
}

module.exports = { WebSocketServer };
