import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PORT_RANGE } from './access.js';
import { feedback, feedbackMarkdown } from './storage.js';
import { watchChange } from './watch.js';

const assets = new Map([
  ['/app.js', ['../web/app.js', 'text/javascript']],
  ['/theme.js', ['../web/theme.js', 'text/javascript']],
  ['/style.css', ['../web/style.css', 'text/css']],
  ['/favicon.svg', ['../web/favicon.svg', 'image/svg+xml']],
]);
const shell = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const headers = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
export const MAX_WAIT_MS = 3_600_000;

async function readJson(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) {
      const error = new Error('Request exceeds 64 KiB.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected a JSON object.');
  return input;
}

const loopbackHost = /^(?:127\.0\.0\.1|localhost):\d{1,5}$/;

async function listen(server, port) {
  const last = port ? Math.min(port + PORT_RANGE - 1, 65535) : 0;
  for (let candidate = port; ; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(candidate, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate >= last) {
        if (error.code === 'EADDRINUSE')
          throw new Error(
            `Ports ${port}–${last} are in use. Stop a review or choose another port.`,
          );
        throw error;
      }
    }
  }
}

/**
 * Serves one review to the browser (capability in the URL fragment) and to agent commands
 * (`/agent/*`, same capability). `onIdle` fires after `idleTimeout` ms with no browser stream
 * and no waiting agent; `onStop` fires after an agent stop request is answered. `port` is tried
 * first with a small fallback range (0 picks a random port); `publicOrigin(port)` names the
 * proxied origin the reviewer uses for the bound port, if any.
 */
