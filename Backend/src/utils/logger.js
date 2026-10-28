// Backend/src/utils/logger.js
// Small logger with levels. Set LOG_LEVEL=debug|info|warn|error|silent in .env
// (default: info, and silent while running Jest tests)
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function currentLevel() {
  const fallback = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
  const name = (process.env.LOG_LEVEL || fallback).toLowerCase();
  return LEVELS[name] ?? LEVELS.info;
}

function write(level, args) {
  if (LEVELS[level] < currentLevel()) return;
  const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(prefix, ...args);
}

module.exports = {
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};