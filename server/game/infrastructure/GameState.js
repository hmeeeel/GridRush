'use strict';

const { PlayerRegistry } = require('../PlayerRegistry');
const { ChangeTracker } = require('./ChangeTracker');

/** Контейнер состояния игры (без поведения). Меняется только через GameEngine.applyCommand. */
class GameState {
  constructor() {
    this.players = new PlayerRegistry();
    this.item = null;
    this.stateVersion = 0;
    this.totalItemsCollected = 0;
    this.roundNumber = 1;
    this.roundEndsAt = 0;
    this.changes = new ChangeTracker();
  }
}

module.exports = { GameState };
