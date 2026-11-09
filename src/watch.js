import { watch } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { within } from './discovery.js';

export async function watchChange(review, report) {
  const root = review.state.changeRoot;
  const watches = new Map();
  let timer,
    running,
    dirty = false,
    closed = false;
  const status = (error) =>
    report({
      type: 'watch',
      automatic: !error,
      error: error
        ? `Automatic updates unavailable: ${error.message} Use Refresh source to retry.`
        : undefined,
    });
  async function register() {
    const directories = new Map();
    async function visit(directory) {
      const stat = await lstat(directory);
      if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        (await realpath(directory)) !== directory ||
        (directory !== root && !within(root, directory))
      )
        throw new Error('Selected change directory moved or uses a symlink.');
      if (directories.size >= 256) throw new Error('Selected change exceeds 256 directories.');
      directories.set(directory, `${stat.dev}:${stat.ino}`);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.isSymbolicLink())
          await visit(path.join(directory, entry.name));
      }
    }
    await visit(root);
    if (closed) return;
    for (const [directory, item] of watches) {
      if (directories.get(directory) !== item.identity) {
        item.watcher.close();
        watches.delete(directory);
      }
    }
    for (const [directory, identity] of directories) {
      if (watches.has(directory)) continue;
      const watcher = watch(directory, schedule);
      watcher.on('error', (error) => {
        watcher.close();
        watches.delete(directory);
        status(error);
      });
      watches.set(directory, { identity, watcher });
    }
  }
  async function update() {
    clearTimeout(timer);
    timer = undefined;
    if (closed) return;
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      try {
        await register();
        if (!closed) await review.refresh();
        if (!closed) status();
      } catch (error) {
        if (!closed) status(error);
      }
    })();
    await running;
    running = undefined;
    if (dirty && !closed) {
      dirty = false;
      schedule();
    }
  }
  function schedule() {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  }
  try {
    await register();
    status();
  } catch (error) {
    status(error);
  }
  return {
    async retry() {
      try {
        await register();
        const state = await review.refresh();
        status();
        return state;
      } catch (error) {
        status(error);
        throw error;
      }
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      for (const { watcher } of watches.values()) watcher.close();
      watches.clear();
      await running;
    },
  };
}
