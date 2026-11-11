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

/** True when the reviewer's browser is probably on another machine (SSH, codespace or no display). */
export function remoteSession(env = process.env, platform = process.platform) {
  return Boolean(
    env.SSH_CONNECTION ||
      env.SSH_TTY ||
      codespace(env) ||
      (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY),
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

/** The public origin for the port actually bound, or undefined when the review stays on loopback. */
export function publicOrigin(config, port, env = process.env) {
  if (config.publicUrl) return port === configuredPort(config, env) ? config.publicUrl : undefined;
  const space = codespace(env);
  return space ? `https://${space.name}-${port}.${space.domain}` : undefined;
}

/** The `access` object for `open`, or undefined for a local desktop session. */
export function accessFor(record, config, env = process.env, platform = process.platform) {
  const port = record.port ?? Number(new URL(record.url).port);
  if (record.publicUrl) return { mode: 'public', port };
  if (!remoteSession(env, platform) && !config.publicUrl) return undefined;
  const host = os.hostname().split('.')[0] || 'this-host';
  return { mode: 'tunnel', port, command: `ssh -N -L ${port}:127.0.0.1:${port} ${host}` };
}
