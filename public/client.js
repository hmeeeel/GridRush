/* Слои: GameConnection (транспорт) - GameModel (состояние + предсказание) -
 *       Renderer (canvas) / Hud (DOM) / InputController (ввод) - App (связывание). */
(() => {
  'use strict';
  const P = window.Protocol;
  const $ = (id) => document.getElementById(id);
  const FONT = '"Golos Text", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const plural = (n, [one, few, many]) => {
    const a = Math.abs(n) % 100; const b = a % 10;
    return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  };

  // Шрифт подгружается после load и не блокирует ни отрисовку, ни игру; без него работает системный шрифт.
  window.addEventListener('load', () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;800&display=swap';
    document.head.append(link);
  });

  /* ───────────────────────── инфраструктура ───────────────────────── */
  class Emitter {
    #handlers = new Map();
    on(type, fn) {
      if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
      this.#handlers.get(type).add(fn);
      return () => this.#handlers.get(type).delete(fn);
    }
    emit(type, ...args) { this.#handlers.get(type)?.forEach((fn) => fn(...args)); }
  }

  class SafeStorage {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } }
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* приватный режим */ } }
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  }

  /* ───────────────────────── транспорт ─────────────────────────────── */
  const ConnState = Object.freeze({
    CONNECTING: 'CONNECTING', ONLINE: 'ONLINE', RECONNECTING: 'RECONNECTING', OFFLINE: 'OFFLINE', HALTED: 'HALTED',
  });

  /**
    автопереподключение с растущей паузой, сторожок «сервер молчит 35 с», 
    события окна online/offline, номера cseq, в HELLO уходят токен и последняя версия. 
    Коды 4003/4004/4005 переподключения не запускают.
   */
  class GameConnection extends Emitter {
    static WATCHDOG_MS = 35_000;
    static NO_RETRY = new Set([P.CloseCode.PROTOCOL_VERSION, P.CloseCode.ROOM_FULL, P.CloseCode.SESSION_REPLACED]);

    #url; #helloFactory; #ws = null; #state = ConnState.CONNECTING; #attempt = 0; #everOnline = false;
    #retryTimer = 0; #watchdog = 0; #cseq = 0; #delayFloor = 0; #halted = false;
    started = false;

    constructor(url, helloFactory) {
      super();
      this.#url = url;
      this.#helloFactory = helloFactory;
      window.addEventListener('online', () => this.reconnectNow());
      window.addEventListener('offline', () => this.#goOffline());
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.#state !== ConnState.ONLINE) this.reconnectNow(); });
    }

    get state() { return this.#state; }
    get cseq() { return this.#cseq; }

    connect() {
      this.started = true;
      this.#halted = false;
      this.#attempt = 0;
      this.#dropSocket();
      this.#open();
    }

    reconnectNow() {
      if (!this.started || this.#halted) return;
      this.#dropSocket();
      this.#attempt = 0;
      this.#open();
    }

    sendHello() { this.#send(P.Client.HELLO, this.#helloFactory()); }

    /** Отправляет команду с монотонным cseq. возвр cseq или null, если не онлайн */
    sendCommand(type, payload) {
      if (this.#state !== ConnState.ONLINE) return null;
      const cseq = ++this.#cseq;
      this.#send(type, { cseq, ...payload });
      return cseq;
    }

    #open() {
      clearTimeout(this.#retryTimer);
      if (navigator.onLine === false) return this.#goOffline();
      this.#setState(this.#everOnline ? ConnState.RECONNECTING : ConnState.CONNECTING);
      let ws;
      try { ws = new WebSocket(this.#url); } catch { return this.#scheduleRetry(); }
      this.#ws = ws;
      ws.onopen = () => { if (ws === this.#ws) { this.sendHello(); this.#armWatchdog(); } };
      ws.onmessage = (ev) => { if (ws === this.#ws) { this.#armWatchdog(); this.#onRaw(ev.data); } };
      ws.onclose = (ev) => { if (ws === this.#ws) { this.#ws = null; this.#onClosed(ev.code); } };
      ws.onerror = () => { /* за ошибкой всегда следует close */ };
    }

    #onRaw(raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === P.Server.PING) {
        this.#send(P.Client.PONG, { t: msg.t });
        this.emit('ping', msg);
        return;
      }
      if (msg.type === P.Server.WELCOME) {
        this.#attempt = 0;
        this.#everOnline = true;
        this.#setState(ConnState.ONLINE);
      } else if (msg.type === P.Server.SERVER_SHUTDOWN) {
        this.#delayFloor = Number(msg.retryAfterMs) || 0;
      }
      this.emit('message', msg);
    }

    #onClosed(code) {
      clearTimeout(this.#watchdog);
      if (GameConnection.NO_RETRY.has(code)) {
        this.#halted = true;
        this.#setState(ConnState.HALTED);
        return;
      }
      this.#scheduleRetry();
    }

    #scheduleRetry() {
      if (navigator.onLine === false) return this.#goOffline();
      this.#setState(this.#everOnline ? ConnState.RECONNECTING : ConnState.CONNECTING);
      const base = Math.min(5000, 400 * 2 ** this.#attempt++);
      const delay = Math.max(this.#delayFloor, base) * (0.75 + Math.random() * 0.5);
      this.#delayFloor = 0;
      this.#retryTimer = setTimeout(() => this.#open(), delay);
    }

    #goOffline() {
      if (!this.started || this.#halted) return;
      clearTimeout(this.#retryTimer);
      this.#dropSocket();
      this.#setState(ConnState.OFFLINE);
    }

    #armWatchdog() {
      clearTimeout(this.#watchdog);
      this.#watchdog = setTimeout(() => { this.#dropSocket(); this.#scheduleRetry(); }, GameConnection.WATCHDOG_MS);
    }

    #dropSocket() {
      clearTimeout(this.#watchdog);
      const ws = this.#ws;
      this.#ws = null;
      if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; try { ws.close(1000); } catch { /* ignore */ } }
    }

    #send(type, payload) {
      if (this.#ws && this.#ws.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type, v: P.VERSION, ...payload }));
    }

    #setState(state) {
      if (state === this.#state) return;
      this.#state = state;
      this.emit('state', state);
    }
  }

  /* ───────────────────────── модель состояния ─────────────────────── */
  /**
   * Копия серверного состояния. Клиент ничего не предсказывает: сервер авторитетный,
   * на экране ровно то, что пришло в SNAPSHOT / DELTA.
   * Главное: проверка baseVersion (разрыв версий - переподключение и полный SNAPSHOT).
   */
  class GameModel extends Emitter {
    #on;
    #selfLeftReason = null;

    constructor() {
      super();
      this.players = new Map();
      this.item = null;
      this.round = null;
      this.leaderboard = [];
      this.version = null;
      this.selfId = null;
      this.config = null;
      this.clockOffset = 0;
      const E = P.Event;
      this.#on = {
        [E.PLAYER_JOINED]: (e) => { this.players.set(e.player.id, { ...e.player }); },
        [E.PLAYER_LEFT]: (e) => {
          this.players.delete(e.playerId);
          if (e.playerId === this.selfId) this.#selfLeftReason = e.reason;
        },
        [E.PLAYER_OFFLINE]: (e) => this.#patch(e.playerId, { online: false }),
        [E.PLAYER_ONLINE]: (e) => this.#patch(e.playerId, { online: true }),
        [E.PLAYER_AFK]: (e) => this.#patch(e.playerId, { afk: e.afk }),
        [E.PLAYER_MOVED]: (e) => this.#patch(e.playerId, { x: e.x, y: e.y }),
        [E.SCORE]: (e) => {
          this.#patch(e.playerId, { score: e.score, roundScore: e.roundScore });
          this.leaderboard = e.leaderboardAllTime;
          this.emit('score', e);
        },
        [E.ITEM_SPAWNED]: (e) => { this.item = e.item; },
        [E.NICK_CHANGED]: (e) => {
          this.#patch(e.playerId, { nick: e.nick });
          for (const row of this.leaderboard) if (row.playerId === e.playerId) row.nick = e.nick;
        },
        [E.ROUND_ENDED]: (e) => this.emit('round-ended', e),
        [E.ROUND_STARTED]: (e) => {
          this.round = { number: e.round, endsAt: e.endsAt };
          for (const p of this.players.values()) p.roundScore = 0;
        },
      };
    }

    get self() { return this.players.get(this.selfId) ?? null; }
    serverNow() { return Date.now() + this.clockOffset; }
    syncClock(serverTime) { this.clockOffset = serverTime - Date.now(); }

    setSession({ playerId, config, serverTime }) {
      this.selfId = playerId;
      this.config = config;
      this.syncClock(serverTime);
      this.emit('config');
    }

    applySnapshot(s) {
      this.players = new Map(s.players.map((p) => [p.id, { ...p }]));
      this.item = s.item;
      this.round = s.round;
      this.leaderboard = s.leaderboardAllTime;
      this.version = s.stateVersion;
      this.emit('change');
    }

    /** @returns {boolean} false, если нарушена непрерывность версий (нужна ресинхронизация) */
    applyDelta(d) {
      if (this.version === null || d.baseVersion !== this.version) return false;
      this.#selfLeftReason = null;
      for (const e of d.events) {
        this.#on[e.type]?.(e);
        this.emit('event', e);
      }
      this.version = d.stateVersion;
      this.emit('change');
      // «убрали с поля» - только если после всей дельты (напр. догона после реконнекта) игрока на поле так и нет
      if (this.#selfLeftReason && this.selfId && !this.players.has(this.selfId)) this.emit('self-left', this.#selfLeftReason);
      this.#selfLeftReason = null;
      return true;
    }

    /** Не шлём ход в стену: сервер всё равно ответил бы OUT_OF_BOUNDS. */
    canStep(dir) {
      const me = this.self;
      const v = P.DirVector[dir];
      if (!me || !v || !this.config) return false;
      const x = me.x + v.dx; const y = me.y + v.dy;
      return x >= 0 && y >= 0 && x < this.config.W && y < this.config.H;
    }

    #patch(id, fields) {
      const p = this.players.get(id);
      if (p) Object.assign(p, fields);
    }
  }

  /* ───────────────────────── отрисовка поля ────────────────────────── */
  /** Рисует модель «как есть»: без анимаций и сглаживания, один проход на кадр. */
  class Renderer {
    #canvas; #wrap; #model; #ctx; #c;
    #cell = 0; #dpr = 1; #flashes = []; #hover = null;

    constructor(canvas, wrap, model) {
      this.#canvas = canvas;
      this.#wrap = wrap;
      this.#model = model;
      this.#ctx = canvas.getContext('2d');
      const css = getComputedStyle(document.documentElement); // цвета берём из CSS-переменных один раз
      const v = (name) => css.getPropertyValue(name).trim();
      this.#c = { grid: v('--grid'), ink: v('--ink'), pen: v('--pen'), marker: v('--marker'), paper: v('--paper-hi') };
      new ResizeObserver(() => this.resize()).observe(wrap);
      model.on('config', () => this.resize());
      model.on('score', (e) => this.#flashes.push({ x: e.x, y: e.y, t0: performance.now() }));
      canvas.addEventListener('pointermove', (ev) => this.#hoverAt(ev));
      canvas.addEventListener('pointerdown', (ev) => this.#hoverAt(ev));
      // у касания pointerleave приходит сразу после pointerup, поэтому подпись гасим только для мыши (иначе она мигнёт и пропадёт)
      canvas.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') this.#hover = null; });
    }

    start() {
      const loop = () => { requestAnimationFrame(loop); this.#draw(); };
      loop();
    }

    resize() {
      const cfg = this.#model.config;
      if (!cfg) return;
      const rect = this.#wrap.getBoundingClientRect();
      this.#cell = Math.max(10, Math.floor(Math.min(rect.width / cfg.W, rect.height / cfg.H)));
      this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.#cell * cfg.W; const h = this.#cell * cfg.H;
      this.#canvas.width = Math.round(w * this.#dpr);
      this.#canvas.height = Math.round(h * this.#dpr);
      this.#canvas.style.width = `${w}px`;
      this.#canvas.style.height = `${h}px`;
      this.#wrap.style.setProperty('--board-ratio', `${cfg.W} / ${cfg.H}`);
    }

    #draw() {
      const cfg = this.#model.config;
      if (!cfg || !this.#cell) return;
      const ctx = this.#ctx; const cell = this.#cell; const now = performance.now();
      ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
      ctx.clearRect(0, 0, cfg.W * cell, cfg.H * cell);
      this.#drawGrid(cfg, cell);
      this.#drawFlashes(cell, now);
      this.#drawItem(cell);
      this.#drawPlayers(cell);
      this.#drawHover(cell, now);
    }

    #drawGrid(cfg, cell) {
      const ctx = this.#ctx;
      ctx.strokeStyle = this.#c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < cfg.W; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, cfg.H * cell); }
      for (let y = 1; y < cfg.H; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(cfg.W * cell, y * cell + 0.5); }
      ctx.stroke();
    }

    /** Подсветка клетки в момент получения очка (кем-либо): жёлтая заливка гаснет за 0,6 с. */
    #drawFlashes(cell, now) {
      this.#flashes = this.#flashes.filter((f) => now - f.t0 < 600);
      for (const f of this.#flashes) {
        this.#ctx.fillStyle = `rgba(255, 224, 102, ${0.8 * (1 - (now - f.t0) / 600)})`;
        this.#ctx.fillRect(f.x * cell, f.y * cell, cell, cell);
      }
    }

    /** Предмет: красная точка; кольцо вокруг неё «выгорает» по мере истечения времени жизни. */
    #drawItem(cell) {
      const m = this.#model; const item = m.item;
      if (!item) return;
      const left = clamp((item.expiresAt - m.serverNow()) / m.config.itemTtlMs, 0, 1);
      const ctx = this.#ctx; const cx = (item.x + 0.5) * cell; const cy = (item.y + 0.5) * cell;
      ctx.lineWidth = cell * 0.09;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(22, 35, 59, 0.15)';
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = this.#c.pen;
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
      ctx.fillStyle = this.#c.pen;
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.17, 0, Math.PI * 2); ctx.fill();
    }

    #drawPlayers(cell) {
      const m = this.#model; const ctx = this.#ctx; const c = this.#c;
      const stack = new Map(); // игроки в одной клетке сдвигаются, чтобы не закрывать друг друга
      const ordered = [...m.players.values()].sort((a, b) => (a.id === m.selfId) - (b.id === m.selfId)); // свой - сверху
      for (const p of ordered) {
        const key = `${p.x},${p.y}`;
        const n = stack.get(key) ?? 0; stack.set(key, n + 1);
        const size = cell * 0.74; const off = n * cell * 0.13;
        const x = p.x * cell + (cell - size) / 2 + off; const y = p.y * cell + (cell - size) / 2 + off;

        ctx.globalAlpha = !p.online ? 0.4 : p.afk ? 0.65 : 1; // offline бледнее всего, AFK - слегка
        if (p.id === m.selfId) { // жёлтый маркер под своим игроком
          ctx.fillStyle = c.marker;
          this.#roundRect(x - cell * 0.09, y - cell * 0.09, size + cell * 0.18, size + cell * 0.18, cell * 0.2);
          ctx.fill();
        }
        ctx.fillStyle = p.color;
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = Math.max(2, cell * 0.07);
        this.#roundRect(x, y, size, size, cell * 0.16);
        ctx.fill(); ctx.stroke();

        const small = cell < 26; // на мелких клетках — одна буква, но крупнее
        ctx.fillStyle = this.#isLight(p.color) ? c.ink : '#ffffff';
        ctx.font = `800 ${Math.round(cell * (small ? 0.52 : 0.34))}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText([...p.nick].slice(0, small ? 1 : 2).join('').toUpperCase(), x + size / 2, y + size / 2 + cell * 0.02);
        if (p.afk) {
          ctx.fillStyle = c.ink; ctx.font = `800 ${Math.round(cell * 0.26)}px ${FONT}`;
          ctx.fillText('z', x + size - cell * 0.04, y + cell * 0.04);
        }
        ctx.globalAlpha = 1;
      }
    }

    /** Ник игрока над фигурой: при наведении мыши или касании (2,5 с). */
    #hoverAt(ev) {
      if (!this.#cell) return;
      const r = this.#canvas.getBoundingClientRect();
      const gx = (ev.clientX - r.left) / this.#cell - 0.5;
      const gy = (ev.clientY - r.top) / this.#cell - 0.5;
      let best = null; let bestD = 0.8;
      for (const p of this.#model.players.values()) {
        const d = Math.hypot(p.x - gx, p.y - gy);
        if (d < bestD) { best = p.id; bestD = d; }
      }
      this.#hover = best ? { id: best, until: performance.now() + 2500 } : null;
    }

    #drawHover(cell, now) {
      if (!this.#hover || now > this.#hover.until) return;
      const p = this.#model.players.get(this.#hover.id);
      if (!p) return;
      const ctx = this.#ctx;
      ctx.font = `600 ${Math.max(12, Math.round(cell * 0.32))}px ${FONT}`;
      const w = ctx.measureText(p.nick).width + 14; const h = Math.max(22, cell * 0.5);
      const x = clamp((p.x + 0.5) * cell - w / 2, 2, this.#model.config.W * cell - w - 2);
      const y = Math.max(2, p.y * cell - h - 4);
      ctx.fillStyle = this.#c.ink;
      this.#roundRect(x, y, w, h, 5); ctx.fill();
      ctx.fillStyle = this.#c.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.nick, x + w / 2, y + h / 2 + 1);
    }

    #roundRect(x, y, w, h, r) {
      const ctx = this.#ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    #isLight(hex) {
      const n = parseInt(hex.slice(1), 16);
      return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170;
    }
  }

  /* ───────────────────────── HUD, списки, диалоги ──────────────────── */
  const CONN_LABEL = {
    [ConnState.CONNECTING]: 'Подключение…', [ConnState.ONLINE]: 'Online', [ConnState.RECONNECTING]: 'Reconnecting…',
    [ConnState.OFFLINE]: 'Offline', [ConnState.HALTED]: 'Отключено', IDLE: 'Не в игре',
  };

  class Hud {
    #model; #feed = []; #toastTimer = 0; #el;

    constructor(model) {
      this.#model = model;
      this.#el = Object.fromEntries(['connBadge', 'hudNick', 'renameBtn', 'hudScore', 'hudTotal', 'hudTimer', 'hudOnline', 'hudPing',
        'rankRound', 'rankAll', 'feed', 'toast', 'veil', 'boardWrap'].map((id) => [id, $(id)]));
      this.#el.feed.append(this.#li('empty', 'Событий пока нет'));
    }

    setConnection(state) {
      const { connBadge, veil, boardWrap } = this.#el;
      connBadge.dataset.state = state;
      connBadge.textContent = CONN_LABEL[state];
      const stale = state === ConnState.RECONNECTING || state === ConnState.OFFLINE;
      boardWrap.classList.toggle('is-stale', stale);
      veil.hidden = !stale;
      veil.textContent = state === ConnState.OFFLINE ? 'Нет сети — ждём подключения' : 'Переподключение…';
    }

    render(rtt) {
      const m = this.#model; const me = m.self; const el = this.#el;
      el.hudNick.textContent = me ? me.nick : '';
      el.renameBtn.hidden = !me;
      el.hudScore.textContent = me ? me.roundScore : 0;
      el.hudTotal.textContent = me ? me.score : 0;
      el.hudOnline.textContent = [...m.players.values()].filter((p) => p.online).length;
      el.hudPing.textContent = rtt === null || rtt === undefined ? '–' : Math.round(rtt);
      this.#renderRanks(el.rankRound, [...m.players.values()]
        .sort((a, b) => b.roundScore - a.roundScore || a.nick.localeCompare(b.nick))
        .map((p) => ({ id: p.id, nick: p.nick, pts: p.roundScore, color: p.color, off: !p.online })), true);
      this.#renderRanks(el.rankAll, m.leaderboard.map((r) => ({ id: r.playerId, nick: r.nick, pts: r.score })), false);
    }

    #renderRanks(list, rows, withDot) {
      list.replaceChildren();
      if (!rows.length) { list.append(this.#li('empty', 'Пока никого')); return; }
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        if (r.id === this.#model.selfId) li.classList.add('is-self');
        if (r.off) li.classList.add('is-off');
        const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = i + 1;
        li.append(rank);
        if (withDot) { const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = r.color; li.append(dot); }
        const name = document.createElement('span'); name.className = 'name'; name.textContent = r.nick; // textContent = экранирование
        const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = r.pts;
        li.append(name, pts);
        list.append(li);
      });
    }

    tickTimer() {
      const round = this.#model.round;
      const left = round ? Math.max(0, Math.ceil((round.endsAt - this.#model.serverNow()) / 1000)) : null;
      this.#el.hudTimer.textContent = left === null ? '–:––' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    }

    pushFeed(event) {
      const line = this.#describe(event);
      if (!line) return;
      this.#feed.unshift({ ...line, time: new Date() });
      this.#feed.length = Math.min(this.#feed.length, 20);
      const list = this.#el.feed;
      list.replaceChildren(...this.#feed.map((f) => {
        const li = document.createElement('li'); li.className = `k-${f.kind}`;
        const time = document.createElement('time'); time.textContent = f.time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const text = document.createElement('span'); text.textContent = f.text;
        li.append(time, text);
        return li;
      }));
    }

    #describe(e) {
      const E = P.Event;
      switch (e.type) {
        case E.PLAYER_JOINED: return { kind: 'join', text: `${e.player.nick} присоединился` };
        case E.PLAYER_OFFLINE: return { kind: 'leave', text: `${e.nick} отключился` };
        case E.PLAYER_ONLINE: return { kind: 'join', text: `${e.nick} вернулся` };
        case E.PLAYER_LEFT: return e.reason === 'AFK' ? { kind: 'leave', text: `${e.nick} убран за неактивность` } : null;
        case E.SCORE: return { kind: 'score', text: `${e.nick} получил очко` };
        case E.NICK_CHANGED: return { kind: 'join', text: `${e.oldNick} теперь ${e.nick}` };
        default: return null;
      }
    }

    #li(cls, text) { const li = document.createElement('li'); li.className = cls; li.textContent = text; return li; }

    toast(text, ms = 4000) {
      const t = this.#el.toast;
      t.textContent = text; t.hidden = false;
      clearTimeout(this.#toastTimer);
      this.#toastTimer = setTimeout(() => { t.hidden = true; }, ms);
    }
  }

  /** Модальный диалог: вход, смена ника, служебные сообщения. */
  class Overlay {
    #root = $('overlay'); #title = $('ovTitle'); #text = $('ovText'); #field = $('ovField'); #input = $('ovInput');
    #error = $('ovError'); #primary = $('ovPrimary'); #secondary = $('ovSecondary'); #onPrimary = null; #onSecondary = null;

    constructor() {
      $('sheet').addEventListener('submit', (ev) => { ev.preventDefault(); this.#onPrimary?.(this.#input.value); });
      this.#secondary.addEventListener('click', () => this.#onSecondary?.());
    }

    get isOpen() { return !this.#root.hidden; }

    show({ title, text = '', input = null, primary, secondary = null, error = '' }) {
      this.#title.textContent = title;
      this.#text.textContent = text;
      this.#field.hidden = input === null;
      if (input !== null) this.#input.value = input;
      this.#error.textContent = error;
      this.#primary.textContent = primary.label; this.#onPrimary = primary.run;
      this.#secondary.hidden = !secondary;
      if (secondary) { this.#secondary.textContent = secondary.label; this.#onSecondary = secondary.run; }
      this.#root.hidden = false;
      (input !== null ? this.#input : this.#primary).focus();
    }

    setError(text) { this.#error.textContent = text; }
    hide() { this.#root.hidden = true; }
  }

  /* ───────────────────────── ввод ──────────────────────────────────── */
  const KEY_DIRS = {
    ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
  };

  /** Клавиатура (стрелки/WASD по физическим клавишам) и экранные кнопки. Удержание = повторы с периодом repeatMs(). */
  class InputController {
    #held = []; #timer = 0; #onDirection; #repeatMs;

    constructor({ onDirection, repeatMs, pad }) {
      this.#onDirection = onDirection;
      this.#repeatMs = repeatMs;
      window.addEventListener('keydown', (ev) => this.#key(ev, true));
      window.addEventListener('keyup', (ev) => this.#key(ev, false));
      window.addEventListener('blur', () => this.releaseAll());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
      for (const btn of pad.querySelectorAll('[data-dir]')) {
        const dir = btn.dataset.dir;
        btn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); btn.setPointerCapture?.(ev.pointerId); btn.classList.add('is-down'); this.press(dir); });
        for (const type of ['pointerup', 'pointercancel']) {
          btn.addEventListener(type, () => { btn.classList.remove('is-down'); this.release(dir); });
        }
        btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
      }
    }

    press(dir) {
      if (this.#held.includes(dir)) return;
      this.#held.push(dir);
      this.#fire();
      clearInterval(this.#timer);
      this.#timer = setInterval(() => this.#fire(), this.#repeatMs());
    }

    release(dir) {
      this.#held = this.#held.filter((d) => d !== dir);
      if (!this.#held.length) clearInterval(this.#timer);
    }

    releaseAll() { this.#held = []; clearInterval(this.#timer); }

    #fire() { const dir = this.#held[this.#held.length - 1]; if (dir) this.#onDirection(dir); }

    #key(ev, down) {
      const dir = KEY_DIRS[ev.code];
      if (!dir || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target instanceof HTMLInputElement) return;
      ev.preventDefault();
      if (down) { if (!ev.repeat) this.press(dir); } else this.release(dir);
    }
  }

  /* ───────────────────────── приложение ────────────────────────────── */
  class App {
    #store = new SafeStorage();
    #model = new GameModel();
    #hud = new Hud(this.#model);
    #overlay = new Overlay();
    #conn; #input; #joined = false; #rtt = null; #lastMoveAt = 0; #pendingNick = ''; #sentAt = new Map();

    constructor() {
      this.#pendingNick = this.#store.get('nick') || '';
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      this.#conn = new GameConnection(`${scheme}://${location.host}/ws`, () => this.#helloPayload());
      this.#input = new InputController({
        pad: $('pad'),
        onDirection: (dir) => this.#tryMove(dir),
        repeatMs: () => (this.#model.config?.cooldownMs ?? 100) + 25,
      });
      new Renderer($('board'), $('boardWrap'), this.#model).start();
      this.#wire();
    }

    start() {
      this.#hud.render(null);
      this.#hud.tickTimer();
      if (this.#store.get('token')) {
        this.#conn.connect();
      } else {
        this.#hud.setConnection('IDLE');
        this.#showLogin();
      }
    }

    #wire() {
      const m = this.#model; const hud = this.#hud;
      this.#conn.on('state', (state) => {
        hud.setConnection(state);
        if (state !== ConnState.ONLINE) { this.#joined = false; this.#input.releaseAll(); }
      });
      this.#conn.on('message', (msg) => this.#onMessage(msg));
      this.#conn.on('ping', (msg) => {
        if (typeof msg.rtt === 'number' && this.#rtt === null) this.#rtt = msg.rtt;
        m.syncClock(msg.t + (this.#rtt ?? 0) / 2);
        hud.render(this.#rtt);
      });
      m.on('change', () => hud.render(this.#rtt));
      m.on('event', (e) => hud.pushFeed(e));
      m.on('round-ended', (e) => {
        const top = e.ranking[0];
        hud.toast(top
          ? `Раунд ${e.round} завершён. Победил ${top.nick}: ${top.roundScore} ${plural(top.roundScore, ['очко', 'очка', 'очков'])}`
          : `Раунд ${e.round} завершён — очков никто не набрал`, 6000);
      });
      m.on('self-left', (reason) => this.#showRemoved(reason));
      $('renameBtn').addEventListener('click', () => this.#showRename());
      setInterval(() => hud.tickTimer(), 250);
    }

    #helloPayload() {
      const token = this.#store.get('token');
      const hello = { lastCseq: this.#conn.cseq };
      if (token) hello.token = token;
      if (this.#pendingNick) hello.nick = this.#pendingNick;
      if (token && this.#model.version !== null) hello.lastStateVersion = this.#model.version;
      return hello;
    }

    #onMessage(msg) {
      const S = P.Server; const m = this.#model;
      switch (msg.type) {
        case S.WELCOME:
          this.#joined = true;
          this.#store.set('token', msg.token);
          this.#store.set('nick', msg.nick);
          this.#pendingNick = '';
          m.setSession(msg);
          this.#overlay.hide();
          break;
        case S.SNAPSHOT: m.applySnapshot(msg); break;
        case S.DELTA: if (!m.applyDelta(msg)) this.#conn.reconnectNow(); break; // разрыв версий → полная пересинхронизация
        case S.MOVE_ACK: this.#measure(msg.cseq); break; // позицию рисует DELTA; ACK нужен только для измерения пинга
        case S.MOVE_REJECTED:
          this.#sentAt.delete(msg.cseq);
          if (msg.reason === P.RejectReason.AFK) this.#showRemoved('AFK');
          break;
        case S.ERROR: this.#onError(msg); break;
        case S.SERVER_SHUTDOWN: this.#hud.toast('Сервер перезапускается — вернёмся автоматически', 5000); break;
        default:
      }
    }

    #onError(err) {
      const C = P.ErrorCode;
      const retry = { label: 'Попробовать снова', run: () => { this.#overlay.hide(); this.#conn.connect(); } };
      switch (err.code) {
        case C.BAD_NICK:
          if (this.#joined) { this.#hud.toast(err.message, 4000); break; }
          this.#store.remove('token'); // токен не подошёл — начинаем как новый игрок
          this.#showLogin(err.message);
          break;
        case C.ROOM_FULL:
          this.#overlay.show({ title: 'Комната заполнена', text: 'Все места на поле заняты. Подождите, пока кто-нибудь выйдет, и попробуйте снова.', primary: retry });
          break;
        case C.SESSION_REPLACED:
          this.#overlay.show({ title: 'Игра открыта в другой вкладке', text: 'Вы вошли с другого окна, поэтому здесь игра остановлена.', primary: { label: 'Играть здесь', run: retry.run } });
          break;
        case C.PROTOCOL_VERSION:
          this.#overlay.show({ title: 'Нужно обновить страницу', text: 'Версия игры изменилась.', primary: { label: 'Обновить', run: () => location.reload() } });
          break;
        default: this.#hud.toast(err.message || 'Ошибка', 4000);
      }
    }

    #showLogin(error = '') {
      const cfg = this.#model.config;
      this.#overlay.show({
        title: 'GridRush',
        text: 'Первым дойдите до красной метки — очко ваше. Играйте стрелками или WASD, на телефоне — кнопками внизу.',
        input: this.#pendingNick, error,
        primary: {
          label: 'Играть',
          run: (value) => {
            const nick = value.trim();
            const min = cfg?.nickMin ?? 2; const max = cfg?.nickMax ?? 16;
            if ([...nick].length < min || [...nick].length > max) return this.#overlay.setError(`Ник — от ${min} до ${max} символов`);
            if (!/^[\p{L}\p{N}_-]+$/u.test(nick)) return this.#overlay.setError('Допустимы буквы, цифры, «_» и «-»');
            this.#pendingNick = nick;
            this.#overlay.setError('');
            if (this.#conn.started) this.#conn.sendHello(); else this.#conn.connect();
          },
        },
      });
    }

    #showRename() {
      this.#overlay.show({
        title: 'Сменить ник', input: this.#model.self?.nick ?? '',
        primary: {
          label: 'Сохранить',
          run: (value) => {
            this.#conn.sendCommand(P.Client.SET_NICK, { nick: value.trim() });
            this.#store.set('nick', value.trim());
            this.#overlay.hide();
          },
        },
        secondary: { label: 'Отмена', run: () => this.#overlay.hide() },
      });
    }

    #showRemoved(reason) {
      if (this.#overlay.isOpen) return;
      this.#input.releaseAll();
      this.#overlay.show({
        title: reason === 'AFK' ? 'Вас убрали с поля' : 'Вы вышли с поля',
        text: 'Долго не было ходов. Счёт сохранён — можно вернуться.',
        primary: { label: 'Вернуться в игру', run: () => { this.#overlay.hide(); this.#conn.reconnectNow(); } },
      });
    }

    #tryMove(dir) {
      const cfg = this.#model.config;
      if (!this.#joined || !cfg || this.#overlay.isOpen || !this.#model.self) return;
      const now = performance.now();
      if (now - this.#lastMoveAt < cfg.cooldownMs + 5) return; // клиентский предохранитель: чаще кулдауна не шлём
      if (!this.#model.canStep(dir)) return;
      const cseq = this.#conn.sendCommand(P.Client.MOVE, { dir, clientTime: Date.now() });
      if (cseq === null) return;
      this.#lastMoveAt = now;
      this.#sentAt.set(cseq, now);
      if (this.#sentAt.size > 64) this.#sentAt.delete(this.#sentAt.keys().next().value);
    }

    #measure(cseq) {
      const t = this.#sentAt.get(cseq);
      if (t === undefined) return;
      this.#sentAt.delete(cseq);
      const rtt = performance.now() - t;
      this.#rtt = this.#rtt === null ? rtt : this.#rtt * 0.7 + rtt * 0.3;
      this.#hud.render(this.#rtt);
    }
  }

  new App().start();
})();