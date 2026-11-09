import { randomUUID } from 'node:crypto';
import { compareSources, sourceChanges } from './changes.js';
import { createDiscovery, readDocument } from './discovery.js';
import { anchor, locate, render } from './markdown.js';
import { batchStatus, deliverable, pendingComments } from './queue.js';
import { feedback, openStore } from './storage.js';

export async function openReview(options, dependencies = {}) {
  const discovery = dependencies.discover || createDiscovery();
  let review = dependencies.initial || (await discovery(options));
  const store = await openStore(review, dependencies.directory);
  let current = new Map();
  let rendered = new Map();
  let tail = Promise.resolve();
  let fingerprint;
  const observers = new Set();
  const notify = (event) => {
    for (const observer of observers) {
      try {
        observer(event);
      } catch {
        observers.delete(observer);
      }
    }
  };
  const serial = (fn) => {
    const job = tail.then(fn);
    tail = job.catch(() => {});
    return job;
  };
  async function refresh(initial) {
    const next = initial || (await discovery(options));
    if (next.reviewId !== review.reviewId)
      throw new Error('Planning identity changed. Reopen explicitly.');
    const documents = await Promise.all(
      next.documents
        .filter((d) => d.supported)
        .map(async (d) => [d.id, await readDocument(next, d)]),
    );
    if (documents.reduce((n, [, s]) => n + Buffer.byteLength(s.source), 0) > 16 * 1024 * 1024)
      throw new Error('Selected documents exceed 16 MiB.');
    const nextFingerprint = JSON.stringify([
      next.schemaName,
      next.source,
      next.artifacts,
      next.documents,
      documents.map(([id, snapshot]) => [id, snapshot.hash]),
    ]);
    if (nextFingerprint === fingerprint) return;
    const state = store.state;
    for (const [, snapshot] of documents) state.snapshots[snapshot.hash] = snapshot;
    const manifest = Object.fromEntries(
      [...documents]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, snapshot]) => [id, { path: snapshot.path, hash: snapshot.hash }]),
    );
    if (
      state.currentDocuments &&
      JSON.stringify(manifest) !== JSON.stringify(state.currentDocuments)
    )
      state.previousDocuments = state.currentDocuments;
    state.currentDocuments = manifest;
    state.documentIds = next.documents.map((d) => d.id);
    state.schemaName = next.schemaName;
    state.revision++;
    const html = new Map(
      documents.map(([, snapshot]) => [
        snapshot.hash,
        rendered.get(snapshot.hash) ?? render(snapshot.source),
      ]),
    );
    await store.commit(state);
    fingerprint = nextFingerprint;
    review = next;
    current = new Map(documents);
    rendered = html;
    notify({ type: 'refresh', revision: state.revision });
  }
  function view() {
    const state = store.state;
    return {
      reviewId: review.reviewId,
      root: review.root,
      changeRoot: review.changeRoot,
      change: review.change,
      defaultView: options.defaultView || 'rendered',
      source: review.source,
      schemaName: review.schemaName,
      artifacts: review.artifacts,
      revision: state.revision,
      documents: review.documents.map((d) => ({
        id: d.id,
        path: d.path,
        supported: d.supported,
        artifact: d.artifact,
        ...current.get(d.id),
        html: rendered.get(current.get(d.id)?.hash),
      })),
      comments: state.comments
        .filter((c) => !c.deletedAt)
        .map((c) => ({ ...c, ...locate(c, current.get(c.documentId)) })),
      deletedComments: state.comments
        .filter((c) => c.deletedAt)
        .map((c) => ({ ...c, ...locate(c, current.get(c.documentId)) })),
      endedAt: state.endedAt,
      changes: sourceChanges(state),
      hasPreviousSource: Boolean(state.previousDocuments),
      activity: state.activity || {},
      queue: state.queue || {},
      pendingCommentIds: pendingComments(state).map((comment) => comment.id),
      batches: state.batches.map(({ entries, ...batch }) => ({
        ...batch,
        count: entries.length,
        commentIds: entries.map((entry) => entry.id),
      })),
      snapshots: Object.fromEntries(state.comments.map((c) => [c.hash, state.snapshots[c.hash]])),
    };
  }
  async function checkRevision(input) {
    if (input.revision !== store.state.revision)
      throw new Error('Revision conflict. Preserve your draft and refresh.');
    for (const document of review.documents.filter((d) => d.supported)) {
      try {
        if ((await readDocument(review, document)).hash !== current.get(document.id)?.hash)
          throw new Error('Source changed.');
      } catch (error) {
        throw new Error(`Revision conflict: ${error.message} Preserve your draft and refresh.`);
      }
    }
  }
  try {
    await refresh(review);
  } catch (error) {
    await store.close();
    throw error;
  }
  return {
    directory: store.directory,
    subscribe(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    view,
    refresh: () =>
      serial(async () => {
        if (store.state.endedAt)
          throw new Error('Review ended. Resume explicitly to refresh source.');
        await refresh();
        return view();
      }),
    compare: (id) => compareSources(store.state, id, dependencies.diff),
    claimBatch: ({ batchId, after }) =>
      serial(async () => {
        const state = store.state;
        if (state.endedAt)
          throw new Error('Review ended. Use --history for saved feedback or resume explicitly.');
        const batch = batchId
          ? state.batches.find((item) => item.id === batchId)
          : state.batches.find((item) => item.sequence > after && deliverable(state, item));
        if (!batch) {
          if (batchId) throw new Error('Unknown feedback batch.');
          return null;
        }
        if (!deliverable(state, batch))
          throw new Error('Batch is withdrawn or being edited. Use --history for an archive copy.');
        if (batchStatus(state, batch.id) !== 'claimed') {
          state.queue ||= {};
          state.queue[batch.id] = { status: 'claimed', at: new Date().toISOString() };
          state.revision++;
          await store.commit(state);
          notify({ type: 'activity', revision: state.revision });
        }
        return feedback(state, batch.id);
      }),
    recordActivity: (batchId, input) =>
      serial(async () => {
        const state = store.state;
        if (!state.batches.some((batch) => batch.id === batchId))
          throw new Error('Unknown feedback batch.');
        if (!['queued', 'claimed'].includes(batchStatus(state, batchId)))
          throw new Error('Batch is withdrawn or being edited.');
        if (!['received', 'working', 'done'].includes(input.status))
          throw new Error('Activity status must be received, working or done.');
        const body = input.body ?? '';
        if (
          typeof body !== 'string' ||
          body.length > 10000 ||
          (input.status === 'done' && !body.trim())
        )
          throw new Error('A reply must contain 1–10,000 characters.');
        state.activity ||= {};
        state.activity[batchId] ||= {
          receivedAt: new Date().toISOString(),
          status: 'received',
          replies: [],
        };
        const activity = state.activity[batchId];
        const previous = JSON.stringify(activity);
        if (input.status === 'working' && activity.status !== 'replied') {
          activity.startedAt ||= new Date().toISOString();
          activity.status = 'working';
        }
        if (input.status === 'done' && activity.replies.at(-1)?.body !== body.trim()) {
          activity.replies.push({
            id: randomUUID(),
            body: body.trim(),
            at: new Date().toISOString(),
          });
          activity.status = 'replied';
        }
        if (store.state.activity?.[batchId] && previous === JSON.stringify(activity)) return view();
        state.revision++;
        await store.commit(state);
        notify({ type: 'activity', revision: state.revision });
        return view();
      }),
    mutate: (input) =>
      serial(async () => {
        if (store.state.endedAt && !['resume', 'end'].includes(input.action))
          throw new Error('Review ended. Resume explicitly to change feedback.');
        if (['end', 'resume', 'cancel-batch', 'edit-batch'].includes(input.action)) {
          if (input.revision !== store.state.revision)
            throw new Error('Revision conflict. Refresh review state and retry.');
        } else await checkRevision(input);
        if (input.action === 'resume' && store.state.endedAt) await refresh();
        const state = store.state;
        if (['end', 'resume'].includes(input.action)) {
          if (input.action === 'end') {
            if (
              state.batches.some((batch) =>
                ['queued', 'editing'].includes(batchStatus(state, batch.id)),
              )
            )
              throw new Error('Deliver or cancel queued submissions before ending the review.');
            state.endedAt ||= new Date().toISOString();
          } else delete state.endedAt;
        } else if (['cancel-batch', 'edit-batch'].includes(input.action)) {
          const batch = state.batches.find((item) => item.id === input.id);
          if (!batch) throw new Error('Unknown feedback batch.');
          const status = batchStatus(state, batch.id);
          if (!['queued', 'editing'].includes(status))
            throw new Error('Batch already handed off or withdrawn. Send a correction instead.');
          if (
            input.action === 'edit-batch' &&
            state.batches.some(
              (item) => item.id !== batch.id && batchStatus(state, item.id) === 'editing',
            )
          )
            throw new Error('Finish or cancel the current queued edit first.');
          state.queue ||= {};
          state.queue[batch.id] = {
            status: input.action === 'edit-batch' ? 'editing' : 'cancelled',
            at: new Date().toISOString(),
          };
        } else if (input.action === 'comment') {
          const snapshot = current.get(input.documentId);
          if (!snapshot || snapshot.hash !== input.hash)
            throw new Error('Revision conflict: select the current document.');
          if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000)
            throw new Error('Comment must contain 1–10,000 characters.');
          state.comments.push({
            id: randomUUID(),
            documentId: input.documentId,
            path: snapshot.path,
            hash: snapshot.hash,
            ...anchor(snapshot, input),
            body: input.body.trim(),
            createdAt: new Date().toISOString(),
            state: 'open',
          });
        } else if (input.action === 'submit') {
          const entries = pendingComments(state).map((c) => ({
            ...c,
            line: state.snapshots[c.hash].source.slice(0, c.start).split('\n').length,
          }));
          const editing = state.batches.find((batch) => batchStatus(state, batch.id) === 'editing');
          if (!entries.length)
            throw new Error(
              editing
                ? 'Keep an open comment or cancel the queued batch.'
                : 'Add an open comment that is new or changed before submitting.',
            );
          const batch = {
            id: randomUUID(),
            sequence: state.batches.length + 1,
            submittedAt: new Date().toISOString(),
            entries,
          };
          state.batches.push(batch);
          if (editing)
            state.queue[editing.id] = {
              status: 'superseded',
              at: batch.submittedAt,
              replacementId: batch.id,
            };
        } else if (['resolve', 'reattach', 'edit', 'delete', 'restore'].includes(input.action)) {
          const comment = state.comments.find((c) => c.id === input.id);
          if (!comment) throw new Error('Unknown comment.');
          if (input.action === 'restore') delete comment.deletedAt;
          else if (comment.deletedAt)
            throw new Error('Comment is deleted. Restore it before editing.');
          else if (input.action === 'delete') comment.deletedAt = new Date().toISOString();
          else if (input.action === 'edit') {
            if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000)
              throw new Error('Comment must contain 1–10,000 characters.');
            comment.body = input.body.trim();
            comment.updatedAt = new Date().toISOString();
          } else if (input.action === 'resolve')
            comment.state = comment.state === 'open' ? 'resolved' : 'open';
          else {
            const snapshot = current.get(comment.documentId);
            const result = locate(comment, snapshot);
            if (result.status !== 'stale')
              throw new Error('No unique suggested anchor. Select source and add a new comment.');
            comment.previousAnchors = [
              ...(comment.previousAnchors || []),
              { hash: comment.hash, start: comment.start, end: comment.end, slice: comment.slice },
            ];
            Object.assign(
              comment,
              anchor(snapshot, {
                start: result.suggestion,
                end: result.suggestion + comment.slice.length,
                precision: 'exact',
                quote: comment.slice,
              }),
              { hash: snapshot.hash },
            );
          }
        } else throw new Error('Unknown review action.');
        state.revision++;
        await store.commit(state);
        notify({
          type: ['end', 'resume'].includes(input.action) ? 'lifecycle' : 'activity',
          revision: state.revision,
          ended: Boolean(state.endedAt),
        });
        if (input.action === 'submit')
          notify({ type: 'batch', sequence: state.batches.at(-1).sequence });
        return view();
      }),
    close: () => serial(() => store.close()),
    get state() {
      return store.state;
    },
  };
}
