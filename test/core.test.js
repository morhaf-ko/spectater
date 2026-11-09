import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, symlink, mkdir, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { discover, hash, readDocument } from '../src/discovery.js';
import { openReview } from '../src/review.js';
import { anchor, locate, render } from '../src/markdown.js';
import { feedback, feedbackMarkdown, loadState, openStore } from '../src/storage.js';
import { startServer, openBrowser } from '../src/server.js';
import { fixture, sample } from './helpers.js';

test('native discovery preserves root, custom paths and missing artifact states', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const r = await discover(f.options);
  assert.equal(r.documents[0].path, 'proposal.md');
  assert.equal(r.artifacts.find(a => a.id === 'design').status, 'ready');
  const schema = path.join(f.project, 'openspec', 'schemas', 'custom');
  await mkdir(schema, { recursive: true });
  await writeFile(path.join(schema, 'schema.yaml'), 'name: custom\nversion: 1\ndescription: Test layout\nartifacts:\n  - id: reader\n    generates: notes/*.md\n    description: Read notes\n    template: reader.md\n    instruction: Read notes\n    requires: []\n');
  await mkdir(path.join(f.changeRoot, 'notes'));
  await writeFile(path.join(f.changeRoot, 'notes', 'review.md'), sample);
  await writeFile(path.join(f.changeRoot, '.openspec.yaml'), 'schema: custom\n');
  const custom = await discover(f.options);
  assert.deepEqual(custom.documents.map(d => d.path), ['notes/review.md']);
  assert.equal(custom.schemaName, 'custom');
});

test('discovery fails closed for missing CLI/change, unsupported version/JSON and global fallback', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await assert.rejects(discover(f.options, async () => { throw new Error('ENOENT openspec'); }), /ENOENT/);
  await assert.rejects(discover(f.options, async () => '2.0.0'), /1.15.0/);
  await assert.rejects(discover(f.options, async args => args[0] === '--version' ? '1.15.0' : 'oops'), /JSON/);
  await assert.rejects(discover({ ...f.options, change: 'missing' }), /not found/);
  await assert.rejects(discover(f.options, async args => args[0] === '--version' ? '1.15.0' : JSON.stringify({ root: { path: f.project, source: 'global_default' } })), /Global default/);
});

test('canonical identities isolate roots and explicit stores propagate to every native call', async t => {
  const f = await fixture(), g = await fixture(); t.after(f.cleanup); t.after(g.cleanup);
  assert.notEqual((await discover(f.options)).reviewId, (await discover(g.options)).reviewId);
  const nativeResult = await discover(f.options);
  const calls = [];
  const run = async args => {
    calls.push(args);
    if (args[0] === '--version') return '1.15.0';
    if (args[0] === 'context') return JSON.stringify({ root: { path: f.project, source: 'store' } });
    if (args[0] === 'list') return JSON.stringify({ root: { path: f.project }, changes: [{ name: 'example' }] });
    return JSON.stringify({ root: { path: f.project }, changeRoot: f.changeRoot, changeName: 'example', schemaName: 'spec-driven', artifacts: nativeResult.artifacts, artifactPaths: Object.fromEntries(nativeResult.artifacts.map(a => [a.id, { existingOutputPaths: a.id === 'proposal' ? [f.file] : [] }])) });
  };
  assert.equal((await discover({ ...f.options, store: 'selected' }, run)).reviewId, nativeResult.reviewId);
  assert.ok(calls.slice(1).every(args => args.includes('--store') && args.includes('selected')));
});

test('actual Git worktrees with the same change slug keep distinct review identities', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const git = args => promisify(execFile)('git', ['-C', f.project, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args]);
  await git(['init', '--quiet']);
  await git(['add', 'openspec']);
  await git(['commit', '--quiet', '-m', 'fixture']);
  const worktree = path.join(f.directory, 'worktree');
  await git(['worktree', 'add', '--detach', worktree, 'HEAD']);
  const first = await discover(f.options);
  const second = await discover({ project: worktree, change: 'example' });
  assert.notEqual(first.reviewId, second.reviewId);
  assert.equal(first.change, second.change);
  await assert.rejects(openStore(first, path.join(f.project, 'state')), /outside the selected/);
  await assert.rejects(openStore(first, path.join(worktree, 'state')), /outside Git/);
});

