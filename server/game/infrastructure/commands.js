'use strict';

const CommandType = Object.freeze({
  JOIN: 'JOIN',
  MOVE: 'MOVE',
  SET_NICK: 'SET_NICK',
  DISCONNECT: 'DISCONNECT',
  TICK: 'TICK',
});

module.exports = { CommandType };
