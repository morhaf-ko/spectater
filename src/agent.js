import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscovery, within } from './discovery.js';
import { readFileLimited, readLimited } from './files.js';
import { alive, privateDirectory } from './storage.js';

const bin = fileURLToPath(new URL('../bin/spectater.js', import.meta.url));
const serverFile = (directory, reviewId) => path.join(directory, `${reviewId}.server.json`);

export async function writeServer(directory, record) {
  const file = serverFile(directory, record.reviewId);
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(record));
  } finally {
    await handle.close();
  }
  await rename(temp, file);
}

export async function removeServer(directory, reviewId) {
  await unlink(serverFile(directory, reviewId)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

/** Returns the running server record for a review, removing records left by dead processes. */
export async function readServer(directory, reviewId) {
  let handle;
  try {
    handle = await open(
      serverFile(directory, reviewId),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = await handle.stat();
    if (!stat.isFile() || stat.mode & 0o077 || stat.uid !== process.getuid())
      throw new Error('Server record is not a private regular file.');
    const record = JSON.parse(new TextDecoder().decode(await readLimited(handle, 65536)));
    if (record.reviewId !== reviewId || !Number.isSafeInteger(record.pid))
      throw new Error('Invalid server record.');
    if (alive(record.pid)) return record;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read server record: ${error.message}`);
  } finally {
    await handle?.close();
  }
  await removeServer(directory, reviewId);
  return null;
}

export async function listServers(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for (const name of names) {
    const match = name.match(/^([a-f0-9]{64})\.server\.json$/);
    const record = match && (await readServer(directory, match[1]).catch(() => null));
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.change.localeCompare(b.change));
}

/**
 * Finds the review for a change. Running servers whose root contains the project are matched
 * without native discovery; otherwise native discovery derives the identity.
 */
export async function locate({ project = '.', change, store }, directory) {
  if (!change) throw new Error('Supply a change name.');
  if (!store) {
    const cwd = await realpath(project);
    const matches = (await listServers(directory)).filter(
      (record) => record.change === change && (record.root === cwd || within(record.root, cwd)),
    );
    if (matches.length === 1) return { reviewId: matches[0].reviewId, record: matches[0] };
  }
  const manifest = await createDiscovery()({ project, change, store });
  return {
    reviewId: manifest.reviewId,
    manifest,
    record: await readServer(directory, manifest.reviewId),
  };
}

/** Sends one agent request; resolves `{ status: 'stopped' }` when the server is gone. */
export function agentRequest(record, operation, input = {}, timeout = 10000) {
  const url = new URL(record.url);
  const body = JSON.stringify(input);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: `/agent/${operation}`,
        method: 'POST',
        agent: false,
        headers: {
          Authorization: `Bearer ${url.hash.slice(1)}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', () => resolve({ status: 'stopped' }));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').trim();
          if (!text) return resolve({ status: 'stopped' });
          try {
            const result = JSON.parse(text);
            if (response.statusCode !== 200 || result.status === 'error')
              reject(new Error(result.error || 'Review request failed.'));
            else resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('Review server did not answer in time.')),
      timeout,
    );
    request.once('close', () => clearTimeout(timer));
    request.once('error', (error) =>
      ['ECONNREFUSED', 'ECONNRESET'].includes(error.code)
        ? resolve({ status: 'stopped' })
        : reject(error),
    );
    request.end(body);
  });
}

/** Starts `spectater serve` detached and resolves its server record once it is ready. */
export async function startDetached(options, directory, reviewId) {
  await privateDirectory(directory);
  const log = path.join(directory, `${reviewId}.log`);
  const output = await open(log, 'w', 0o600);
  const args = [bin, 'serve', options.change, '--project', options.project];
  if (options.store) args.push('--store', options.store);
  if (options.config) args.push('--config', options.config);
  if (options.reopen) args.push('--reopen');
  let child;
  try {
    child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', output.fd, output.fd],
      env: { ...process.env, SPECTATER_STATE_DIR: directory },
    });
  } finally {
    await output.close();
  }
  let exited = null;
  child.once('exit', (code) => {
    exited = code ?? 1;
  });
  try {
    for (let elapsed = 0; elapsed < 30000; elapsed += 100) {
      const record = await readServer(directory, reviewId);
      if (record?.pid === child.pid) return record;
      if (exited !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    child.unref();
  }
  const detail = new TextDecoder()
    .decode(await readFileLimited(log, 65536).catch(() => Buffer.alloc(0)))
    .trim();
  if (exited === null) child.kill('SIGTERM');
  throw new Error(detail.replace(/^spectater: /, '') || 'Review server did not start.');
}
