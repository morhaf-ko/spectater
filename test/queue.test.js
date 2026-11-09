import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { controlRequest } from '../src/control.js';
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
    async serve() {
      server = await startServer(review);
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
  const batch = await s.review.claimBatch({ after: 0 });
  const claimedRevision = s.review.state.revision;
  assert.deepEqual(await s.review.claimBatch({ after: 0 }), batch);
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
  await s.serve();
  await s.comment('Correct me.');
  await s.comment('Remove me.');
  await s.mutate({ action: 'submit' });
  const batch = s.review.state.batches[0],
    original = feedback(s.review.state, batch.id);
  await s.mutate({ action: 'edit-batch', id: batch.id });
  assert.equal(
    (await controlRequest(s.f.stateDir, s.review.state.reviewId, '/next?after=0&wait=0')).status,
    'timeout',
  );
  await assert.rejects(s.review.claimBatch({ batchId: batch.id }), /being edited/);
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
  assert.equal((await s.review.claimBatch({ after: 0 })).id, replacement.id);
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
  const lostClaim = s.review.claimBatch({ batchId: first.id });
  await cancelled;
  await assert.rejects(lostClaim, /withdrawn/);
  assert.equal(await s.review.claimBatch({ after: 0 }), null);
  await s.mutate({ action: 'submit' });
  const second = s.review.state.batches[1];
  const claim = s.review.claimBatch({ batchId: second.id });
  const lostCancel = s.mutate({ action: 'cancel-batch', id: second.id });
  assert.equal((await claim).id, second.id);
  await assert.rejects(lostCancel, /conflict/);
  await assert.rejects(s.mutate({ action: 'cancel-batch', id: second.id }), /already handed off/);
  await assert.rejects(s.mutate({ action: 'edit-batch', id: second.id }), /already handed off/);
  await s.restart();
  assert.equal(s.review.view().queue[first.id].status, 'cancelled');
  assert.equal(s.review.view().queue[second.id].status, 'claimed');
  assert.equal((await s.review.claimBatch({ after: 0 })).id, second.id);
});

test('CLI uses live claims, skips cancelled batches and requires explicit offline archive reads', async (t) => {
  const s = await setup(t);
  await s.serve();
  const env = {
    ...process.env,
    SPECTATER_STATE_DIR: s.f.stateDir,
    SPECTATER_CONFIG: s.f.configFile,
  };
  const run = (args) =>
    promisify(execFile)(process.execPath, ['bin/spectater.js', ...args], { env, timeout: 15000 });
  await s.comment('Withdrawn.');
  await s.mutate({ action: 'submit' });
  const batch = s.review.state.batches[0],
    id = s.review.state.reviewId;
  await s.mutate({ action: 'cancel-batch', id: batch.id });
  await assert.rejects(run(['feedback', '--review', id, '--batch', batch.id]), /withdrawn/);
  const archived = await run([
    'feedback',
    '--review',
    id,
    '--batch',
    batch.id,
    '--history',
    '--format',
    'json',
  ]);
  assert.equal(JSON.parse(archived.stdout).id, batch.id);
  assert.equal(s.review.view().activity[batch.id], undefined);
  await s.mutate({ action: 'submit' });
  const pending = s.review.state.batches[1];
  await s.stop();
  await assert.rejects(
    run(['feedback', '--review', id, '--batch', pending.id]),
    /Reopen it for delivery/,
  );
  await assert.rejects(
    run(['feedback', '--review', id, '--after', '0', '--wait', '0']),
    /Reopen it before/,
  );
  assert.equal(
    (await run(['feedback', '--review', id, '--batch', batch.id, '--history', '--format', 'json']))
      .stdout,
    archived.stdout,
  );
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
    await assert.rejects(s.review.claimBatch({ batchId: batch.id }));
    assert.equal(JSON.stringify(s.review.state), before);
  } finally {
    await rmdir(file);
    await rename(backup, file);
  }
  await s.mutate({ action: 'cancel-batch', id: batch.id });
  assert.equal(s.review.view().queue[batch.id].status, 'cancelled');
});
