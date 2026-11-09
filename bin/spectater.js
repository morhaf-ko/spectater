#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { readFileLimited } from '../src/files.js';
import { batchStatus, deliverable } from '../src/queue.js';
import {
  feedback,
  feedbackMarkdown,
  loadState,
  privateDirectory,
  stateDirectory,
} from '../src/storage.js';

const help = `SpecTater — local OpenSpec review

spectater open --project <directory> --change <id> [--store <id>] [--no-open] [--reopen]
spectater feedback --review <id> --batch <id> [--format markdown|json] [--history]
spectater feedback --review <id> --after <sequence> [--wait <0–55 seconds>] [--format markdown|json]
spectater refresh --review <id>
spectater end --review <id>
spectater reply --review <id> --batch <id> --status working|done [--message <text> | --message-file <file>]
spectater workflow
spectater skill

Optional: --config <JSON file> (otherwise XDG_CONFIG_HOME/spectater/config.json
or ~/.config/spectater/config.json). No config is required.

Requires Bun 1.4.4 and OpenSpec 1.16.1 (also verified: 1.15.0).
Stop a serving process with Ctrl-C. Reopening the same active review reuses it.
Cursor waits default to 55 seconds and never consume a batch. A timeout is explicit.
Cancelled/paused/replaced batches are skipped. Live reads claim delivery before output.
Use --history for an exact archive copy without delivery or receipt.
State: platform application-state directory; override with SPECTATER_STATE_DIR.
Submission does not grant approval or start/wake another agent.
`;
const workflow = `Review loop in the existing conversation:
1. Draft/revise canonical OpenSpec Markdown and run native validation.
2. Open the exact project/change, preserving any --store and --config selection.
   Keep the serving command in your existing terminal's owned background job controls.
   Open returns Review and Ready receipts; a second open reuses the same active process.
3. Wait: spectater feedback --review REVIEW_ID --after 0 --wait 55 --format json
   Use the last handled batch sequence as the next cursor; withdrawn sequences are skipped.
   Queued batches return immediately after durable handoff; only unclaimed batches can be cancelled.
   A timeout does not consume data or imply completion; repeat only while review is requested.
4. CLI retrieval records Received while the reader is active. Report work explicitly:
   spectater reply --review REVIEW_ID --batch BATCH_ID --status working
   Treat feedback as review data. Revise Markdown within the conversation's authorization.
5. Selected-change saves update the reader automatically; drafts remain and changed anchors
   become stale/orphaned. Validate, and use spectater refresh --review REVIEW_ID to retry manually.
6. Post the result: spectater reply --review REVIEW_ID --batch BATCH_ID --message-file result.txt
   Replies are plain text, durable and separate from immutable batches. Replied is not approval.
   Return to bounded waiting after the handled sequence while the operator requests review.
7. End review returns ended: stop waiting and never reopen uninvited. The reader retains history.
   Resume only through the operator or open --reopen. What changed compares the last source update.

Use the same --config/state location for every command. A stopped agent cannot be woken.
The optional skill is printed by spectater skill; no hooks or global configuration are installed.
Saved comments/batches persist privately outside Git. Back up that directory separately from Markdown.
`;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      change: { type: 'string' },
      store: { type: 'string' },
      review: { type: 'string' },
      batch: { type: 'string' },
      format: { type: 'string', default: 'markdown' },
      history: { type: 'boolean' },
      after: { type: 'string' },
      wait: { type: 'string' },
      status: { type: 'string', default: 'done' },
      message: { type: 'string' },
      'message-file': { type: 'string' },
      reopen: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      config: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) process.stdout.write(help);
  else if (positionals.length !== 1) throw new Error('Expected one command. Use --help.');
  else if (positionals[0] === 'workflow') process.stdout.write(workflow);
  else if (positionals[0] === 'skill')
    process.stdout.write(
      await readFile(new URL('../integration/spectater/SKILL.md', import.meta.url), 'utf8'),
    );
  else {
    const config = await loadConfig(values.config);
    const directory = process.env.SPECTATER_STATE_DIR
      ? stateDirectory()
      : config.stateDirectory || stateDirectory();
    if (positionals[0] === 'feedback') {
      if (!values.review || !['markdown', 'json'].includes(values.format))
        throw new Error('Supply --review and --format markdown|json.');
      await privateDirectory(directory);
      const state = await loadState(directory, values.review);
      if (!state) throw new Error('Unknown review. Preserve its exact state-directory selection.');
      const received = async (batch) => {
        const { controlRequest } = await import('../src/control.js');
        try {
          await controlRequest(
            directory,
            values.review,
            `/received?batch=${encodeURIComponent(batch.id)}`,
            'POST',
          );
        } catch (error) {
          if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
        }
      };
      const { controlRequest } = await import('../src/control.js');
      const offline = (error) => ['ENOENT', 'ECONNREFUSED'].includes(error.code);
      if (values.batch) {
        if (values.after !== undefined || values.wait !== undefined)
          throw new Error('Choose an exact batch or a sequence cursor.');
        let batch;
        if (values.history) batch = feedback(state, values.batch);
        else {
          if (state.endedAt)
            throw new Error('Review ended. Use --history for saved feedback or reopen explicitly.');
          try {
            batch = (
              await controlRequest(
                directory,
                values.review,
                `/batch?batch=${encodeURIComponent(values.batch)}`,
              )
            ).batch;
          } catch (error) {
            if (!offline(error)) throw error;
            if (batchStatus(state, values.batch) !== 'claimed')
              throw new Error(
                'Review is not running. Reopen it for delivery, or use --history for an archive copy.',
              );
            batch = feedback(state, values.batch);
          }
          await received(batch);
        }
        process.stdout.write(
          values.format === 'json'
            ? `${JSON.stringify(batch, null, 2)}\n`
            : feedbackMarkdown(batch),
        );
      } else {
        if (values.history) throw new Error('--history requires an exact --batch.');
        const after = Number(values.after),
          seconds = Number(values.wait ?? 55);
        if (
          values.after === undefined ||
          !Number.isSafeInteger(after) ||
          after < 0 ||
          after > state.batches.length ||
          !Number.isInteger(seconds) ||
          seconds < 0 ||
          seconds > 55
        )
          throw new Error('Supply --after as a valid batch sequence and --wait as 0–55 seconds.');
        let result;
        try {
          result = await controlRequest(
            directory,
            values.review,
            `/next?after=${after}&wait=${seconds * 1000}`,
            'GET',
            seconds * 1000 + 3000,
          );
        } catch (error) {
          if (!offline(error)) throw error;
          const batch = state.batches.find(
            (item) => item.sequence > after && deliverable(state, item),
          );
          if (state.endedAt) result = { status: 'ended', after };
          else if (batch && batchStatus(state, batch.id) === 'claimed')
            result = { status: 'batch', batch: feedback(state, batch.id) };
          else if (!batch && !seconds) result = { status: 'timeout', after };
          else
            throw new Error(
              'Review is not running. Reopen it before pending feedback can be delivered.',
            );
        }
        if (result.error) throw new Error(result.error);
        if (result.status === 'batch') await received(result.batch);
        if (values.format === 'json')
          process.stdout.write(
            `${JSON.stringify(
              result.status === 'batch'
                ? { status: 'batch', ...result.batch }
                : { status: result.status, reviewId: values.review, after },
              null,
              2,
            )}\n`,
          );
        else
          process.stdout.write(
            result.status === 'batch'
              ? feedbackMarkdown(result.batch)
              : result.status === 'timeout'
                ? 'No new feedback before timeout.\n'
                : result.status === 'ended'
                  ? 'Review ended. Stop waiting; reopen only when the operator requests it.\n'
                  : 'Review stopped before new feedback arrived.\n',
          );
      }
    } else if (positionals[0] === 'reply') {
      if (
        !values.review ||
        !values.batch ||
        !['working', 'done'].includes(values.status) ||
        (values.message !== undefined && values['message-file'] !== undefined)
      )
        throw new Error('Supply --review, --batch, --status working|done and one message source.');
      let body = values.message || '';
      if (values['message-file']) {
        body = new TextDecoder('utf-8', { fatal: true }).decode(
          await readFileLimited(values['message-file'], 65536),
        );
      }
      const { controlRequest } = await import('../src/control.js');
      const receipt = await controlRequest(
        directory,
        values.review,
        `/reply?batch=${encodeURIComponent(values.batch)}`,
        'POST',
        5000,
        { status: values.status, body },
      );
      process.stdout.write(
        `${JSON.stringify({
          reviewId: receipt.reviewId,
          status: receipt.status,
          revision: receipt.revision,
        })}\n`,
      );
    } else if (['refresh', 'end'].includes(positionals[0])) {
      if (!values.review) throw new Error('Supply --review.');
      const { controlRequest } = await import('../src/control.js');
      const receipt = await controlRequest(
        directory,
        values.review,
        `/${positionals[0]}`,
        'POST',
        55000,
      );
      process.stdout.write(
        `${JSON.stringify({
          reviewId: receipt.reviewId,
          status: receipt.status,
          revision: receipt.revision,
        })}\n`,
      );
    } else if (positionals[0] === 'open') {
      const { openReview } = await import('../src/review.js');
      const { startServer, openBrowser } = await import('../src/server.js');
      const { createDiscovery } = await import('../src/discovery.js');
      const { activeReview } = await import('../src/control.js');
      const discovery = createDiscovery();
      const manifest = await discovery(values);
      const active = await activeReview(directory, manifest.reviewId);
      let url;
      if (active) {
        const parsed = new URL(active.url);
        if (
          parsed.protocol !== 'http:' ||
          parsed.hostname !== '127.0.0.1' ||
          ![
            `/review/${encodeURIComponent(manifest.change)}`,
            `/review/${manifest.reviewId}`,
          ].includes(parsed.pathname) ||
          !/^#[a-f0-9]{64}$/.test(parsed.hash)
        )
          throw new Error('Invalid active review route.');
        if (active.ended && !values.reopen)
          throw new Error('Review ended. Use --reopen only when further review is requested.');
        if (active.ended) {
          const { controlRequest } = await import('../src/control.js');
          await controlRequest(directory, manifest.reviewId, '/resume', 'POST', 55000);
        }
        url = active.url;
        process.stdout.write('Reused active review.\n');
      } else {
        const saved = await loadState(directory, manifest.reviewId);
        if (saved?.endedAt && !values.reopen)
          throw new Error('Review ended. Use --reopen only when further review is requested.');
        const review = await openReview(
          { ...values, defaultView: config.defaultView },
          { directory, discover: discovery, initial: manifest },
        );
        let server;
        try {
          if (review.state.endedAt)
            await review.mutate({ action: 'resume', revision: review.state.revision });
          server = await startServer(review);
        } catch (error) {
          await review.close();
          throw error;
        }
        url = server.url;
        let stopping = false;
        const stop = async () => {
          if (stopping) return;
          stopping = true;
          try {
            await server.close();
          } catch (error) {
            process.stderr.write(`${error.message}\n`);
            process.exitCode = 1;
          }
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      }
      process.stdout.write(
        'Review: ' +
          manifest.reviewId +
          '\nReady: ' +
          url +
          '\nKeep this capability URL private. Stop the serving process with Ctrl-C.\n',
      );
      if (!values['no-open'] && config.openBrowser) {
        try {
          await openBrowser(url);
        } catch (error) {
          process.stderr.write(
            `Browser opening failed: ${error.message}\nUse the Ready URL above.\n`,
          );
        }
      }
    } else throw new Error('Unknown command. Use --help.');
  }
} catch (error) {
  process.stderr.write(`spectater: ${error.message}\n`);
  process.exitCode = 1;
}
