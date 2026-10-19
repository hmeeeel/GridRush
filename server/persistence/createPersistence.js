'use strict';

const { SupabasePersistence } = require('./SupabasePersistence');
const { InMemoryPersistence } = require('./InMemoryPersistence');

function createPersistence(config, logger) {
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY) {
    logger.info('Persistence: Supabase');
    return new SupabasePersistence({
      url: config.SUPABASE_URL, serviceKey: config.SUPABASE_SERVICE_KEY, timeoutMs: config.SUPABASE_TIMEOUT_MS,
    });
  }
  logger.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы');
  return new InMemoryPersistence();
}

module.exports = { createPersistence };
