import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { listServers } from '../src/agent.js';
import { alive } from '../src/storage.js';

/** A local desktop session, so results do not depend on whether the test host looks remote. */
export const localSession = {
  SSH_CONNECTION: '',
  SSH_TTY: '',
  CODESPACES: '',
  BROWSER: '',
  DISPLAY: ':0',
  SPECTATER_PORT: '',
  SPECTATER_REMOTE: '',
  WSL_DISTRO_NAME: '',
  TMUX: '',
  SPECTATER_TAILSCALE: '0',
  SPECTATER_HERDR_CHIME: '',
};

/** Runs the CLI against a test fixture's project, state directory and config. */
export function cli(bin, f, env = {}) {
  const entry = path.resolve(bin);
  return (args, options = {}) =>
    promisify(execFile)(process.execPath, [entry, ...args], {
      cwd: f.project,
      env: {
        ...process.env,
        SPECTATER_STATE_DIR: f.stateDir,
        SPECTATER_CONFIG: f.configFile,
        ...localSession,
        ...env,
      },
      timeout: 60000,
      ...options,
    });
}

/** Starts a detached review server for the fixture's `example` change. */
export async function launchFixture(bin, f, { reopen = false, env = {} } = {}) {
  const run = cli(bin, f, env);
  const opened = JSON.parse(
    (await run(['open', 'example', '--no-open', ...(reopen ? ['--reopen'] : [])])).stdout,
  );
  const url = new URL(opened.url);
  const route = `${url.origin}${url.pathname}`;
  const [record] = (await listServers(f.stateDir)).filter((item) => item.url === opened.url);
  const request = async (endpoint, input) => {
    const response = await fetch(`${route}/${endpoint}`, {
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
  return {
    opened,
    url: url.href,
    pid: record.pid,
    request,
    run,
    async close() {
      if (!alive(record.pid)) return;
      await run(['stop', 'example']);
      for (let i = 0; i < 100 && alive(record.pid); i++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (alive(record.pid)) throw new Error('Fixture server did not stop.');
    },
  };
}
