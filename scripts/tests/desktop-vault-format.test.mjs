import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const mainProcess = readFileSync(resolve('desktop/recovered/dist/main.js'), 'utf8');

test('桌面主进程同时接受 v1 和 v2 Vault 根格式', () => {
  assert.match(mainProcess, /SUPPORTED_VAULT_FORMATS = new Set\(\[VAULT_FORMAT, 'clawpm-vault@2'\]\)/);
  assert.match(mainProcess, /!SUPPORTED_VAULT_FORMATS\.has\(config\.format\)/);
});
