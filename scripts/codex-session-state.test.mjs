import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TURN_STATE,
  getTurnState,
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
