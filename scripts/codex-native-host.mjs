#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
let stdoutQueue = Promise.resolve();
let shuttingDown = false;

const probe = spawn(
  process.execPath,
  [
    join(rootDir, 'scripts', 'codex-status-probe.mjs'),
    '--watch',
    '--emit-unchanged',
  ],
  {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let bufferedStdout = '';

probe.stdout.setEncoding('utf8');
probe.stdout.on('data', (chunk) => {
  bufferedStdout += chunk;

  while (bufferedStdout.includes('\n')) {
    const newlineIndex = bufferedStdout.indexOf('\n');
    const line = bufferedStdout.slice(0, newlineIndex).trim();
    bufferedStdout = bufferedStdout.slice(newlineIndex + 1);

    if (!line) {
      continue;
    }

    try {
      sendNativeMessage(JSON.parse(line));
    } catch {
      sendNativeMessage({
        status: 'disconnected',
        reason: 'probe_output_parse_error',
      });
    }
  }
});

probe.stderr.setEncoding('utf8');
probe.stderr.on('data', (chunk) => {
  sendNativeMessage({
    status: 'disconnected',
    reason: 'probe_stderr',
    detail: chunk.trim().slice(0, 500),
  });
});

probe.on('exit', (code, signal) => {
  sendNativeMessage({
    status: 'disconnected',
    reason: 'probe_exited',
    code,
    signal,
  }).finally(() => {
    process.exit(code ?? 1);
  });
});

process.stdin.on('data', () => {
  // The current host streams status changes and does not need commands yet.
});

process.stdin.on('end', () => {
  probe.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  probe.kill('SIGTERM');
});

process.on('SIGINT', () => {
  probe.kill('SIGINT');
});

process.stdout.on('error', handleOutputError);

function sendNativeMessage(message) {
  stdoutQueue = stdoutQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(message), 'utf8');
        const header = Buffer.alloc(4);
        header.writeUInt32LE(body.length, 0);

        process.stdout.write(Buffer.concat([header, body]), (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  ).catch(handleOutputError);

  return stdoutQueue;
}

function handleOutputError(error) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  probe.kill('SIGTERM');
  process.exit(error?.code === 'EPIPE' ? 0 : 1);
}
