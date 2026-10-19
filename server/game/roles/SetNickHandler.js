'use strict';

const { CommandType } = require('../infrastructure/commands.js');
const { Event, ErrorCode } = require('../../../public/protocol');

// Смена ника. Отключение: игрок остаётся на поле как «offline». 
// В отключении нужна проверка «а не вошёл ли игрок уже с другого соединения», иначе случится гонка.
class SetNickHandler {
  type = CommandType.SET_NICK;
  #state;
  #nickPolicy;
  #events;

  constructor({ state, nickPolicy, events }) {
    this.#state = state;
    this.#nickPolicy = nickPolicy;
    this.#events = events;
  }

  execute(cmd) {
    const player = this.#state.players.get(cmd.playerId);
    if (!player) return { ok: false, code: ErrorCode.INTERNAL, message: 'Игрок не найден' };
    const checked = this.#nickPolicy.validate(cmd.nick);
    if (!checked.ok) return { ok: false, code: ErrorCode.BAD_NICK, message: checked.message };
    if (this.#state.players.isNickTaken(checked.nick, player.id)) {
      return { ok: false, code: ErrorCode.BAD_NICK, message: 'Этот ник уже занят' };
    }
    if (checked.nick !== player.nick) {
      const oldNick = player.nick;
      this.#state.players.rename(player, checked.nick);
      player.touch(cmd.now);
      this.#state.changes.markPlayer(player);
      this.#events.emit(Event.NICK_CHANGED, { playerId: player.id, oldNick, nick: checked.nick });
    }
    return { ok: true, nick: checked.nick };
  }
}

module.exports = { SetNickHandler };