test('native declared and explicit stores share identity; isolated global default needs selection', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await mkdir(path.join(f.project, 'openspec', 'specs'));
  const env = { ...process.env, OPENSPEC_TELEMETRY: '0', XDG_CONFIG_HOME: path.join(f.directory, 'config'), XDG_DATA_HOME: path.join(f.directory, 'data') };
  const executable = fileURLToPath(new URL('../node_modules/.bin/openspec', import.meta.url));
  const run = async (args, cwd) => (await promisify(execFile)(executable, args, { cwd, env, timeout: 15000, maxBuffer: 4 * 1024 * 1024 })).stdout;
  await run(['store', 'register', f.project, '--id', 'fixture', '--yes', '--json'], f.project);
  const client = path.join(f.directory, 'client');
  await mkdir(path.join(client, 'openspec'), { recursive: true });
  await writeFile(path.join(client, 'openspec', 'config.yaml'), 'store: fixture\n');
  const declared = await discover({ project: client, change: 'example' }, run);
  const explicit = await discover({ project: client, change: 'example', store: 'fixture' }, run);
  assert.equal(declared.source, 'declared'); assert.equal(explicit.source, 'store');
  assert.equal(declared.reviewId, explicit.reviewId);
  await run(['config', 'set', 'defaultStore', 'fixture'], client);
  const empty = path.join(f.directory, 'empty'); await mkdir(empty);
  await assert.rejects(discover({ project: empty, change: 'example' }, run), /Global default/);
  assert.equal((await discover({ project: empty, change: 'example', store: 'fixture' }, run)).reviewId, explicit.reviewId);
});

test('filesystem manifest rejects escaping symlinks and identity changes', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const r = await discover(f.options);
  await unlink(f.file);
  await symlink(path.join(f.project, 'openspec', 'config.yaml'), f.file);
  await assert.rejects(readDocument(r, r.documents[0]), /identity|escaped/);
  await assert.rejects(discover(f.options), /escap|outside|OpenSpec failed/);
});

test('source offsets preserve UTF-16, CRLF and original-byte hash; rendering remains inert', () => {
  const source = '# Title\r\n\r\n😀 **bold** &amp; \\*literal*\r\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) ![remote](https://example.org/a.png)\n\n- [x] done\n\n| A | B |\n| - | - |\n| x | y |\n';
  const snapshot = { source, hash: hash(Buffer.from(source)) };
  const start = source.indexOf('😀');
  assert.equal(anchor(snapshot, { start, end: start + 2, precision: 'exact', quote: '😀' }).slice, '😀');
  assert.throws(() => anchor(snapshot, { start, end: start + 1, precision: 'exact', quote: '😀' }), /match/);
  const html = render(source);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /<table>/); assert.match(html, /Complete/); assert.match(html, /data-precision="enclosing"/);
  assert.equal(render(source), html);
});

test('comment persistence, immutable feedback, revision conflicts, stale/duplicate/deleted reconciliation', async t => {
  const f = await fixture();
  let review = await openReview(f.options, { directory: f.stateDir });
  t.after(async () => { await review?.close(); await f.cleanup(); });
  const before = await readFile(f.file);
  const d = review.view().documents[0], start = d.source.indexOf('exact');
  const input = { action: 'comment', revision: review.view().revision, documentId: d.id, hash: d.hash, start, end: start + 5, precision: 'exact', quote: 'exact', body: 'Clarify this.' };
  await review.mutate(input);
  await assert.rejects(review.mutate(input), /conflict/);
  await review.mutate({ action: 'submit', revision: review.view().revision });
  const batch = review.state.batches[0].id;
  const exported = feedbackMarkdown(feedback(review.state, batch));
  assert.doesNotMatch(exported, new RegExp(f.directory));
  assert.throws(() => feedback(review.state, 'unknown'), /Unknown/);
  assert.deepEqual(await readFile(f.file), before);
  await assert.rejects(openReview(f.options, { directory: f.stateDir }), /lock/);
  await writeFile(f.file, `Introduction.\n\n${sample}`);
  await assert.rejects(review.mutate({ action: 'submit', revision: review.view().revision }), /conflict/);
  await review.refresh();
  assert.equal(review.view().comments[0].status, 'stale');
  await review.mutate({ action: 'reattach', id: review.view().comments[0].id, revision: review.view().revision });
  assert.equal(review.view().comments[0].status, 'current');
  assert.equal(review.state.comments[0].previousAnchors.length, 1);
  assert.equal(feedbackMarkdown(feedback(review.state, batch)), exported);
  await writeFile(f.file, sample + sample);
  await review.refresh(); assert.equal(review.view().comments[0].status, 'orphaned');
  await unlink(f.file);
  await review.refresh(); assert.equal(review.view().comments[0].status, 'orphaned');
  await review.close(); review = null;
  review = await openReview(f.options, { directory: f.stateDir });
  assert.equal(review.view().comments.length, 1);
  assert.equal(feedbackMarkdown(feedback(review.state, batch)), exported);
  assert.equal((await stat(path.join(f.stateDir, `${review.state.reviewId}.json`))).mode & 0o777, 0o600);
});

