'use strict';

const { CommandType } = require('../infrastructure/commands.js');
const { Event } = require('../../../public/protocol');

/** Потеря соединения: игрок остаётся на поле (offline) до истечения RECONNECT_GRACE_MS. */
class DisconnectHandler {
  type = CommandType.DISCONNECT;
  #state;
  #events;

  constructor({ state, events }) {
    this.#state = state;
    this.#events = events;
  }

  execute(cmd) {
    // cmd.guard - предусловие, проверяемое в момент исполнения (а не постановки в очередь):
    // если за это время игрок уже вошёл с другого соединения, отключать его нельзя.
    if (cmd.guard && !cmd.guard()) return { ok: true };
    const player = this.#state.players.get(cmd.playerId);
    if (!player || !player.onField || !player.isOnline) return { ok: true };
    player.markOffline(cmd.now);
    this.#state.changes.markPlayer(player);
    this.#events.emit(Event.PLAYER_OFFLINE, { playerId: player.id, nick: player.nick });
    return { ok: true };
  }
}

module.exports = { DisconnectHandler };
