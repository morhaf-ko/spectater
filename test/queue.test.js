import assert from 'node:assert/strict';
import { mkdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { cli } from '../scripts/cli-fixture.js';
import { removeServer, writeServer } from '../src/agent.js';
import { openReview } from '../src/review.js';
import { startServer } from '../src/server.js';
import { feedback } from '../src/storage.js';
import { fixture } from './helpers.js';

async function setup(t) {
  const f = await fixture();
  let review = await openReview(f.options, { directory: f.stateDir });
  let server;
  const mutate = (input) => review.mutate({ revision: review.state.revision, ...input });
  const comment = (body) => {
    const d = review.view().documents[0],
      start = d.source.indexOf('exact');
    return mutate({
      action: 'comment',
      documentId: d.id,
      hash: d.hash,
      start,
      end: start + 5,
      quote: 'exact',
      precision: 'exact',
      body,
    });
  };
  t.after(async () => {
    if (server) await server.close();
    else await review.close();
    await f.cleanup();
  });
  return {
    f,
    mutate,
    comment,
    get review() {
      return review;
    },
    get server() {
      return server;
    },
    async serve() {
      server = await startServer(review, { watch: false });
    },
    async restart() {
      if (server) {
        await server.close();
        server = undefined;
      } else await review.close();
      review = await openReview(f.options, { directory: f.stateDir });
    },
    async stop() {
      await server.close();
      server = undefined;
      review = { close() {} };
    },
  };
}

test('default submission sends only new/changed comments and prevents duplicate queued versions', async (t) => {
  const s = await setup(t);
  await s.comment('First.');
  await s.comment('Unchanged.');
  await s.mutate({ action: 'submit' });
  const [first] = s.review.state.comments;
  await assert.rejects(s.mutate({ action: 'submit' }), /new or changed/);
  await s.mutate({ action: 'edit', id: first.id, body: 'Changed while queued.' });
  assert.equal(s.review.view().pendingCommentIds.length, 0);
  await assert.rejects(s.mutate({ action: 'submit' }), /new or changed/);
  const batch = await s.review.deliver();
  const claimedRevision = s.review.state.revision;
  assert.deepEqual(await s.review.deliver(), batch);
  assert.equal(s.review.state.revision, claimedRevision);
  await s.comment('New comment.');
  await s.mutate({ action: 'submit' });
  const correction = s.review.state.batches[1];
  assert.deepEqual(
    correction.entries.map((entry) => entry.body),
    ['Changed while queued.', 'New comment.'],
  );
  assert.equal(s.review.state.batches[0].entries[0].body, 'First.');
});

test('queued edits pause delivery across restart and explicit updates preserve immutable history', async (t) => {
  const s = await setup(t);
  await s.comment('Correct me.');
  await s.comment('Remove me.');
  await s.mutate({ action: 'submit' });
  const batch = s.review.state.batches[0],
    original = feedback(s.review.state, batch.id);
  await s.mutate({ action: 'edit-batch', id: batch.id });
  assert.equal(await s.review.deliver(), null);
  await s.restart();
  assert.equal(s.review.view().queue[batch.id].status, 'editing');
  await s.mutate({ action: 'edit', id: batch.entries[0].id, body: 'Corrected.' });
  await s.mutate({ action: 'delete', id: batch.entries[1].id });
  await s.comment('Separate later submission.');
  await s.mutate({ action: 'submit' });
  const replacement = s.review.state.batches[1];
  assert.deepEqual(
    replacement.entries.map((entry) => entry.body),
    ['Corrected.'],
  );
  assert.equal(s.review.view().queue[batch.id].replacementId, replacement.id);
  assert.deepEqual(feedback(s.review.state, batch.id), original);
  assert.equal((await s.review.deliver()).id, replacement.id);
  await s.mutate({ action: 'submit' });
  assert.deepEqual(
    s.review.state.batches[2].entries.map((entry) => entry.body),
    ['Separate later submission.'],
  );
});

test('cancellation and handoff serialize: exactly one can win and cancelled data never reaches cursor delivery', async (t) => {
  const s = await setup(t);
  await s.comment('Cancel first.');
  await s.mutate({ action: 'submit' });
  const first = s.review.state.batches[0];
  const cancelled = s.mutate({ action: 'cancel-batch', id: first.id });
  const lostClaim = s.review.deliver();
  await cancelled;
  assert.equal(await lostClaim, null);
  await s.mutate({ action: 'submit' });
  const second = s.review.state.batches[1];
  const claim = s.review.deliver();
  const lostCancel = s.mutate({ action: 'cancel-batch', id: second.id });
  assert.equal((await claim).id, second.id);
  await assert.rejects(lostCancel, /conflict/);
  await assert.rejects(s.mutate({ action: 'cancel-batch', id: second.id }), /already handed off/);
  await assert.rejects(s.mutate({ action: 'edit-batch', id: second.id }), /already handed off/);
  await s.restart();
  assert.equal(s.review.view().queue[first.id].status, 'cancelled');
  assert.equal(s.review.view().queue[second.id].status, 'claimed');
  assert.equal((await s.review.deliver()).id, second.id);
});

test('CLI wait skips cancelled batches and feedback reads any batch without delivery', async (t) => {
  const s = await setup(t);
  await s.serve();
  const run = cli('bin/spectater.js', s.f);
  await writeServer(s.f.stateDir, {
    reviewId: s.review.state.reviewId,
    pid: process.pid,
    url: s.server.url,
    change: 'example',
    root: s.f.project,
  });
  await s.comment('Withdrawn.');
  await s.mutate({ action: 'submit' });
  const batch = s.review.state.batches[0];
  await s.mutate({ action: 'cancel-batch', id: batch.id });
  assert.equal(
    JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).status,
    'timeout',
  );
  const archived = await run(['feedback', 'example', '--batch', '1']);
  assert.equal(JSON.parse(archived.stdout).id, batch.id);
  assert.equal(s.review.view().activity[batch.id], undefined);
  await s.mutate({ action: 'submit' });
  assert.equal(
    JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).batch.sequence,
    2,
  );
  const { reviewId } = s.review.state;
  await s.stop();
  await removeServer(s.f.stateDir, reviewId);
  assert.equal((await run(['feedback', 'example', '--batch', '1'])).stdout, archived.stdout);
});

test('failed durable handoff does not falsely claim delivery or prevent cancellation', async (t) => {
  const s = await setup(t);
  await s.comment('Preserve on failure.');
  await s.mutate({ action: 'submit' });
  const batch = s.review.state.batches[0],
    before = JSON.stringify(s.review.state);
  const file = path.join(s.f.stateDir, `${s.review.state.reviewId}.json`),
    backup = `${file}.saved`;
  await rename(file, backup);
  await mkdir(file);
  try {
    await assert.rejects(s.review.deliver());
    assert.equal(JSON.stringify(s.review.state), before);
  } finally {
    await rmdir(file);
    await rename(backup, file);
  }
  await s.mutate({ action: 'cancel-batch', id: batch.id });
  assert.equal(s.review.view().queue[batch.id].status, 'cancelled');
});
