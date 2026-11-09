import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
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

export async function native(args, cwd) {
  try {
    const { stdout } = await promisify(execFile)('openspec', args, {
      cwd,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
    });
    return stdout;
  } catch (error) {
    throw new Error(
      `OpenSpec failed: ${error.stderr?.trim() || error.stdout?.trim() || error.message}`,
    );
  }
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
    throw new Error('Supply --project and a valid --change id.');
  const cwd = await realpath(project);
  if (!['1.15.0', '1.16.1'].includes((await run(['--version'], cwd)).trim()))
    throw new Error(
      'Verified OpenSpec contracts: 1.15.0 and 1.16.1. Install a verified version explicitly.',
    );
  const selector = store ? ['--store', store] : [];
  const json = async (args) => {
    try {
      return JSON.parse(await run([...args, ...selector, '--json'], cwd));
    } catch (error) {
      throw new Error(`OpenSpec JSON/discovery error: ${error.message}`);
    }
  };
  const context = await json(['context']);
  if (
    !context.root?.path ||
    !['nearest', 'declared', 'store', 'global_default'].includes(context.root.source)
  )
    throw new Error('Unsupported OpenSpec root contract.');
  if (context.root.source === 'global_default' && !store)
    throw new Error('Global default refused. Select an explicit --store id.');
  const root = await realpath(context.root.path);
  const list = await json(['list']);
  if (!Array.isArray(list.changes) || !list.changes.some((item) => item.name === change))
    throw new Error(`Change not found: ${change}`);
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
