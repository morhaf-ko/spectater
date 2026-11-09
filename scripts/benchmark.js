import { performance } from 'node:perf_hooks';
import { fixture } from '../test/helpers.js';
import { openReview } from '../src/review.js';

const results = [];
for (let i = 0; i < 3; i++) {
  const f = await fixture();
  let review;
  try {
    const start = performance.now();
    review = await openReview(f.options, { directory: f.stateDir });
    const opened = performance.now();
    const initial = review.view();
    const viewed = performance.now();
    const d = initial.documents[0], offset = d.source.indexOf('exact');
    await review.mutate({ action: 'comment', revision: initial.revision, documentId: d.id, hash: d.hash,
      start: offset, end: offset + 5, precision: 'exact', quote: 'exact', body: 'Benchmark comment.' });
    const saved = performance.now();
    await review.refresh();
    results.push({ open: opened - start, view: viewed - opened, save: saved - viewed, refresh: performance.now() - saved });
  } finally { await review?.close(); await f.cleanup(); }
}
const median = key => results.map(r => r[key]).sort((a, b) => a - b)[1];
console.log(JSON.stringify({ runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`, fixture: 'one small Markdown artifact; three sequential local runs; warm OS/package caches', medianMs: Object.fromEntries(['open', 'view', 'save', 'refresh'].map(key => [key, Number(median(key).toFixed(2))])) }));
