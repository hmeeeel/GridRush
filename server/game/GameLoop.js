'use strict';

const { CommandType } = require('./infrastructure/commands.js');
const { ErrorCode } = require('../../public/protocol');

/**
 * Игровой цикл: каждые TICK_MS
 *  1) обрабатывает накопленную очередь в порядке поступления,
 *  2) выполняет обслуживание (таймеры),
 *  3) рассылает дельту (только если версия изменилась),
 *  4) отправляет отправителям результаты их команд.
 */
class GameLoop {
  #engine; #queue; #broadcaster; #tickMs; #clock; #logger;
  #timer = null;

  constructor({ engine, queue, broadcaster, tickMs, clock = Date.now, logger }) {
    this.#engine = engine;
    this.#queue = queue;
    this.#broadcaster = broadcaster;
    this.#tickMs = tickMs;
    this.#clock = clock;
    this.#logger = logger;
  }

  start() { if (!this.#timer) this.#timer = setInterval(() => this.tick(), this.#tickMs); }
  stop() { clearInterval(this.#timer); this.#timer = null; }

  tick() {
    const now = this.#clock();
    const results = [];
    for (const { cmd, onResult } of this.#queue.drain()) {
      cmd.now = now;
      let result;
      try {
        result = this.#engine.applyCommand(cmd);
      } catch (err) {
        this.#logger.error(`Command ${cmd.type} failed`, err);
        result = { ok: false, code: ErrorCode.INTERNAL, message: 'Internal error' };
      }
      if (onResult) results.push([onResult, result]);
    }
    try {
      this.#engine.applyCommand({ type: CommandType.TICK, now });
    } catch (err) {
      this.#logger.error('Maintenance tick failed', err);
    }

    const delta = this.#engine.flushDelta();
    if (delta) this.#broadcaster.broadcastDelta(delta);

    for (const [onResult, result] of results) {
      try {
        onResult(result);
      } catch (err) {
        this.#logger.error('Result callback failed', err);
      }
    }
  }
}

module.exports = { GameLoop };
