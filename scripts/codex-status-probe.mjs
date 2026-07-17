#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  TURN_STATE,
  createBlockingStatusStabilizer,
  getAggregateTurnState,
  getTurnState,
  hasLiveCodexApp,
  isWaitingOnUserEvent,
} from './codex-session-state.mjs';

const STATUS = {
  WORKING: 'working',
  WAITING_ON_USER: 'waiting_on_user',
  IDLE: 'idle',
  DISCONNECTED: 'disconnected',
};

const DEFAULT_IDLE_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 2 * 1000;
const BLOCKING_CONFIRMATION_MS = 4 * 1000;
const CODEX_APP_PROCESS_PATTERN =
  /^\s*\d+\s+\/Applications\/(Codex|ChatGPT)\.app\/Contents\/MacOS\/(Codex|ChatGPT)( |$)/;

const args = parseArgs(process.argv.slice(2));

const codexDir = args.codexDir ?? join(homedir(), '.codex');
const logsDir =
  args.logsDir ?? join(homedir(), 'Library', 'Logs', 'com.openai.codex');
const idleMs = args.idleMs ?? DEFAULT_IDLE_MS;
const intervalMs = args.intervalMs ?? DEFAULT_INTERVAL_MS;

let lastPrintedSignature;
const stabilizeStatus = createBlockingStatusStabilizer(
  BLOCKING_CONFIRMATION_MS,
);

if (args.watch) {
  printStatus(true);
  setInterval(() => printStatus(false), intervalMs);
} else {
  printStatus(true);
}

