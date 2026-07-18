import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TURN_STATE,
  createBlockingStatusStabilizer,
  getAggregateTurnState,
  getDesktopLogTurnStates,
  getTurnState,
  hasLiveCodexApp,
  isWaitingOnUserEvent,
} from './codex-session-state.mjs';

const event = (type, extra = {}) => ({
  type: 'event_msg',
  payload: { type, ...extra },
});

test('keeps a turn active throughout tool calls', () => {
  const events = [
    event('task_started'),
    event('agent_message', { phase: 'commentary' }),
    event('custom_tool_call', { status: 'completed' }),
  ];

  assert.equal(getTurnState(events), TURN_STATE.ACTIVE);
  assert.equal(isWaitingOnUserEvent(events.at(-1)), false);
});

test('does not treat a final answer as complete before task_complete', () => {
  const finalAnswer = event('agent_message', { phase: 'final_answer' });

  assert.equal(
    getTurnState([event('task_started'), finalAnswer]),
    TURN_STATE.ACTIVE,
  );
  assert.equal(isWaitingOnUserEvent(finalAnswer), false);
});

test('waits only once the active task completes or aborts', () => {
  const completed = event('task_complete');
  const aborted = event('turn_aborted');

  assert.equal(
    getTurnState([event('task_started'), completed]),
    TURN_STATE.COMPLETE,
  );
  assert.equal(isWaitingOnUserEvent(completed), true);
  assert.equal(isWaitingOnUserEvent(aborted), true);
});

test('a newly started task supersedes the prior completion', () => {
  assert.equal(
    getTurnState([
      event('task_started'),
      event('task_complete'),
      event('task_started'),
    ]),
    TURN_STATE.ACTIVE,
  );
});

test('an active session wins over a newer completed session', () => {
  assert.equal(
    getAggregateTurnState([
      { turnState: TURN_STATE.COMPLETE },
      { turnState: TURN_STATE.ACTIVE },
    ]),
    TURN_STATE.ACTIVE,
  );
});

test('tracks remote desktop turns from structural log lifecycle signals', () => {
  const conversationId = '019f7392-475f-7d93-b0d6-c42e453fbe8b';
  const states = getDesktopLogTurnStates([
    `2026-07-18T23:36:40.012Z info response_routed conversationId=${conversationId} method=turn/start`,
    `2026-07-18T23:39:22.238Z info Reasoning summary item completed threadId=${conversationId} summary=[redacted]`,
  ]);

  assert.equal(states.length, 1);
  assert.equal(states[0].conversationId, conversationId);
  assert.equal(states[0].turnState, TURN_STATE.ACTIVE);
  assert.equal(states[0].timestamp, '2026-07-18T23:39:22.238Z');
});

test('remote turn completion supersedes its prior desktop activity', () => {
  const conversationId = '019f7392-475f-7d93-b0d6-c42e453fbe8b';
  const states = getDesktopLogTurnStates([
    `2026-07-18T23:39:22.238Z info Reasoning summary item completed threadId=${conversationId}`,
    `2026-07-18T23:41:26.448Z info [electron-message-handler] [desktop-notifications] show turn-complete conversationId=${conversationId}`,
  ]);

  assert.equal(states.length, 1);
  assert.equal(states[0].turnState, TURN_STATE.COMPLETE);
});

test('ignores desktop log bodies without a lifecycle signal', () => {
  assert.deepEqual(
    getDesktopLogTurnStates([
      '2026-07-18T23:39:22.238Z info arbitrary prompt and response text',
    ]),
    [],
  );
});

test('expires desktop activity that has not been refreshed', () => {
  const conversationId = '019f7392-475f-7d93-b0d6-c42e453fbe8b';
  const states = getDesktopLogTurnStates(
    [
      `2026-07-18T23:39:22.238Z info Reasoning summary item completed threadId=${conversationId}`,
    ],
    Date.parse('2026-07-18T23:40:00.000Z'),
  );

  assert.deepEqual(states, []);
});

test('historical tracked PIDs do not count as a live Codex app', () => {
  assert.equal(
    hasLiveCodexApp({ appProcesses: [], liveTrackedPids: [4904] }),
    false,
  );
  assert.equal(
    hasLiveCodexApp({
      appProcesses: [
        '62473 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
      ],
      liveTrackedPids: [],
    }),
    true,
  );
});

test('confirms a blocking transition for the configured duration', () => {
  const stabilize = createBlockingStatusStabilizer(4_000);
  const working = { status: 'working', reason: 'task_in_progress' };
  const waiting = { status: 'waiting_on_user', reason: 'task_complete' };

  assert.equal(stabilize(working, 1_000).status, 'working');

  const firstCandidate = stabilize(waiting, 2_000);
  assert.equal(firstCandidate.status, 'working');
  assert.equal(firstCandidate.candidateStatus, 'waiting_on_user');

  assert.equal(stabilize(waiting, 5_999).status, 'working');
  assert.equal(stabilize(waiting, 6_000).status, 'waiting_on_user');
});

test('cancels a pending block as soon as work resumes', () => {
  const stabilize = createBlockingStatusStabilizer(4_000);

  stabilize({ status: 'working', reason: 'active' }, 1_000);
  stabilize({ status: 'waiting_on_user', reason: 'complete' }, 2_000);

  assert.equal(
    stabilize({ status: 'working', reason: 'active' }, 3_000).status,
    'working',
  );
  assert.equal(
    stabilize({ status: 'waiting_on_user', reason: 'complete' }, 6_500)
      .status,
    'working',
  );
});
