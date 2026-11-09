import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const COMMAND = 'spectater status --hook';
const managed = (value) => typeof value === 'string' && value.includes(COMMAND);

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function updateJson(file, update) {
  const text = await readText(file);
  const current = text === undefined ? {} : JSON.parse(text);
  const next = update(structuredClone(current));
  if (JSON.stringify(next) === JSON.stringify(current)) return 'unchanged';
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  return text === undefined ? 'created' : 'updated';
}

// Claude Code and Codex share the SessionStart hook schema.
function sessionStart(remove) {
  return (settings) => {
    settings.hooks ||= {};
    const groups = (settings.hooks.SessionStart || [])
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !managed(h.command)) }))
      .filter((group) => group.hooks.length);
    if (!remove)
      groups.push({ matcher: '', hooks: [{ type: 'command', command: COMMAND, timeout: 10 }] });
    if (groups.length) settings.hooks.SessionStart = groups;
    else delete settings.hooks.SessionStart;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
    return settings;
  };
}

function copilot(settings) {
  settings.version = 1;
  settings.hooks ||= {};
  const hooks = (settings.hooks.sessionStart || []).filter((h) => !managed(h.bash));
  hooks.push({ type: 'command', bash: `${COMMAND} copilot`, timeoutSec: 10 });
  settings.hooks.sessionStart = hooks;
  return settings;
}

const OPENCODE_MARKER = '// Managed by spectater setup hooks.';
const openCodePlugin = `${OPENCODE_MARKER}
import { execFile } from 'node:child_process';

export const SpecTaterPlugin = async ({ directory }) => {
  const seen = new Map();
  const status = () =>
    new Promise((resolve) =>
      execFile('spectater', ['status', '--hook'], { cwd: directory, timeout: 10000 }, (error, stdout) =>
        resolve(error ? '' : stdout.trim()),
      ),
    );
  return {
    'experimental.chat.system.transform': async (input, output) => {
      const key = input.sessionID ?? '';
      if (!seen.has(key)) seen.set(key, await status());
      if (seen.get(key)) output.system.push(seen.get(key));
    },
  };
};
`;

async function openCode(file, remove) {
  const text = await readText(file);
  if (text !== undefined && !text.startsWith(OPENCODE_MARKER))
    throw new Error('refusing to replace an unmanaged plugin');
  if (remove) {
    if (text === undefined) return 'unchanged';
    await rm(file);
    return 'removed';
  }
  if (text === openCodePlugin) return 'unchanged';
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, openCodePlugin);
  return text === undefined ? 'created' : 'updated';
}

async function exists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function removeFile(file) {
  if ((await readText(file)) === undefined) return 'unchanged';
  await rm(file);
  return 'removed';
}

/**
 * Installs or removes SessionStart hooks for each agent whose configuration directory exists.
 * Returns one result per agent and never throws.
 */
export async function setupHooks({ remove = false, home = os.homedir(), env = process.env } = {}) {
  const copilotHome = env.COPILOT_HOME || path.join(home, '.copilot');
  const targets = [
    {
      agent: 'Claude Code',
      directory: path.join(home, '.claude'),
      file: path.join(home, '.claude', 'settings.json'),
      apply: (file) => updateJson(file, sessionStart(remove)),
    },
    {
      agent: 'Codex',
      directory: path.join(home, '.codex'),
      file: path.join(home, '.codex', 'hooks.json'),
      apply: (file) => updateJson(file, sessionStart(remove)),
    },
    {
      agent: 'OpenCode',
      directory: path.join(home, '.config', 'opencode'),
      file: path.join(home, '.config', 'opencode', 'plugins', 'spectater.js'),
      apply: (file) => openCode(file, remove),
    },
    {
      agent: 'GitHub Copilot CLI',
      directory: copilotHome,
      file: path.join(copilotHome, 'hooks', 'spectater.json'),
      apply: (file) => (remove ? removeFile(file) : updateJson(file, copilot)),
    },
  ];
  const results = [];
  for (const { agent, directory, file, apply } of targets) {
    try {
      const result = (await exists(directory)) ? await apply(file) : 'skipped (not installed)';
      results.push({ agent, file, result });
    } catch (error) {
      results.push({ agent, file, result: 'failed', error: error.message });
    }
  }
  return results;
}