function parseArgs(rawArgs) {
  const parsed = {
    watch: false,
    verbose: false,
    emitUnchanged: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === '--watch') {
      parsed.watch = true;
      continue;
    }

    if (arg === '--verbose') {
      parsed.verbose = true;
      continue;
    }

    if (arg === '--emit-unchanged') {
      parsed.emitUnchanged = true;
      continue;
    }

    if (arg === '--idle-ms') {
      parsed.idleMs = Number(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--interval-ms') {
      parsed.intervalMs = Number(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--codex-dir') {
      parsed.codexDir = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--logs-dir') {
      parsed.logsDir = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (parsed.idleMs !== undefined && !Number.isFinite(parsed.idleMs)) {
    throw new Error('--idle-ms must be a number');
  }

  if (parsed.intervalMs !== undefined && !Number.isFinite(parsed.intervalMs)) {
    throw new Error('--interval-ms must be a number');
  }

  return parsed;
}

function printHelpAndExit() {
  console.log(`Usage: node scripts/codex-status-probe.mjs [options]

Options:
  --watch                 Keep polling and print only status changes
  --emit-unchanged        With --watch, print every poll
  --verbose               Include source paths and diagnostic details
  --idle-ms <ms>          Idle threshold, default ${DEFAULT_IDLE_MS}
  --interval-ms <ms>      Watch polling interval, default ${DEFAULT_INTERVAL_MS}
  --codex-dir <path>      Override ~/.codex
  --logs-dir <path>       Override ~/Library/Logs/com.openai.codex
`);
  process.exit(0);
}

function printStatus(force) {
  const detectedSnapshot = detectStatus();
  const snapshot = args.watch
    ? stabilizeStatus(detectedSnapshot)
    : detectedSnapshot;
  const output = args.verbose ? snapshot : compactSnapshot(snapshot);
  const signature = args.verbose
    ? JSON.stringify(output)
    : compactSignature(output);

  if (!force && !args.emitUnchanged && signature === lastPrintedSignature) {
    return;
  }

  lastPrintedSignature = signature;
  console.log(JSON.stringify(output));
}

function compactSnapshot(snapshot) {
  const latestEvent = snapshot.latestSession?.lastEvent;

  return {
    observedAt: snapshot.observedAt,
    status: snapshot.status,
    reason: snapshot.reason,
    latestEventAt: snapshot.latestSession?.lastEventAt,
    latestEventType: latestEvent?.payloadType ?? latestEvent?.type,
    latestEventPhase: latestEvent?.payloadPhase,
    latestEventRole: latestEvent?.payloadRole,
    latestEventStatus: latestEvent?.payloadStatus,
    latestToolName: latestEvent?.payloadName,
    turnState: snapshot.latestSession?.turnState,
    sessionFile: snapshot.latestSession?.source
      ? basename(snapshot.latestSession.source)
      : undefined,
  };
}

function compactSignature(output) {
  return [
    output.status,
    output.reason,
    output.latestEventAt,
    output.latestEventType,
    output.latestEventPhase,
    output.latestEventRole,
    output.latestEventStatus,
    output.latestToolName,
    output.turnState,
    output.sessionFile,
  ].join('|');
}

function detectStatus() {
  const now = Date.now();
  const processInfo = getCodexProcessInfo();
  const sessions = getRecentSessionInfos(now);
  const latestSession = sessions.at(0);
  const activeSession = sessions.find(
    (session) => session.turnState === TURN_STATE.ACTIVE,
  );
  const aggregateTurnState = getAggregateTurnState(sessions);
  const latestLog = getLatestLogInfo();
  const latestActivityMs = Math.max(
    latestSession?.mtimeMs ?? 0,
    latestSession?.lastEventMs ?? 0,
    latestLog?.mtimeMs ?? 0,
  );
  const activityAgeMs =
    latestActivityMs > 0 ? Math.max(0, now - latestActivityMs) : undefined;

  const base = {
    observedAt: new Date(now).toISOString(),
    codexDir,
    logsDir,
    process: processInfo.summary,
    latestSession: latestSession?.summary,
    activeSession: activeSession?.summary,
    relevantSessionCount: sessions.length,
    latestLog: latestLog?.summary,
    idleMs,
  };

  if (!existsSync(codexDir)) {
    return {
      ...base,
      status: STATUS.DISCONNECTED,
      reason: 'codex_dir_missing',
    };
  }

  if (!processInfo.hasLiveProcess) {
    return {
      ...base,
      status: STATUS.DISCONNECTED,
      reason: 'no_active_codex_process',
    };
  }

  if (aggregateTurnState === TURN_STATE.ACTIVE) {
    return {
      ...base,
      status: STATUS.WORKING,
      reason:
        activeSession === latestSession
          ? 'task_in_progress'
          : 'another_task_in_progress',
    };
  }

  if (isWaitingOnUserEvent(latestSession?.lastEvent)) {
    return {
      ...base,
      status: STATUS.WAITING_ON_USER,
      reason: 'last_event_waiting_on_user',
    };
  }

  if (isRecentWorkingActivity(latestSession?.lastEvent, activityAgeMs)) {
    return {
      ...base,
      status: STATUS.WORKING,
      reason: 'recent_tool_or_response_activity',
    };
  }

  if (activityAgeMs !== undefined && activityAgeMs > idleMs) {
    return {
      ...base,
      status: STATUS.IDLE,
      reason: 'codex_open_no_recent_session_activity',
    };
  }

  return {
    ...base,
    status: STATUS.WORKING,
    reason: 'codex_process_present',
  };
}

function getCodexProcessInfo() {
  const filePath = join(codexDir, 'process_manager', 'chat_processes.json');
  const processes = readJson(filePath);
  const entries = Array.isArray(processes) ? processes : [];
  const trackedPids = [];
  const appProcesses = findCodexAppProcesses();

  for (const entry of entries) {
    const pid = readPid(entry);

    if (!pid) {
      continue;
    }

    trackedPids.push(pid);
  }

  return {
    hasLiveProcess: hasLiveCodexApp({ appProcesses }),
    summary: {
      source: filePath,
      trackedCount: entries.length,
      trackedPidCount: trackedPids.length,
      trackedPidsAreDiagnosticOnly: true,
      appProcessCount: appProcesses.length,
      appProcesses,
    },
  };
}

function readPid(entry) {
  for (const key of ['osPid', 'processId']) {
    const value = Number(entry?.[key]);

    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return undefined;
}

function findCodexAppProcesses() {
  try {
    const output = execFileSync('ps', ['-axo', 'pid=,args='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => CODEX_APP_PROCESS_PATTERN.test(line))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function getRecentSessionInfos(nowMs) {
  const sessionsDir = join(codexDir, 'sessions');
  const files = findLatestFiles(
    sessionsDir,
    (name) => name.endsWith('.jsonl'),
    nowMs - idleMs,
  );

  return files.map(({ path: filePath }) => getSessionInfo(filePath));
}

function getSessionInfo(filePath) {
  const fileStat = safeStat(filePath);
  const events = readSessionTail(filePath);
  const lastEvent = events.at(-1);
  const turnState = getTurnState(events);
  const lastEventMs = Date.parse(lastEvent?.timestamp ?? '');

  return {
    mtimeMs: fileStat?.mtimeMs,
    lastEventMs: Number.isFinite(lastEventMs) ? lastEventMs : undefined,
    lastEvent,
    turnState,
    summary: {
      source: filePath,
      modifiedAt: fileStat ? fileStat.mtime.toISOString() : undefined,
      lastEventAt:
        Number.isFinite(lastEventMs) && lastEventMs > 0
          ? new Date(lastEventMs).toISOString()
          : undefined,
      lastEvent: summarizeEvent(lastEvent),
      turnState,
    },
  };
}

function getLatestLogInfo() {
  const filePath = findLatestFiles(logsDir, (name) => name.endsWith('.log')).at(
    0,
  )?.path;

  if (!filePath) {
    return undefined;
  }

  const fileStat = safeStat(filePath);

  return {
    mtimeMs: fileStat?.mtimeMs,
    summary: {
      source: filePath,
      size: fileStat?.size,
      modifiedAt: fileStat ? fileStat.mtime.toISOString() : undefined,
    },
  };
}

function isRecentWorkingActivity(event, activityAgeMs) {
  if (activityAgeMs === undefined || activityAgeMs > idleMs) {
    return false;
  }

  const payload = event?.payload;
  const workingTypes = new Set([
    'reasoning',
    'function_call',
    'function_call_output',
    'custom_tool_call',
    'custom_tool_call_output',
    'web_search_call',
    'web_search_end',
    'patch_apply_end',
    'token_count',
    'agent_message',
    'message',
    'user_message',
  ]);

  if (event?.type === 'turn_context') {
    return true;
  }

  if (!workingTypes.has(payload?.type)) {
    return false;
  }

  if (payload?.type === 'message' && payload?.phase === 'final_answer') {
    return false;
  }

  return true;
}

function summarizeEvent(event) {
  if (!event) {
    return undefined;
  }

  return {
    timestamp: event.timestamp,
    type: event.type,
    payloadType: event.payload?.type,
    payloadPhase: event.payload?.phase,
    payloadRole: event.payload?.role,
    payloadStatus: event.payload?.status,
    payloadName: event.payload?.name,
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function readSessionTail(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').trimEnd().split('\n');
    const events = [];

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();

      if (!line) {
        continue;
      }

      try {
        events.unshift(JSON.parse(line));
      } catch {
        continue;
      }

      if (getTurnState(events) !== TURN_STATE.UNKNOWN) {
        break;
      }
    }

    return events;
  } catch {
    return [];
  }
}

function findLatestFiles(
  root,
  predicate,
  recentAfterMs = Number.POSITIVE_INFINITY,
) {
  const matches = [];
  let latest;

  visit(root);
  if (latest && !matches.some((match) => match.path === latest.path)) {
    matches.push(latest);
  }

  return matches.sort((left, right) => right.mtimeMs - left.mtimeMs);

  function visit(dir) {
    let entries;

    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !predicate(entry.name)) {
        continue;
      }

      const fileStat = safeStat(fullPath);

      if (!fileStat) {
        continue;
      }

      if (!latest || fileStat.mtimeMs > latest.mtimeMs) {
        latest = {
          path: fullPath,
          mtimeMs: fileStat.mtimeMs,
        };
      }

      if (fileStat.mtimeMs >= recentAfterMs) {
        matches.push({
          path: fullPath,
          mtimeMs: fileStat.mtimeMs,
        });
      }
    }
  }
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return undefined;
  }
}
