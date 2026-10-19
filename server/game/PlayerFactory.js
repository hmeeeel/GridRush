'use strict';

const crypto = require('node:crypto');
const { Player } = require('./entities');

const PALETTE = Object.freeze([
  '#e5484d', '#3e63dd', '#30a46c', '#f5a524', '#8e4ec6', '#12a594',
  '#e93d82', '#0090ff', '#978365', '#ff6a00', '#6e56cf', '#46a758',
]);

// Создаёт новых игроков: id, цвет 
class PlayerFactory {
  #palette;

  constructor(palette = PALETTE) {
    this.#palette = palette;
  }

  create({ nick, tokenHash, usedColors = [], now }) {
    const used = new Set(usedColors);
    const free = this.#palette.filter((c) => !used.has(c));
    const pool = free.length ? free : this.#palette;
    return new Player({
      id: crypto.randomUUID(),
      tokenHash,
      nick,
      color: pool[Math.floor(Math.random() * pool.length)],
      createdAt: now,
      lastSeenAt: now,
    });
  }
}

module.exports = { PlayerFactory, PALETTE };
