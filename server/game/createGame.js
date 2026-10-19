'use strict';

const { Board } = require('./Board');
const { GameState } = require('./infrastructure/GameState.js'); 
const { EventLog } = require('./infrastructure/EventLog');
const { DeltaBuffer } = require('./infrastructure/DeltaBuffer');
const { NickPolicy } = require('./NickPolicy');
const { TokenService } = require('./TokenService');
const { PlayerFactory } = require('./PlayerFactory');
const { SpawnService } = require('./SpawnService');
const { Leaderboard } = require('./roles/Leaderboard'); 
const { ItemService } = require('./roles/ItemService');
const { ScoringService } = require('./roles/ScoringService');
const { GameEngine } = require('./GameEngine');
const { CommandQueue } = require('./CommandQueue');
const { RoundTimerTask, ItemExpiryTask, PresenceTask } = require('./roles/tasks');
const { JoinHandler } = require('./roles/JoinHandler');
const { MoveHandler } = require('./roles/MoveHandler');
const { SetNickHandler } = require('./roles/SetNickHandler');
const { DisconnectHandler } = require('./roles/DisconnectHandler');
const { TickHandler } = require('./roles/TickHandler');

function createGame(config, { logger, rng = Math.random } = {}) {
  const board = new Board(config.BOARD_W, config.BOARD_H);
  const state = new GameState();
  const events = new EventLog();
  const spawner = new SpawnService({ board, minSpawnDist: config.MIN_SPAWN_DIST, rng });
  const nickPolicy = new NickPolicy({ min: config.NICK_MIN, max: config.NICK_MAX });
  const tokens = new TokenService();
  const leaderboard = new Leaderboard({ players: state.players, size: config.LEADERBOARD_SIZE });
  const items = new ItemService({ state, spawner, events, ttlMs: config.ITEM_TTL_MS });
  const scoring = new ScoringService({ state, items, leaderboard, events, logger });

  const handlers = [
    new JoinHandler({
      state, tokens, nickPolicy, spawner, events, factory: new PlayerFactory(), maxPlayers: config.MAX_PLAYERS,
    }),
    new MoveHandler({ state, board, scoring, events, cooldownMs: config.MOVE_COOLDOWN_MS }),
    new SetNickHandler({ state, nickPolicy, events }),
    new DisconnectHandler({ state, events }),
    new TickHandler([
      new RoundTimerTask({ state, leaderboard, events, durationMs: config.ROUND_DURATION_MS }),
      new ItemExpiryTask({ state, items }),
      new PresenceTask({ state, events, rules: config }),
    ]),
  ];

  const engine = new GameEngine({
    state, events, handlers, items, leaderboard, board, rules: config,
    deltas: new DeltaBuffer(config.DELTA_BUFFER_SIZE),
  });
  return { engine, queue: new CommandQueue(), board };
}

module.exports = { createGame };
