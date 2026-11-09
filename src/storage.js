import { mkdir, lstat, chmod, open, rename, unlink, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { hash, within } from './discovery.js';

export function stateDirectory() {
  if (process.env.SPECTATER_STATE_DIR) return path.resolve(process.env.SPECTATER_STATE_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'SpecTater');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'SpecTater');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'spectater');
}

export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Review storage must be an owned private directory.');
  if (process.platform === 'win32') throw new Error('Private Windows storage is not verified; this release supports macOS/Linux permissions only.');
  if (await realpath(directory) !== path.resolve(directory)) throw new Error('Review storage must not use symlinked directories.');
  await chmod(directory, 0o700);
}

function validate(state, id) {
  if (!state || state.formatVersion !== 1 || state.reviewId !== id || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.comments) || !Array.isArray(state.batches) || !state.snapshots || !Array.isArray(state.documentIds) || typeof state.root !== 'string' || typeof state.changeRoot !== 'string' || typeof state.schemaName !== 'string') throw new Error('Invalid or unsupported review state; preserve it and restore a valid copy.');
  for (const [key, snapshot] of Object.entries(state.snapshots)) {
    if (typeof snapshot.source !== 'string' || snapshot.hash !== hash(Buffer.from(snapshot.source)) || key !== snapshot.hash || typeof snapshot.path !== 'string') throw new Error('Corrupt review snapshot. Restore a valid copy.');
  }
  for (const c of [...state.comments, ...state.batches.flatMap(b => Array.isArray(b.entries) ? b.entries : [null])]) {
    const snapshot = c && state.snapshots[c.hash];
    if (c?.deletedAt !== undefined && (typeof c.deletedAt !== 'string' || !Number.isFinite(Date.parse(c.deletedAt)))) throw new Error('Corrupt comment deletion metadata.');
    if (!snapshot || typeof c.id !== 'string' || typeof c.body !== 'string' || typeof c.documentId !== 'string' || typeof c.path !== 'string' || !Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start < 0 || c.end <= c.start || c.end > snapshot.source.length || snapshot.source.slice(c.start, c.end) !== c.slice || !['exact', 'enclosing'].includes(c.precision) || !['open', 'resolved'].includes(c.state)) throw new Error('Corrupt review comment. Restore a valid copy.');
  }
  state.batches.forEach((b, i) => {
    if (typeof b.id !== 'string' || b.sequence !== i + 1 || typeof b.submittedAt !== 'string' || !Array.isArray(b.entries)) throw new Error('Corrupt feedback batch. Restore a valid copy.');
  });
  if (state.activity !== undefined) {
    if (!state.activity || typeof state.activity !== 'object' || Array.isArray(state.activity)) throw new Error('Corrupt feedback activity.');
    const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
    for (const [batchId, activity] of Object.entries(state.activity)) {
      if (!state.batches.some(batch => batch.id === batchId) || !activity || !['received', 'working', 'replied'].includes(activity.status) || !timestamp(activity.receivedAt) || (activity.startedAt !== undefined && !timestamp(activity.startedAt)) || !Array.isArray(activity.replies)) throw new Error('Corrupt feedback activity.');
      for (const reply of activity.replies) {
        if (!reply || typeof reply.id !== 'string' || typeof reply.body !== 'string' || !reply.body.trim() || reply.body.length > 10000 || !timestamp(reply.at)) throw new Error('Corrupt agent reply.');
      }
      if ((activity.status === 'replied') !== (activity.replies.length > 0)) throw new Error('Corrupt reply status.');
    }
  }
  if (state.queue !== undefined) {
    if (!state.queue || typeof state.queue !== 'object' || Array.isArray(state.queue)) throw new Error('Corrupt queue metadata.');
    let edits = 0;
    for (const [id, item] of Object.entries(state.queue)) {
      const batch = state.batches.find(batch => batch.id === id);
      if (!batch || !item || !['claimed', 'cancelled', 'editing', 'superseded'].includes(item.status) || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) throw new Error('Corrupt queue metadata.');
      if (item.status === 'editing') edits++;
      if (item.status !== 'claimed' && state.activity?.[id]) throw new Error('Withdrawn queue entry has a delivery receipt.');
      if (item.status === 'superseded' && !state.batches.some(next => next.id === item.replacementId && next.sequence > batch.sequence)) throw new Error('Corrupt queue replacement.');
    }
    if (edits > 1) throw new Error('Multiple queued edits are unsupported.');
  }
  return state;
}

