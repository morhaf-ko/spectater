import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.js';
import { readFileLimited, readLimited } from '../src/files.js';
import { openReview } from '../src/review.js';
import { loadState } from '../src/storage.js';
import { fixture } from './helpers.js';

test('native reads enforce the byte budget during reading and preserve exact bytes', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const file = path.join(f.directory, 'bytes');
  await writeFile(file, Buffer.from([0, 255, 13, 10]));
  assert.deepEqual(await readFileLimited(file, 4), Buffer.from([0, 255, 13, 10]));
  const handle = await open(file, 'r');
  try {
    await assert.rejects(readLimited(handle, 3), /exceeds 3 bytes/);
  } finally {
    await handle.close();
  }
  await writeFile(file, 'x'.repeat(65536));
  await assert.rejects(readFileLimited(file, 16384), /exceeds 16384 bytes/);
});

test('non-regular inputs fail without waiting on a FIFO and config requires strict UTF-8', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await assert.rejects(readFileLimited(f.directory, 16), /regular file/);
  if (process.platform === 'win32') return;
  const fifo = path.join(f.directory, 'fifo');
  await promisify(execFile)('mkfifo', [fifo]);
  await assert.rejects(readFileLimited(fifo, 16), /regular file/);
  await writeFile(f.configFile, Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]));
  await assert.rejects(loadConfig(f.configFile), /Cannot read SpecTater config/);
});

test('corrupted UTF-8 in private state is rejected without rewriting the file', async (t) => {
  const f = await fixture();
  const review = await openReview(f.options, { directory: f.stateDir });
  t.after(async () => {
    await review.close();
    await f.cleanup();
  });
  const file = path.join(f.stateDir, `${review.state.reviewId}.json`);
  const bytes = await readFile(file);
  bytes[bytes.indexOf('Fixture proposal')] = 255;
  await writeFile(file, bytes);
  await assert.rejects(loadState(f.stateDir, review.state.reviewId), /Cannot load review state/);
  assert.deepEqual(await readFile(file), bytes);
});
