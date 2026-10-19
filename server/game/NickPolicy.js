'use strict';

/** Правила ника: 2–16 символов, буквы/цифры/_/-, пробелы по краям обрезаются. */
class NickPolicy {
  #min;
  #max;

  constructor({ min, max }) {
    this.#min = min;
    this.#max = max;
  }

  validate(raw) {
    if (typeof raw !== 'string') return { ok: false, message: 'Введите ник' };
    const nick = raw.trim();
    const length = [...nick].length;
    if (length < this.#min || length > this.#max) {
      return { ok: false, message: `Ник должен быть от ${this.#min} до ${this.#max} символов` };
    }
    if (!/^[\p{L}\p{N}_-]+$/u.test(nick)) {
      return { ok: false, message: 'Допустимы буквы, цифры, «_» и «-»' };
    }
    return { ok: true, nick };
  }

  /** Ключ для сравнения на уникальность (регистронезависимо). */
  static key(nick) { return nick.toLowerCase(); }
}

module.exports = { NickPolicy };