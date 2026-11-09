import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { feedback, feedbackMarkdown } from './storage.js';

const assets = new Map([
  ['/app.js', ['../web/app.js', 'text/javascript']],
  ['/theme.js', ['../web/theme.js', 'text/javascript']],
  ['/style.css', ['../web/style.css', 'text/css']],
]);
const shell = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');

export async function startServer(review) {
  const capability = randomBytes(32).toString('hex');
  const route = `/review/${review.state.reviewId}`;
  let origin;
  const server = http.createServer(async (request, response) => {
    const headers = {
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
    };
    const send = (code, data, type = 'application/json') => { response.writeHead(code, { ...headers, 'Content-Type': `${type}; charset=utf-8` }); response.end(type === 'application/json' ? JSON.stringify(data) : data); };
    try {
      if (request.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid Host.' });
      if (request.headers.origin && request.headers.origin !== origin) return send(403, { error: 'Foreign origin refused.' });
      if (request.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Cross-site request refused.' });
      const url = new URL(request.url, origin);
      if (url.search) return send(404, { error: 'Unknown route.' });
      if (request.method === 'GET' && url.pathname === route) return send(200, shell, 'text/html');
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        return send(200, await readFile(fileURLToPath(new URL(file, import.meta.url)), 'utf8'), type);
      }
      const token = request.headers.authorization || '';
      const expected = `Bearer ${capability}`;
      if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return send(403, { error: 'Review capability required. Reopen the printed URL.' });
      if (request.method === 'GET' && url.pathname === `${route}/state`) return send(200, review.view());
      const batchMatch = url.pathname.startsWith(`${route}/batch/`) && url.pathname.slice(`${route}/batch/`.length);
      if (request.method === 'GET' && batchMatch && /^[a-f0-9-]{36}$/.test(batchMatch)) return send(200, { markdown: feedbackMarkdown(feedback(review.state, batchMatch)) });
      if (request.method !== 'POST' || ![`${route}/refresh`, `${route}/action`].includes(url.pathname)) return send(404, { error: 'Unknown route.' });
      if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return send(403, { error: 'Mutation requires this review origin and JSON.' });
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) { send(413, { error: 'Request exceeds 64 KiB.' }); request.resume(); return; }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object.');
      return send(200, url.pathname.endsWith('/refresh') ? await review.refresh() : await review.mutate(input));
    } catch (error) {
      send(/conflict/i.test(error.message) ? 409 : 400, { error: error.message });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}${route}#${capability}`, origin, route,
    async close() { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await review.close(); } };
}

export async function openBrowser(url, run = promisify(execFile), platform = process.platform) {
  if (platform !== 'darwin') throw new Error('Automatic opening is verified only on macOS; use the printed URL.');
  await run('open', [url], { timeout: 10000, maxBuffer: 65536 });
}