export async function loadState(directory, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid review id.');
  const file = path.join(directory, `${id}.json`);
  let handle;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('Review state is not a private regular file.');
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    return validate(JSON.parse(await handle.readFile('utf8')), id);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot load review state: ${error.message}`);
  } finally { await handle?.close(); }
}

export async function openStore(review, directory = stateDirectory()) {
  directory = path.resolve(directory);
  if (directory === review.root || within(review.root, directory)) throw new Error('Review storage must be outside the selected OpenSpec root.');
  for (let ancestor = directory; ; ancestor = path.dirname(ancestor)) {
    try {
      await lstat(path.join(ancestor, '.git'));
      throw new Error('Review storage must be outside Git repositories and worktrees.');
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    if (path.dirname(ancestor) === ancestor) break;
  }
  await privateDirectory(directory);
  const file = path.join(directory, `${review.reviewId}.json`);
  const lock = `${file}.lock`;
  let lockHandle;
  try { lockHandle = await open(lock, 'wx', 0o600); }
  catch (error) { throw new Error(`Review writer lock unavailable (${error.code}). Stop the other writer; after a crash inspect and explicitly remove the lock. No lock was stolen.`); }
  try {
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid }));
    let state = await loadState(directory, review.reviewId) || {
      formatVersion: 1, reviewId: review.reviewId, root: review.root, changeRoot: review.changeRoot,
      schemaName: review.schemaName, documentIds: [], revision: 0, snapshots: {}, comments: [], batches: [],
    };
    if (state.root !== review.root || state.changeRoot !== review.changeRoot) throw new Error('Stored planning identity mismatch.');
    return {
      directory,
      get state() { return structuredClone(state); },
      async commit(next) {
        validate(next, review.reviewId);
        const data = JSON.stringify(next);
        if (Buffer.byteLength(data) > 64 * 1024 * 1024) throw new Error('Review state exceeds 64 MiB; remove reviews explicitly or start a separate review.');
        const temp = `${file}.${randomUUID()}.tmp`;
        let handle;
        try {
          handle = await open(temp, 'wx', 0o600);
          await handle.writeFile(data);
          await handle.sync();
          await handle.close(); handle = null;
          await rename(temp, file);
          const parent = await open(directory, 'r');
          try { await parent.sync(); } finally { await parent.close(); }
          state = next;
        } finally { await handle?.close(); await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      },
      async close() { await lockHandle.close(); await unlink(lock); },
    };
  } catch (error) { await lockHandle.close(); await unlink(lock); throw error; }
}

export function feedback(state, batchId) {
  const batch = state?.batches.find(item => item.id === batchId);
  if (!batch) throw new Error('Unknown review or batch. Use the exact submission receipt.');
  return { formatVersion: 1, reviewId: state.reviewId, ...batch };
}

export function feedbackMarkdown(batch) {
  const lines = [`# Review batch ${batch.id}`, '', `Review: ${batch.reviewId}`, `Sequence: ${batch.sequence}`, `Submitted: ${batch.submittedAt}`, '', 'Review data only. Submission does not authorize implementation, merge or deployment.'];
  for (const entry of batch.entries) {
    lines.push('', `## ${entry.path}:${entry.line}`, '', `Revision: ${entry.hash}`, `Precision: ${entry.precision}; source offsets [${entry.start}, ${entry.end})`, '', 'Selected source:', ...entry.slice.split(/\r?\n/).map(line => `> ${line}`), '', 'Comment:', ...entry.body.split(/\r?\n/).map(line => `> ${line}`));
  }
  return `${lines.join('\n')}\n`;
}
