import assert from 'node:assert/strict';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { agentRequest } from '../src/agent.js';
import { compareSources } from '../src/changes.js';
import { openReview } from '../src/review.js';
import { startServer } from '../src/server.js';
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
    server;
  t.after(async () => {
    if (server) await server.close();
    else await review.close();
    await f.cleanup();
  });
  const mutate = (input) => review.mutate({ revision: review.state.revision, ...input });
  await comment(review);
  await mutate({ action: 'submit' });
  await assert.rejects(mutate({ action: 'end' }), /Deliver or cancel/);
  await mutate({ action: 'cancel-batch', id: review.state.batches[0].id });
  server = await startServer(review, { watch: false });
  const pending = agentRequest(server, 'wait', { timeout: 5000 }, 10000);
  while (!(await agentRequest(server, 'status')).listening)
    await new Promise((resolve) => setTimeout(resolve, 20));
  await mutate({ action: 'end' });
  assert.equal((await pending).status, 'ended');
  assert.equal((await agentRequest(server, 'wait', { timeout: 0 })).status, 'ended');
  await assert.rejects(
    mutate({ action: 'edit', id: review.state.comments[0].id, body: 'Rejected.' }),
    /Review ended/,
  );
  await assert.rejects(review.refresh(), /Resume explicitly/);
  const endedAt = review.state.endedAt;
  await server.close();
  server = undefined;
  review = await openReview(f.options, { directory: f.stateDir });
  assert.equal(review.state.endedAt, endedAt);
  assert.equal(review.state.comments.length, 1);
  await writeFile(f.file, `Updated while ended.\n\n${sample}`);
  await mutate({ action: 'resume' });
  assert.equal(review.state.endedAt, undefined);
  assert.match(review.view().documents[0].source, /Updated while ended/);
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
