export const CODEX_STATUSES = [
  'working',
  'waiting_on_user',
  'idle',
  'disconnected',
  'paused',
] as const;

export const BLOCKER_STATE_STORAGE_KEY = 'codexBlockerState';
export const EXPECTED_EXTENSION_ID = 'jfgddmjfbnebpdodhcjoihoknnlefifm';

export type CodexStatus = (typeof CODEX_STATUSES)[number];
export type HostCodexStatus = Exclude<CodexStatus, 'paused'>;

export interface CodexBlockerState {
  hostStatus: HostCodexStatus;
  status: CodexStatus;
  paused: boolean;
  autoResumeVideos: boolean;
  alsoPauseSpotify: boolean;
  statusSource: 'native' | 'mock' | 'none';
  nativeConnected: boolean;
  extensionId: string;
  expectedExtensionId: string;
  nativeError?: string;
  shouldBlockSocial: boolean;
  updatedAt: number;
}

export type PopupMessage =
  | { type: 'codex-blocker:get-state' }
  | { type: 'codex-blocker:set-paused'; paused: boolean }
  | { type: 'codex-blocker:set-auto-resume'; autoResumeVideos: boolean }
  | { type: 'codex-blocker:set-also-pause-spotify'; alsoPauseSpotify: boolean }
  | { type: 'codex-blocker:set-mock-status'; status: HostCodexStatus };

export type BackgroundStateMessage = {
  type: 'codex-blocker:state-changed';
  state: CodexBlockerState;
};

export function shouldBlockForStatus(status: CodexStatus): boolean {
  return status === 'waiting_on_user' || status === 'idle';
}

export function getEffectiveStatus(
  hostStatus: HostCodexStatus,
  paused: boolean,
): CodexStatus {
  return paused ? 'paused' : hostStatus;
}

export function createBlockerState(
  hostStatus: HostCodexStatus,
  paused: boolean,
  autoResumeVideos: boolean,
  alsoPauseSpotify: boolean,
  statusSource: CodexBlockerState['statusSource'] = 'none',
  nativeConnected = false,
  extensionId = '',
  nativeError?: string,
): CodexBlockerState {
  const status = getEffectiveStatus(hostStatus, paused);

  return {
    hostStatus,
    status,
    paused,
    autoResumeVideos,
    alsoPauseSpotify,
    statusSource,
    nativeConnected,
    extensionId,
    expectedExtensionId: EXPECTED_EXTENSION_ID,
    nativeError,
    shouldBlockSocial: shouldBlockForStatus(status),
    updatedAt: Date.now(),
  };
}
