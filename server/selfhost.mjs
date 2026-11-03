import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from './handler.ts';
import { SqliteStore } from './sqlite-store.mjs';

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.ico':'image/x-icon' };
export function createDinnerServer(options = {}) {
  const env = options.env || process.env;
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 24) throw Error('Configure SESSION_SECRET and ADMIN_PASSWORD before starting.');
  const publicOrigin = new URL(env.PUBLIC_ORIGIN || 'http://127.0.0.1:8789').origin;
  const root = resolve(options.staticDir || env.STATIC_DIR || resolve(dirname(fileURLToPath(import.meta.url)), 'public'));
  const store = options.store || new SqliteStore(env.DATABASE_PATH || '/var/lib/yingxue-dinner/answers.sqlite');
  const server = createServer(async (incoming, outgoing) => {
    outgoing.setHeader('X-Content-Type-Options', 'nosniff');
    outgoing.setHeader('Referrer-Policy', 'same-origin');
    outgoing.setHeader('X-Frame-Options', 'DENY');
    outgoing.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const host = incoming.headers.host || '';
      const directLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(incoming.socket.remoteAddress) && !incoming.headers['x-forwarded-for'] && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
      const origin = directLocal ? `http://${host}` : publicOrigin;
      if (!directLocal && host !== new URL(publicOrigin).host) { outgoing.writeHead(421); outgoing.end('Unexpected host'); return; }
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(400); outgoing.end(); return; }
      const url = new URL(incoming.url, origin);
      if (url.pathname === '/api/health' && incoming.method === 'GET') {
        store.db.prepare('SELECT 1').get();
        outgoing.setHeader('Cache-Control','no-store'); outgoing.setHeader('Content-Type','application/json'); outgoing.end('{"ok":true}'); return;
      }
      if (url.pathname.startsWith('/api/')) {
        // Admin passwords are sent over HTTPS, or a direct localhost SSH tunnel.
        if (url.pathname.startsWith('/api/admin/') && new URL(origin).protocol !== 'https:' && !directLocal) {
          outgoing.writeHead(403, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); outgoing.end(JSON.stringify({ error:'管理员信箱需要 HTTPS，请使用正式域名或本机 SSH 隧道。' })); return;
        }
        const init = { method:incoming.method, headers:incoming.headers };
        if (!['GET','HEAD'].includes(incoming.method)) { init.body = Readable.toWeb(incoming); init.duplex = 'half'; }
        const request = new Request(url, init);
        // Public callers cannot forge their address. Enable proxy headers only
        // when a loopback reverse proxy has been explicitly configured.
        const proxy = env.TRUST_LOCAL_PROXY === 'true' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(incoming.socket.remoteAddress);
        const clientIp = (proxy && incoming.headers['x-real-ip']) || incoming.socket.remoteAddress || 'unknown';
        const response = await handleRequest(request, env, store, clientIp);
        response.headers.forEach((value,key) => outgoing.setHeader(key,value));
        outgoing.writeHead(response.status); outgoing.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (!['GET','HEAD'].includes(incoming.method)) { outgoing.writeHead(405); outgoing.end(); return; }
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { outgoing.writeHead(400); outgoing.end(); return; }
      if (path.includes('\\') || path.split('/').some(p => p.startsWith('.'))) { outgoing.writeHead(404); outgoing.end(); return; }
      const relative = path === '/' || path === '/adam' || path === '/adam/' ? 'index.html' : path.replace(/^\//,'');
      const filename = resolve(root, relative);
      if (!filename.startsWith(root + sep)) { outgoing.writeHead(404); outgoing.end(); return; }
      const info = await stat(filename).catch(() => null);
      if (!info?.isFile()) { outgoing.writeHead(404); outgoing.end(); return; }
      outgoing.setHeader('Content-Type', types[extname(filename)] || 'application/octet-stream');
      outgoing.setHeader('Cache-Control', relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      outgoing.setHeader('Content-Length', info.size);
      outgoing.writeHead(200);
      if (incoming.method === 'HEAD') outgoing.end(); else createReadStream(filename).pipe(outgoing);
    } catch { if (!outgoing.headersSent) outgoing.writeHead(503); outgoing.end('Service temporarily unavailable'); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.on('close', () => store.close());
  return { server, store };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createDinnerServer();
  const port = Number(process.env.PORT || 8789);
  const address = process.env.BIND_ADDRESS || '127.0.0.1';
  server.listen(port, address, () => console.log(`Dinner server listening on ${address}:${port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
