'use strict';

const crypto = require('node:crypto');
const { Item } = require('../entities');
const { Event } = require('../../../public/protocol');

/** Появление предмета: всегда ровно один, в свободной клетке, не там же где был прежний. */
class ItemService {
  #state;
  #spawner;
  #events;
  #ttlMs;

  constructor({ state, spawner, events, ttlMs }) {
    this.#state = state;
    this.#spawner = spawner;
    this.#events = events;
    this.#ttlMs = ttlMs;
  }

  //выбрать клетку, создать предмет с новым itemId (uuid), отметить мета-изменение, эмитить ITEM_SPAWNED
  spawn(now, reason) {
    const cell = this.#spawner.pickItemCell(this.#state.item, this.#state.players.onField());
    const item = new Item({ id: crypto.randomUUID(), x: cell.x, y: cell.y, spawnedAt: now, expiresAt: now + this.#ttlMs });
    this.#state.item = item;
    this.#state.changes.markMeta();
    this.#events.emit(Event.ITEM_SPAWNED, { item: item.toDto(), reason });
    return item;
  }
}

module.exports = { ItemService };
