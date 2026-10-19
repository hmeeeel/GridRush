'use strict';

const crypto = require('node:crypto');

/** Анонимные сессии: выдаёт токен, хранится только его SHA-256.
 * В БД идёт только хэш.
*/
class TokenService {
  issue() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, hash: this.hash(token) };
  }

  hash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
  isWellFormed(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token); }
}

module.exports = { TokenService };
