'use strict';

/**
 * Порт хранилища (интерфейс). Игровое ядро и планировщик зависят только от него,
 *  Supabase можно заменить на любое другое 
 */
class Persistence {
  async load() { throw new Error('not implemented'); }
  async savePlayers(players) { throw new Error('not implemented'); }
  async appendAwards(awards) { throw new Error('not implemented'); }
  async saveMeta(meta) { throw new Error('not implemented'); }
}

module.exports = { Persistence };
