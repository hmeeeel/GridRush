'use strict';

const { VERSION, Client, Dir, ErrorCode } = require('../../public/protocol');

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUint = (v) => Number.isSafeInteger(v) && v >= 0;
const optString = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);
const optUint = (v) => v === undefined || isUint(v);

/** Схемы по типам сообщений (Strategy): возвращают текст ошибки или null. Новый тип = новая запись. */
const SCHEMAS = {
  [Client.HELLO]: (m) => {
    if (!optString(m.token, 128)) return 'token must be a string';
    if (!optString(m.nick, 64)) return 'nick must be a string';
    if (!optUint(m.lastStateVersion)) return 'lastStateVersion must be a non-negative integer';
    if (!optUint(m.lastCseq)) return 'lastCseq must be a non-negative integer';
    return null;
  },
  [Client.MOVE]: (m) => {
    if (!isUint(m.cseq)) return 'cseq must be a non-negative integer';
    if (typeof m.dir !== 'string' || !Object.hasOwn(Dir, m.dir)) return 'dir must be one of U/D/L/R';
    if (typeof m.clientTime !== 'number' || !Number.isFinite(m.clientTime)) return 'clientTime must be a number';
    return null;
  },
  [Client.SET_NICK]: (m) => {
    if (!isUint(m.cseq)) return 'cseq must be a non-negative integer';
    if (typeof m.nick !== 'string' || m.nick.length > 64) return 'nick must be a string';
    return null;
  },
  [Client.PONG]: (m) => (typeof m.t === 'number' && Number.isFinite(m.t) ? null : 't must be a number'),
};

/**
 * Проверка входящего кадра: размер ≤ maxBytes, корректный JSON, версия протокола,
 * известный тип, обязательные поля и допустимые значения.
 */
class MessageValidator {
  #maxBytes;

  constructor({ maxBytes }) {
    this.#maxBytes = maxBytes;
  }

  /** @returns {{ok:true, msg:object} | {ok:false, code:string, message:string, fatal:boolean}} */
  validate(raw) {
    if (Buffer.byteLength(raw, 'utf8') > this.#maxBytes) return this.#bad(`Message exceeds ${this.#maxBytes} bytes`);
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.#bad('Invalid JSON');
    }
    if (!isObject(msg)) return this.#bad('Message must be a JSON object');
    if (msg.v !== VERSION) {
      return { ok: false, code: ErrorCode.PROTOCOL_VERSION, message: `Unsupported protocol version, expected ${VERSION}`, fatal: true };
    }
    const schema = Object.hasOwn(SCHEMAS, msg.type) ? SCHEMAS[msg.type] : null;
    if (!schema) return this.#bad('Unknown message type');
    const problem = schema(msg);
    return problem ? this.#bad(problem) : { ok: true, msg };
  }

  #bad(message) { return { ok: false, code: ErrorCode.INVALID_MESSAGE, message, fatal: false }; }
}

module.exports = { MessageValidator };
