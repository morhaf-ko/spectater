import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listServers } from '../src/agent.js';
import { loadState } from '../src/storage.js';
import { fixture } from '../test/helpers.js';
import { launchFixture } from './cli-fixture.js';

const f = await fixture();
let server;
try {
  const before = await readFile(f.file);
  server = await launchFixture('bin/spectater.js', f);
  const state = await server.request('state');
  assert.equal(state.documents[0].source, before.toString());
  await server.close();
  server = null;
  assert.deepEqual(await listServers(f.stateDir), []);
  assert.ok(await loadState(f.stateDir, state.reviewId));
  assert.deepEqual(await readFile(f.file), before);
  console.log('Smoke passed: detached start, manifest, private state, stop and unchanged source.');
} finally {
  await server?.close();
  await f.cleanup();
}
