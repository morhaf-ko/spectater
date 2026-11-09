import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rename, mkdir, unlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import { openReview } from '../src/review.js';
import { watchChange } from '../src/watch.js';
import { fixture, sample } from './helpers.js';

function nextRefresh(review, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Source update timed out.')); }, 10000);
    const unsubscribe = review.subscribe(event => {
      if (event.type === 'refresh' && predicate(review.view())) { clearTimeout(timer); unsubscribe(); resolve(); }
    });
  });
}

test('selected directory events refresh direct/atomic writes and native artifact additions/removals', async t => {
  const f = await fixture(); const review = await openReview(f.options, { directory: f.stateDir }); let watcher;
  t.after(async () => { await watcher?.close(); await review.close(); await f.cleanup(); });
  let status;
  watcher = await watchChange(review, event => { status = event; });
  assert.equal(status.automatic, true);
  let next = nextRefresh(review, view => view.documents[0].source.startsWith('Direct'));
  await writeFile(f.file, 'Direct edit.\n\n' + sample); await next;
  next = nextRefresh(review, view => view.documents[0].source.startsWith('Atomic'));
  await writeFile(f.file + '.tmp', 'Atomic replacement.\n\n' + sample);
  await rename(f.file + '.tmp', f.file); await next;
  next = nextRefresh(review, view => view.documents.some(d => d.path.endsWith('spec.md')));
  const specs = path.join(f.changeRoot, 'specs', 'new-capability'); await mkdir(specs, { recursive: true });
  await writeFile(path.join(specs, 'spec.md'), '# New capability\n'); await next;
  next = nextRefresh(review, view => !view.documents.some(d => d.path.endsWith('spec.md')));
  await unlink(path.join(specs, 'spec.md')); await next;
  const revision = review.state.revision;
  await review.refresh(); assert.equal(review.state.revision, revision);
  await watcher.close(); watcher = null;
  await writeFile(f.file, 'After close.'); assert.equal(review.state.revision, revision);
});

test('unchanged events avoid persistence and unsafe sources retain the last valid review', async t => {
  const f = await fixture(); const review = await openReview(f.options, { directory: f.stateDir }); let watcher;
  t.after(async () => { await watcher?.close(); await review.close(); await f.cleanup(); });
  let resolveStatus;
  watcher = await watchChange(review, event => resolveStatus?.(event));
  const event = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Watch event timed out.')), 10000);
    resolveStatus = result => { clearTimeout(timer); resolveStatus = undefined; resolve(result); };
  });
  let update = event(); const revision = review.state.revision;
  await writeFile(f.file, sample); assert.equal((await update).automatic, true);
  assert.equal(review.state.revision, revision);
  const outside = path.join(f.directory, 'outside.md'); await writeFile(outside, 'Outside source');
  update = event(); await unlink(f.file); await symlink(outside, f.file);
  const failure = await update; assert.equal(failure.automatic, false); assert.match(failure.error, /Automatic updates unavailable/);
  assert.equal(review.view().documents[0].source, sample);
  assert.equal(review.state.revision, revision);
  update = event(); await unlink(f.file); await writeFile(f.file, 'Recovered.\n');
  assert.equal((await update).automatic, true); assert.equal(review.view().documents[0].source, 'Recovered.\n');
});
