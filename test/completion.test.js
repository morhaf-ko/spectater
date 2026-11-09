import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { launchFixture } from '../scripts/cli-fixture.js';
import { compareSources } from '../src/changes.js';
import { controlRequest, startControl } from '../src/control.js';
import { openReview } from '../src/review.js';
import { fixture, sample } from './helpers.js';

async function comment(review) {
  const d = review.view().documents[0],
    start = d.source.indexOf('exact');
  await review.mutate({
    action: 'comment',
    revision: review.state.revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    quote: 'exact',
    precision: 'exact',
    body: 'Retain this feedback.',
  });
}

test('ending preserves feedback, refuses queued abandonment and ends listeners until explicit resume', async (t) => {
  const f = await fixture();
  let review = await openReview(f.options, { directory: f.stateDir }),
    control;
  t.after(async () => {
    await control?.close();
    await review.close();
    await f.cleanup();
  });
  const mutate = (input) => review.mutate({ revision: review.state.revision, ...input });
  await comment(review);
  await mutate({ action: 'submit' });
  await assert.rejects(mutate({ action: 'end' }), /Deliver or cancel/);
  await mutate({ action: 'cancel-batch', id: review.state.batches[0].id });
  let waiting;
  const ready = new Promise((resolve) => {
    waiting = resolve;
  });
  control = await startControl(review, 'http://127.0.0.1/review/example', (count) => {
    if (count) waiting();
  });
  const pending = controlRequest(
    f.stateDir,
    review.state.reviewId,
    '/next?after=1&wait=5000',
    'GET',
    6000,
  );
  await ready;
  await mutate({ action: 'end' });
  assert.equal((await pending).status, 'ended');
  assert.equal(
    (await controlRequest(f.stateDir, review.state.reviewId, '/next?after=0&wait=0')).status,
    'ended',
  );
  await assert.rejects(
    mutate({ action: 'edit', id: review.state.comments[0].id, body: 'Rejected.' }),
    /Review ended/,
  );
  await assert.rejects(review.refresh(), /Resume explicitly/);
  await control.close();
  control = undefined;
  const endedAt = review.state.endedAt;
  await review.close();
  review = await openReview(f.options, { directory: f.stateDir });
  assert.equal(review.state.endedAt, endedAt);
  assert.equal(review.state.comments.length, 1);
  await writeFile(f.file, `Updated while ended.\n\n${sample}`);
  await mutate({ action: 'resume' });
  assert.equal(review.state.endedAt, undefined);
  assert.match(review.view().documents[0].source, /Updated while ended/);
});

test('CLI end returns ended, rejects ordinary reopening and resumes explicitly on the same server', async (t) => {
  const f = await fixture();
  let cli;
  t.after(async () => {
    await cli?.close();
    await f.cleanup();
  });
  cli = await launchFixture('bin/spectater.js', f);
  const state = await cli.request('state');
  const env = { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile };
  const run = (args) =>
    promisify(execFile)(process.execPath, ['bin/spectater.js', ...args], { env, timeout: 15000 });
  assert.equal(JSON.parse((await run(['end', '--review', state.reviewId])).stdout).status, 'ended');
  assert.equal(
    JSON.parse(
      (
        await run([
          'feedback',
          '--review',
          state.reviewId,
          '--after',
          '0',
          '--wait',
          '0',
          '--format',
          'json',
        ])
      ).stdout,
    ).status,
    'ended',
  );
  const open = ['open', '--project', f.project, '--change', 'example', '--no-open'];
  await assert.rejects(run(open), /Use --reopen/);
  const resumed = await run([...open, '--reopen']);
  assert.match(resumed.stdout, /Reused active review/);
  assert.equal((await cli.request('state')).endedAt, undefined);
});

test('source comparisons retain previous manifests across metadata changes, removals and restart', async (t) => {
  const f = await fixture();
  let review = await openReview(f.options, { directory: f.stateDir });
  t.after(async () => {
    await review.close();
    await f.cleanup();
  });
  assert.equal(review.view().hasPreviousSource, false);
  await writeFile(f.file, '# Changed proposal\n\nReview this exact sentence.\n');
  await review.refresh();
  const changed = review.view().changes[0];
  assert.equal(changed.status, 'changed');
  const diff = await review.compare(changed.id);
  assert.match(diff.diff, /-# Fixture proposal/);
  assert.match(diff.diff, /\+# Changed proposal/);
  assert.ok(!diff.diff.includes(f.directory));
  const baseline = review.state.previousDocuments;
  await comment(review);
  assert.deepEqual(review.state.previousDocuments, baseline);
  await review.refresh();
  assert.deepEqual(review.state.previousDocuments, baseline);
  const specs = path.join(f.changeRoot, 'specs', 'capability');
  await mkdir(specs, { recursive: true });
  await writeFile(path.join(specs, 'spec.md'), '# Added spec\n');
  await unlink(f.file);
  await review.refresh();
  assert.deepEqual(
    review
      .view()
      .changes.map((item) => item.status)
      .sort(),
    ['added', 'removed'],
  );
  for (const item of review.view().changes)
    assert.match((await review.compare(item.id)).diff, /Added spec|Changed proposal/);
  const changes = review.view().changes;
  await review.close();
  review = await openReview(f.options, { directory: f.stateDir });
  assert.deepEqual(review.view().changes, changes);
  await assert.rejects(review.compare('unknown'), /No source comparison/);
});

test('native comparison failures remain bounded and remove only their owned temporary snapshots', async (t) => {
  const f = await fixture();
  const review = await openReview(f.options, { directory: f.stateDir });
  t.after(async () => {
    await review.close();
    await f.cleanup();
  });
  await writeFile(f.file, 'Changed.\n');
  await review.refresh();
  const id = review.view().changes[0].id;
  let directory;
  await assert.rejects(
    compareSources(review.state, id, async (command, args, options) => {
      assert.equal(command, 'git');
      assert.ok(args.includes('--no-ext-diff'));
      assert.ok(args.includes('--no-textconv'));
      assert.equal(options.timeout, 3000);
      assert.equal(options.maxBuffer, 256 * 1024);
      assert.equal(options.env.GIT_EXTERNAL_DIFF, undefined);
      directory = options.cwd;
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }),
    /Comparison unavailable/,
  );
  await assert.rejects(access(directory));
  assert.equal(review.view().documents[0].source, 'Changed.\n');
});
