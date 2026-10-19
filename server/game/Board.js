'use strict';

const { DirVector } = require('../../public/protocol');

//Границы поля, манхэттенское расстояние, список всех клеток, «соседняя клетка по направлению»
class Board {
  #cells;

  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.#cells = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) this.#cells.push(Object.freeze({ x, y }));
    Object.freeze(this.#cells);
  }

  contains(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height; }
  manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  cells() { return this.#cells; }

// Соседняя клетка в направлении dir или null, если dir неизвестен. 
  neighbor(pos, dir) {
    const v = DirVector[dir];
    return v ? { x: pos.x + v.dx, y: pos.y + v.dy } : null;
  }
}

module.exports = { Board };
