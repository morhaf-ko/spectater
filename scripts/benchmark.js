import { readFile, realpath } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { native } from '../src/discovery.js';
import { openReview } from '../src/review.js';
import { fixture } from '../test/helpers.js';

const { values } = parseArgs({
  options: { project: { type: 'string' }, change: { type: 'string' }, store: { type: 'string' } },
});
if (Boolean(values.project) !== Boolean(values.change))
  throw new Error('Supply both --project and --change, or neither for the small fixture.');
const results = [];
let documentCount, currentSourceBytes, responseBytes;
for (let i = 0; i < 3; i++) {
  const f = await fixture();
  let review;
  try {
    const start = performance.now();
    review = await openReview(values.project ? values : f.options, { directory: f.stateDir });
    const opened = performance.now();
    const initial = review.view();
    const viewed = performance.now();
    documentCount = initial.documents.length;
    currentSourceBytes = initial.documents.reduce(
      (total, d) => total + Buffer.byteLength(d.source || ''),
      0,
    );
    responseBytes = Buffer.byteLength(JSON.stringify(initial));
    const d = initial.documents.find((d) => d.source?.length);
    if (!d) throw new Error('Benchmark requires a nonempty Markdown artifact.');
    const offset = Math.max(0, d.source.indexOf('exact'));
    const quote = d.source.slice(offset, offset + 5);
    await review.mutate({
      action: 'comment',
      revision: initial.revision,
      documentId: d.id,
      hash: d.hash,
      start: offset,
      end: offset + quote.length,
      precision: 'exact',
      quote,
      body: 'Benchmark comment.',
    });
    const saved = performance.now();
    await review.refresh();
    results.push({
      open: opened - start,
      view: viewed - opened,
      save: saved - viewed,
      refresh: performance.now() - saved,
    });
  } finally {
    await review?.close();
    await f.cleanup();
  }
}
const median = (key) => results.map((r) => r[key]).sort((a, b) => a - b)[1];
const nativeStageMs = {};
if (values.project) {
  const cwd = await realpath(values.project);
  for (const args of [
    ['--version'],
    ['context', '--json'],
    ['list', '--json'],
    ['status', '--change', values.change, '--json'],
  ]) {
    const start = performance.now();
    await native(
      [...args, ...(values.store && args[0] !== '--version' ? ['--store', values.store] : [])],
      cwd,
    );
    nativeStageMs[args[0]] = Number((performance.now() - start).toFixed(2));
  }
}
const assets = await Promise.all(
  ['index.html', 'style.css', 'app.js', 'theme.js'].map(async (file) => [
    file,
    (await readFile(new URL(`../web/${file}`, import.meta.url))).length,
  ]),
);
console.log(
  JSON.stringify({
    runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`,
    fixture: values.project
      ? 'explicit change; three sequential local runs; warm OS/package caches; isolated review state'
      : 'one small Markdown artifact; three sequential local runs; warm OS/package caches',
    documentCount,
    currentSourceBytes,
    responseBytes,
    assetBytes: Object.fromEntries(assets),
    nativeStageMs,
    medianMs: Object.fromEntries(
      ['open', 'view', 'save', 'refresh'].map((key) => [key, Number(median(key).toFixed(2))]),
    ),
  }),
);
