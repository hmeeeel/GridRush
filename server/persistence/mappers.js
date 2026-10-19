'use strict';

const { Player } = require('../game/entities');

const iso = (ms) => new Date(ms).toISOString();

/** Преобразование доменных объектов <-> строк БД (snake_case). */
const playerToRecord = (p) => ({
  id: p.id,
  token_hash: p.tokenHash,
  nick: p.nick,
  color: p.color,
  score: p.score,
  x: p.x,
  y: p.y,
  on_field: p.onField,
  created_at: iso(p.createdAt),
  last_seen_at: iso(p.lastSeenAt),
});

const playerFromRecord = (r) => new Player({
  id: r.id,
  tokenHash: r.token_hash,
  nick: r.nick,
  color: r.color,
  score: r.score,
  x: r.x,
  y: r.y,
  onField: r.on_field,
  createdAt: Date.parse(r.created_at),
  lastSeenAt: Date.parse(r.last_seen_at),
});

const metaToRecord = (m) => ({
  id: 1,
  state_version: m.stateVersion,
  total_items_collected: m.totalItemsCollected,
  schema_version: m.schemaVersion,
  round_number: m.roundNumber,
  item: m.item,
  updated_at: iso(Date.now()),
});

const metaFromRecord = (r) => ({
  stateVersion: Number(r.state_version),
  totalItemsCollected: Number(r.total_items_collected),
  schemaVersion: r.schema_version,
  roundNumber: r.round_number,
  item: r.item ?? null,
});

const awardToRecord = (a) => ({ ts: iso(a.ts), player_id: a.playerId, item_id: a.itemId, x: a.x, y: a.y });

module.exports = { playerToRecord, playerFromRecord, metaToRecord, metaFromRecord, awardToRecord };