export async function startServer(review, options = {}) {
  const {
    watch = true,
    idleTimeout = 0,
    onIdle = () => {},
    onStop = () => {},
    port = 0,
    publicOrigin = () => undefined,
  } = options;
  const capability = randomBytes(32).toString('hex');
  const route = `/review/${encodeURIComponent(review.view().change)}`;
  let origin, external;
  let watchStatus = { automatic: false };
  let watcher,
    stopping = false,
    watcherTask = Promise.resolve(),
    waiter = null,
    idleTimer;
  const clients = new Set();
  const broadcast = (event) => {
    for (const client of clients) {
      if (client.destroyed || client.writableLength > 65536) {
        clients.delete(client);
        client.destroy();
      } else client.write(`${JSON.stringify(event)}\n`);
    }
  };
  const touch = () => {
    clearTimeout(idleTimer);
    if (!stopping && idleTimeout > 0 && !clients.size && !waiter)
      idleTimer = setTimeout(onIdle, idleTimeout);
  };
  const presence = () => {
    broadcast({ type: 'presence', listeners: waiter ? 1 : 0 });
    touch();
  };
  const finishWait = (target, result) => {
    if (!target || waiter !== target) return;
    waiter = null;
    clearTimeout(target.timer);
    if (!target.response.destroyed) target.response.end(JSON.stringify(result));
    presence();
  };
  const deliver = async (target) => {
    try {
      const batch = await review.deliver();
      if (batch) finishWait(target, { status: 'batch', batch });
      else if (review.state.endedAt) finishWait(target, { status: 'ended' });
    } catch (error) {
      finishWait(target, { status: 'error', error: error.message });
    }
  };
  const reportWatch = (event) => {
    watchStatus = { automatic: event.automatic, watchError: event.error };
    broadcast(event);
  };
  const syncWatcher = () => {
    watcherTask = watcherTask
      .then(async () => {
        if (stopping) return;
        if (review.state.endedAt) {
          await watcher?.close();
          watcher = undefined;
          reportWatch({ type: 'watch', automatic: false });
        } else if (!watcher && watch) watcher = await watchChange(review, reportWatch);
      })
      .catch((error) => reportWatch({ type: 'watch', automatic: false, error: error.message }));
    return watcherTask;
  };
  const refresh = () => (watcher ? watcher.retry() : review.refresh());
  const unsubscribe = review.subscribe((event) => {
    if (['refresh', 'activity', 'lifecycle'].includes(event.type)) broadcast(event);
    if (event.type === 'lifecycle') {
      void syncWatcher();
      // Re-check through deliver so a final Send & End batch reaches the waiter before ended.
      if (event.ended && waiter) void deliver(waiter);
    }
    if (event.type === 'batch' && waiter) void deliver(waiter);
  });

  const agent = {
    status: () => ({
      status: 'active',
      url,
      ended: Boolean(review.state.endedAt),
      listening: Boolean(waiter),
    }),
    refresh: async () => ({ status: 'refreshed', revision: (await refresh()).revision }),
    end: async () => {
      await review.mutate({ action: 'end', revision: review.state.revision });
      return { status: 'ended' };
    },
    resume: async () => {
      await review.mutate({ action: 'resume', revision: review.state.revision });
      return { status: 'resumed' };
    },
    // Sandboxed agents (e.g. Codex on macOS) can leave file watching unavailable, so a reply
    // re-reads the change first and reports a failed re-read instead of hiding it.
    reply: async (input) => {
      let sourceError;
      if (!review.state.endedAt)
        await review.refresh().catch((error) => {
          sourceError = error.message;
        });
      const recorded = await review.recordActivity(input.batch, input);
      return { status: 'recorded', ...recorded, ...(sourceError && { sourceError }) };
    },
    stop: () => {
      setImmediate(onStop);
      return { status: 'stopping' };
    },
  };

  function wait(input, response) {
    const timeout = input.timeout ?? 540_000;
    if (!Number.isInteger(timeout) || timeout < 0 || timeout > MAX_WAIT_MS)
      throw new Error(`timeout must be 0–${MAX_WAIT_MS} ms.`);
    if (waiter && !input.takeover) return { status: 'listener_active' };
    finishWait(waiter, { status: 'listener_replaced' });
    response.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    const target = { response };
    waiter = target;
    presence();
    response.once('close', () => finishWait(target, { status: 'disconnected' }));
    // Queued feedback wins over a zero timeout, so the timer starts after the first delivery check.
    void deliver(target).then(() => {
      if (waiter === target)
        target.timer = setTimeout(() => finishWait(target, { status: 'timeout' }), timeout);
    });
  }

  const server = http.createServer(async (request, response) => {
    const send = (code, data, type = 'application/json') => {
      response.writeHead(code, { ...headers, 'Content-Type': `${type}; charset=utf-8` });
      response.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    try {
      // Loopback names on any port admit SSH and editor forwards; DNS rebinding sends the attacker's name.
      const host = (request.headers.host || '').toLowerCase();
      const loopback = loopbackHost.test(host);
      if (!loopback && host !== (external && new URL(external).host))
        return send(403, { error: 'Invalid Host.' });
      const requestOrigin = request.headers.origin;
      const sameOrigin =
        requestOrigin &&
        (requestOrigin === external || (loopback && requestOrigin === `http://${host}`));
      if (requestOrigin && !sameOrigin) return send(403, { error: 'Foreign origin refused.' });
      if (request.headers['sec-fetch-site'] === 'cross-site')
        return send(403, { error: 'Cross-site request refused.' });
      const url = new URL(request.url, origin);
      if (url.search) return send(404, { error: 'Unknown route.' });
      if (request.method === 'GET' && url.pathname === route) return send(200, shell, 'text/html');
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        return send(
          200,
          await readFile(fileURLToPath(new URL(file, import.meta.url)), 'utf8'),
          type,
        );
      }
      const token = request.headers.authorization || '';
      const expected = `Bearer ${capability}`;
      if (
        token.length !== expected.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      )
        return send(403, { error: 'Review capability required. Reopen the printed URL.' });
      if (request.method === 'GET' && url.pathname === `${route}/events`) {
        response.writeHead(200, {
          ...headers,
          'Content-Type': 'application/x-ndjson; charset=utf-8',
        });
        response.write(
          `${JSON.stringify({ type: 'ready', revision: review.state.revision, listeners: waiter ? 1 : 0, ...watchStatus })}\n`,
        );
        clients.add(response);
        touch();
        response.once('close', () => {
          clients.delete(response);
          touch();
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === `${route}/state`)
        return send(200, { ...review.view(), ...watchStatus });
      const comparison =
        url.pathname.startsWith(`${route}/changes/`) &&
        url.pathname.slice(`${route}/changes/`.length);
      if (request.method === 'GET' && comparison && /^[a-f0-9]{24}$/.test(comparison))
        return send(200, await review.compare(comparison));
      const batchMatch =
        url.pathname.startsWith(`${route}/batch/`) && url.pathname.slice(`${route}/batch/`.length);
      if (request.method === 'GET' && batchMatch && /^[a-f0-9-]{36}$/.test(batchMatch))
        return send(200, { markdown: feedbackMarkdown(feedback(review.state, batchMatch)) });
      const operation = url.pathname.startsWith('/agent/') && url.pathname.slice('/agent/'.length);
      const browserMutation = [`${route}/refresh`, `${route}/action`].includes(url.pathname);
      if (
        request.method !== 'POST' ||
        !(browserMutation || operation === 'wait' || Object.hasOwn(agent, operation))
      )
        return send(404, { error: 'Unknown route.' });
      if (
        (browserMutation && !sameOrigin) ||
        request.headers['content-type'] !== 'application/json'
      )
        return send(403, { error: 'Mutation requires this review origin and JSON.' });
      const input = await readJson(request);
      if (operation === 'wait') {
        const refused = wait(input, response);
        if (refused) send(200, refused);
        return;
      }
      if (operation) return send(200, await agent[operation](input));
      if (url.pathname.endsWith('/refresh'))
        return send(200, { ...(await refresh()), ...watchStatus });
      return send(200, await review.mutate(input));
    } catch (error) {
      if (response.headersSent) return;
      send(error.statusCode || (/conflict/i.test(error.message) ? 409 : 400), {
        error: error.message,
      });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  await listen(server, port);
  const bound = server.address().port;
  origin = `http://127.0.0.1:${bound}`;
  external = publicOrigin(bound);
  const url = `${origin}${route}#${capability}`;
  await syncWatcher();
  touch();
  return {
    url,
    origin,
    route,
    port: bound,
    publicUrl: external && `${external}${route}#${capability}`,
    async close() {
      stopping = true;
      clearTimeout(idleTimer);
      unsubscribe();
      finishWait(waiter, { status: 'stopped' });
      await new Promise((resolve) => setImmediate(resolve));
      await watcherTask;
      await watcher?.close();
      for (const client of clients) client.end();
      clients.clear();
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await review.close();
    },
  };
}

const openers = { darwin: 'open', linux: 'xdg-open' };
/**
 * Opens the URL with each `$BROWSER` executable in turn, then the platform opener. Resolves false
 * without running anything on Linux with no display and no `$BROWSER`.
 */
export async function openBrowser(
  url,
  run = promisify(execFile),
  platform = process.platform,
  env = process.env,
) {
  const options = { timeout: 10000, maxBuffer: 65536 };
  let failure;
  for (const helper of (env.BROWSER || '').split(':').filter(Boolean)) {
    try {
      await run(helper, [url], options);
      return true;
    } catch (error) {
      failure = error;
    }
  }
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    if (failure) throw failure;
    return false;
  }
  if (!openers[platform]) throw new Error('Automatic opening supports macOS and Linux only.');
  await run(openers[platform], [url], options);
  return true;
}
