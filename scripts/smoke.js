import { parseArgs } from 'node:util';
import { fixture } from '../test/helpers.js';
import { launchFixture } from './cli-fixture.js';
import { loadState } from '../src/storage.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { values } = parseArgs({ options: { fixture: { type: 'string' }, 'no-open': { type: 'boolean' } } });
assert.equal(values.fixture, 'local-review');
assert.equal(values['no-open'], true);
const f = await fixture();
let cli;
try {
  const before = await readFile(f.file);
  cli = await launchFixture('bin/spectater.js', f);
  const state = await cli.request('state');
  assert.equal(state.documents[0].source, before.toString());
  await cli.close(); cli = null;
  assert.ok(await loadState(f.stateDir, state.reviewId));
  assert.deepEqual(await readFile(f.file), before);
  console.log('Smoke passed: CLI readiness, manifest, private state, SIGTERM shutdown and canonical-byte preservation. Browser acceptance is a separate gate.');
} finally { await cli?.close(); await f.cleanup(); }
