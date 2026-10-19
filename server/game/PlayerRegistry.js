'use strict';

const { NickPolicy } = require('./NickPolicy');

/** Все известные игроки (и на поле, и ушедшие) с индексами по id, хэшу токену и нику. */
class PlayerRegistry {
  #byId = new Map();
  #byToken = new Map();
  #byNick = new Map();

  add(player) {
    this.#byId.set(player.id, player);
    this.#byToken.set(player.tokenHash, player);
    this.#byNick.set(NickPolicy.key(player.nick), player);
  }

  get(id) { return this.#byId.get(id) ?? null; }
  findByTokenHash(hash) { return this.#byToken.get(hash) ?? null; }

  isNickTaken(nick, exceptId = null) {
    const owner = this.#byNick.get(NickPolicy.key(nick));
    return Boolean(owner) && owner.id !== exceptId;
  }

  rename(player, nick) {
    this.#byNick.delete(NickPolicy.key(player.nick));
    player.nick = nick;
    this.#byNick.set(NickPolicy.key(nick), player);
  }

  all() { return [...this.#byId.values()]; }
  onField() { return this.all().filter((p) => p.onField); }
  fieldCount() { let n = 0; for (const p of this.#byId.values()) if (p.onField) n++; return n; }
}

module.exports = { PlayerRegistry };
