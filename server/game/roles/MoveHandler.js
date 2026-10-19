'use strict';

const { CommandType } = require('../infrastructure/commands.js')
const { Event, RejectReason } = require('../../../public/protocol');

/**
 * Ход игрока. Конфликт «двое шагнули на предмет»: побеждает тот, чья команда
 * извлечена из очереди первой; после захвата itemId меняется, поэтому второй ход
 * - обычное перемещение без очка. clientTime не используется (только телеметрия).
 */

//игрок на поле - направление -  кулдаун - границы - применить ход - если пришёл на предмет, начислить очко
class MoveHandler {
  type = CommandType.MOVE;
  #state;
  #board;
  #cooldownMs;
  #scoring;
  #events;

  constructor({ state, board, cooldownMs, scoring, events }) {
    this.#state = state;
    this.#board = board;
    this.#cooldownMs = cooldownMs;
    this.#scoring = scoring;
    this.#events = events;
  }

  execute(cmd) {
    const player = this.#state.players.get(cmd.playerId);
    if (!player || !player.onField) return this.#reject(cmd, RejectReason.AFK, null);

    const target = this.#board.neighbor(player, cmd.dir);
    if (!target) return this.#reject(cmd, RejectReason.INVALID_DIR, player);

    // Команды, пришедшие чаще кулдауна, отбрасываются (не ставятся в очередь).
    //кулдаун сч от времени прихода пакета, а не обработки
    if (cmd.receivedAt - player.lastMoveAt < this.#cooldownMs) return this.#reject(cmd, RejectReason.COOLDOWN, player);
    if (!this.#board.contains(target.x, target.y)) return this.#reject(cmd, RejectReason.OUT_OF_BOUNDS, player);

    player.lastMoveAt = cmd.receivedAt;
    const wasAfk = player.touch(cmd.now);
    player.moveTo(target.x, target.y);
    this.#state.changes.markPlayer(player);

    if (wasAfk) this.#events.emit(Event.PLAYER_AFK, { playerId: player.id, afk: false });
    this.#events.emit(Event.PLAYER_MOVED, { playerId: player.id, x: target.x, y: target.y });

    const item = this.#state.item;
    if (item && item.isAt(target.x, target.y)) this.#scoring.award(player, cmd.now);
    return { ok: true, cseq: cmd.cseq, x: target.x, y: target.y };
  }

  #reject(cmd, reason, player) {
    return { ok: false, cseq: cmd.cseq, reason, x: player?.x ?? null, y: player?.y ?? null };
  }
}

module.exports = { MoveHandler };
