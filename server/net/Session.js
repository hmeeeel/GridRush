'use strict';

const { RateLimiter, ViolationTracker } = require('./limiters');

let nextId = 1;

/** Состояние одного клиентского соединения на уровне протокола. */
class Session {
  constructor(conn, config, now) {
    this.id = nextId++;
    this.conn = conn;
    this.playerId = null;
    this.joined = false;
    this.helloPending = false;
    this.lastCseq = 0;
    this.connectedAt = now;
    this.lastPongAt = now;
    this.lastPingAt = 0;
    this.rtt = null;
    this.rate = new RateLimiter({ maxPerSecond: config.RATE_LIMIT_PER_SEC, maxStrikes: config.RATE_LIMIT_STRIKES });
    this.violations = new ViolationTracker({ maxPerMinute: config.MAX_VIOLATIONS_PER_MIN });
  }

  get isOpen() { return this.conn.isOpen; }
  send(message) { return this.conn.sendText(JSON.stringify(message)); }
  sendRaw(text) { return this.conn.sendText(text); }
  close(code, reason) { this.conn.close(code, reason); }

  /** cseq монотонно растёт; повтор или «из прошлого» отбрасывается. */
  acceptCseq(cseq) {
    if (cseq <= this.lastCseq) return false;
    this.lastCseq = cseq;
    return true;
  }

  onPong(t, now) {
    this.lastPongAt = now;
    if (typeof t === 'number') {
      const rtt = now - t;
      if (rtt >= 0 && rtt < 60_000) this.rtt = rtt;
    }
  }
}

module.exports = { Session };
