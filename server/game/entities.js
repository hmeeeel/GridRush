'use strict';

const PlayerStatus = Object.freeze({ ONLINE: 'ONLINE', OFFLINE: 'OFFLINE' });

/** Игрок. Поля до «runtime» сохраняются в БД; остальное живёт только в памяти. */
class Player {
  constructor({ id, tokenHash, nick, color, score = 0, x = null, y = null, onField = false, createdAt, lastSeenAt }) {
    this.id = id;
    this.tokenHash = tokenHash;
    this.nick = nick;
    this.color = color;
    this.score = score;
    this.x = x;
    this.y = y;
    this.onField = onField;
    this.createdAt = createdAt;
    this.lastSeenAt = lastSeenAt;
    // runtime
    this.status = PlayerStatus.OFFLINE;
    this.afk = false;
    this.roundScore = 0;
    this.lastMoveAt = 0;
    this.lastActiveAt = 0;
    this.offlineSince = null;
  }

  get isOnline() { return this.status === PlayerStatus.ONLINE; }

  placeAt(x, y, now) {
    this.x = x;
    this.y = y;
    this.onField = true;
    this.markOnline(now);
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  removeFromField() {
    this.onField = false;
    this.x = null;
    this.y = null;
    this.afk = false;
    this.offlineSince = null;
    this.status = PlayerStatus.OFFLINE;
  }

  markOffline(now) {
    this.status = PlayerStatus.OFFLINE;
    this.offlineSince = now;
    this.lastSeenAt = now;
  }

  markOnline(now) {
    this.status = PlayerStatus.ONLINE;
    this.offlineSince = null;
    this.touch(now);
  }

  /** Фиксирует активность игрока.  true, если был снят флаг AFK */
  touch(now) {
    const wasAfk = this.afk;
    this.afk = false;
    this.lastActiveAt = now;
    this.lastSeenAt = now;
    return wasAfk;
  }

  toDto() {
    return {
      id: this.id, nick: this.nick, color: this.color, x: this.x, y: this.y,
      score: this.score, roundScore: this.roundScore, online: this.isOnline, afk: this.afk,
    };
  }
}

/** Предмет на поле. claimed защищает от повторного начисления очка за один и тот же itemId. */
class Item {
  constructor({ id, x, y, spawnedAt, expiresAt }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spawnedAt = spawnedAt;
    this.expiresAt = expiresAt;
    this.claimed = false;
  }

  isAt(x, y) { return this.x === x && this.y === y; }
  toDto() { return { id: this.id, x: this.x, y: this.y, expiresAt: this.expiresAt }; }
}

module.exports = { Player, PlayerStatus, Item };
