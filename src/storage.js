import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hash, within } from './discovery.js';
import { readFileLimited, readLimited } from './files.js';

export function stateDirectory() {
  if (process.env.SPECTATER_STATE_DIR) return path.resolve(process.env.SPECTATER_STATE_DIR);
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpecTater');
  if (process.platform === 'win32')
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'SpecTater',
    );
  return path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
    'spectater',
  );
}

const windows = process.platform === 'win32';

/**
 * True for a regular file only this user can read. NTFS reports no POSIX owner or mode, so on
 * Windows privacy comes from the user profile's ACL that `privateDirectory` requires.
 */
export function privateFile(stat) {
  if (!stat.isFile()) return false;
  if (windows) return true;
  return !(stat.mode & 0o077) && stat.uid === process.getuid();
}

export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error('Review storage must be an owned private directory.');
  const real = await realpath(directory);
  // Windows paths compare case-insensitively.
  const resolved = path.resolve(directory);
  if (windows ? real.toLowerCase() !== resolved.toLowerCase() : real !== resolved)
    throw new Error('Review storage must not use symlinked directories.');
  if (windows) {
    const profile = await realpath(os.homedir());
    if (!within(profile.toLowerCase(), real.toLowerCase()))
      throw new Error(
        'On Windows, review storage must be inside your user profile, whose permissions keep it private.',
      );
    return;
  }
  await chmod(directory, 0o700);
}

