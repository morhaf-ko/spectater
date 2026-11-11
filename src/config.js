import os from 'node:os';
import path from 'node:path';
import { parsePort } from './access.js';
import { readFileLimited } from './files.js';

export const defaults = Object.freeze({ defaultView: 'rendered', openBrowser: true });
function configPath(env = process.env) {
  return (
    env.SPECTATER_CONFIG ||
    path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'spectater', 'config.json')
  );
}

function publicOrigin(value) {
  let url;
  try {
    url = typeof value === 'string' && new URL(value);
  } catch {}
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== value.replace(/\/$/, '')
  )
    throw new Error(
      'publicUrl must be an http or https origin without credentials, path, query or fragment.',
    );
  return url.origin;
}

export async function loadConfig(explicit, env = process.env) {
  const file = explicit || configPath(env);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await readFileLimited(file, 16384));
  } catch (error) {
    if (error.code === 'ENOENT' && !explicit && !env.SPECTATER_CONFIG) return { ...defaults };
    throw new Error(`Cannot read SpecTater config: ${error.message}`);
  }
  try {
    const config = JSON.parse(text);
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new Error('Expected an object.');
    for (const key of Object.keys(config))
      if (!['defaultView', 'openBrowser', 'stateDirectory', 'port', 'publicUrl'].includes(key))
        throw new Error(`Unknown setting: ${key}`);
    if (config.defaultView !== undefined && !['rendered', 'source'].includes(config.defaultView))
      throw new Error('defaultView must be rendered or source.');
    if (config.openBrowser !== undefined && typeof config.openBrowser !== 'boolean')
      throw new Error('openBrowser must be true or false.');
    if (
      config.stateDirectory !== undefined &&
      (typeof config.stateDirectory !== 'string' || !path.isAbsolute(config.stateDirectory))
    )
      throw new Error('stateDirectory must be an absolute path.');
    if (config.port !== undefined) {
      if (typeof config.port !== 'number') throw new Error('port must be a number.');
      parsePort(config.port, 'port');
    }
    if (config.publicUrl !== undefined) config.publicUrl = publicOrigin(config.publicUrl);
    if (config.publicUrl && config.port === undefined && !env.SPECTATER_PORT)
      throw new Error('publicUrl needs port (or SPECTATER_PORT) for the proxy to target.');
    return { ...defaults, ...config };
  } catch (error) {
    throw new Error(
      `Invalid SpecTater config: ${error.message} Fix it or remove the optional file to use defaults.`,
    );
  }
}
