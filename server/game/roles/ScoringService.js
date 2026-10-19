'use strict';

const { Event } = require('../../../public/protocol');

/**
 * Начисление очка
 */
class ScoringService {
  #state;
  #items;
  #leaderboard;
  #events;
  #logger;

  constructor({ state, items, leaderboard, events, logger }) {
    this.#state = state;
    this.#items = items;
    this.#leaderboard = leaderboard;
    this.#events = events;
    this.#logger = logger;
  }

  //проверить item.claimed, поставить его, начислить очко, записать в лог начислений, эмитить SCORE и сразу создать новый предмет
  award(player, now) {
    const item = this.#state.item;
    if (!item || item.claimed) {
      this.#logger.error(`INTERNAL: duplicate award rejected (player=${player.id}, item=${item?.id})`);
      return false;
    }
    item.claimed = true;
    player.score += 1;
    player.roundScore += 1;
    this.#state.totalItemsCollected += 1;

    const { changes } = this.#state;
    changes.recordAward({ ts: now, playerId: player.id, itemId: item.id, x: item.x, y: item.y });
    changes.markPlayer(player);
    changes.markMeta();

    this.#events.emit(Event.SCORE, {
      playerId: player.id, nick: player.nick, itemId: item.id, x: item.x, y: item.y,
      score: player.score, roundScore: player.roundScore,
      leaderboardAllTime: this.#leaderboard.allTime(),
    });
    this.#items.spawn(now, 'COLLECTED');
    return true;
  }
}

module.exports = { ScoringService };
