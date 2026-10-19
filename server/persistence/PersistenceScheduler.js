'use strict';

/**
 * Write-behind: раз в PERSIST_INTERVAL_MS сбрасывает накопленные изменения в хранилище.
 * 
 * запись - игроки - начисления - мета
 * 
 * Ошибка сохранения не теряет данные - пачка возвращается в трекер и уйдёт со следующим сбросом.
 */
class PersistenceScheduler {
  #persistence; #engine; #intervalMs; #logger;
  #timer = null;
  #inFlight = null;

  constructor({ persistence, engine, intervalMs, logger }) {
    this.#persistence = persistence;
    this.#engine = engine;
    this.#intervalMs = intervalMs;
    this.#logger = logger;
  }

  start() { if (!this.#timer) this.#timer = setInterval(() => this.flush(), this.#intervalMs); }

  flush() {
    if (!this.#inFlight) this.#inFlight = this.#doFlush().finally(() => { this.#inFlight = null; });
    return this.#inFlight;
  }

  /** Останавливает таймер и принудительно сохраняет всё накопленное. */
  async stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    await this.#inFlight;
    await this.flush();
  }

  async #doFlush() {
    const { changes } = this.#engine.state;
    const batch = changes.drain();
    if (!batch.players.length && !batch.awards.length && !batch.meta) return;
    try {
      // порядок важен: score_log ссылается на players
      await this.#persistence.savePlayers(batch.players);
      await this.#persistence.appendAwards(batch.awards);
      if (batch.meta) await this.#persistence.saveMeta(this.#engine.exportMeta());
    } catch (err) {
      changes.restore(batch);
      this.#logger.error('Persist failed, will retry', err);
    }
  }
}

module.exports = { PersistenceScheduler };
