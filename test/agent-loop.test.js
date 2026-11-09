import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { launchFixture } from '../scripts/cli-fixture.js';
import { activeReview, controlPath, controlRequest, startControl } from '../src/control.js';
import { openReview } from '../src/review.js';
import { startServer } from '../src/server.js';
import { fixture } from './helpers.js';

async function submit(review, body = 'Agent feedback.') {
  const d = review.view().documents[0],
    start = d.source.indexOf('exact');
  await review.mutate({
    action: 'comment',
    revision: review.view().revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    quote: 'exact',
    precision: 'exact',
    body,
  });
  return review.mutate({ action: 'submit', revision: review.view().revision });
}

test('private IPC delivers queued batches repeatably, validates budgets and isolates state locations', async (t) => {
  const f = await fixture();
  let server;
  t.after(async () => {
    await server?.close();
    await f.cleanup();
  });
  const review = await openReview(f.options, { directory: f.stateDir });
  server = await startServer(review);
  const id = review.state.reviewId;
  await submit(review);
  const first = await controlRequest(f.stateDir, id, '/next?after=0&wait=0');
  assert.equal(first.status, 'batch');
  assert.equal(first.batch.sequence, 1);
  assert.deepEqual(await controlRequest(f.stateDir, id, '/next?after=0&wait=0'), first);
  assert.equal((await controlRequest(f.stateDir, id, '/next?after=1&wait=10')).status, 'timeout');
  await assert.rejects(controlRequest(f.stateDir, id, '/next?after=0&wait=55001'), /budget/);
  await assert.rejects(controlRequest(f.stateDir, id, '/next?after=2&wait=0'), /cursor/);
  assert.equal(await activeReview(f.directory, id), null);
  assert.equal((await stat(await controlPath(f.stateDir, id))).mode & 0o777, 0o600);
});

test('a waiting listener receives only after durable submission and shutdown ends another wait', async (t) => {
  const f = await fixture();
  let control, review;
  t.after(async () => {
    await control?.close();
    await review?.close();
    await f.cleanup();
  });
  review = await openReview(f.options, { directory: f.stateDir });
  let ready;
  const listening = new Promise((resolve) => {
    ready = resolve;
  });
  control = await startControl(review, 'http://127.0.0.1/review', (count) => {
    if (count) ready();
  });
  const id = review.state.reviewId;
  const result = controlRequest(f.stateDir, id, '/next?after=0&wait=5000', 'GET', 6000);
  await listening;
  await submit(review);
  const delivered = await result;
  assert.equal(delivered.status, 'batch');
  assert.equal(delivered.batch.entries[0].body, 'Agent feedback.');
  const disk = JSON.parse(
    await (await import('node:fs/promises')).readFile(`${f.stateDir}/${id}.json`, 'utf8'),
  );
  assert.equal(disk.batches[0].id, delivered.batch.id);
  const waitingAgain = new Promise((resolve) => {
    ready = resolve;
  });
  const stopped = controlRequest(f.stateDir, id, '/next?after=1&wait=5000', 'GET', 6000);
  await waitingAgain;
  await control.close();
  control = null;
  assert.equal((await stopped).status, 'stopped');
});

test('IPC startup refuses to replace a regular file', async (t) => {
  const f = await fixture();
  const review = await openReview(f.options, { directory: f.stateDir });
  const socket = await controlPath(f.stateDir, review.state.reviewId);
  t.after(async () => {
    await unlink(socket);
    await review.close();
    await f.cleanup();
  });
  await writeFile(socket, 'preserve', { mode: 0o600 });
  await assert.rejects(
    startControl(review, 'http://127.0.0.1', () => {}),
    /Refusing/,
  );
  assert.equal((await stat(socket)).isFile(), true);
});

