'use strict';

// Выбор клеток для появления игроков и предмета. rng для детерминированных тестов . генератор случайных чисел передаётся снаружи, иначе тесты не воспроизводимы
class SpawnService {
  #board;
  #minSpawnDist;
  #rng;

  constructor({ board, minSpawnDist, rng = Math.random }) {
    this.#board = board;
    this.#minSpawnDist = minSpawnDist;
    this.#rng = rng;
  }

  /** Не клетка предмета; предпочтительно не ближе MIN_SPAWN_DIST (манхэттен), иначе любая кроме клетки предмета. */
  pickPlayerCell(itemPos) {
    const all = this.#board.cells();
    const notItem = itemPos ? all.filter((c) => !(c.x === itemPos.x && c.y === itemPos.y)) : all;
    const far = itemPos ? notItem.filter((c) => this.#board.manhattan(c, itemPos) >= this.#minSpawnDist) : notItem;
    return this.#pick(far.length ? far : notItem.length ? notItem : all);
  }

  /**
   * Не занята игроками и не совпадает с прежней позицией предмета.
   * Если оба условия невыполнимы (крошечное поле), ослабляется второе: предмет никогда не появляется под игроком.
   */
  pickItemCell(previousPos, occupied) {
    const key = (c) => `${c.x},${c.y}`;
    const taken = new Set([...occupied].map(key));
    const all = this.#board.cells();
    const notPrev = previousPos ? all.filter((c) => key(c) !== key(previousPos)) : all;
    const free = notPrev.filter((c) => !taken.has(key(c)));
    if (free.length) return this.#pick(free);
    const notTaken = all.filter((c) => !taken.has(key(c)));
    return this.#pick(notTaken.length ? notTaken : notPrev.length ? notPrev : all);
  }

  #pick(cells) { return cells[Math.floor(this.#rng() * cells.length)]; }
}

module.exports = { SpawnService };