test('corrupt state is preserved and persistence errors do not acknowledge changes', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const r = await discover(f.options);
  const store = await openStore(r, f.stateDir);
  const state = store.state;
  const file = path.join(f.stateDir, `${r.reviewId}.json`);
  await mkdir(file);
  await assert.rejects(store.commit(state));
  assert.equal(store.state.revision, 0);
  await store.close();
  await unlink(path.join(f.stateDir, `${r.reviewId}.json.lock`)).catch(() => {});
  const f2 = await fixture(); t.after(f2.cleanup);
  const r2 = await discover(f2.options);
  await mkdir(f2.stateDir, { mode: 0o700 });
  const corrupt = path.join(f2.stateDir, `${r2.reviewId}.json`);
  await writeFile(corrupt, '{ broken', { mode: 0o600 });
  await assert.rejects(openStore(r2, f2.stateDir), /Cannot load/);
  assert.equal(await readFile(corrupt, 'utf8'), '{ broken');
  await writeFile(corrupt, JSON.stringify({ formatVersion: 99 }));
  await assert.rejects(loadState(f2.stateDir, r2.reviewId), /unsupported/);
  await chmod(corrupt, 0o644);
  await assert.rejects(loadState(f2.stateDir, r2.reviewId), /private/);
});

test('comment edits and recoverable deletion survive restart without changing submitted batches', async t => {
  const f = await fixture(); let review;
  t.after(async () => { await review?.close(); await f.cleanup(); });
  review = await openReview(f.options, { directory: f.stateDir });
  const d = review.view().documents[0], start = d.source.indexOf('exact');
  const mutate = input => review.mutate({ ...input, revision: review.view().revision });
  await mutate({ action: 'comment', documentId: d.id, hash: d.hash, start, end: start + 5, quote: 'exact', precision: 'exact', body: 'Original feedback.' });
  const id = review.view().comments[0].id;
  await mutate({ action: 'submit' });
  const batchId = review.state.batches[0].id;
  const original = feedbackMarkdown(feedback(review.state, batchId));
  await assert.rejects(mutate({ action: 'edit', id, body: '' }), /1–10,000/);
  await mutate({ action: 'edit', id, body: 'Updated feedback.' });
  assert.equal(review.view().comments[0].hash, d.hash);
  await mutate({ action: 'delete', id });
  assert.equal(review.view().comments.length, 0); assert.equal(review.view().deletedComments.length, 1);
  await assert.rejects(mutate({ action: 'submit' }), /Add an open/);
  await assert.rejects(mutate({ action: 'edit', id, body: 'No' }), /Restore/);
  assert.equal(feedbackMarkdown(feedback(review.state, batchId)), original);
  await review.close(); review = null;
  review = await openReview(f.options, { directory: f.stateDir });
  assert.equal(review.view().deletedComments[0].body, 'Updated feedback.');
  await mutate({ action: 'restore', id });
  assert.equal(review.view().comments[0].body, 'Updated feedback.');
  assert.equal(feedbackMarkdown(feedback(review.state, batchId)), original);
  assert.equal(await readFile(f.file, 'utf8'), d.source);
});

test('local HTTP boundary rejects unauthorized, foreign, oversized and arbitrary-path requests', async t => {
  const f = await fixture();
  const r = await openReview(f.options, { directory: f.stateDir });
  const server = await startServer(r); t.after(async () => { await server.close(); await f.cleanup(); });
  const url = new URL(server.url);
  const headers = { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin, 'Content-Type': 'application/json' };
  assert.equal(server.route, '/review/example');
  assert.notEqual(r.state.reviewId, 'example');
  assert.equal((await fetch(`${server.origin}${server.route}/state`)).status, 403);
  assert.equal((await fetch(`${server.origin}${server.route}/events`)).status, 403);
  const forgedHost = await new Promise((resolve, reject) => {
    const request = http.get(`${server.origin}${server.route}/state`, { headers: { ...headers, Host: 'evil.test' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(forgedHost, 403);
  assert.equal((await fetch(`${server.origin}${server.route}/action`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${server.origin}${server.route}/action`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${server.origin}${server.route}/action`, { method: 'POST', headers, body: JSON.stringify({ body: 'x'.repeat(70000) }) })).status, 413);
  assert.equal((await fetch(`${server.origin}/etc/passwd`, { headers })).status, 404);
  const response = await fetch(`${server.origin}${server.route}/state`, { headers });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await response.json()).documents[0].source, sample);
});

test('browser opener uses exact argument and reports failure without shell execution', async () => {
  const calls = [];
  await openBrowser('http://127.0.0.1:1/review/test#cap', async (...args) => calls.push(args), 'darwin');
  assert.deepEqual(calls[0].slice(0, 2), ['open', ['http://127.0.0.1:1/review/test#cap']]);
  await assert.rejects(openBrowser('http://example', async () => { throw new Error('forced opener failure'); }, 'darwin'), /forced/);
  await assert.rejects(openBrowser('http://example', undefined, 'linux'), /printed URL/);
});
