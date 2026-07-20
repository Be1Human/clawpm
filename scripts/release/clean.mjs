#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const path of [resolve(root, 'release-artifacts'), resolve(root, 'desktop', 'release')]) {
  rmSync(path, { recursive: true, force: true });
  console.log(`[release:clean] removed ${path}`);
}
