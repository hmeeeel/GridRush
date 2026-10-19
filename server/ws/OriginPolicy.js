'use strict';

/**
 * Проверка заголовка Origin при рукопожатии (защита от от захвата сокета с чужого сайта -Источник должен совпадать с хостом (или быть в белом списке).
 *  - заголовка нет (не браузер)      - разрешено;
 *  - allowed содержит '*'            - разрешено;
 *  - allowed непустой                - только перечисленные источники;
 *  - allowed пуст                    - только тот же хост, что в Host.
 */
class OriginPolicy {
  #allowed;

  constructor(allowedOrigins = []) {
    this.#allowed = new Set(allowedOrigins.map((o) => o.replace(/\/+$/, '').toLowerCase()));
  }

  isAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (this.#allowed.has('*')) return true;
    if (this.#allowed.size > 0) return this.#allowed.has(origin.replace(/\/+$/, '').toLowerCase());
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
}

module.exports = { OriginPolicy };
