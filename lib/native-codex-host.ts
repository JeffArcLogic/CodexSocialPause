import type { HostCodexStatus } from './codex-status';
import type { CodexHostClient } from './mock-codex-host';

const NATIVE_HOST_NAME = 'com.codex_social_pause.status';
const HOST_STATUSES: HostCodexStatus[] = [
  'working',
  'waiting_on_user',
  'idle',
  'disconnected',
];

type StatusListener = (status: HostCodexStatus) => void;
type ConnectionListener = (connected: boolean) => void;
type ErrorListener = (message: string) => void;

export class NativeCodexHostClient implements CodexHostClient {
  private listeners = new Set<StatusListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private errorListeners = new Set<ErrorListener>();
  private port: Browser.runtime.Port | undefined;

  connect() {
    try {
      this.port = browser.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (error) {
      this.emitError(formatError(error));
      this.emitConnection(false);
      return;
    }

    this.port.onMessage.addListener((message) => {
      const status = readHostStatus(message);

      if (status) {
        this.emitConnection(true);
        this.emit(status);
      }
    });

    this.port.onDisconnect.addListener(() => {
      const lastError = browser.runtime.lastError;
      this.port = undefined;
      if (lastError?.message) {
        this.emitError(lastError.message);
      }
      this.emitConnection(false);
    });
  }

  disconnect() {
    this.port?.disconnect();
    this.port = undefined;
    this.emitConnection(false);
  }

  onStatusChange(listener: StatusListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  onConnectionChange(listener: ConnectionListener) {
    this.connectionListeners.add(listener);

    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private emit(status: HostCodexStatus) {
    this.listeners.forEach((listener) => listener(status));
  }

  private emitConnection(connected: boolean) {
    this.connectionListeners.forEach((listener) => listener(connected));
  }

  private emitError(message: string) {
    this.errorListeners.forEach((listener) => listener(message));
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function readHostStatus(message: unknown): HostCodexStatus | undefined {
  if (!message || typeof message !== 'object' || !('status' in message)) {
    return undefined;
  }

  const status = String(message.status);

  if (HOST_STATUSES.includes(status as HostCodexStatus)) {
    return status as HostCodexStatus;
  }

  return undefined;
}
