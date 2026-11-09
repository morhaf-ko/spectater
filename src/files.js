import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

export async function readLimited(handle, limit) {
  const chunks = [];
  let length = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(65536, limit + 1 - length));
    const { bytesRead } = await handle.read(chunk);
    if (!bytesRead) return Buffer.concat(chunks, length);
    length += bytesRead;
    if (length > limit) throw new Error(`File exceeds ${limit} bytes.`);
    chunks.push(chunk.subarray(0, bytesRead));
  }
}

export async function readFileLimited(file, limit) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Expected a regular file.');
    return await readLimited(handle, limit);
  } finally {
    await handle.close();
  }
}