function validate(state, id) {
  if (
    state?.formatVersion !== 1 ||
    state.reviewId !== id ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !Array.isArray(state.comments) ||
    !Array.isArray(state.batches) ||
    !state.snapshots ||
    !Array.isArray(state.documentIds) ||
    typeof state.root !== 'string' ||
    typeof state.changeRoot !== 'string' ||
    typeof state.schemaName !== 'string'
  )
    throw new Error('Invalid or unsupported review state; preserve it and restore a valid copy.');
  if (
    state.endedAt !== undefined &&
    (typeof state.endedAt !== 'string' || !Number.isFinite(Date.parse(state.endedAt)))
  )
    throw new Error('Corrupt review completion metadata.');
  if (
    state.approvedAt !== undefined &&
    (typeof state.approvedAt !== 'string' || !Number.isFinite(Date.parse(state.approvedAt)))
  )
    throw new Error('Corrupt review completion metadata.');
  if (
    state.endRequestedAt !== undefined &&
    (typeof state.endRequestedAt !== 'string' || !Number.isFinite(Date.parse(state.endRequestedAt)))
  )
    throw new Error('Corrupt review completion metadata.');
  for (const [key, snapshot] of Object.entries(state.snapshots)) {
    if (
      typeof snapshot.source !== 'string' ||
      snapshot.hash !== hash(Buffer.from(snapshot.source)) ||
      key !== snapshot.hash ||
      typeof snapshot.path !== 'string'
    )
      throw new Error('Corrupt review snapshot. Restore a valid copy.');
  }
  for (const c of [
    ...state.comments,
    ...state.batches.flatMap((b) => (Array.isArray(b.entries) ? b.entries : [null])),
  ]) {
    const snapshot = c && state.snapshots[c.hash];
    if (
      c?.deletedAt !== undefined &&
      (typeof c.deletedAt !== 'string' || !Number.isFinite(Date.parse(c.deletedAt)))
    )
      throw new Error('Corrupt comment deletion metadata.');
    if (
      !snapshot ||
      typeof c.id !== 'string' ||
      typeof c.body !== 'string' ||
      typeof c.documentId !== 'string' ||
      typeof c.path !== 'string' ||
      !Number.isInteger(c.start) ||
      !Number.isInteger(c.end) ||
      c.start < 0 ||
      c.end <= c.start ||
      c.end > snapshot.source.length ||
      snapshot.source.slice(c.start, c.end) !== c.slice ||
      !['exact', 'enclosing'].includes(c.precision) ||
      !['open', 'resolved'].includes(c.state)
    )
      throw new Error('Corrupt review comment. Restore a valid copy.');
  }
  state.batches.forEach((b, i) => {
    if (
      typeof b.id !== 'string' ||
      b.sequence !== i + 1 ||
      typeof b.submittedAt !== 'string' ||
      !Array.isArray(b.entries) ||
      (b.message !== undefined &&
        (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 10000)) ||
      (!b.entries.length && b.message === undefined)
    )
      throw new Error('Corrupt feedback batch. Restore a valid copy.');
  });
  if (state.activity !== undefined) {
    if (!state.activity || typeof state.activity !== 'object' || Array.isArray(state.activity))
      throw new Error('Corrupt feedback activity.');
    const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    for (const [batchId, activity] of Object.entries(state.activity)) {
      if (
        !state.batches.some((batch) => batch.id === batchId) ||
        !activity ||
        !['received', 'working', 'replied'].includes(activity.status) ||
        !timestamp(activity.receivedAt) ||
        (activity.startedAt !== undefined && !timestamp(activity.startedAt)) ||
        !Array.isArray(activity.replies)
      )
        throw new Error('Corrupt feedback activity.');
      for (const reply of activity.replies) {
        if (
          !reply ||
          typeof reply.id !== 'string' ||
          typeof reply.body !== 'string' ||
          !reply.body.trim() ||
          reply.body.length > 10000 ||
          !timestamp(reply.at)
        )
          throw new Error('Corrupt agent reply.');
      }
      if ((activity.status === 'replied') !== activity.replies.length > 0)
        throw new Error('Corrupt reply status.');
    }
  }
  if (state.queue !== undefined) {
    if (!state.queue || typeof state.queue !== 'object' || Array.isArray(state.queue))
      throw new Error('Corrupt queue metadata.');
    let edits = 0;
    for (const [id, item] of Object.entries(state.queue)) {
      const batch = state.batches.find((batch) => batch.id === id);
      if (
        !batch ||
        !item ||
        !['claimed', 'cancelled', 'editing', 'superseded'].includes(item.status) ||
        typeof item.at !== 'string' ||
        !Number.isFinite(Date.parse(item.at))
      )
        throw new Error('Corrupt queue metadata.');
      if (item.status === 'editing') edits++;
      if (item.status !== 'claimed' && state.activity?.[id])
        throw new Error('Withdrawn queue entry has a delivery receipt.');
      if (
        item.status === 'superseded' &&
        !state.batches.some(
          (next) => next.id === item.replacementId && next.sequence > batch.sequence,
        )
      )
        throw new Error('Corrupt queue replacement.');
    }
    if (edits > 1) throw new Error('Multiple queued edits are unsupported.');
  }
  for (const manifest of [state.currentDocuments, state.previousDocuments]) {
    if (manifest === undefined) continue;
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest) ||
      Object.keys(manifest).length > 128
    )
      throw new Error('Corrupt source comparison manifest.');
    for (const [id, entry] of Object.entries(manifest)) {
      if (
        !entry ||
        typeof entry.path !== 'string' ||
        path.isAbsolute(entry.path) ||
        entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        id !== hash(entry.path).slice(0, 24) ||
        !/^[a-f0-9]{64}$/.test(entry.hash) ||
        !state.snapshots[entry.hash]
      )
        throw new Error('Corrupt source comparison manifest.');
    }
  }
  return state;
}

