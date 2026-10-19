'use strict';

const { loadConfig } = require('./config');
const { Logger } = require('./Logger');
const { GameServer } = require('./GameServer');

const config = loadConfig();
const logger = new Logger('main', config.LOG_LEVEL);
const server = new GameServer(config);

let exiting = false;
function gracefulExit(signal) {
  if (exiting) return;
  exiting = true;
  // жёсткий потолок: выход не позже SHUTDOWN_TIMEOUT_MS
  setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS).unref();
  server.shutdown(signal).then(() => process.exit(0), (err) => { logger.error('Shutdown error', err); process.exit(1); });
}

process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', err));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception', err); gracefulExit('uncaughtException'); });

server.start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
