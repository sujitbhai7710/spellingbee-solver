import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const publicRoot = new URL('../../public/', import.meta.url);

function resolvePublicPath(relativePath) {
  return new URL(relativePath.replace(/^\/+/, ''), publicRoot);
}

export function ensurePublicDataDir(relativeDir) {
  const target = resolvePublicPath(relativeDir);
  mkdirSync(target, { recursive: true });
  return target;
}

export function readPublicJson(relativePath, fallback = null) {
  try {
    const url = resolvePublicPath(relativePath);
    if (!existsSync(url)) {
      return fallback;
    }
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (error) {
    console.error(`Failed to read public JSON ${relativePath}:`, error);
    return fallback;
  }
}

export function readPublicText(relativePath, fallback = '') {
  try {
    const url = resolvePublicPath(relativePath);
    if (!existsSync(url)) {
      return fallback;
    }
    return readFileSync(url, 'utf8');
  } catch (error) {
    console.error(`Failed to read public text ${relativePath}:`, error);
    return fallback;
  }
}

export function readDictionaryWords() {
  const raw = readPublicText('twl06.txt', '');
  if (!raw) return [];
  return [...new Set(
    raw
      .split(/\r?\n/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  )];
}
