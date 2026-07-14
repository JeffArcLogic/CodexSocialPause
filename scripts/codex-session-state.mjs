export const TURN_STATE = {
  ACTIVE: 'active',
  COMPLETE: 'complete',
  UNKNOWN: 'unknown',
};

export function getTurnState(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payloadType = events[index]?.payload?.type;

    if (payloadType === 'task_started') {
      return TURN_STATE.ACTIVE;
    }

    if (payloadType === 'task_complete' || payloadType === 'turn_aborted') {
      return TURN_STATE.COMPLETE;
    }
  }

  return TURN_STATE.UNKNOWN;
}

export function isWaitingOnUserEvent(event) {
  const payloadType = event?.payload?.type;

  return payloadType === 'task_complete' || payloadType === 'turn_aborted';
}
