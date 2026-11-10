const $ = (id) => document.getElementById(id);
const route = location.pathname;
let token = location.hash.slice(1);
try {
  token ||= sessionStorage.getItem(route);
  if (token) sessionStorage.setItem(route, token);
} catch {
  /* The private URL still authorizes this page when storage is denied. */
}
history.replaceState(null, '', route);
let state,
  selectedId,
  selection,
  mode = 'rendered',
  busy = false;
let editingId,
  anchorRect,
  undoDeletedId,
  draftReady = false;
const draftKey = `${route}:draft`;
let streamActive = false,
  streamStarting = false,
  listeners = 0;
let comparisonKey,
  comparisonRequest = 0,
  automatic = false,
  watchError;
function acceptState(next) {
  if (!state || next.revision >= state.revision) state = next;
}

async function watchReview() {
  if (streamActive || streamStarting) return;
  streamStarting = true;
  try {
    const response = await fetch(`${route}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok || !response.body)
      throw new Error('Live updates unavailable. Use Refresh source to reconnect.');
    streamActive = true;
    streamStarting = false;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      if (pending.length > 65536) throw new Error('Invalid live-update response.');
      while (true) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const event = JSON.parse(pending.slice(0, end));
        pending = pending.slice(end + 1);
        if (event.listeners !== undefined) {
          listeners = event.listeners;
          displayPresence();
        }
        if (event.type === 'watch' || event.type === 'ready') {
          automatic = event.automatic;
          watchError = event.error || event.watchError;
          displaySourceStatus();
        }
        if (
          ['refresh', 'activity', 'lifecycle', 'ready'].includes(event.type) &&
          event.revision > state.revision
        ) {
          const before = JSON.stringify([
            state.documents.map((d) => [d.id, d.hash]),
            state.artifacts,
          ]);
          const scroll = { x: scrollX, y: scrollY };
          acceptState(await api('state'));
          if (
            before !== JSON.stringify([state.documents.map((d) => [d.id, d.hash]), state.artifacts])
          ) {
            display();
            window.scrollTo(scroll.x, scroll.y);
            announce('Plan refreshed. Draft text kept.');
          } else {
            displayFeedback();
            displayChanges();
          }
        }
      }
    }
    throw new Error('Live updates disconnected. Use Refresh source to reconnect.');
  } catch (error) {
    listeners = 0;
    displayPresence();
    $('source-status').textContent = 'Live connection unavailable. Refresh source to reconnect.';
    announce(error.message, true);
  } finally {
    streamActive = false;
    streamStarting = false;
  }
}

function announce(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
  $('message').classList.toggle('quiet', text === 'Ready.');
}
async function api(suffix, input) {
  const response = await fetch(`${route}/${suffix}`, {
    method: input ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Review request failed.');
  return data;
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, handler) {
  const el = element('button', text);
  el.type = 'button';
  el.addEventListener('click', handler);
  return el;
}
function documentNow() {
  return state?.documents.find((d) => d.id === selectedId);
}
function persistDraft() {
  if (!draftReady) return;
  try {
    if ($('comment').value || editingId || selection)
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ body: $('comment').value, selection, editingId }),
      );
    else sessionStorage.removeItem(draftKey);
  } catch {
    /* Saved comments remain durable when draft caching is unavailable. */
  }
}
function updateDraftButton() {
  $('resume-draft').hidden =
    Boolean(state?.endedAt) ||
    !($('comment').value || editingId) ||
    $('comment-popover').matches(':popover-open');
}
function closeComposer() {
  $('comment-popover').hidePopover();
  updateDraftButton();
  persistDraft();
}
function openComposer(rect = anchorRect) {
  const popover = $('comment-popover');
  $('comment-title').textContent = editingId ? 'Edit comment' : 'Add comment';
  $('composer-error').hidden = true;
  if (!popover.matches(':popover-open')) popover.showPopover();
  const box = popover.getBoundingClientRect();
  const left = rect ? rect.left : (innerWidth - box.width) / 2;
  let top = rect ? rect.bottom + 8 : (innerHeight - box.height) / 2;
  if (rect && top + box.height > innerHeight - 16) top = rect.top - box.height - 8;
  popover.style.left = `${Math.max(16, Math.min(left, innerWidth - box.width - 16))}px`;
  popover.style.top = `${Math.max(16, Math.min(top, innerHeight - box.height - 16))}px`;
  $('comment').focus({ preventScroll: true });
  updateDraftButton();
  persistDraft();
}
function resetSelection() {
  selection = null;
  anchorRect = null;
  $('selection').textContent = $('comment').value
    ? 'Draft kept. Select text again.'
    : 'Select text to comment.';
  $('save').disabled = !editingId;
  closeComposer();
}
function editComment(comment, rect) {
  editingId = comment.id;
  selection = null;
  anchorRect = rect;
  $('comment').value = comment.body;
  $('selection').textContent = `Original selection: “${comment.quote}”`;
  $('save').disabled = false;
  openComposer(rect);
}
function restoreDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (draft && typeof draft.body === 'string' && draft.body.length <= 10000) {
      $('comment').value = draft.body;
      editingId = state.comments.some((c) => c.id === draft.editingId)
        ? draft.editingId
        : undefined;
      const d = state.documents.find(
        (d) => d.id === draft.selection?.documentId && d.hash === draft.selection?.hash,
      );
      if (d) {
        if (selectedId !== d.id) {
          selectedId = d.id;
          displayDocument();
        }
        selection = draft.selection;
      }
      $('save').disabled = !(selection || editingId);
      $('selection').textContent = selection
        ? `${selection.precision === 'exact' ? 'Exact source' : 'Enclosing source span'}: “${selection.quote}”`
        : 'Draft kept. Select text again.';
    }
  } catch {
    /* Draft recovery is optional; server-side comments are authoritative. */
  }
  draftReady = true;
  updateDraftButton();
}
function displayDocument() {
  const d = documentNow();
  resetSelection();
  $('document-name').textContent = d?.path || 'No readable artifacts';
  $('revision').textContent = d?.hash
    ? `SHA-256 ${d.hash}`
    : 'This artifact has no supported Markdown snapshot.';
  $('source').textContent = d?.source || '';
  $('source-lines').textContent = Array.from(
    { length: (d?.source || '').split('\n').length },
    (_, i) => i + 1,
  ).join('\n');
  $('rendered').innerHTML =
    d?.html ||
    '<p>Choose an existing Markdown artifact. Missing and unsupported artifacts appear in navigation.</p>';
  $('source').hidden = mode !== 'source';
  $('rendered').hidden = mode !== 'rendered';
  $('source-view').hidden = mode !== 'source';
  $('source-mode').setAttribute('aria-pressed', String(mode === 'source'));
  $('rendered-mode').setAttribute('aria-pressed', String(mode === 'rendered'));
}
function displaySourceStatus() {
  $('source-status').textContent = state?.endedAt
    ? 'Source watching paused'
    : watchError || (automatic ? 'Source updates automatically' : 'Refresh source manually');
}
function displayPresence() {
  if (state?.endedAt) {
    $('listener-status').textContent = 'Review ended · saved feedback retained';
    return;
  }
  $('listener-status').textContent = listeners
    ? 'Feedback listener waiting'
    : 'No agent waiting · submissions stay saved';
}
function display() {
  $('change').textContent = state.change;
  $('identity').textContent = `${state.schemaName} · ${state.source}`;
  $('location').textContent = state.changeRoot;
  $('artifacts').replaceChildren();
  $('artifact-statuses').replaceChildren();
  if (!documentNow()) selectedId = state.documents.find((d) => d.supported)?.id;
  for (const artifact of state.artifacts) {
    const group = element('div', '', 'artifact-group');
    $('artifact-statuses').append(element('p', `${artifact.id} · ${artifact.status}`));
    const docs = state.documents.filter((d) => d.artifact === artifact.id);
    if (docs.length > 1) group.append(element('p', artifact.id, 'artifact-status'));
    for (const d of docs) {
      const el = button(`${d.path}${d.supported ? '' : ' (unsupported)'}`, () => {
        selectedId = d.id;
        display();
      });
      el.className = 'artifact';
      if (d.id === selectedId) el.setAttribute('aria-current', 'page');
      group.append(el);
    }
    $('artifacts').append(group);
  }
  if (!state.documents.length)
    $('artifacts').append(element('p', 'No existing artifacts.', 'note'));
  displayDocument();
  displayFeedback();
  displayChanges();
}
function displayFeedback() {
  displayPresence();
  displaySourceStatus();
  $('save').disabled = Boolean(state.endedAt) || !(selection || editingId);
  if (state.endedAt) closeComposer();
  $('comments').replaceChildren();
  const deliveredIds = new Set(
    state.batches
      .filter(
        (batch) => state.queue?.[batch.id]?.status === 'claimed' || state.activity?.[batch.id],
      )
      .flatMap((batch) => batch.commentIds),
  );
  for (const c of state.comments) {
    const section = element('section', '', 'comment');
    section.append(
      element('h3', `${c.status} · ${c.state}`),
      element('p', c.path, 'note'),
      element('blockquote', c.quote),
      element('p', c.body),
    );
    const original = element('details', '');
    original.append(element('summary', 'Original source context'));
    const snapshot = state.snapshots[c.hash];
    original.append(
      element('p', `Revision ${c.hash}; ${c.precision} offsets [${c.start}, ${c.end})`, 'note'),
      element('pre', snapshot?.source.slice(Math.max(0, c.start - 120), c.end + 120) || c.slice),
    );
    section.append(original);
    if (!state.endedAt) {
      section.append(
        button(c.state === 'open' ? 'Resolve' : 'Reopen', () =>
          action({ action: 'resolve', id: c.id }),
        ),
      );
      const delivered = deliveredIds.has(c.id);
      section.append(
        button(delivered ? 'Send correction' : 'Edit', (event) =>
          editComment(c, event.currentTarget.getBoundingClientRect()),
        ),
        button('Delete', () => action({ action: 'delete', id: c.id })),
      );
      if (c.status === 'stale')
        section.append(
          button('Reattach to suggested text', () => action({ action: 'reattach', id: c.id })),
        );
    }
    if (c.status === 'orphaned')
      section.append(
        element(
          'p',
          'No unique anchor. Keep this feedback or select source and add a new comment.',
          'note',
        ),
      );
    $('comments').append(section);
  }
  $('comment-hint').hidden = state.comments.length > 0;
  $('undo-delete').hidden =
    Boolean(state.endedAt) || !state.deletedComments.some((c) => c.id === undoDeletedId);
  $('deleted-comments').hidden = !state.deletedComments.length;
  $('deleted-list').replaceChildren();
  for (const c of state.deletedComments) {
    const row = element('div', '', 'deleted-comment');
    row.append(element('p', c.body));
    if (!state.endedAt)
      row.append(button('Restore', () => action({ action: 'restore', id: c.id })));
    $('deleted-list').append(row);
  }
  const editing = state.batches.find((batch) => state.queue?.[batch.id]?.status === 'editing');
  $('queue-editing').hidden = !editing;
  $('queue-editing').textContent = editing
    ? `Editing batch ${editing.sequence} · delivery paused. Edit saved comments, then update.`
    : '';
  $('submit').textContent = editing ? 'Update queued batch' : 'Submit batch';
  updateSubmit();
  $('agent-message').disabled = Boolean(state.endedAt);
  $('refresh').disabled = Boolean(state.endedAt);
  $('comment-hint').hidden ||= Boolean(state.endedAt);
  $('receipts').replaceChildren();
  const history = element('details', '', 'batch-history');
  const historyCount = state.batches.filter((batch) =>
    ['cancelled', 'superseded'].includes(state.queue?.[batch.id]?.status),
  ).length;
  history.append(element('summary', `History · ${historyCount}`));
  for (const batch of [...state.batches].reverse()) {
    const receipt = element('div', '', 'receipt');
    receipt.append(
      button(`Batch ${batch.sequence} · ${batch.count} items`, () => showBatch(batch.id)),
    );
    const activity = state.activity?.[batch.id];
    const queue = state.queue?.[batch.id];
    const handedOff = queue?.status === 'claimed' || Boolean(activity);
    const replacement = state.batches.find((item) => item.id === queue?.replacementId);
    const status =
      queue?.status === 'cancelled'
        ? 'Cancelled'
        : queue?.status === 'superseded'
          ? `Replaced by batch ${replacement.sequence}`
          : queue?.status === 'editing'
            ? 'Editing · delivery paused'
            : activity?.status === 'replied'
              ? 'Agent replied'
              : activity?.status === 'working'
                ? 'Agent working'
                : activity
                  ? 'Received by agent CLI'
                  : handedOff
                    ? 'Handed to agent CLI'
                    : 'Saved · queued for agent';
    receipt.append(element('p', status, 'note'));
    if (!state.endedAt && !handedOff && !['cancelled', 'superseded'].includes(queue?.status)) {
      const controls = element('div', '', 'queue-actions');
      if (!editing && queue?.status !== 'editing') {
        const edit = button('Edit queued', () => action({ action: 'edit-batch', id: batch.id }));
        edit.setAttribute('aria-label', `Edit queued batch ${batch.sequence}`);
        controls.append(edit);
      }
      const cancel = button('Cancel submission', () =>
        action({ action: 'cancel-batch', id: batch.id }),
      );
      cancel.setAttribute('aria-label', `Cancel batch ${batch.sequence}`);
      controls.append(cancel);
      receipt.append(controls);
    }
    for (const reply of activity?.replies || []) {
      const response = element('div', '', 'agent-reply');
      response.append(
        element('p', reply.body),
        element('time', new Date(reply.at).toLocaleString(), 'note'),
      );
      receipt.append(response);
    }
    (['cancelled', 'superseded'].includes(queue?.status) ? history : $('receipts')).append(receipt);
  }
  if (historyCount) $('receipts').append(history);
  $('export-details').hidden = !state.batches.length;
}
function displayChanges() {
  const key = JSON.stringify(state.changes);
  if (key === comparisonKey) return;
  comparisonKey = key;
  $('change-diff').hidden = true;
  $('change-diff').textContent = '';
  $('changed-files').replaceChildren();
  $('changes-note').textContent = state.changes.length
    ? 'Compared with the previous source update.'
    : state.hasPreviousSource
      ? 'No source differences.'
      : 'A comparison appears after the first source update.';
  for (const change of state.changes) {
    $('changed-files').append(
      button(`${change.path} · ${change.status}`, () => loadComparison(change.id)),
    );
  }
}
async function loadComparison(id) {
  const key = comparisonKey,
    request = ++comparisonRequest;
  $('change-diff').hidden = false;
  $('change-diff').textContent = 'Loading comparison…';
  try {
    const change = await api(`changes/${id}`);
    if (comparisonKey === key && request === comparisonRequest)
      $('change-diff').textContent =
        `${change.path} · ${change.status}\n\n${change.diff || 'No textual differences.'}`;
  } catch (error) {
    if (comparisonKey === key && request === comparisonRequest)
      $('change-diff').textContent = error.message;
  }
}
async function operation(fn) {
  if (busy) return false;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  try {
    await fn();
    return true;
  } catch (error) {
    announce(error.message, true);
    if ($('comment-popover').matches(':popover-open')) {
      $('composer-error').textContent = error.message;
      $('composer-error').hidden = false;
    }
    return false;
  } finally {
    busy = false;
    document.body.setAttribute('aria-busy', 'false');
  }
}
async function action(input) {
  return operation(async () => {
    acceptState(await api('action', { ...input, revision: state.revision }));
    if (input.action === 'comment' || input.action === 'edit') {
      $('comment').value = '';
      editingId = undefined;
      selection = null;
      persistDraft();
    }
    if (input.action === 'delete') undoDeletedId = input.id;
    if (input.action === 'submit') $('agent-message').value = '';
    if (input.action === 'end') closeComposer();
    display();
    announce(
      input.action === 'end'
        ? 'Review ended. Saved feedback retained.'
        : input.action === 'resume'
          ? 'Review resumed.'
          : input.action === 'submit'
            ? state.endedAt
              ? 'Review ended.'
              : input.end
                ? 'Batch saved. The review ends once the agent receives it.'
                : 'Batch saved.'
            : input.action === 'cancel-batch'
              ? 'Submission cancelled. Comments kept.'
              : input.action === 'edit-batch'
                ? 'Delivery paused. Edit saved comments, then update the queued batch.'
                : input.action === 'delete'
                  ? 'Comment deleted.'
                  : 'Saved.',
    );
    if (input.action === 'submit' && state.batches.length)
      await showBatch(state.batches.at(-1).id, false);
  });
}
async function showBatch(id, open = true) {
  try {
    $('export').value = (await api(`batch/${id}`)).markdown;
    const batch = state.batches.find((item) => item.id === id);
    $('retrieval-command').textContent =
      `spectater feedback ${state.change} --batch ${batch.sequence} --format markdown`;
    $('export-details').hidden = false;
    $('export-details').open = open;
  } catch (error) {
    announce(error.message, true);
  }
}
function offset(container, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}
function captureSelection() {
  if (busy || !state || state.endedAt) return;
  const selected = window.getSelection();
  if (!selected.rangeCount || selected.isCollapsed) return;
  const range = selected.getRangeAt(0),
    d = documentNow();
  const area = mode === 'source' ? $('source') : $('rendered');
  if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) return;
  let start, end, precision;
  if (mode === 'source') {
    start = offset(area, range.startContainer, range.startOffset);
    end = offset(area, range.endContainer, range.endOffset);
    precision = 'exact';
  } else {
    const parts = [];
    const common = range.commonAncestorContainer;
    const scope = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
    const spans = scope.matches('[data-start]') ? [scope] : scope.querySelectorAll('[data-start]');
    for (const span of spans) {
      if (!range.intersectsNode(span)) continue;
      const bounds = document.createRange();
      bounds.selectNodeContents(span);
      const overlap = range.cloneRange();
      if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
        overlap.setStart(bounds.startContainer, bounds.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
        overlap.setEnd(bounds.endContainer, bounds.endOffset);
      if (!overlap.collapsed && overlap.toString().length) parts.push({ span, overlap });
    }
    const first = parts[0],
      last = parts.at(-1);
    let unmapped = !first;
    if (first) {
      const before = range.cloneRange();
      before.setEnd(first.overlap.startContainer, first.overlap.startOffset);
      const after = range.cloneRange();
      after.setStart(last.overlap.endContainer, last.overlap.endOffset);
      unmapped = Boolean(before.toString().trim() || after.toString().trim());
    }
    if (unmapped) {
      resetSelection();
      $('selection').textContent = 'This selection has unmapped content. Use Source.';
      announce($('selection').textContent);
      return;
    }
    start = Number(first.span.dataset.start);
    end = Number(last.span.dataset.end);
    if (first.span.dataset.precision === 'exact')
      start += offset(first.span, first.overlap.startContainer, first.overlap.startOffset);
    if (last.span.dataset.precision === 'exact')
      end =
        Number(last.span.dataset.start) +
        offset(last.span, last.overlap.endContainer, last.overlap.endOffset);
    precision =
      parts.length === 1 && first.span.dataset.precision === 'exact' ? 'exact' : 'enclosing';
  }
  if (range.toString().length > 10000 || end - start > 10000) {
    resetSelection();
    announce('Selection exceeds 10,000 characters. Select a shorter passage.', true);
    return;
  }
  selection = { documentId: d.id, hash: d.hash, start, end, precision, quote: range.toString() };
  editingId = undefined;
  anchorRect =
    [...range.getClientRects()]
      .filter((rect) => rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight)
      .at(-1) || range.getBoundingClientRect();
  $('selection').textContent =
    `${precision === 'exact' ? 'Exact source' : 'Enclosing source span'}: “${selection.quote}”`;
  $('save').disabled = false;
  // Open after the gesture's click so native light-dismiss does not immediately close it.
  requestAnimationFrame(() => {
    if (selection) openComposer();
  });
}
document.addEventListener('mouseup', captureSelection);
document.addEventListener('keyup', (event) => {
  if (
    event.key === 'Shift' ||
    (!event.shiftKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
  )
    captureSelection();
});
function saveComment() {
  if (editingId) return action({ action: 'edit', id: editingId, body: $('comment').value });
  if (selection) return action({ action: 'comment', ...selection, body: $('comment').value });
  return false;
}
$('comment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void saveComment();
});
$('comment').addEventListener('input', persistDraft);
$('comment-popover').addEventListener('toggle', updateDraftButton);
$('resume-draft').addEventListener('click', () => openComposer());
$('undo').addEventListener('click', () => action({ action: 'restore', id: undoDeletedId }));
window.addEventListener('resize', closeComposer);
function hasPendingFeedback() {
  return Boolean(state.pendingCommentIds.length || $('agent-message').value.trim());
}
$('review-lifecycle').addEventListener('click', () => {
  if (state.endedAt) return void action({ action: 'resume' });
  if ($('comment').value)
    return announce('Save or clear the unsaved draft before ending the review.', true);
  if (hasPendingFeedback()) return void submit(true);
  editingId = undefined;
  void action({ action: 'end' });
});
function updateSubmit() {
  $('submit').disabled = Boolean(state.endedAt) || !hasPendingFeedback();
  const endPending = Boolean(state.endRequestedAt && !state.endedAt);
  $('end-pending').hidden = !endPending;
  $('review-lifecycle').hidden = endPending;
  $('review-lifecycle').textContent = state.endedAt
    ? 'Resume review'
    : hasPendingFeedback()
      ? 'Send & End'
      : 'End review';
}
function submit(end = false) {
  const message = $('agent-message').value.trim();
  return action({ action: 'submit', ...(message ? { message } : {}), ...(end ? { end } : {}) });
}
$('submit').addEventListener('click', () => submit());
$('agent-message').addEventListener('input', updateSubmit);
$('agent-message').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!$('submit').disabled) void submit();
});
$('comment').addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if ($('save').disabled || !(await saveComment())) return;
  if ((event.metaKey || event.ctrlKey) && !$('submit').disabled) await submit();
});
$('refresh').addEventListener('click', () =>
  operation(async () => {
    acceptState(await api('refresh', {}));
    display();
    announce('Refreshed. Select text again.');
    void watchReview();
  }),
);
for (const name of ['rendered', 'source'])
  $(`${name}-mode`).addEventListener('click', () => {
    mode = name;
    displayDocument();
  });
$('export-details').addEventListener('toggle', () => {
  if ($('export-details').open && !$('export').value && state?.batches.length)
    void showBatch(state.batches.at(-1).id);
});
$('copy').addEventListener('click', async () => {
  try {
    if (!$('export').value) throw new Error('Submit or open a batch first.');
    await navigator.clipboard.writeText($('export').value);
    announce('Export copied.');
  } catch {
    $('export').focus();
    $('export').select();
    announce('Clipboard unavailable. Copy the selected export or download it.');
  }
});
$('download').addEventListener('click', () => {
  if (!$('export').value) return announce('Submit or open a batch first.');
  const url = URL.createObjectURL(new Blob([$('export').value], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spectater-feedback.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
operation(async () => {
  state = await api('state');
  mode = state.defaultView;
  automatic = state.automatic;
  watchError = state.watchError;
  display();
  restoreDraft();
  announce('Ready.');
  void watchReview();
});
