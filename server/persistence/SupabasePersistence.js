'use strict';

const { Persistence } = require('./Persistence');
const m = require('./mappers');

const PAGE_SIZE = 1000; // лимит строк PostgREST по умолчанию

/**
 * Хранилище в Supabase через REST (PostgREST). Без SDK: только fetch.
 * Используется service_role-ключ - он живёт ТОЛЬКО на сервере и никогда не попадает в клиент.
 */
class SupabasePersistence extends Persistence {
  #base;
  #key;
  #timeoutMs;
  #fetch;

  constructor({ url, serviceKey, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
    super();
    this.#base = `${url.replace(/\/+$/, '')}/rest/v1`;
    this.#key = serviceKey;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImpl;
  }

  async load() {
    const [records, metaRows] = await Promise.all([
      this.#selectAll('players', 'created_at.asc'),
      this.#request('GET', 'game_state?id=eq.1&select=*'),
    ]);
    return {
      meta: metaRows.length ? m.metaFromRecord(metaRows[0]) : null,
      players: records.map(m.playerFromRecord),
    };
  }

  async savePlayers(players) {
    if (!players.length) return;
    await this.#request('POST', 'players?on_conflict=id', {
      body: players.map(m.playerToRecord),
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async appendAwards(awards) {
    if (!awards.length) return;
    await this.#request('POST', 'score_log?on_conflict=item_id', {
      body: awards.map(m.awardToRecord),
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
  }

  async saveMeta(meta) {
    await this.#request('POST', 'game_state?on_conflict=id', {
      body: [m.metaToRecord(meta)],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  async #selectAll(table, order) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await this.#request('GET', `${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }

  async #request(method, path, { body, prefer } = {}) {
    const headers = { apikey: this.#key, Authorization: `Bearer ${this.#key}` };
    if (body) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const res = await this.#fetch(`${this.#base}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Supabase ${method} ${path.split('?')[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return method === 'GET' ? res.json() : null;
  }
}

module.exports = { SupabasePersistence };
