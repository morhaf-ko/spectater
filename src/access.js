import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const REMOTE_PORT = 47420;
export const PORT_RANGE = 10;

function codespace(env) {
  const name = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (env.CODESPACES !== 'true' || !name || !domain) return null;
  if (!/^[A-Za-z0-9-]+$/.test(name) || !/^[A-Za-z0-9.-]+$/.test(domain)) return null;
  return { name, domain };
}

const tmuxSessions = new Map();

/**
 * True when the tmux session around this pane was last attached over SSH. A pane keeps the
 * environment of the client that started tmux; tmux updates `SSH_CONNECTION` on every attach.
 */
export function tmuxSsh(env, run = execFileSync) {
  if (!env.TMUX) return false;
  if (!tmuxSessions.has(env.TMUX)) {
    let attached = false;
    try {
      const output = run('tmux', ['show-environment', 'SSH_CONNECTION'], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      });
      attached = /^SSH_CONNECTION=\S/m.test(output);
    } catch {}
    tmuxSessions.set(env.TMUX, attached);
  }
  return tmuxSessions.get(env.TMUX);
}

/**
 * True when the reviewer's browser is probably on another machine (SSH, codespace or no display).
 * `SPECTATER_REMOTE` set to 1/true or 0/false overrides detection.
 */
export function remoteSession(env = process.env, platform = process.platform) {
  const override = (env.SPECTATER_REMOTE || '').toLowerCase();
  if (['1', 'true'].includes(override)) return true;
  if (['0', 'false'].includes(override)) return false;
  if (override) throw new Error('SPECTATER_REMOTE must be 1, true, 0 or false.');
  if (env.SSH_CONNECTION || env.SSH_TTY || codespace(env)) return true;
  // Windows browsers reach WSL2 loopback directly, so a display-less WSL shell is still local.
  const headless =
    platform === 'linux' && !env.WSL_DISTRO_NAME && !env.DISPLAY && !env.WAYLAND_DISPLAY;
  // tmux is asked last: a headless host is remote without the extra process.
  return headless || tmuxSsh(env);
}

/** True inside a container or pod, where an SSH tunnel to the hostname cannot work. */
export function containerized(env = process.env) {
  return Boolean(
    env.KUBERNETES_SERVICE_HOST || existsSync('/.dockerenv') || existsSync('/run/.containerenv'),
  );
}

export function parsePort(value, source) {
  const port = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${source} must be a port number from 1 to 65535.`);
  return port;
}

/** The configured port (`SPECTATER_PORT` wins over config), or undefined when none is set. */
export function configuredPort(config = {}, env = process.env) {
  if (env.SPECTATER_PORT) return parsePort(env.SPECTATER_PORT, 'SPECTATER_PORT');
  return config.port;
}

/** The port to try first: configured, the remote default, or 0 for a random port. */
export function preferredPort(config, env = process.env, platform = process.platform) {
  return configuredPort(config, env) ?? (remoteSession(env, platform) ? REMOTE_PORT : 0);
}

/**
 * The public origin for the port actually bound, or undefined when the review stays on loopback.
 * A configured `publicUrl` belongs to the config's `port`, which its proxy targets.
 */
export function publicOrigin(config, port, env = process.env) {
  if (config.publicUrl) return port === config.port ? config.publicUrl : undefined;
  const space = codespace(env);
  return space ? `https://${space.name}-${port}.${space.domain}` : undefined;
}

/** This node's tailnet IPv4 and MagicDNS name from `tailscale status --json`, or null. */
export function parseTailscale(raw) {
  let status;
  try {
    status = JSON.parse(raw);
  } catch {
    return null;
  }
  if (status?.BackendState !== 'Running' || !Array.isArray(status.Self?.TailscaleIPs)) return null;
  const address = status.Self.TailscaleIPs.find((ip) => isIP(ip) === 4);
  const host = String(status.Self.DNSName || '')
    .replace(/\.$/, '')
    .toLowerCase();
  const labels = host.split('.');
  if (
    !address ||
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return null;
  return { address, host };
}

function tailscaleCommands(platform, env) {
  if (platform === 'darwin')
    return ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  if (platform === 'win32')
    return [
      'tailscale',
      path.win32.join(env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    ];
  return ['tailscale'];
}

/**
 * The tailnet address to serve reviews on, or null when Tailscale is not running, MagicDNS is
 * off, or `SPECTATER_TAILSCALE` is 0/false. Never throws.
 */
export async function detectTailscale(
  env = process.env,
  platform = process.platform,
  run = promisify(execFile),
) {
  if (['0', 'false'].includes((env.SPECTATER_TAILSCALE || '').toLowerCase())) return null;
  for (const command of tailscaleCommands(platform, env)) {
    try {
      const { stdout } = await run(command, ['status', '--json'], {
        timeout: 2000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      const tailnet = parseTailscale(stdout);
      if (tailnet) return tailnet;
    } catch {}
  }
  return null;
}

/** The `access` object for `open`, or undefined for a local desktop session. */
export function accessFor(
  record,
  config,
  env = process.env,
  platform = process.platform,
  inContainer = containerized(env),
) {
  const port = record.port ?? Number(new URL(record.url).port);
  if (record.publicUrl) return { mode: 'public', port };
  if (!remoteSession(env, platform) && !config.publicUrl) return undefined;
  if (inContainer && !env.SSH_CONNECTION && !env.SSH_TTY && !tmuxSsh(env))
    return { mode: 'forward', port };
  const host = os.hostname().split('.')[0] || 'this-host';
  return { mode: 'tunnel', port, command: `ssh -N -L ${port}:127.0.0.1:${port} ${host}` };
}

/** The `next_step` handoff before `Run: spectater wait`. */
export function handoffFor(access, opened) {
  if (!access)
    return opened ? 'The browser is open.' : 'Give the reviewer the url (keep it private).';
  const reach = {
    tunnel:
      ' and access.command, which they run on their own machine first; the host is this machine and may need their own SSH name for it',
    forward: ` and tell them to forward port ${access.port} from this container to their machine first (their editor's port forwarding, \`kubectl port-forward\` or host networking)`,
    public: '',
  }[access.mode];
  // An opener can run on this machine rather than the reviewer's, so remote handoffs keep the url.
  const helper = opened ? "The browser opener ran, possibly not on the reviewer's machine. " : '';
  return `${helper}Give the reviewer the url (keep it private)${reach}.`;
}

/**
 * Shows a Herdr notification with its request chime when `SPECTATER_HERDR_CHIME=1` inside Herdr
 * (`HERDR_ENV=1`). Never blocks or throws: a missing or stalled Herdr is ignored.
 */
export function notifyHerdr(change, env = process.env, run = spawn) {
  if (env.HERDR_ENV !== '1' || env.SPECTATER_HERDR_CHIME !== '1') return false;
  try {
    const child = run(
      'herdr',
      [
        'notification',
        'show',
        'SpecTater review waiting',
        '--body',
        `${change} is waiting for your feedback.`,
        '--sound',
        'request',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    child.on('error', () => {});
    const timer = setTimeout(() => child.kill(), 2000);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
    child.unref();
    return true;
  } catch {
    return false;
  }
}
