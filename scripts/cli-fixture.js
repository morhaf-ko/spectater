import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function launchFixture(bin, f, { noOpen = true, env = {} } = {}) {
  const child = spawn(process.execPath, [bin, 'open', '--project', f.project, '--change', 'example', ...(noOpen ? ['--no-open'] : [])], {
    env: { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Fixture CLI readiness timed out.')); }, 20000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Ready: (http:\/\/[^\n]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${errors}`)); });
  });
  const url = new URL(await ready);
  const route = `${url.origin}${url.pathname}`;
  const request = async (endpoint, input) => {
    const response = await fetch(`${route}/${endpoint}`, { method: input ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin, 'Content-Type': 'application/json' },
      ...(input ? { body: JSON.stringify(input) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  };
  return { child, url: url.href, request, get errors() { return errors; }, async close() {
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
    if (child.exitCode !== 0) throw new Error(`Fixture shutdown failed: ${errors}`);
  } };
}
