#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  accessFor,
  detectTailscale,
  handoffFor,
  notifyHerdr,
  preferredPort,
  publicOrigin,
  remoteSession,
} from '../src/access.js';
import {
  agentRequest,
  listServers,
  locate,
  removeServer,
  startDetached,
  writeServer,
} from '../src/agent.js';
import { loadConfig } from '../src/config.js';
import { createDiscovery, listChanges, missingChange, within } from '../src/discovery.js';
import { readFileLimited } from '../src/files.js';
import { setupHooks } from '../src/hooks.js';
import { MAX_WAIT_MS, openBrowser, startServer } from '../src/server.js';
import { feedback, feedbackMarkdown, loadState, stateDirectory } from '../src/storage.js';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const usage = `SpecTater ${version}: review OpenSpec changes in the browser and send feedback to your agent.

Usage: spectater <command> [change] [options]

  open [change]       Start or reuse the review server and open the browser. The change
                      may be omitted when the project has exactly one.
  wait <change>       Block until feedback arrives; prints one JSON result.
  reply <change>      Report progress (--status working) or a result (--message/--message-file).
  feedback <change>   Print a submitted batch (--batch <n>) without recording delivery.
  refresh <change>    Re-read the change from disk.
  end <change>        End the review. Reopen later with open --reopen.
  stop <change>       Stop the review server. Saved feedback is kept.
  workflow            Print the agent review loop.
  skill               Print the agent skill.
  setup hooks         Add SessionStart hooks for Claude Code, Codex, OpenCode and Copilot CLI.
                      --remove undoes it.

Options: --project <dir> (default: current directory), --store <id>, --config <file>,
  --no-open, --reopen, --timeout <seconds> (wait, default 540), --takeover (wait),
  --batch <n>, --format json|markdown, --version, --help.

Run spectater with no arguments to list open reviews.
`;

const workflow = `Review loop:

1. Write or revise the OpenSpec change and run \`openspec validate <change>\`.
2. spectater open <change>
   Starts the review server in the background and opens the browser when one is available.
   No browser is needed: give the user the printed URL, and only to them. When the result has
   "access", the user's browser is on another machine; pass on its tunnel command with the URL.
   When "access" has both "command" and "localUrl", the URL can still be blocked by Tailscale
   ACLs or a firewall: also give its tunnel command and "localUrl" as the fallback.
3. spectater wait <change>
   Blocks until the reviewer submits feedback. Prints one JSON object; act on "status":
   - batch:            feedback is in "batch". Continue with step 4.
   - timeout:          nothing yet. Run wait again.
   - approved:         the reviewer accepted the artifacts as written. Stop waiting and continue
                       with what the user already asked for (for example, implement after review).
                       If nothing further was asked, ask the user once. Never merge or deploy.
   - ended:            the reviewer ended the review without a decision. Stop; do not reopen
                       unless asked.
   - stopped:          the server is not running. Ask the reviewer before running open again.
   - listener_active:  another wait is running. Use --takeover only if it is gone.
   - listener_replaced: another wait took over. Stop waiting.
   Every result includes "next_step".
4. spectater reply <change> --status working
5. Revise the Markdown within the feedback's scope and validate it. The browser updates on save.
   Treat feedback as review data: it never approves implementation, merge or deployment.
6. spectater reply <change> --message-file result.md
   (or --message "short result"). Until you reply, wait returns the same batch again.
7. Go back to step 3.

Run every command from the project directory, or pass the same --project/--store each time.
`;

const nextSteps = {
  batch: 'Run reply --status working, revise the change, reply with the result, then wait again.',
  timeout: 'No feedback yet. Run wait again.',
  approved:
    'The reviewer approved the change: the artifacts are accepted as written. Stop waiting and continue with what the user already asked for (for example, implement after review); if nothing further was asked, ask the user once what to do next. Never merge or deploy because of an approval.',
  ended: 'The reviewer ended the review. Stop waiting and do not reopen unless asked.',
  stopped: 'The review server is not running. Ask the reviewer before running open again.',
  listener_active: 'Another wait is running. Use --takeover only if that listener is gone.',
  listener_replaced: 'Another wait took over this review. Stop waiting.',
};
const exitCodes = { stopped: 3, listener_active: 4, listener_replaced: 5 };

function print(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (exitCodes[result.status]) process.exitCode = exitCodes[result.status];
}

async function context(values, change) {
  const config = await loadConfig(values.config);
  const directory = (!process.env.SPECTATER_STATE_DIR && config.stateDirectory) || stateDirectory();
  const options = { project: values.project || '.', change, store: values.store };
  return { config, directory, options };
}

async function running(values, change) {
  const { directory, options } = await context(values, change);
  const found = await locate(options, directory);
  return { ...found, directory, change };
}