test('disconnect cancels only that listener and retains the review state', async (t) => {
  const f = await fixture();
  let control, review;
  t.after(async () => {
    await control?.close();
    await review?.close();
    await f.cleanup();
  });
  review = await openReview(f.options, { directory: f.stateDir });
  let ready, gone;
  const listening = new Promise((resolve) => {
    ready = resolve;
  });
  const disconnected = new Promise((resolve) => {
    gone = resolve;
  });
  control = await startControl(review, 'http://127.0.0.1/review', (count) => {
    if (count) ready();
    else gone();
  });
  const request = http.get({
    socketPath: await controlPath(f.stateDir, review.state.reviewId),
    path: '/next?after=0&wait=5000',
    agent: false,
  });
  request.on('error', () => {});
  await listening;
  request.destroy();
  await disconnected;
  assert.equal(review.state.batches.length, 0);
  await submit(review, 'After disconnect.');
  assert.equal(
    (await controlRequest(f.stateDir, review.state.reviewId, '/next?after=0&wait=0')).batch
      .entries[0].body,
    'After disconnect.',
  );
});

test('installed-style CLI reuses an active review and retrieves queued feedback offline', async (t) => {
  const f = await fixture();
  let cli;
  t.after(async () => {
    await cli?.close();
    await f.cleanup();
  });
  const env = { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile };
  const run = (args) =>
    promisify(execFile)(process.execPath, ['bin/spectater.js', ...args], { env, timeout: 15000 });
  cli = await launchFixture('bin/spectater.js', f);
  let view = await cli.request('state');
  const reopened = await run(['open', '--project', f.project, '--change', 'example', '--no-open']);
  assert.match(reopened.stdout, /Reused active review/);
  assert.ok(reopened.stdout.includes(cli.url));
  const d = view.documents[0],
    start = d.source.indexOf('exact');
  view = await cli.request('action', {
    action: 'comment',
    revision: view.revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    quote: 'exact',
    precision: 'exact',
    body: 'Offline queue.',
  });
  view = await cli.request('action', { action: 'submit', revision: view.revision });
  const args = [
    'feedback',
    '--review',
    view.reviewId,
    '--after',
    '0',
    '--wait',
    '0',
    '--format',
    'json',
  ];
  const before = await run(args);
  assert.equal(JSON.parse(before.stdout).status, 'batch');
  await cli.close();
  cli = null;
  assert.equal((await run(args)).stdout, before.stdout);
  assert.match((await run(['workflow'])).stdout, /refresh --review/);
  assert.match((await run(['skill'])).stdout, /name: spectater/);
});

test('activity survives restart without changing immutable batches and repeated receipts/replies are idempotent', async (t) => {
  const f = await fixture();
  let server, review;
  t.after(async () => {
    await server?.close();
    await f.cleanup();
  });
  review = await openReview(f.options, { directory: f.stateDir });
  server = await startServer(review);
  await submit(review);
  const id = review.state.reviewId,
    batchId = review.state.batches[0].id;
  const immutable = JSON.stringify(review.state.batches);
  const record = (endpoint, input) =>
    controlRequest(f.stateDir, id, `${endpoint}?batch=${batchId}`, 'POST', 5000, input);
  await record('/received');
  const receivedRevision = review.state.revision;
  await record('/received');
  assert.equal(review.state.revision, receivedRevision);
  assert.equal(review.view().activity[batchId].status, 'received');
  await record('/reply', { status: 'working' });
  assert.equal(review.view().activity[batchId].status, 'working');
  // Agent metadata remains writable while source is being revised.
  await writeFile(f.file, '# New source\n');
  await record('/reply', { status: 'done', body: 'Revised the proposal; validation passed.' });
  const revision = review.state.revision;
  await record('/reply', { status: 'done', body: 'Revised the proposal; validation passed.' });
  await record('/received');
  await record('/reply', { status: 'working' });
  assert.equal(review.state.revision, revision);
  await assert.rejects(record('/reply', { status: 'done', body: '' }), /reply must contain/);
  await assert.rejects(record('/reply', { status: 'received' }), /working or done/);
  assert.equal(JSON.stringify(review.state.batches), immutable);
  await server.close();
  server = null;
  review = await openReview(f.options, { directory: f.stateDir });
  server = await startServer(review);
  assert.equal(review.view().activity[batchId].status, 'replied');
  assert.equal(review.view().activity[batchId].replies.length, 1);
  assert.equal(JSON.stringify(review.state.batches), immutable);
});
