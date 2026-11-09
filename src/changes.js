import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export function sourceChanges(state) {
  if (!state.previousDocuments) return [];
  const before = state.previousDocuments,
    after = state.currentDocuments || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .flatMap((id) => {
      if (before[id]?.hash === after[id]?.hash) return [];
      return [
        {
          id,
          path: (after[id] || before[id]).path,
          status: !before[id] ? 'added' : !after[id] ? 'removed' : 'changed',
          beforeHash: before[id]?.hash,
          afterHash: after[id]?.hash,
        },
      ];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function compareSources(state, id, run = promisify(execFile)) {
  const change = sourceChanges(state).find((item) => item.id === id);
  if (!change) throw new Error('No source comparison for this document.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'spectater-diff-'));
  try {
    for (const [name, hash] of [
      ['before', change.beforeHash],
      ['after', change.afterHash],
    ]) {
      await writeFile(path.join(directory, name), hash ? state.snapshots[hash].source : '', {
        mode: 0o600,
        flag: 'wx',
      });
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_ATTR_NOSYSTEM: '1',
      LC_ALL: 'C',
    });
    let diff;
    try {
      ({ stdout: diff } = await run(
        'git',
        [
          '--no-pager',
          '-c',
          `core.attributesFile=${os.devNull}`,
          'diff',
          '--no-index',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--text',
          '--unified=3',
          '--',
          'before',
          'after',
        ],
        { cwd: directory, env, timeout: 3000, maxBuffer: 256 * 1024 },
      ));
    } catch (error) {
      if (error.code === 1 && typeof error.stdout === 'string') diff = error.stdout;
      else
        throw new Error(
          'Comparison unavailable. Git must be installed; comparisons are limited to 3 seconds and 256 KiB of output. Reading and feedback remain available.',
        );
    }
    return { ...change, diff };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
