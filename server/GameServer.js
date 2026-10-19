'use strict';

const path = require('node:path');
const { Logger } = require('./Logger');
const { HttpApp } = require('./http/HttpApp');
const { HealthRoute } = require('./http/HealthRoute');
const { StaticFileServer } = require('./http/StaticFileServer');
const { WebSocketServer } = require('./ws/WebSocketServer');
const { OriginPolicy } = require('./ws/OriginPolicy');
const { createGame } = require('./game/createGame');
const { GameLoop } = require('./game/GameLoop');
const { MessageValidator } = require('./net/MessageValidator');
const { SessionRegistry } = require('./net/SessionRegistry');
const { Broadcaster } = require('./net/Broadcaster');
const { ClientGateway } = require('./net/ClientGateway');
const { HeartbeatMonitor } = require('./net/HeartbeatMonitor');
const { createPersistence } = require('./persistence/createPersistence');
const { PersistenceScheduler } = require('./persistence/PersistenceScheduler');
const { CloseCode } = require('../public/protocol');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Composition root: собирает все части приложения и управляет их жизненным циклом. */
class GameServer {
  #config; #logger; #httpServer; #broadcaster; #loop; #heartbeat; #scheduler; #game; #persistence;
  #shuttingDown = false;

  constructor(config, { logger = new Logger('server', config.LOG_LEVEL), persistence, rng } = {}) {
    this.#config = config;
    this.#logger = logger;
    this.#persistence = persistence ?? createPersistence(config, logger);
    this.#game = createGame(config, { logger: logger.child('game'), rng });

    const sessions = new SessionRegistry();
    this.#broadcaster = new Broadcaster({ sessions });
    const gateway = new ClientGateway({
      engine: this.#game.engine, queue: this.#game.queue, sessions, config,
      validator: new MessageValidator({ maxBytes: config.MAX_MESSAGE_BYTES }),
      logger: logger.child('gateway'),
    });
    this.#heartbeat = new HeartbeatMonitor({ sessions, config, logger: logger.child('heartbeat') });
    this.#loop = new GameLoop({
      engine: this.#game.engine, queue: this.#game.queue, broadcaster: this.#broadcaster,
      tickMs: config.TICK_MS, logger: logger.child('loop'),
    });
    this.#scheduler = new PersistenceScheduler({
      persistence: this.#persistence, engine: this.#game.engine,
      intervalMs: config.PERSIST_INTERVAL_MS, logger: logger.child('persist'),
    });

    const app = new HttpApp({
      logger,
      routes: [
        new HealthRoute({ getPlayers: () => sessions.joinedCount() }),
        new StaticFileServer({ rootDir: PUBLIC_DIR }),
      ],
    });
    this.#httpServer = app.createServer();
    const ws = new WebSocketServer({
      path: config.WS_PATH, maxPayload: config.MAX_FRAME_BYTES,
      originPolicy: new OriginPolicy(config.ALLOWED_ORIGINS), logger: logger.child('ws'),
    });
    ws.attach(this.#httpServer);
    ws.on('connection', (conn) => gateway.handleConnection(conn));
  }

  get engine() { return this.#game.engine; }
  get port() { return this.#httpServer.address()?.port ?? null; }

  /** Загружает состояние из хранилища и запускает сервер. Если хранилище недоступно - падает (fail fast). */
  async start() {
    const now = Date.now();
    this.#game.engine.restore(await this.#persistence.load(), now);
    this.#game.engine.start(now);
    this.#scheduler.start();
    this.#loop.start();
    this.#heartbeat.start();
    await new Promise((resolve, reject) => {
      this.#httpServer.once('error', reject);
      this.#httpServer.listen(this.#config.PORT, resolve);
    });
    this.#logger.info(`Listening on :${this.port}`);
  }

  /** Graceful shutdown: сохранить состояние - SERVER_SHUTDOWN - закрыть сокеты (1001) - выйти (≤ SHUTDOWN_TIMEOUT_MS). */
  async shutdown(reason = 'SHUTDOWN') {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    this.#logger.info(`Shutting down (${reason})`);
    const budget = this.#config.SHUTDOWN_TIMEOUT_MS;

    this.#loop.stop();
    this.#heartbeat.stop();
    await Promise.race([
      this.#scheduler.stop().catch((err) => this.#logger.error('Final flush failed', err)),
      new Promise((resolve) => setTimeout(resolve, Math.floor(budget * 0.6))),
    ]);
    this.#broadcaster.broadcastShutdown(reason, 3000);
    this.#broadcaster.closeAll(CloseCode.GOING_AWAY, 'SERVER_SHUTDOWN');
    await new Promise((resolve) => {
      this.#httpServer.close(resolve);
      this.#httpServer.closeAllConnections?.();
      setTimeout(resolve, 500).unref();
    });
    this.#logger.info('Stopped');
  }
}

module.exports = { GameServer };
