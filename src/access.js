import { existsSync } from 'node:fs';
import os from 'node:os';

export const REMOTE_PORT = 47420;
export const PORT_RANGE = 10;

function codespace(env) {
  const name = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (env.CODESPACES !== 'true' || !name || !domain) return null;
  if (!/^[A-Za-z0-9-]+$/.test(name) || !/^[A-Za-z0-9.-]+$/.test(domain)) return null;
  return { name, domain };
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
  if (env.WSL_DISTRO_NAME) return false;
  return platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

/** True inside a Docker or Podman container, where an SSH tunnel to the hostname cannot work. */
export function containerized() {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
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

/** The `access` object for `open`, or undefined for a local desktop session. */
export function accessFor(
  record,
  config,
  env = process.env,
  platform = process.platform,
  inContainer = containerized(),
) {
  const port = record.port ?? Number(new URL(record.url).port);
  if (record.publicUrl) return { mode: 'public', port };
  if (!remoteSession(env, platform) && !config.publicUrl) return undefined;
  if (inContainer && !env.SSH_CONNECTION && !env.SSH_TTY) return { mode: 'forward', port };
  const host = os.hostname().split('.')[0] || 'this-host';
  return { mode: 'tunnel', port, command: `ssh -N -L ${port}:127.0.0.1:${port} ${host}` };
}