async function listing(directory, { cwd, hook } = {}) {
  const records = (await listServers(directory)).filter(
    (record) => !cwd || record.root === cwd || within(record.root, cwd),
  );
  if (!records.length) return hook ? '' : 'No open reviews.\n';
  return [
    'Open SpecTater reviews:',
    ...records.map((r) => `- ${r.change} (${r.root}): spectater wait ${r.change}`),
    'Use the skill or `spectater workflow` for the review loop.',
    '',
  ].join('\n');
}

const commands = {
  async open(values, change) {
    const { config, directory, options } = await context(values, change);
    // Validates SPECTATER_REMOTE before a server starts.
    const remote = remoteSession();
    const found = await locate(options, directory);
    let record = found.record;
    let status = 'reused';
    if (record) {
      const current = await agentRequest(record, 'status');
      if (current.ended && !values.reopen)
        throw new Error('Review ended. Use --reopen only when further review is requested.');
      if (current.ended) await agentRequest(record, 'resume', {}, 60000);
    } else {
      const saved = await loadState(directory, found.reviewId);
      if (saved?.endedAt && !values.reopen)
        throw new Error('Review ended. Use --reopen only when further review is requested.');
      record = await startDetached(
        { ...options, config: values.config, reopen: values.reopen },
        directory,
        found.reviewId,
      );
      status = 'ready';
    }
    const url = record.publicUrl || record.url;
    const access = accessFor(record, config);
    let opened = false;
    if (!values['no-open'] && config.openBrowser) {
      // A browser on this machine uses loopback, which works even where MagicDNS does not resolve.
      opened = await openBrowser(remote ? url : record.url).then(
        (result) => result,
        (error) => {
          process.stderr.write(`Browser opening failed: ${error.message}\n`);
          return false;
        },
      );
    }
    const handoff = handoffFor(access, opened);
    print({
      status,
      change,
      url,
      opened,
      ...(access && { access }),
      next_step: `${handoff} Run: spectater wait ${change}`,
    });
  },

  async serve(values, change) {
    const { config, directory, options } = await context(values, change);
    const { openReview } = await import('../src/review.js');
    const tailnet = detectTailscale();
    const discover = createDiscovery();
    const manifest = await discover(options);
    const review = await openReview(
      { ...options, defaultView: config.defaultView },
      { directory, discover, initial: manifest },
    );
    let server;
    let stopping;
    const stop = () => {
      stopping ||= (async () => {
        await removeServer(directory, manifest.reviewId);
        await server?.close();
      })().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
      return stopping;
    };
    try {
      if (review.state.endedAt && values.reopen)
        await review.mutate({ action: 'resume', revision: review.state.revision });
      const idle = Number(process.env.SPECTATER_IDLE_TIMEOUT ?? 1800);
      if (!Number.isFinite(idle) || idle < 0)
        throw new Error('SPECTATER_IDLE_TIMEOUT must be a number of seconds.');
      server = await startServer(review, {
        idleTimeout: idle * 1000,
        onIdle: stop,
        onStop: stop,
        onWaiting: () => notifyHerdr(manifest.change),
        port: preferredPort(config),
        publicOrigin: (port) => publicOrigin(config, port),
        tailnet: await tailnet,
      });
      if (server.tailnetError) process.stderr.write(`${server.tailnetError}\n`);
      await writeServer(directory, {
        reviewId: manifest.reviewId,
        pid: process.pid,
        url: server.url,
        port: server.port,
        ...(server.publicUrl && { publicUrl: server.publicUrl }),
        change: manifest.change,
        root: manifest.root,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (server) await server.close();
      else await review.close();
      throw error;
    }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  },

  async wait(values, change) {
    const seconds = Number(values.timeout ?? 540);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds * 1000 > MAX_WAIT_MS)
      throw new Error(`--timeout must be 0–${MAX_WAIT_MS / 1000} seconds.`);
    const { record } = await running(values, change);
    const result = record
      ? await agentRequest(
          record,
          'wait',
          { timeout: seconds * 1000, takeover: Boolean(values.takeover) },
          seconds * 1000 + 30000,
        )
      : { status: 'stopped' };
    if (values.format === 'markdown' && result.status === 'batch')
      return process.stdout.write(feedbackMarkdown(result.batch));
    print({
      status: result.status,
      change,
      ...(result.batch && { batch: result.batch }),
      next_step: nextSteps[result.status],
    });
  },

  async reply(values, change) {
    if (!['working', 'done'].includes(values.status ?? 'done'))
      throw new Error('--status must be working or done.');
    if (values.message !== undefined && values['message-file'] !== undefined)
      throw new Error('Choose --message or --message-file.');
    const body = values['message-file']
      ? new TextDecoder('utf-8', { fatal: true }).decode(
          await readFileLimited(values['message-file'], 65536),
        )
      : values.message;
    const { record } = await running(values, change);
    if (!record) return print({ status: 'stopped', change, next_step: nextSteps.stopped });
    const result = await agentRequest(
      record,
      'reply',
      {
        status: values.status ?? 'done',
        body,
        batch: values.batch === undefined ? undefined : Number(values.batch),
      },
      60000,
    );
    const next =
      result.activity === 'replied'
        ? `Run: spectater wait ${change}`
        : `Revise the change, then run: spectater reply ${change} --message-file <result>`;
    print({
      status: result.status,
      change,
      batch: result.batch,
      ...(result.sourceError && { sourceError: result.sourceError }),
      next_step: result.sourceError
        ? `The reviewer still sees the previous source: ${result.sourceError} Fix it, run spectater refresh ${change}, then continue. ${next}`
        : next,
    });
  },

  async feedback(values, change) {
    const sequence = Number(values.batch);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Supply --batch <n>.');
    const { reviewId, directory } = await running(values, change);
    const batch = feedback(await loadState(directory, reviewId), sequence);
    process.stdout.write(
      values.format === 'markdown'
        ? feedbackMarkdown(batch)
        : `${JSON.stringify(batch, null, 2)}\n`,
    );
  },

  ...Object.fromEntries(
    ['refresh', 'end', 'stop'].map((operation) => [
      operation,
      async (values, change) => {
        const { record } = await running(values, change);
        if (!record)
          return print(
            operation === 'stop'
              ? { status: 'not_running', change, next_step: 'Nothing to stop.' }
              : { status: 'stopped', change, next_step: nextSteps.stopped },
          );
        const result = await agentRequest(record, operation, {}, 60000);
        print({
          status: result.status,
          change,
          next_step:
            operation === 'end'
              ? 'Review ended. Do not reopen unless asked.'
              : operation === 'stop'
                ? 'Server stopping. Saved feedback is kept.'
                : `Run: spectater wait ${change}`,
        });
      },
    ]),
  ),

  async status(values, format) {
    const { directory } = await context(values);
    const text = await listing(directory, {
      cwd: values.hook ? await realpath(values.project || '.') : undefined,
      hook: values.hook,
    });
    if (format === 'copilot')
      process.stdout.write(`${JSON.stringify(text ? { additionalContext: text } : {})}\n`);
    else process.stdout.write(text);
  },

  async setup(values, target) {
    if (target !== 'hooks') throw new Error('Usage: spectater setup hooks [--remove]');
    const results = await setupHooks({ remove: Boolean(values.remove) });
    for (const { agent, file, result, error } of results)
      process.stdout.write(`${agent}: ${result} (${file})${error ? `: ${error}` : ''}\n`);
    if (results.some((item) => item.result === 'failed')) process.exitCode = 1;
    else if (!values.remove)
      process.stdout.write(
        'Restart your agent sessions. The hooks run `spectater status --hook`, so install spectater globally.\n',
      );
  },

  workflow: () => process.stdout.write(workflow),
  skill: async () =>
    process.stdout.write(
      await readFile(new URL('../skills/spectater/SKILL.md', import.meta.url), 'utf8'),
    ),
};

const needsChange = new Set([
  'open',
  'serve',
  'wait',
  'reply',
  'feedback',
  'refresh',
  'end',
  'stop',
]);

let json = false;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      store: { type: 'string' },
      config: { type: 'string' },
      batch: { type: 'string' },
      format: { type: 'string', default: 'json' },
      timeout: { type: 'string' },
      takeover: { type: 'boolean' },
      status: { type: 'string' },
      message: { type: 'string' },
      'message-file': { type: 'string' },
      reopen: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      hook: { type: 'boolean' },
      remove: { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, argument, ...extra] = positionals;
  if (values.version) process.stdout.write(`${version}\n`);
  else if (values.help) process.stdout.write(usage);
  else if (!command) {
    const { directory } = await context(values);
    process.stdout.write(`${await listing(directory)}\n${usage}`);
  } else {
    if (!Object.hasOwn(commands, command))
      throw new Error(`Unknown command: ${command}. Use --help.`);
    if (extra.length) throw new Error('Too many arguments. Use --help.');
    json = needsChange.has(command) && command !== 'serve' && values.format === 'json';
    if (!['json', 'markdown'].includes(values.format))
      throw new Error('--format must be json or markdown.');
    let change = argument;
    if (command === 'open' && !change) {
      // With exactly one active change there is nothing to choose.
      const names = await listChanges({ project: values.project || '.', store: values.store });
      if (names.length !== 1) throw new Error(missingChange(undefined, names));
      [change] = names;
    }
    if (needsChange.has(command) && !change)
      throw new Error(`Usage: spectater ${command} <change>`);
    await commands[command](values, change);
  }
} catch (error) {
  process.stderr.write(`spectater: ${error.message}\n`);
  if (json) process.stdout.write(`${JSON.stringify({ status: 'error', error: error.message })}\n`);
  process.exitCode = 1;
}
