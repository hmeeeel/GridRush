'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

class Logger {
  #scope;
  #level;

  constructor(scope = 'app', level = 'info') {
    this.#scope = scope;
    this.#level = level;
  }

  child(scope) { return new Logger(`${this.#scope}:${scope}`, this.#level); }

  debug(msg, meta) { this.#write('debug', msg, meta); }
  info(msg, meta) { this.#write('info', msg, meta); }
  warn(msg, meta) { this.#write('warn', msg, meta); }
  error(msg, meta) { this.#write('error', msg, meta); }

  #write(level, msg, meta) {
    if (LEVELS[level] < (LEVELS[this.#level] ?? LEVELS.info)) return;
    let line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.#scope}] ${msg}`;
    if (meta !== undefined) line += ` ${meta instanceof Error ? meta.stack : JSON.stringify(meta)}`;
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  }
}

module.exports = { Logger };
