import { randomUUID } from 'node:crypto';
import { createDiscovery, readDocument } from './discovery.js';
import { openStore } from './storage.js';
import { anchor, locate, render } from './markdown.js';

export async function openReview(options, dependencies = {}) {
  const discovery = dependencies.discover || createDiscovery();
  let review = await discovery(options);
  const store = await openStore(review, dependencies.directory);
  let current = new Map();
  let rendered = new Map();
  let tail = Promise.resolve();
  const serial = fn => { const job = tail.then(fn); tail = job.catch(() => {}); return job; };
  async function refresh(initial) {
    const next = initial || await discovery(options);
    if (next.reviewId !== review.reviewId) throw new Error('Planning identity changed. Reopen explicitly.');
    const documents = await Promise.all(next.documents.filter(d => d.supported).map(async d => [d.id, await readDocument(next, d)]));
    if (documents.reduce((n, [, s]) => n + Buffer.byteLength(s.source), 0) > 16 * 1024 * 1024) throw new Error('Selected documents exceed 16 MiB.');
    const state = store.state;
    for (const [, snapshot] of documents) state.snapshots[snapshot.hash] = snapshot;
    state.documentIds = next.documents.map(d => d.id);
    state.schemaName = next.schemaName;
    state.revision++;
    await store.commit(state);
    const html = new Map(documents.map(([, snapshot]) => [snapshot.hash, rendered.get(snapshot.hash) ?? render(snapshot.source)]));
    review = next; current = new Map(documents); rendered = html;
  }
  function view() {
    const state = store.state;
    return { reviewId: review.reviewId, root: review.root, changeRoot: review.changeRoot, change: review.change, defaultView: options.defaultView || 'rendered',
      source: review.source, schemaName: review.schemaName, artifacts: review.artifacts, revision: state.revision,
      documents: review.documents.map(({ file, canonical, ...d }) => ({ ...d, ...current.get(d.id), html: rendered.get(current.get(d.id)?.hash) })),
      comments: state.comments.map(c => ({ ...c, ...locate(c, current.get(c.documentId)) })),
      batches: state.batches.map(({ entries, ...batch }) => ({ ...batch, count: entries.length })),
      snapshots: Object.fromEntries(state.comments.map(c => [c.hash, state.snapshots[c.hash]])) };
  }
  async function checkRevision(input) {
    if (input.revision !== store.state.revision) throw new Error('Revision conflict. Preserve your draft and refresh.');
    for (const document of review.documents.filter(d => d.supported)) {
      try {
        if ((await readDocument(review, document)).hash !== current.get(document.id)?.hash) throw new Error('Source changed.');
      } catch (error) { throw new Error(`Revision conflict: ${error.message} Preserve your draft and refresh.`); }
    }
  }
  try { await refresh(review); } catch (error) { await store.close(); throw error; }
  return {
    view,
    refresh: () => serial(async () => { await refresh(); return view(); }),
    mutate: input => serial(async () => {
      await checkRevision(input);
      const state = store.state;
      if (input.action === 'comment') {
        const snapshot = current.get(input.documentId);
        if (!snapshot || snapshot.hash !== input.hash) throw new Error('Revision conflict: select the current document.');
        if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000) throw new Error('Comment must contain 1–10,000 characters.');
        state.comments.push({ id: randomUUID(), documentId: input.documentId, path: snapshot.path, hash: snapshot.hash,
          ...anchor(snapshot, input), body: input.body.trim(), createdAt: new Date().toISOString(), state: 'open' });
      } else if (input.action === 'submit') {
        const entries = state.comments.filter(c => c.state === 'open').map(c => ({ ...c,
          line: state.snapshots[c.hash].source.slice(0, c.start).split('\n').length }));
        if (!entries.length) throw new Error('Add an open comment before submitting.');
        state.batches.push({ id: randomUUID(), sequence: state.batches.length + 1, submittedAt: new Date().toISOString(), entries });
      } else if (input.action === 'resolve' || input.action === 'reattach') {
        const comment = state.comments.find(c => c.id === input.id);
        if (!comment) throw new Error('Unknown comment.');
        if (input.action === 'resolve') comment.state = comment.state === 'open' ? 'resolved' : 'open';
        else {
          const snapshot = current.get(comment.documentId);
          const result = locate(comment, snapshot);
          if (result.status !== 'stale') throw new Error('No unique suggested anchor. Select source and add a new comment.');
          comment.previousAnchors = [...(comment.previousAnchors || []), { hash: comment.hash, start: comment.start, end: comment.end, slice: comment.slice }];
          Object.assign(comment, anchor(snapshot, { start: result.suggestion, end: result.suggestion + comment.slice.length, precision: 'exact', quote: comment.slice }), { hash: snapshot.hash });
        }
      } else throw new Error('Unknown review action.');
      state.revision++;
      await store.commit(state);
      return view();
    }),
    close: () => serial(() => store.close()),
    get state() { return store.state; },
  };
}
