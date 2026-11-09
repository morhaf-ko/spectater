import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { listServers } from '../src/agent.js';
import { alive } from '../src/storage.js';
import { fixture } from '../test/helpers.js';

const exec = promisify(execFile);
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'spectater-package-')));
const f = await fixture();
// Runs the installed CLI under Node, the published runtime.
const run = (args) =>
  exec('node', [bin, ...args], {
    cwd: f.project,
    env: { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile },
    timeout: 60000,
  });
let bin;
try {
  const tarball = path.join(temp, 'spectater.tgz');
  await exec('bun', ['pm', 'pack', '--filename', tarball, '--ignore-scripts', '--quiet']);
  const listing = (await exec('tar', ['-tzf', tarball])).stdout.trim().split('\n');
  for (const file of listing)
    assert.match(
      file,
      /^package\/(bin\/|src\/|web\/|skills\/spectater\/SKILL\.md$|README\.md$|LICENSE$|package\.json$)/,
    );
  const install = path.join(temp, 'install');
  await mkdir(install);
  await writeFile(path.join(install, 'package.json'), '{"private":true}');
  await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: install,
    timeout: 120000,
  });
  bin = path.join(install, 'node_modules', 'spectater', 'bin', 'spectater.js');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal((await run(['--version'])).stdout.trim(), version);
  assert.match((await run(['workflow'])).stdout, /spectater wait <change>/);
  assert.match((await run(['skill'])).stdout, /^---\nname: spectater\n/);

  const opened = JSON.parse((await run(['open', 'example', '--no-open'])).stdout);
  assert.equal(opened.status, 'ready');
  const url = new URL(opened.url);
  assert.equal(url.pathname, '/review/example');
  const request = async (endpoint, input) => {
    const response = await fetch(`${url.origin}${url.pathname}/${endpoint}`, {
      method: input ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${url.hash.slice(1)}`,
        Origin: url.origin,
        'Content-Type': 'application/json',
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  };
  let state = await request('state');
  const d = state.documents[0],
    start = d.source.indexOf('exact');
  state = await request('action', {
    action: 'comment',
    revision: state.revision,
    documentId: d.id,
    hash: d.hash,
    start,
    end: start + 5,
    precision: 'exact',
    quote: 'exact',
    body: 'Packaged feedback.',
  });
  await request('action', { action: 'submit', revision: state.revision });
  const waited = JSON.parse((await run(['wait', 'example'])).stdout);
  assert.equal(waited.status, 'batch');
  assert.equal(waited.batch.entries[0].body, 'Packaged feedback.');
  await run(['reply', 'example', '--status', 'working']);
  const message = path.join(temp, 'reply.txt');
  await writeFile(message, 'Packaged agent reply.');
  await run(['reply', 'example', '--message-file', message]);
  assert.equal(
    (await request('state')).activity[waited.batch.id].replies[0].body,
    'Packaged agent reply.',
  );
  const revised = `Package revision.\n\n${d.source}`;
  await writeFile(f.file, revised);
  assert.equal(JSON.parse((await run(['refresh', 'example'])).stdout).status, 'refreshed');
  assert.equal((await request('state')).documents[0].source, revised);
  assert.equal(JSON.parse((await run(['end', 'example'])).stdout).status, 'ended');
  const [{ pid }] = await listServers(f.stateDir);
  await run(['stop', 'example']);
  while (alive(pid)) await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(run(['open', 'example', '--no-open']), /Use --reopen/);
  assert.equal(
    JSON.parse((await run(['open', 'example', '--no-open', '--reopen'])).stdout).status,
    'ready',
  );
  assert.equal(
    (await run(['feedback', 'example', '--batch', '1'])).stdout.includes('Packaged'),
    true,
  );
  console.log(
    `Package passed: ${listing.length} allowlisted files installed with npm and run under Node: open, wait, reply, refresh, end, stop, reopen and feedback.`,
  );
} finally {
  if (bin) await run(['stop', 'example']).catch(() => {});
  await f.cleanup();
  await rm(temp, { recursive: true, force: true });
}
