'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
});

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

/** Отдаёт файлы из rootDir: корректные MIME, ETag/Last-Modified, защита от path traversal. */
class StaticFileServer {
  #root;
  #index;

  constructor({ rootDir, index = 'index.html' }) {
    this.#root = path.resolve(rootDir);
    this.#index = index;
  }

  /** @returns {Promise<boolean>} true, если запрос обработан */
  async handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return true;
    }
    const filePath = this.#resolve(req.url);
    if (!filePath) return false;

    let stat;
    try {
      stat = await fs.stat(filePath);
      if (!stat.isFile()) return false;
    } catch {
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext];
    if (!type) return false;

    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': type,
      'Content-Length': stat.size,
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    };
    if (ext === '.html') {
      headers['Content-Security-Policy'] = CSP;
      headers['Referrer-Policy'] = 'no-referrer';
    }

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] }).end();
      return true;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(await fs.readFile(filePath));
    }
    return true;
  }

  #resolve(rawUrl) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
    } catch {
      return null;
    }
    if (pathname.includes('\0')) return null;
    if (pathname.endsWith('/')) pathname += this.#index;
    const full = path.join(this.#root, path.normalize(pathname));
    return full.startsWith(this.#root + path.sep) ? full : null;
  }
}

module.exports = { StaticFileServer };
