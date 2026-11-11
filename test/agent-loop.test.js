import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { cli, launchFixture } from '../scripts/cli-fixture.js';
import { agentRequest, listServers } from '../src/agent.js';
import { setupHooks } from '../src/hooks.js';
import { openReview } from '../src/review.js';
import { startServer } from '../src/server.js';
import { alive } from '../src/storage.js';
import { fixture } from './helpers.js';

const bin = 'bin/spectater.js';

async function comment(review, body = 'Agent feedback.') {
  const d = review.view().documents[0],
    start = d.source.indexOf('exact');
  return review.mutate({
    action: 'comment',
    revision: review.state.revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    quote: 'exact',
    precision: 'exact',
    body,
  });
}
async function submit(review, body, extra = {}) {
  await comment(review, body);
  return review.mutate({ action: 'submit', revision: review.state.revision, ...extra });
}
async function served(t, options) {
  const f = await fixture();
  const review = await openReview(f.options, { directory: f.stateDir });
  const server = await startServer(review, options);
  t.after(async () => {
    await server.close();
    await f.cleanup();
  });
  return {
    f,
    review,
    server,
    agent: (op, input, timeout) => agentRequest(server, op, input, timeout),
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test('wait redelivers a batch until the agent replies, then delivers the next one', async (t) => {
  const { review, agent } = await served(t);
  await submit(review, 'First.');
  const first = await agent('wait', { timeout: 0 });
  assert.equal(first.status, 'batch');
  assert.equal(first.batch.sequence, 1);
  assert.equal(review.view().activity[first.batch.id].status, 'received');
  assert.deepEqual((await agent('wait', { timeout: 0 })).batch, first.batch);
  assert.equal((await agent('reply', { status: 'working' })).batch, 1);
  assert.equal((await agent('wait', { timeout: 0 })).batch.id, first.batch.id);
  await agent('reply', { status: 'done', body: 'Revised.' });
  assert.equal((await agent('wait', { timeout: 10 })).status, 'timeout');
  await submit(review, 'Second.');
  assert.equal((await agent('wait', { timeout: 0 })).batch.sequence, 2);
  await assert.rejects(agent('wait', { timeout: -1 }), /timeout must be/);
  await assert.rejects(agent('reply', { status: 'done', body: '' }), /1–10,000/);
  await assert.rejects(agent('reply', { status: 'done', body: 'x', batch: 9 }), /Unknown/);
});

test('a reply re-reads the change when file watching is unavailable', async (t) => {
  // Watching off proves the reply itself re-reads; replies take the same path with a watcher.
  const { f, review, agent } = await served(t, { watch: false });
  await submit(review, 'Revise this.');
  await agent('wait', { timeout: 0 });
  await writeFile(f.file, '# Revised by the agent\n\nReview this exact sentence.\n');
  assert.doesNotMatch(review.view().documents[0].source, /Revised by the agent/);
  await agent('reply', { status: 'done', body: 'Revised.' });
  assert.match(review.view().documents[0].source, /Revised by the agent/);
  assert.equal(review.view().activity[review.state.batches[0].id].status, 'replied');
  await writeFile(f.file, 'x'.repeat(1024 * 1024 + 1));
  const failed = await agent('reply', { status: 'done', body: 'Revised again.', batch: 1 });
  assert.match(failed.sourceError, /1 MiB/);
  assert.match(review.view().documents[0].source, /Revised by the agent/);
});

test('one listener at a time: a second wait is refused unless it takes over', async (t) => {
  const { review, agent } = await served(t);
  const first = agent('wait', { timeout: 5000 }, 10000);
  while (!(await agent('status')).listening) await tick();
  assert.equal((await agent('wait', { timeout: 0 })).status, 'listener_active');
  const second = agent('wait', { timeout: 5000, takeover: true }, 10000);
  assert.equal((await first).status, 'listener_replaced');
  await submit(review, 'For the new listener.');
  assert.equal((await second).batch.entries[0].body, 'For the new listener.');
});

test('a waiting agent receives ended, and stopped when the server closes', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const review = await openReview(f.options, { directory: f.stateDir });
  let server = await startServer(review);
  const agent = (op, input) => agentRequest(server, op, input, 10000);
  let pending = agent('wait', { timeout: 5000 });
  while (!(await agent('status')).listening) await tick();
  await agent('end');
  assert.equal((await pending).status, 'ended');
  assert.equal((await agent('wait', { timeout: 0 })).status, 'ended');
  await agent('resume');
  pending = agent('wait', { timeout: 5000 });
  while (!(await agent('status')).listening) await tick();
  const closed = server.close();
  assert.equal((await pending).status, 'stopped');
  await closed;
  server = null;
});

test('Send & End ends the review only after the final batch is delivered', async (t) => {
  const { review, agent } = await served(t);
  await review.mutate({
    action: 'submit',
    revision: review.state.revision,
    message: 'Overall: tighten the scope.',
    end: true,
  });
  assert.equal(review.state.endedAt, undefined);
  assert.ok(review.view().endRequestedAt);
  const final = await agent('wait', { timeout: 0 });
  assert.equal(final.batch.message, 'Overall: tighten the scope.');
  assert.deepEqual(final.batch.entries, []);
  assert.ok(review.state.endedAt);
  assert.equal((await agent('wait', { timeout: 0 })).batch.id, final.batch.id);
  await agent('reply', { status: 'done', body: 'Scope tightened.' });
  assert.equal((await agent('wait', { timeout: 0 })).status, 'ended');
  await agent('resume');
  await submit(review, 'Queued before Send & End.');
  await review.mutate({ action: 'submit', revision: review.state.revision, end: true });
  assert.equal(review.state.endedAt, undefined, 'a queued batch defers the end');
  assert.equal((await agent('wait', { timeout: 0 })).batch.sequence, 2);
  assert.ok(review.state.endedAt);
  await agent('reply', { status: 'done', body: 'Handled.' });
  await agent('resume');
  await review.mutate({ action: 'submit', revision: review.state.revision, end: true });
  assert.ok(review.state.endedAt, 'Send & End with nothing pending ends immediately');
});

test('idle servers stop themselves and active listeners keep them alive', async (t) => {
  let idle;
  const fired = new Promise((resolve) => {
    idle = resolve;
  });
  const { review, agent } = await served(t, { idleTimeout: 200, onIdle: idle });
  const waiting = agent('wait', { timeout: 400 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  let early = false;
  void fired.then(() => {
    early = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(early, false);
  assert.equal((await waiting).status, 'timeout');
  await fired;
  assert.equal(review.state.batches.length, 0);
});

test('CLI runs the full loop against a detached server addressed by change name', async (t) => {
  const f = await fixture();
  let server;
  t.after(async () => {
    await server?.close();
    await f.cleanup();
  });
  server = await launchFixture(bin, f);
  const run = server.run;
  assert.equal(server.opened.status, 'ready');
  assert.equal(new URL(server.url).pathname, '/review/example');
  const record = (await listServers(f.stateDir))[0];
  assert.equal(
    (await stat(path.join(f.stateDir, `${record.reviewId}.server.json`))).mode & 0o777,
    0o600,
  );
  assert.equal(JSON.parse((await run(['open', 'example', '--no-open'])).stdout).status, 'reused');
  const implicit = JSON.parse((await run(['open', '--no-open'])).stdout);
  assert.deepEqual([implicit.status, implicit.change], ['reused', 'example']);
  const second = path.join(f.project, 'openspec', 'changes', 'second');
  await mkdir(second);
  await writeFile(path.join(second, 'proposal.md'), '# Second\n');
  const ambiguous = await run(['open', '--no-open']).catch((error) => error);
  assert.equal(ambiguous.code, 1);
  const listed = JSON.parse(ambiguous.stdout).error;
  assert.match(listed, /^Choose a change: spectater open <change>\. Active changes: /);
  assert.ok(listed.includes('example') && listed.includes('second'));
  await rm(second, { recursive: true });
  assert.match((await run([])).stdout, /- example .*spectater wait example/);
  const nested = path.join(f.project, 'openspec', 'changes', 'example');
  assert.equal(
    JSON.parse((await run(['wait', 'example', '--timeout', '0'], { cwd: nested })).stdout).status,
    'timeout',
  );

  let view = await server.request('state');
  const d = view.documents[0],
    start = d.source.indexOf('exact');
  view = await server.request('action', {
    action: 'comment',
    revision: view.revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    quote: 'exact',
    precision: 'exact',
    body: 'From the browser.',
  });
  await server.request('action', { action: 'submit', revision: view.revision, message: 'Hi.' });
  const delivered = JSON.parse((await run(['wait', 'example'])).stdout);
  assert.equal(delivered.status, 'batch');
  assert.equal(delivered.batch.message, 'Hi.');
  assert.match(delivered.next_step, /reply --status working/);
  assert.equal(
    JSON.parse((await run(['reply', 'example', '--status', 'working'])).stdout).status,
    'recorded',
  );
  const result = path.join(f.directory, 'result.md');
  await writeFile(result, 'Revised the proposal.\n');
  assert.equal(
    JSON.parse((await run(['reply', 'example', '--message-file', result])).stdout).batch,
    1,
  );
  assert.equal((await server.request('state')).activity[delivered.batch.id].status, 'replied');
  const markdown = (await run(['feedback', 'example', '--batch', '1', '--format', 'markdown']))
    .stdout;
  assert.match(markdown, /## Message\n\n> Hi\./);
  assert.doesNotMatch(markdown, new RegExp(f.directory));

  assert.equal(JSON.parse((await run(['end', 'example'])).stdout).status, 'ended');
  assert.equal(
    JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).status,
    'ended',
  );
  await assert.rejects(run(['open', 'example', '--no-open']), /Use --reopen/);
  assert.equal(
    JSON.parse((await run(['open', 'example', '--no-open', '--reopen'])).stdout).status,
    'reused',
  );
  await server.close();
  const stopped = await run(['wait', 'example', '--timeout', '0']).catch((error) => error);
  assert.equal(stopped.code, 3);
  assert.equal(JSON.parse(stopped.stdout).status, 'stopped');
  assert.deepEqual(await listServers(f.stateDir), []);
  assert.equal(JSON.parse((await run(['feedback', 'example', '--batch', '1'])).stdout).sequence, 1);
  assert.match((await run(['workflow'])).stdout, /spectater wait <change>/);
  assert.match((await run(['skill'])).stdout, /^---\nname: spectater\n/);
  const bad = await run(['wait', 'missing-change', '--timeout', '0']).catch((error) => error);
  assert.equal(JSON.parse(bad.stdout).status, 'error');
});

test('a crashed server leaves no lock or record that blocks the next open', async (t) => {
  const f = await fixture();
  let server;
  t.after(async () => {
    await server?.close();
    await f.cleanup();
  });
  server = await launchFixture(bin, f);
  const { pid } = server;
  process.kill(pid, 'SIGKILL');
  while (alive(pid)) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    JSON.parse((await server.run(['wait', 'example', '--timeout', '0']).catch((e) => e)).stdout)
      .status,
    'stopped',
  );
  server = await launchFixture(bin, f);
  assert.equal(server.opened.status, 'ready');
});

test('setup hooks is idempotent, keeps unrelated hooks and removes only its own entries', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const home = path.join(f.directory, 'home');
  await mkdir(path.join(home, '.claude'), { recursive: true });
  const other = { matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] };
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ model: 'x', hooks: { SessionStart: [other] } }),
  );
  await mkdir(path.join(home, '.codex'), { recursive: true });
  await mkdir(path.join(home, '.copilot'), { recursive: true });
  const env = {};
  const first = await setupHooks({ home, env });
  assert.deepEqual(
    first.map((r) => r.result),
    ['updated', 'created', 'skipped (not installed)', 'created'],
  );
  assert.deepEqual(
    (await setupHooks({ home, env })).map((r) => r.result),
    ['unchanged', 'unchanged', 'skipped (not installed)', 'unchanged'],
  );
  const claude = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
  assert.equal(claude.model, 'x');
  assert.equal(claude.hooks.SessionStart.length, 2);
  await assert.rejects(stat(path.join(home, '.codex', 'config.toml')));
  const copilot = JSON.parse(
    await readFile(path.join(home, '.copilot', 'hooks', 'spectater.json'), 'utf8'),
  );
  assert.equal(copilot.hooks.sessionStart[0].bash, 'spectater status --hook copilot');
  await setupHooks({ home, env, remove: true });
  assert.deepEqual(
    JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8')),
    { model: 'x', hooks: { SessionStart: [other] } },
  );
  await assert.rejects(stat(path.join(home, '.config', 'opencode', 'plugins', 'spectater.js')));
});

