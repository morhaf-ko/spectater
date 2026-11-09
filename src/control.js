import { chmod, lstat, realpath, unlink } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { hash } from './discovery.js';
import { privateDirectory } from './storage.js';

export async function controlPath(directory, reviewId) {
  if (!/^[a-f0-9]{64}$/.test(reviewId)) throw new Error('Invalid review id.');
  const base = path.join(
    await realpath(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir()),
    `spectater-${process.getuid()}`,
  );
  await privateDirectory(base);
  const socket = path.join(
    base,
    `${hash(JSON.stringify([await realpath(directory), reviewId])).slice(0, 32)}.sock`,
  );
  if (Buffer.byteLength(socket) > 100)
    throw new Error('Private IPC path is too long. Use a shorter temporary directory.');
  return socket;
}

export async function controlRequest(
  directory,
  reviewId,
  endpoint = '/status',
  method = 'GET',
  timeout = 5000,
  input,
) {
  const socketPath = await controlPath(directory, reviewId);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { socketPath, path: endpoint, method, agent: false },
      (response) => {
        let bytes = 0;
        const chunks = [];
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) request.destroy(new Error('IPC response exceeds 64 MiB.'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (result.protocolVersion !== 1 || result.reviewId !== reviewId)
              throw new Error('Active review IPC identity/version mismatch.');
            if (response.statusCode !== 200)
              throw new Error(result.error || 'Active review operation failed.');
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('Active review IPC timed out.')),
      timeout,
    );
    request.once('close', () => clearTimeout(timer));
    request.once('error', (error) => reject(error));
    request.end(input === undefined ? undefined : JSON.stringify(input));
  });
}

export async function activeReview(directory, reviewId) {
  try {
    return await controlRequest(directory, reviewId);
  } catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) return null;
    throw error;
  }
}

export async function startControl(review, url, presence, refresh = () => review.refresh()) {
  const socket = await controlPath(review.directory, review.state.reviewId);
  try {
    const stat = await lstat(socket);
    if (!stat.isSocket() || stat.isSymbolicLink() || stat.uid !== process.getuid())
      throw new Error('Refusing to replace a non-owned IPC socket.');
    // The acquired review writer lock owns this socket's lifecycle.
    await unlink(socket);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const waiting = new Set();
  const send = (response, result, code = 200) => {
    if (response.destroyed) return;
    response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(
      JSON.stringify({ protocolVersion: 1, reviewId: review.state.reviewId, ...result }),
    );
  };
  const finish = (waiter, result) => {
    if (!waiting.delete(waiter)) return;
    clearTimeout(waiter.timer);
    send(waiter.response, result);
    presence(waiting.size);
  };
  const deliver = async (waiter) => {
    if (!waiting.has(waiter) || waiter.response.destroyed) return;
    try {
      const batch = await review.claimBatch({ after: waiter.after });
      if (batch) finish(waiter, { status: 'batch', batch });
    } catch (error) {
      finish(waiter, { status: 'error', error: error.message });
    }
  };
  const unsubscribe = review.subscribe((event) => {
    if (event.type === 'lifecycle' && event.ended)
      for (const waiter of [...waiting]) finish(waiter, { status: 'ended', after: waiter.after });
    if (event.type === 'batch') for (const waiter of [...waiting]) void deliver(waiter);
  });
  const server = http.createServer(async (request, response) => {
    try {
      const parsed = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && parsed.pathname === '/status' && !parsed.search)
        return send(response, {
          status: 'active',
          url,
          sequence: review.state.batches.length,
          ended: Boolean(review.state.endedAt),
        });
      if (
        request.method === 'POST' &&
        ['/end', '/resume'].includes(parsed.pathname) &&
        !parsed.search
      ) {
        const state = await review.mutate({
          action: parsed.pathname.slice(1),
          revision: review.state.revision,
        });
        return send(response, {
          status: state.endedAt ? 'ended' : 'resumed',
          revision: state.revision,
        });
      }
      if (request.method === 'GET' && parsed.pathname === '/batch') {
        if (parsed.searchParams.size !== 1 || !parsed.searchParams.has('batch'))
          throw new Error('Supply an exact batch id.');
        return send(response, {
          status: 'batch',
          batch: await review.claimBatch({ batchId: parsed.searchParams.get('batch') }),
        });
      }
      if (request.method === 'POST' && parsed.pathname === '/refresh' && !parsed.search) {
        const state = await refresh();
        return send(response, { status: 'refreshed', revision: state.revision });
      }
      if (request.method === 'POST' && ['/received', '/reply'].includes(parsed.pathname)) {
        if (parsed.searchParams.size !== 1 || !parsed.searchParams.has('batch'))
          throw new Error('Supply an exact batch id.');
        let bytes = 0;
        const chunks = [];
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 65536) throw new Error('IPC request exceeds 64 KiB.');
          chunks.push(chunk);
        }
        const input =
          parsed.pathname === '/received'
            ? { status: 'received' }
            : JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          (parsed.pathname === '/reply' && !['working', 'done'].includes(input.status))
        )
          throw new Error('Supply working or done reply status.');
        const state = await review.recordActivity(parsed.searchParams.get('batch'), input);
        return send(response, { status: 'recorded', revision: state.revision });
      }
      if (request.method !== 'GET' || parsed.pathname !== '/next')
        return send(response, { error: 'Unknown IPC operation.' }, 404);
      const after = Number(parsed.searchParams.get('after'));
      const wait = Number(parsed.searchParams.get('wait'));
      if (
        !parsed.searchParams.has('after') ||
        !parsed.searchParams.has('wait') ||
        !Number.isSafeInteger(after) ||
        after < 0 ||
        after > review.state.batches.length ||
        !Number.isInteger(wait) ||
        wait < 0 ||
        wait > 55000
      )
        throw new Error('Supply a valid sequence cursor and wait budget of 0–55000 ms.');
      if (review.state.endedAt) return send(response, { status: 'ended', after });
      const batch = await review.claimBatch({ after });
      if (batch) return send(response, { status: 'batch', batch });
      if (!wait) return send(response, { status: 'timeout', after });
      if (waiting.size >= 16) throw new Error('Too many feedback listeners.');
      const waiter = { response, after };
      waiter.timer = setTimeout(() => finish(waiter, { status: 'timeout', after }), wait);
      waiting.add(waiter);
      presence(waiting.size);
      void deliver(waiter);
      response.once('close', () => {
        if (waiting.delete(waiter)) {
          clearTimeout(waiter.timer);
          presence(waiting.size);
        }
      });
    } catch (error) {
      send(response, { error: error.message }, 400);
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxConnections = 20;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socket, resolve);
    });
    await chmod(socket, 0o600);
  } catch (error) {
    unsubscribe();
    server.closeAllConnections();
    server.close();
    throw error;
  }
  return {
    async close() {
      unsubscribe();
      for (const waiter of [...waiting]) finish(waiter, { status: 'stopped', after: waiter.after });
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
