import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const sample =
  '# Fixture proposal\n\nReview this exact sentence.\n\n## Requirements\n\nKeep Markdown authoritative.\n';
export async function fixture(source = sample) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'spectater-test-')));
  const project = path.join(directory, 'project');
  const changeRoot = path.join(project, 'openspec', 'changes', 'example');
  await mkdir(changeRoot, { recursive: true });
  await writeFile(path.join(project, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
  await writeFile(
    path.join(changeRoot, '.openspec.yaml'),
    'schema: spec-driven\ncreated: 2026-11-09\n',
  );
  const file = path.join(changeRoot, 'proposal.md');
  await writeFile(file, source);
  const configFile = path.join(directory, 'preferences.json');
  await writeFile(configFile, '{}');
  return {
    directory,
    project,
    changeRoot,
    file,
    configFile,
    options: { project, change: 'example' },
    stateDir: path.join(directory, 'state'),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