test('status --hook prints open reviews for this project only, and nothing otherwise', async (t) => {
  const f = await fixture();
  let server;
  t.after(async () => {
    await server?.close();
    await f.cleanup();
  });
  const run = cli(bin, f);
  assert.equal((await run(['status', '--hook'])).stdout, '');
  assert.equal((await run(['status', '--hook', 'copilot'])).stdout, '{}\n');
  server = await launchFixture(bin, f);
  assert.match((await run(['status', '--hook'])).stdout, /spectater wait example/);
  assert.equal((await run(['status', '--hook'], { cwd: f.directory })).stdout, '');
  assert.match(
    JSON.parse((await run(['status', '--hook', 'copilot'])).stdout).additionalContext,
    /example/,
  );
});

test('the serve process exits cleanly on SIGTERM and removes its record', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const child = spawn(
    process.execPath,
    [path.resolve(bin), 'serve', 'example', '--project', f.project],
    {
      env: { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile },
      stdio: 'ignore',
    },
  );
  while (!(await listServers(f.stateDir)).length)
    await new Promise((resolve) => setTimeout(resolve, 50));
  child.kill('SIGTERM');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.deepEqual(await listServers(f.stateDir), []);
});

test('remote open reports tunnel access on a stable port; a public URL is printed but agents stay on loopback', async (t) => {
  const f = await fixture();
  const free = http.createServer();
  await new Promise((resolve) => free.listen(0, '127.0.0.1', resolve));
  const port = free.address().port;
  await new Promise((resolve) => free.close(resolve));
  const remote = cli(bin, f, {
    SSH_CONNECTION: '10.0.0.2 5000 10.0.0.1 22',
    SPECTATER_PORT: String(port),
  });
  t.after(async () => {
    await remote(['stop', 'example']).catch(() => {});
    while ((await listServers(f.stateDir)).length) await new Promise((r) => setTimeout(r, 50));
    await f.cleanup();
  });
  const opened = JSON.parse((await remote(['open', 'example', '--no-open'])).stdout);
  assert.equal(new URL(opened.url).port, String(port));
  assert.deepEqual([opened.access.mode, opened.access.port], ['tunnel', port]);
  assert.match(
    opened.access.command,
    new RegExp(`^ssh -N -L ${port}:127\\.0\\.0\\.1:${port} \\S+$`),
  );
  assert.match(opened.next_step, /access\.command/);
  const reused = JSON.parse((await remote(['open', 'example', '--no-open'])).stdout);
  assert.deepEqual([reused.status, reused.access], ['reused', opened.access]);
  await remote(['stop', 'example']);
  while ((await listServers(f.stateDir)).length) await new Promise((r) => setTimeout(r, 50));

  await writeFile(f.configFile, JSON.stringify({ publicUrl: 'https://forge.example.test' }));
  const proxied = JSON.parse((await remote(['open', 'example', '--no-open'])).stdout);
  assert.match(proxied.url, /^https:\/\/forge\.example\.test\/review\/example#[a-f0-9]{64}$/);
  assert.deepEqual(proxied.access, { mode: 'public', port });
  const [record] = await listServers(f.stateDir);
  assert.equal(record.url, `http://127.0.0.1:${port}/review/example${new URL(proxied.url).hash}`);
  assert.equal(
    JSON.parse((await remote(['wait', 'example', '--timeout', '0'])).stdout).status,
    'timeout',
  );
});
