import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { defaults, loadConfig } from '../src/config.js';
import { fixture } from './helpers.js';

test('missing optional config uses defaults; explicit/env paths must exist', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const missing = path.join(f.directory, 'missing.json');
  assert.deepEqual(await loadConfig(undefined, { XDG_CONFIG_HOME: f.directory }), defaults);
  await assert.rejects(loadConfig(missing), /Cannot read/);
  await assert.rejects(loadConfig(undefined, { SPECTATER_CONFIG: missing }), /Cannot read/);
});

test('partial preferences inherit defaults and malformed/unknown/unsafe preferences fail visibly', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const file = path.join(f.directory, 'config.json');
  await writeFile(file, '{"defaultView":"source"}');
  assert.deepEqual(await loadConfig(file), { defaultView: 'source', openBrowser: true });
  await writeFile(file, JSON.stringify({ openBrowser: false, stateDirectory: f.stateDir }));
  assert.deepEqual(await loadConfig(file), {
    defaultView: 'rendered',
    openBrowser: false,
    stateDirectory: f.stateDir,
  });
  for (const text of [
    '{',
    '[]',
    '{"port":"80"}',
    '{"port":70000}',
    '{"publicUrl":"https://review.example.test"}',
    '{"publicUrl":"https://review.example.test/path","port":47421}',
    '{"publicUrl":"https://user@review.example.test","port":47421}',
    '{"publicUrl":"ftp://review.example.test","port":47421}',
    '{"openBrowser":"false"}',
    '{"defaultView":"edit"}',
    '{"stateDirectory":"relative"}',
  ]) {
    await writeFile(file, text);
    await assert.rejects(loadConfig(file), /Invalid SpecTater config/);
  }
});

test('port and publicUrl are validated and the public origin is normalized', async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const file = path.join(f.directory, 'config.json');
  await writeFile(file, '{"port":47421,"publicUrl":"https://forge.example.ts.net:47421/"}');
  assert.deepEqual(await loadConfig(file), {
    ...defaults,
    port: 47421,
    publicUrl: 'https://forge.example.ts.net:47421',
  });
  await writeFile(file, '{"publicUrl":"https://forge.example.ts.net"}');
  assert.equal(
    (await loadConfig(file, { SPECTATER_PORT: '47421' })).publicUrl,
    'https://forge.example.ts.net',
  );
});
