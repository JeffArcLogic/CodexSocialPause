#!/usr/bin/env node

import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const manifestPaths = [
  'com.codex_social_pause.status.json',
  'com.codex_social_blocker.status.json',
].map((fileName) =>
  join(
    homedir(),
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    'NativeMessagingHosts',
    fileName,
  ),
);

let removed = false;

for (const manifestPath of manifestPaths) {
  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath);
    removed = true;
    console.log(`Removed ${manifestPath}`);
  }
}

if (!removed) {
  console.log('No native host manifest found.');
}
