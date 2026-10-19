'use strict';

/** Расчёт таблиц лидеров: за всё время (включая ушедших) и текущего раунда. */
class Leaderboard {
  #players;
  #size;

  constructor({ players, size }) {
    this.#players = players;
    this.#size = size;
  }

  allTime() {
    return this.#players.all()
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick))
      .slice(0, this.#size)
      .map((p) => ({ playerId: p.id, nick: p.nick, score: p.score }));
  }

  roundRanking() {
    return this.#players.all()
      .filter((p) => p.roundScore > 0)
      .sort((a, b) => b.roundScore - a.roundScore || a.nick.localeCompare(b.nick))
      .map((p) => ({ playerId: p.id, nick: p.nick, roundScore: p.roundScore }));
  }
}

module.exports = { Leaderboard };