export async function loadState(directory, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid review id.');
  const file = path.join(directory, `${id}.json`);
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!privateFile(stat) || stat.size > 64 * 1024 * 1024)
      throw new Error('Review state is not a private regular file.');
    return validate(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readLimited(handle, 64 * 1024 * 1024),
        ),
      ),
      id,
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot load review state: ${error.message}`);
  } finally {
    await handle?.close();
  }
}

export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// A lock is abandoned only when it names a process that no longer exists.
async function abandoned(lock) {
  try {
    const { pid } = JSON.parse(new TextDecoder().decode(await readFileLimited(lock, 1024)));
    return Number.isSafeInteger(pid) && pid > 0 && !alive(pid);
  } catch {
    return false;
  }
}

export async function openStore(review, directory = stateDirectory()) {
  directory = path.resolve(directory);
  if (directory === review.root || within(review.root, directory))
    throw new Error('Review storage must be outside the selected OpenSpec root.');
  for (let ancestor = directory; ; ancestor = path.dirname(ancestor)) {
    try {
      await lstat(path.join(ancestor, '.git'));
      throw new Error('Review storage must be outside Git repositories and worktrees.');
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    if (path.dirname(ancestor) === ancestor) break;
  }
  await privateDirectory(directory);
  const file = path.join(directory, `${review.reviewId}.json`);
  const lock = `${file}.lock`;
  let lockHandle;
  try {
    lockHandle = await open(lock, 'wx', 0o600);
  } catch (error) {
    const unavailable = new Error(
      `Review writer lock unavailable (${error.code}). Another SpecTater process owns this review.`,
    );
    if (error.code !== 'EEXIST' || !(await abandoned(lock))) throw unavailable;
    // Move the lock aside before judging it, so a concurrent reclaimer's fresh lock is restored.
    const moved = `${lock}.${randomUUID()}.stale`;
    try {
      await rename(lock, moved);
    } catch {
      throw unavailable;
    }
    if (!(await abandoned(moved))) {
      // Restore the live lock; if another process took the name meanwhile, keep it aside for inspection.
      await link(moved, lock);
      await unlink(moved);
      throw unavailable;
    }
    await unlink(moved);
    try {
      lockHandle = await open(lock, 'wx', 0o600);
    } catch {
      throw unavailable;
    }
  }
  try {
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid }));
    let state = (await loadState(directory, review.reviewId)) || {
      formatVersion: 1,
      reviewId: review.reviewId,
      root: review.root,
      changeRoot: review.changeRoot,
      schemaName: review.schemaName,
      documentIds: [],
      revision: 0,
      snapshots: {},
      comments: [],
      batches: [],
    };
    if (state.root !== review.root || state.changeRoot !== review.changeRoot)
      throw new Error('Stored planning identity mismatch.');
    return {
      directory,
      get state() {
        return structuredClone(state);
      },
      async commit(next) {
        validate(next, review.reviewId);
        const data = JSON.stringify(next);
        if (Buffer.byteLength(data) > 64 * 1024 * 1024)
          throw new Error(
            'Review state exceeds 64 MiB; remove reviews explicitly or start a separate review.',
          );
        const temp = `${file}.${randomUUID()}.tmp`;
        let handle;
        try {
          handle = await open(temp, 'wx', 0o600);
          await handle.writeFile(data);
          await handle.sync();
          await handle.close();
          handle = null;
          await rename(temp, file);
          // Windows cannot open a directory to flush it; NTFS journals the rename.
          if (!windows) {
            const parent = await open(directory, 'r');
            try {
              await parent.sync();
            } finally {
              await parent.close();
            }
          }
          state = next;
        } finally {
          await handle?.close();
          await unlink(temp).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      },
      async close() {
        await lockHandle.close();
        await unlink(lock);
      },
    };
  } catch (error) {
    await lockHandle.close();
    await unlink(lock);
    throw error;
  }
}

export function feedback(state, batchId) {
  const batch = state?.batches.find((item) => item.id === batchId || item.sequence === batchId);
  if (!batch) throw new Error(`Unknown feedback batch: ${batchId}.`);
  return { formatVersion: 1, reviewId: state.reviewId, ...batch };
}

export function feedbackMarkdown(batch) {
  const lines = [
    `# Review batch ${batch.id}`,
    '',
    `Review: ${batch.reviewId}`,
    `Sequence: ${batch.sequence}`,
    `Submitted: ${batch.submittedAt}`,
    '',
    'Review data only. Submission does not authorize implementation, merge or deployment.',
  ];
  if (batch.message)
    lines.push('', '## Message', '', ...batch.message.split(/\r?\n/).map((line) => `> ${line}`));
  for (const entry of batch.entries) {
    lines.push(
      '',
      `## ${entry.path}:${entry.line}`,
      '',
      `Revision: ${entry.hash}`,
      `Precision: ${entry.precision}; source offsets [${entry.start}, ${entry.end})`,
      '',
      'Selected source:',
      ...entry.slice.split(/\r?\n/).map((line) => `> ${line}`),
      '',
      'Comment:',
      ...entry.body.split(/\r?\n/).map((line) => `> ${line}`),
    );
  }
  return `${lines.join('\n')}\n`;
}
