'use strict';

const msg = require('./messages');
const { CloseCode } = require('../../public/protocol');

/**
 * Heartbeat: каждые HEARTBEAT_INTERVAL_MS шлёт WS-ping и прикладной PING (для RTT);
 * соединение без pong дольше HEARTBEAT_TIMEOUT_MS закрывается кодом 4000.
 * Соединение, не приславшее HELLO за HELLO_TIMEOUT_MS, закрывается кодом 4001.
 */
class HeartbeatMonitor {
  #sessions; #config; #clock; #logger;
  #timer = null;

  constructor({ sessions, config, clock = Date.now, logger }) {
    this.#sessions = sessions;
    this.#config = config;
    this.#clock = clock;
    this.#logger = logger;
  }

  start() { if (!this.#timer) this.#timer = setInterval(() => this.check(), this.#config.HEARTBEAT_CHECK_MS); }
  stop() { clearInterval(this.#timer); this.#timer = null; }

  check() {
    const now = this.#clock();
    const c = this.#config;
    for (const s of this.#sessions.all()) {
      if (!s.isOpen) continue;
      if (now - s.lastPongAt > c.HEARTBEAT_TIMEOUT_MS) {
        this.#logger.info(`Heartbeat timeout (session ${s.id})`);
        s.close(CloseCode.HEARTBEAT_TIMEOUT, 'HEARTBEAT_TIMEOUT');
      } else if (!s.joined && now - s.connectedAt > c.HELLO_TIMEOUT_MS) {
        s.close(CloseCode.PROTOCOL_VIOLATION, 'HELLO timeout');
      } else if (now - s.lastPingAt >= c.HEARTBEAT_INTERVAL_MS) {
        s.lastPingAt = now;
        s.conn.ping();
        s.send(msg.ping(now, s.rtt));
      }
    }
  }
}

module.exports = { HeartbeatMonitor };
