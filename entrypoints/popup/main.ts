import './style.css';
import {
  type BackgroundStateMessage,
  type CodexBlockerState,
  type HostCodexStatus,
} from '@/lib/codex-status';

const mockStatuses: HostCodexStatus[] = [
  'working',
  'waiting_on_user',
  'idle',
  'disconnected',
];

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="popup">
    <header class="header">
      <h1>Codex Social Pause</h1>
    </header>

    <section class="status-grid" aria-label="Current blocker state">
      <div class="status-row">
        <span>Status</span>
        <strong id="status-value">...</strong>
      </div>
      <div class="status-row">
        <span>Blocking</span>
        <strong id="blocking-value">...</strong>
      </div>
      <div class="status-row">
        <span>Source</span>
        <strong id="source-value">...</strong>
      </div>
      <div class="status-row" id="extension-id-row" hidden>
        <span>Extension ID</span>
        <strong id="extension-id-value">...</strong>
      </div>
      <div class="status-row" id="native-error-row" hidden>
        <span>Native error</span>
        <strong id="native-error-value">...</strong>
      </div>
    </section>

    <button id="pause-toggle" class="toggle" type="button">Pause</button>

    <label class="checkbox-field">
      <input id="auto-resume" type="checkbox" />
      <span>Resume videos when unblocked</span>
    </label>

    <label class="checkbox-field">
      <input id="also-pause-spotify" type="checkbox" />
      <span>Also pause Spotify</span>
    </label>

    <label class="field" id="mock-status-field" for="mock-status">
      <span>Mock Codex status</span>
      <select id="mock-status">
        ${mockStatuses
          .map((status) => `<option value="${status}">${status}</option>`)
          .join('')}
      </select>
    </label>
  </main>
`;

const statusValue = document.querySelector<HTMLElement>('#status-value')!;
const blockingValue = document.querySelector<HTMLElement>('#blocking-value')!;
const sourceValue = document.querySelector<HTMLElement>('#source-value')!;
const extensionIdRow = document.querySelector<HTMLElement>('#extension-id-row')!;
const extensionIdValue =
  document.querySelector<HTMLElement>('#extension-id-value')!;
const nativeErrorRow = document.querySelector<HTMLElement>('#native-error-row')!;
const nativeErrorValue =
  document.querySelector<HTMLElement>('#native-error-value')!;
const mockStatusField =
  document.querySelector<HTMLElement>('#mock-status-field')!;
const pauseToggle = document.querySelector<HTMLButtonElement>('#pause-toggle')!;
const autoResumeCheckbox =
  document.querySelector<HTMLInputElement>('#auto-resume')!;
const alsoPauseSpotifyCheckbox = document.querySelector<HTMLInputElement>(
  '#also-pause-spotify',
)!;
const mockStatusSelect =
  document.querySelector<HTMLSelectElement>('#mock-status')!;

let currentState: CodexBlockerState | undefined;

const formatStatus = (status: string) => status.replaceAll('_', ' ');

function render(state: CodexBlockerState) {
  currentState = state;
  statusValue.textContent = formatStatus(state.status);
  blockingValue.textContent = state.shouldBlockSocial ? 'Active' : 'Inactive';
  blockingValue.className = state.shouldBlockSocial ? 'active' : 'inactive';
  sourceValue.textContent = state.nativeConnected ? 'Native host' : 'Mock';
  extensionIdRow.hidden = state.nativeConnected;
  extensionIdValue.textContent = state.extensionId;
  extensionIdValue.className =
    state.extensionId === state.expectedExtensionId ? 'inactive' : 'active';
  const nativeError = state.nativeError?.trim() ?? '';
  nativeErrorRow.hidden = nativeError.length === 0;
  nativeErrorValue.textContent = nativeError;
  pauseToggle.textContent = state.paused ? 'Resume' : 'Pause';
  pauseToggle.setAttribute('aria-pressed', String(state.paused));
  autoResumeCheckbox.checked = state.autoResumeVideos;
  alsoPauseSpotifyCheckbox.checked = state.alsoPauseSpotify;
  mockStatusSelect.value = state.hostStatus;
  mockStatusField.hidden = state.nativeConnected;
  mockStatusSelect.disabled = state.nativeConnected;
  mockStatusSelect.title = state.nativeConnected
    ? 'Native host is connected; mock status is disabled.'
    : 'Native host is unavailable; mock status is active.';
}

async function sendMessage<T>(message: unknown): Promise<T> {
  return browser.runtime.sendMessage(message);
}

pauseToggle.addEventListener('click', async () => {
  const nextPaused = !currentState?.paused;
  const state = await sendMessage<CodexBlockerState>({
    type: 'codex-blocker:set-paused',
    paused: nextPaused,
  });
  render(state);
});

autoResumeCheckbox.addEventListener('change', async () => {
  const state = await sendMessage<CodexBlockerState>({
    type: 'codex-blocker:set-auto-resume',
    autoResumeVideos: autoResumeCheckbox.checked,
  });
  render(state);
});

alsoPauseSpotifyCheckbox.addEventListener('change', async () => {
  const state = await sendMessage<CodexBlockerState>({
    type: 'codex-blocker:set-also-pause-spotify',
    alsoPauseSpotify: alsoPauseSpotifyCheckbox.checked,
  });
  render(state);
});

mockStatusSelect.addEventListener('change', async () => {
  const state = await sendMessage<CodexBlockerState>({
    type: 'codex-blocker:set-mock-status',
    status: mockStatusSelect.value as HostCodexStatus,
  });
  render(state);
});

const port = browser.runtime.connect({ name: 'codex-blocker:popup' });
port.onMessage.addListener((message: BackgroundStateMessage) => {
  if (message.type === 'codex-blocker:state-changed') {
    render(message.state);
  }
});

sendMessage<CodexBlockerState>({ type: 'codex-blocker:get-state' }).then(
  render,
);
