'use strict';

/** Реестр активных сессий и привязка «игрок - сессия» (одна активная сессия на игрока). */
class SessionRegistry {
  #sessions = new Set();
  #byPlayer = new Map();

  add(session) { this.#sessions.add(session); }

  remove(session) {
    this.#sessions.delete(session);
    if (session.playerId && this.#byPlayer.get(session.playerId) === session) this.#byPlayer.delete(session.playerId);
  }

  /** Привязывает сессию к игроку. возвр вытесненная предыдущая сессия того же игрока */
  bind(session, playerId) {
    const previous = this.#byPlayer.get(playerId) ?? null;
    if (previous && previous !== session) {
      previous.joined = false;
      this.#byPlayer.delete(playerId);
    }
    session.playerId = playerId;
    session.joined = true;
    this.#byPlayer.set(playerId, session);
    return previous && previous !== session ? previous : null;
  }

  byPlayer(playerId) { return this.#byPlayer.get(playerId) ?? null; }
  all() { return [...this.#sessions]; }
  joined() { return this.all().filter((s) => s.joined); }
  joinedCount() { return this.#byPlayer.size; }
}

module.exports = { SessionRegistry };
