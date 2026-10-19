'use strict';

const { CommandType } = require('../infrastructure/commands.js');

/** Периодическое обслуживание: набор независимых задач (раунд, предмет, присутствие). */
class TickHandler {
  type = CommandType.TICK;
  #tasks;

  constructor(tasks) {
    this.#tasks = tasks;
  }

  execute(cmd) {
    for (const task of this.#tasks) task.run(cmd.now);
    return { ok: true };
  }
}

module.exports = { TickHandler };
