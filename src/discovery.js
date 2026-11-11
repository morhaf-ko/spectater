import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readLimited } from './files.js';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function within(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

/** True when `PATH` holds `command` with one of `PATHEXT`'s extensions (Windows lookup). */
async function onWindowsPath(command, env = process.env) {
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  for (const directory of (env.PATH || env.Path || '').split(';').filter(Boolean))
    for (const extension of extensions)
      if (
        await access(path.win32.join(directory, command + extension)).then(
          () => true,
          () => false,
        )
      )
        return true;
  return false;
}

export async function native(args, cwd, platform = process.platform) {
  // npm installs `openspec.cmd` on Windows, which only cmd.exe can run; it sees the joined args.
  const shell = platform === 'win32';
  if (shell && args.some((arg) => !/^[\w.:/@-]+$/.test(arg)))
    throw new Error('OpenSpec arguments on Windows may use only letters, digits and . _ : / @ -.');
  if (shell && !(await onWindowsPath('openspec')))
    throw diagnostic(Object.assign(new Error('openspec not found'), { code: 'ENOENT' }));
  try {
    // cmd.exe takes one validated command line; NoDefaultCurrentDirectoryInExePath stops it
    // running an `openspec.cmd` from the reviewed project instead of the one on PATH.
    const [command, list] = shell ? [['openspec', ...args].join(' '), []] : ['openspec', args];
    const { stdout } = await promisify(execFile)(command, list, {
      cwd,
      shell,
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0', NoDefaultCurrentDirectoryInExePath: '1' },
    });
    return stdout;
  } catch (error) {
    throw diagnostic(error);
  }
}

// Prefer OpenSpec's own structured diagnostics (`status[].message`) over raw output.
function diagnostic(error) {
  if (error.code === 'ENOENT')
    return Object.assign(
      new Error(
        'OpenSpec CLI not found. Install it with `npm install -g @fission-ai/openspec` (1.15 or newer), then try again.',
      ),
      { diagnostic: true },
    );
  try {
    const messages = JSON.parse(error.stdout)
      .status.filter((item) => item?.severity === 'error' && typeof item.message === 'string')
      .map((item) => item.message);
    if (messages.length) return Object.assign(new Error(messages.join(' ')), { diagnostic: true });
  } catch {
    /* Not structured output; report it verbatim below. */
  }
  return new Error(
    `OpenSpec failed: ${error.stderr?.trim() || error.stdout?.trim() || error.message}`,
  );
}

async function session({ project, store }, run) {
  const cwd = await realpath(project);
  const version = (await run(['--version'], cwd)).trim();
  const [major, minor] = version.split('.').map(Number);
  if (!/^\d+\.\d+\.\d+/.test(version) || major < 1 || (major === 1 && minor < 15))
    throw new Error(`OpenSpec ${version} is not supported. Install OpenSpec 1.15.0 or newer.`);
  const selector = store ? ['--store', store] : [];
  const json = async (args) => {
    try {
      return JSON.parse(await run([...args, ...selector, '--json'], cwd));
    } catch (error) {
      if (error.diagnostic) throw error;
      throw new Error(`OpenSpec JSON/discovery error: ${error.message}`);
    }
  };
  // Every caller gets the same root selection rules, including the global-default refusal.
  const context = await json(['context']);
  if (
    !context.root?.path ||
    !['nearest', 'declared', 'store', 'global_default'].includes(context.root.source)
  )
    throw new Error('Unsupported OpenSpec root contract.');
  if (context.root.source === 'global_default' && !store)
    throw new Error('Global default refused. Select an explicit --store id.');
  return { json, context };
}

const changeNames = (list) =>
  Array.isArray(list.changes) ? list.changes.map((item) => item.name) : [];

export function missingChange(change, names) {
  if (!names.length)
    return `No active OpenSpec changes${change ? ` (looked for ${change})` : ''}. Draft one first, for example with /opsx:propose or \`openspec new change <name>\`.`;
  return `${change ? `Change not found: ${change}.` : 'Choose a change: spectater open <change>.'} Active changes: ${names.join(', ')}.`;
}

/** Names of the active changes in the selected OpenSpec root. */
export async function listChanges(options, run = native) {
  const { json } = await session(options, run);
  return changeNames(await json(['list']));
}

export function createDiscovery() {
  let version;
  return (options) =>
    discover(options, async (args, cwd) => {
      if (args[0] !== '--version') return native(args, cwd);
      version ??= await native(args, cwd);
      return version;
    });
}

export async function discover({ project, change, store }, run = native) {
  if (!project || !change || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(change))
    throw new Error('Supply a valid change name.');
  const { json, context } = await session({ project, store }, run);
  const root = await realpath(context.root.path);
  const list = await json(['list']);
  if (!changeNames(list).includes(change))
    throw new Error(missingChange(change, changeNames(list)));
  const status = await json(['status', '--change', change]);
  if (
    status.changeName !== change ||
    typeof status.schemaName !== 'string' ||
    !Array.isArray(status.artifacts) ||
    !status.artifactPaths ||
    !status.changeRoot ||
    !status.root?.path
  )
    throw new Error('Unsupported OpenSpec status contract.');
  if (
    (await realpath(status.root.path)) !== root ||
    !list.root?.path ||
    (await realpath(list.root.path)) !== root
  )
    throw new Error('OpenSpec root changed during discovery.');
  const changeRoot = await realpath(status.changeRoot);
  if (!within(root, changeRoot)) throw new Error('Change escapes the selected OpenSpec root.');
  const documents = [];
  for (const artifact of status.artifacts) {
    const outputs = status.artifactPaths[artifact.id]?.existingOutputPaths;
    if (
      typeof artifact.id !== 'string' ||
      typeof artifact.status !== 'string' ||
      !Array.isArray(outputs)
    )
      throw new Error('Unsupported OpenSpec artifact contract.');
    for (const file of outputs) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || !within(changeRoot, file))
        throw new Error('Artifact escapes the selected change.');
      const canonical = await realpath(file);
      if (!within(changeRoot, canonical))
        throw new Error('Artifact symlink escapes the selected change.');
      const relative = path.relative(changeRoot, file).split(path.sep).join('/');
      if (!documents.some((item) => item.path === relative))
        documents.push({
          id: hash(relative).slice(0, 24),
          path: relative,
          file,
          canonical,
          supported: /\.md$/i.test(file),
          artifact: artifact.id,
        });
    }
  }
  if (documents.length > 128) throw new Error('Review exceeds 128 artifacts.');
  return {
    root,
    changeRoot,
    change,
    schemaName: status.schemaName,
    source: context.root.source,
    reviewId: hash(JSON.stringify([root, changeRoot])),
    artifacts: status.artifacts,
    documents,
  };
}

export async function readDocument(review, document) {
  if (
    (await realpath(review.root)) !== review.root ||
    (await realpath(review.changeRoot)) !== review.changeRoot
  )
    throw new Error('Planning identity changed. Reopen explicitly.');
  const canonical = await realpath(document.file);
  if (canonical !== document.canonical || !within(review.changeRoot, canonical))
    throw new Error('Document identity changed or escaped the change.');
  if (!(await lstat(canonical)).isFile()) throw new Error('Artifact is not a regular file.');
  const handle = await open(
    canonical,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('Artifact must be a regular file smaller than 1 MiB.');
    const bytes = await readLimited(handle, 1024 * 1024);
    if (bytes.length > 1024 * 1024 || (await realpath(document.file)) !== canonical)
      throw new Error('Document changed during read.');
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { path: document.path, hash: hash(bytes), source };
  } finally {
    await handle.close();
  }
}
