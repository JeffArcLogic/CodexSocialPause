import type { HostCodexStatus } from './codex-status';

type StatusListener = (status: HostCodexStatus) => void;

export interface CodexHostClient {
  connect(): void;
  disconnect(): void;
  onStatusChange(listener: StatusListener): () => void;
}

export class MockCodexHostClient implements CodexHostClient {
  private listeners = new Set<StatusListener>();
  private status: HostCodexStatus;
  private connected = false;

  constructor(initialStatus: HostCodexStatus = 'idle') {
    this.status = initialStatus;
  }

  connect() {
    this.connected = true;
    this.emit(this.status);
  }

  disconnect() {
    this.connected = false;
    this.setStatus('disconnected');
  }

  onStatusChange(listener: StatusListener) {
    this.listeners.add(listener);

    if (this.connected) {
      listener(this.status);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  setStatus(status: HostCodexStatus) {
    this.status = status;
    this.emit(status);
  }

  private emit(status: HostCodexStatus) {
    this.listeners.forEach((listener) => listener(status));
  }
}
