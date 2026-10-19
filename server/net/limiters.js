'use strict';

const Verdict = Object.freeze({ OK: 'OK', DROP: 'DROP', DISCONNECT: 'DISCONNECT' });

/**
 * Лимит сообщений в секунду. Превышение - отбрасывание; если лимит превышен
 * `maxStrikes` секунд подряд - разрыв соединения.
 */
class RateLimiter {
  #max; #maxStrikes;
  #windowStart = 0;
  #count = 0;
  #strikes = 0;
  #windowExceeded = false;

  constructor({ maxPerSecond, maxStrikes }) {
    this.#max = maxPerSecond;
    this.#maxStrikes = maxStrikes;
  }

  hit(now) {
    if (now - this.#windowStart >= 1000) {
      this.#strikes = this.#windowExceeded ? this.#strikes + 1 : 0;
      this.#windowStart = now;
      this.#count = 0;
      this.#windowExceeded = false;
    }
    if (++this.#count <= this.#max) return Verdict.OK;
    this.#windowExceeded = true;
    return this.#strikes + 1 >= this.#maxStrikes ? Verdict.DISCONNECT : Verdict.DROP;
  }
}

/** Счётчик нарушений протокола в скользящем окне 60 с. */
class ViolationTracker {
  #limit;
  #times = [];

  constructor({ maxPerMinute }) {
    this.#limit = maxPerMinute;
  }

  /**true, если лимит превышен */
  record(now) {
    this.#times = this.#times.filter((t) => now - t < 60_000);
    this.#times.push(now);
    return this.#times.length > this.#limit;
  }
}

module.exports = { RateLimiter, ViolationTracker, Verdict };
