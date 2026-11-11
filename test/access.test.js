import assert from 'node:assert/strict';
import os from 'node:os';
import { test } from 'node:test';
import {
  accessFor,
  preferredPort,
  publicOrigin,
  REMOTE_PORT,
  remoteSession,
} from '../src/access.js';

const desktop = { DISPLAY: ':0' };
const codespace = {
  CODESPACES: 'true',
  CODESPACE_NAME: 'fluffy-space-x7',
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
};

test('remote sessions are SSH, codespaces or headless Linux', () => {
  assert.equal(remoteSession(desktop, 'linux'), false);
  assert.equal(remoteSession({}, 'darwin'), false);
  assert.equal(
    remoteSession({ ...desktop, SSH_CONNECTION: '10.0.0.2 5000 10.0.0.1 22' }, 'linux'),
    true,
  );
  assert.equal(remoteSession({ SSH_TTY: '/dev/pts/1' }, 'darwin'), true);
  assert.equal(remoteSession({ ...desktop, ...codespace }, 'linux'), true);
  assert.equal(remoteSession({}, 'linux'), true, 'multiplexer pane on a headless host');
  assert.equal(remoteSession({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux'), false);
});

test('preferred port: SPECTATER_PORT, then config, then the remote default, else random', () => {
  assert.equal(preferredPort({}, desktop, 'linux'), 0);
  assert.equal(preferredPort({}, {}, 'linux'), REMOTE_PORT);
  assert.equal(preferredPort({ port: 9000 }, desktop, 'linux'), 9000);
  assert.equal(preferredPort({ port: 9000 }, { SPECTATER_PORT: '9100' }, 'linux'), 9100);
  assert.throws(() => preferredPort({}, { SPECTATER_PORT: 'abc' }, 'linux'), /SPECTATER_PORT/);
  assert.throws(() => preferredPort({}, { SPECTATER_PORT: '0' }, 'linux'), /SPECTATER_PORT/);
});

test('public origin applies only on the configured port; codespaces derive it per port', () => {
  const config = { port: 47421, publicUrl: 'https://forge.example.ts.net:47421' };
  assert.equal(publicOrigin(config, 47421, {}), config.publicUrl);
  assert.equal(publicOrigin(config, 47422, {}), undefined, 'fallback port stays on loopback');
  assert.equal(publicOrigin({}, 47420, {}), undefined);
  assert.equal(publicOrigin({}, 47420, codespace), 'https://fluffy-space-x7-47420.app.github.dev');
  assert.equal(publicOrigin({}, 47420, { ...codespace, CODESPACE_NAME: 'a/b' }), undefined);
});

test('access names the tunnel for remote sessions and the public mode for proxied reviews', () => {
  const record = { url: 'http://127.0.0.1:47420/review/x#cap', port: 47420 };
  const host = os.hostname().split('.')[0];
  assert.deepEqual(accessFor(record, {}, {}, 'linux'), {
    mode: 'tunnel',
    port: 47420,
    command: `ssh -N -L 47420:127.0.0.1:47420 ${host}`,
  });
  assert.equal(accessFor(record, {}, desktop, 'linux'), undefined);
  assert.deepEqual(
    accessFor({ ...record, publicUrl: 'https://p/review/x#cap' }, {}, desktop, 'linux'),
    {
      mode: 'public',
      port: 47420,
    },
  );
  assert.equal(
    accessFor({ url: 'http://127.0.0.1:47422/r#c' }, { publicUrl: 'https://p' }, desktop, 'linux')
      .command,
    `ssh -N -L 47422:127.0.0.1:47422 ${host}`,
    'a public URL that did not apply falls back to a tunnel',
  );
});
