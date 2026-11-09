import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

function copilot(remove) {
  return (settings) => {
    settings.version = 1;
    settings.hooks ||= {};
    const hooks = (settings.hooks.sessionStart || []).filter((h) => !managed(h.bash));
    if (!remove) hooks.push({ type: 'command', bash: `${COMMAND} copilot`, timeoutSec: 10 });
    settings.hooks.sessionStart = hooks;
    return settings;
  };
}

// Codex runs hooks only when `[features] hooks = true` is set in config.toml.
async function enableCodexHooks(file) {
  const text = (await readText(file)) ?? '';
  const lines = text.split('\n');
  let inFeatures = false,
    insertAt = -1;
  for (const [index, line] of lines.entries()) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (header) {
      if (inFeatures) break;
      inFeatures = header[1] === 'features';
      if (inFeatures) insertAt = index + 1;
    } else if (inFeatures && /^\s*hooks\s*=/.test(line)) {
      if (/=\s*true\b/.test(line)) return;
      lines[index] = 'hooks = true';
      return writeFile(file, lines.join('\n'));
    }
  }
  if (insertAt >= 0) lines.splice(insertAt, 0, 'hooks = true');
  else lines.splice(text.endsWith('\n') ? -1 : lines.length, 0, '', '[features]', 'hooks = true');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${lines.join('\n').replace(/^\n+/, '')}${text.endsWith('\n') ? '' : '\n'}`,
  );
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

/** Installs or removes SessionStart hooks; returns one result per agent and never throws. */
export async function setupHooks({ remove = false, home = os.homedir(), env = process.env } = {}) {
  const copilotHome = env.COPILOT_HOME || path.join(home, '.copilot');
  const targets = [
    [
      'Claude Code',
      path.join(home, '.claude', 'settings.json'),
      (f) => updateJson(f, sessionStart(remove)),
    ],
    [
      'Codex',
      path.join(home, '.codex', 'hooks.json'),
      async (f) => {
        const result = await updateJson(f, sessionStart(remove));
        if (!remove) await enableCodexHooks(path.join(home, '.codex', 'config.toml'));
        return result;
      },
    ],
    [
      'OpenCode',
      path.join(home, '.config', 'opencode', 'plugins', 'spectater.js'),
      (f) => openCode(f, remove),
    ],
    [
      'GitHub Copilot CLI',
      path.join(copilotHome, 'hooks', 'spectater.json'),
      async (f) => {
        if (remove) {
          if ((await readText(f)) === undefined) return 'unchanged';
          await rm(f);
          return 'removed';
        }
        return updateJson(f, copilot(false));
      },
    ],
  ];
  const results = [];
  for (const [agent, file, apply] of targets) {
    try {
      results.push({ agent, file, result: await apply(file) });
    } catch (error) {
      results.push({ agent, file, result: 'failed', error: error.message });
    }
  }
  return results;
}
