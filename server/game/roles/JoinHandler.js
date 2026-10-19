'use strict';

const { CommandType } = require('../infrastructure/commands'); 
const { Event, ErrorCode } = require('../../../public/protocol');

/**
 * Вход / восстановление сессии.
 *  - валидный токен - тот же игрок (если ещё на поле - просто «снова онлайн», иначе появляется заново с сохранённым счётом);
 *  - иначе регистрируется новый игрок по нику.
 */
class JoinHandler {
  type = CommandType.JOIN;
  #state;
  #tokens;
  #nickPolicy;
  #factory;
  #spawner;
  #maxPlayers;
  #events;

  constructor({ state, tokens, nickPolicy, factory, spawner, maxPlayers, events }) {
    this.#state = state;
    this.#tokens = tokens;
    this.#nickPolicy = nickPolicy;
    this.#factory = factory;
    this.#spawner = spawner;
    this.#maxPlayers = maxPlayers;
    this.#events = events;
  }

  execute(cmd) {
    const known = this.#tokens.isWellFormed(cmd.token)
      ? this.#state.players.findByTokenHash(this.#tokens.hash(cmd.token))
      : null;
    return known ? this.#resume(known, cmd) : this.#register(cmd);
  }

  #resume(player, cmd) {
    if (player.onField) {
      const wasOffline = !player.isOnline;
      const wasAfk = player.afk;
      player.markOnline(cmd.now);
      if (wasOffline) this.#events.emit(Event.PLAYER_ONLINE, { playerId: player.id, nick: player.nick });
      if (wasAfk) this.#events.emit(Event.PLAYER_AFK, { playerId: player.id, afk: false });
    } else {
      if (this.#state.players.fieldCount() >= this.#maxPlayers) return this.#fail(ErrorCode.ROOM_FULL, 'Комната заполнена');
      this.#placeOnField(player, cmd.now);
    }
    this.#state.changes.markPlayer(player);
    return { ok: true, player, token: cmd.token, resumed: true };
  }

  #register(cmd) {
    const checked = this.#nickPolicy.validate(cmd.nick);
    if (!checked.ok) return this.#fail(ErrorCode.BAD_NICK, checked.message);
    const { players } = this.#state;
    if (players.isNickTaken(checked.nick)) return this.#fail(ErrorCode.BAD_NICK, 'Этот ник уже занят');
    if (players.fieldCount() >= this.#maxPlayers) return this.#fail(ErrorCode.ROOM_FULL, 'Комната заполнена');

    const { token, hash } = this.#tokens.issue();
    const player = this.#factory.create({
      nick: checked.nick, tokenHash: hash, now: cmd.now,
      usedColors: players.onField().map((p) => p.color),
    });
    players.add(player);
    this.#placeOnField(player, cmd.now);
    this.#state.changes.markPlayer(player);
    return { ok: true, player, token, resumed: false };
  }

  #placeOnField(player, now) {
    const cell = this.#spawner.pickPlayerCell(this.#state.item);
    player.placeAt(cell.x, cell.y, now);
    this.#events.emit(Event.PLAYER_JOINED, { player: player.toDto() });
  }

  #fail(code, message) { return { ok: false, code, message }; }
}

module.exports = { JoinHandler };
