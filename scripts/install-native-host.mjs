#!/usr/bin/env node

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_NAME = 'com.codex_social_pause.status';
const LEGACY_HOST_NAME = 'com.codex_social_blocker.status';
const DEFAULT_EXTENSION_ID = 'jfgddmjfbnebpdodhcjoihoknnlefifm';
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hostPath = resolve(rootDir, 'native', 'codex-social-pause-host');
const manifestPath = join(
  homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
  `${HOST_NAME}.json`,
);
const legacyManifestPath = join(
  homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
  `${LEGACY_HOST_NAME}.json`,
);

const extensionId = readArg('--extension-id') ?? DEFAULT_EXTENSION_ID;

if (!/^[a-p]{32}$/.test(extensionId)) {
  console.error(`Usage: npm run native:install -- [--extension-id <chrome-extension-id>]

By default this uses the stable unpacked-extension ID baked into wxt.config.ts:
${DEFAULT_EXTENSION_ID}

To override, find the ID at chrome://extensions on the "Codex Social Pause" card.
Expected Chrome extension IDs are 32 lowercase characters using a-p.
`);
  process.exit(1);
}

if (!existsSync(hostPath)) {
  console.error(`Native host launcher not found: ${hostPath}`);
  process.exit(1);
}

mkdirSync(dirname(manifestPath), { recursive: true });

const manifest = {
  name: HOST_NAME,
  description: 'Streams local Codex status to the Codex Social Pause extension.',
  path: hostPath,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${extensionId}/`],
};

writeFileSync(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`);

if (existsSync(legacyManifestPath)) {
  unlinkSync(legacyManifestPath);
}

console.log(`Installed native messaging host manifest:
${manifestPath}

Allowed extension:
chrome-extension://${extensionId}/

Host launcher:
${hostPath}
`);

function readArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}
