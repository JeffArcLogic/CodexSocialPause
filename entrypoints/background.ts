import {
  BLOCKER_STATE_STORAGE_KEY,
  type BackgroundStateMessage,
  type CodexBlockerState,
  type HostCodexStatus,
  type PopupMessage,
  createBlockerState,
} from '@/lib/codex-status';
import { MockCodexHostClient } from '@/lib/mock-codex-host';
import { NativeCodexHostClient } from '@/lib/native-codex-host';

const PAUSED_STORAGE_KEY = 'codexBlockerPaused';
const AUTO_RESUME_STORAGE_KEY = 'codexBlockerAutoResumeVideos';
const ALSO_PAUSE_SPOTIFY_STORAGE_KEY = 'codexBlockerAlsoPauseSpotify';

export default defineBackground(() => {
  const nativeHost = new NativeCodexHostClient();
  const mockHost = new MockCodexHostClient('idle');
  const contentPorts = new Set<Browser.runtime.Port>();
  const popupPorts = new Set<Browser.runtime.Port>();

  let state: CodexBlockerState = createBlockerState(
    'disconnected',
    false,
    true,
    false,
    'none',
    false,
    browser.runtime.id,
  );

  const publishState = () => {
    const message: BackgroundStateMessage = {
      type: 'codex-blocker:state-changed',
      state,
    };

    browser.storage.local.set({ [BLOCKER_STATE_STORAGE_KEY]: state });

    contentPorts.forEach((port) => {
      port.postMessage(message);
    });
    popupPorts.forEach((port) => {
      port.postMessage(message);
    });
  };

  const setState = (
    hostStatus: HostCodexStatus,
    paused = state.paused,
    autoResumeVideos = state.autoResumeVideos,
    alsoPauseSpotify = state.alsoPauseSpotify,
    statusSource = state.statusSource,
    nativeConnected = state.nativeConnected,
    nativeError = state.nativeError,
  ) => {
    state = createBlockerState(
      hostStatus,
      paused,
      autoResumeVideos,
      alsoPauseSpotify,
      statusSource,
      nativeConnected,
      browser.runtime.id,
      nativeError,
    );
    publishState();
  };

  browser.storage.local
    .get([
      PAUSED_STORAGE_KEY,
      AUTO_RESUME_STORAGE_KEY,
      ALSO_PAUSE_SPOTIFY_STORAGE_KEY,
    ])
    .then((stored) => {
      setState(
        state.hostStatus,
        stored[PAUSED_STORAGE_KEY] === true,
        stored[AUTO_RESUME_STORAGE_KEY] !== false,
        stored[ALSO_PAUSE_SPOTIFY_STORAGE_KEY] === true,
      );
    });

  nativeHost.onConnectionChange((connected) => {
    setState(
      connected ? state.hostStatus : 'disconnected',
      state.paused,
      state.autoResumeVideos,
      state.alsoPauseSpotify,
      connected ? 'native' : 'none',
      connected,
      connected ? undefined : state.nativeError,
    );
  });

  nativeHost.onStatusChange((status) => {
    setState(
      status,
      state.paused,
      state.autoResumeVideos,
      state.alsoPauseSpotify,
      'native',
      true,
      undefined,
    );
  });

  nativeHost.onError((message) => {
    setState(
      'disconnected',
      state.paused,
      state.autoResumeVideos,
      state.alsoPauseSpotify,
      'none',
      false,
      message,
    );
  });
  nativeHost.connect();

  mockHost.onStatusChange((status) => {
    if (!state.nativeConnected) {
      setState(
        status,
        state.paused,
        state.autoResumeVideos,
        state.alsoPauseSpotify,
        'mock',
        false,
      );
    }
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'codex-blocker:content') {
      contentPorts.add(port);
    }

    if (port.name === 'codex-blocker:popup') {
      popupPorts.add(port);
    }

    port.postMessage({
      type: 'codex-blocker:state-changed',
      state,
    } satisfies BackgroundStateMessage);

    port.onDisconnect.addListener(() => {
      contentPorts.delete(port);
      popupPorts.delete(port);
    });
  });

  browser.runtime.onMessage.addListener(
    (
      message: PopupMessage,
      _sender,
      sendResponse: (response: CodexBlockerState) => void,
    ) => {
      if (message.type === 'codex-blocker:get-state') {
        sendResponse(state);
        return false;
      }

      if (message.type === 'codex-blocker:set-paused') {
        browser.storage.local.set({ [PAUSED_STORAGE_KEY]: message.paused });
        setState(
          state.hostStatus,
          message.paused,
          state.autoResumeVideos,
          state.alsoPauseSpotify,
          state.statusSource,
          state.nativeConnected,
        );
        sendResponse(state);
        return false;
      }

      if (message.type === 'codex-blocker:set-auto-resume') {
        browser.storage.local.set({
          [AUTO_RESUME_STORAGE_KEY]: message.autoResumeVideos,
        });
        setState(
          state.hostStatus,
          state.paused,
          message.autoResumeVideos,
          state.alsoPauseSpotify,
          state.statusSource,
          state.nativeConnected,
        );
        sendResponse(state);
        return false;
      }

      if (message.type === 'codex-blocker:set-also-pause-spotify') {
        browser.storage.local.set({
          [ALSO_PAUSE_SPOTIFY_STORAGE_KEY]: message.alsoPauseSpotify,
        });
        setState(
          state.hostStatus,
          state.paused,
          state.autoResumeVideos,
          message.alsoPauseSpotify,
          state.statusSource,
          state.nativeConnected,
        );
        sendResponse(state);
        return false;
      }

      if (message.type === 'codex-blocker:set-mock-status') {
        if (state.nativeConnected) {
          sendResponse(state);
          return false;
        }

        mockHost.setStatus(message.status);
        sendResponse(state);
        return false;
      }

      return false;
    },
  );
});
