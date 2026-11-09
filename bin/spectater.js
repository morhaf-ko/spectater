#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { stateDirectory, loadState, feedback, feedbackMarkdown, privateDirectory } from '../src/storage.js';
import { loadConfig } from '../src/config.js';

const help = `SpecTater — local OpenSpec review

spectater open --project <directory> --change <id> [--store <id>] [--no-open]
spectater feedback --review <id> --batch <id> [--format markdown|json]

Optional: --config <JSON file> (otherwise XDG_CONFIG_HOME/spectater/config.json
or ~/.config/spectater/config.json). No config is required.

Requires Bun 1.4.4 and OpenSpec 1.16.1 (also verified: 1.15.0).
Stop a review with Ctrl-C.
State: platform application-state directory; override with SPECTATER_STATE_DIR.
No source editing, agent delivery or approval is implied by submission.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    project: { type: 'string' }, change: { type: 'string' }, store: { type: 'string' },
    review: { type: 'string' }, batch: { type: 'string' }, format: { type: 'string', default: 'markdown' },
    'no-open': { type: 'boolean' }, config: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !positionals.length) process.stdout.write(help);
  else if (positionals.length !== 1) throw new Error('Expected one command. Use --help.');
  else if (positionals[0] === 'feedback') {
    if (!values.review || !values.batch || !['markdown', 'json'].includes(values.format)) throw new Error('Supply exact --review and --batch ids and --format markdown|json.');
    const config = await loadConfig(values.config);
    const directory = process.env.SPECTATER_STATE_DIR ? stateDirectory() : config.stateDirectory || stateDirectory();
    await privateDirectory(directory);
    const batch = feedback(await loadState(directory, values.review), values.batch);
    process.stdout.write(values.format === 'json' ? `${JSON.stringify(batch, null, 2)}\n` : feedbackMarkdown(batch));
  } else if (positionals[0] === 'open') {
    const { openReview } = await import('../src/review.js');
    const { startServer, openBrowser } = await import('../src/server.js');
    const config = await loadConfig(values.config);
    const directory = process.env.SPECTATER_STATE_DIR ? stateDirectory() : config.stateDirectory || stateDirectory();
    const review = await openReview({ ...values, defaultView: config.defaultView }, { directory });
    let server;
    try { server = await startServer(review); } catch (error) { await review.close(); throw error; }
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; try { await server.close(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    process.stdout.write(`Review: ${review.state.reviewId}\nReady: ${server.url}\nKeep this capability URL private. Stop with Ctrl-C.\n`);
    if (!values['no-open'] && config.openBrowser) {
      try { await openBrowser(server.url); }
      catch (error) { process.stderr.write(`Browser opening failed: ${error.message}\nUse the Ready URL above.\n`); }
    }
  } else throw new Error('Unknown command. Use --help.');
} catch (error) { process.stderr.write(`spectater: ${error.message}\n`); process.exitCode = 1; }
