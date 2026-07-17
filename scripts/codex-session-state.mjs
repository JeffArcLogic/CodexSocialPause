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

export function getAggregateTurnState(sessions) {
  if (sessions.some((session) => session.turnState === TURN_STATE.ACTIVE)) {
    return TURN_STATE.ACTIVE;
  }

  if (sessions.some((session) => session.turnState === TURN_STATE.COMPLETE)) {
    return TURN_STATE.COMPLETE;
  }

  return TURN_STATE.UNKNOWN;
}

export function hasLiveCodexApp({ appProcesses }) {
  return appProcesses.length > 0;
}

export function createBlockingStatusStabilizer(confirmationMs) {
  let stableSnapshot;
  let candidateStatus;
  let candidateSinceMs;

  return (snapshot, nowMs = Date.now()) => {
    if (!stableSnapshot) {
      stableSnapshot = snapshot;
      return snapshot;
    }

    const isBlocking =
      snapshot.status === 'waiting_on_user' || snapshot.status === 'idle';
    const stableIsBlocking =
      stableSnapshot.status === 'waiting_on_user' ||
      stableSnapshot.status === 'idle';

    if (!isBlocking || stableIsBlocking) {
      candidateStatus = undefined;
      candidateSinceMs = undefined;
      stableSnapshot = snapshot;
      return snapshot;
    }

    if (candidateStatus !== snapshot.status) {
      candidateStatus = snapshot.status;
      candidateSinceMs = nowMs;
    }

    if (nowMs - candidateSinceMs >= confirmationMs) {
      candidateStatus = undefined;
      candidateSinceMs = undefined;
      stableSnapshot = snapshot;
      return snapshot;
    }

    return {
      ...snapshot,
      status: stableSnapshot.status,
      reason: `confirming_${snapshot.status}`,
      candidateStatus: snapshot.status,
    };
  };
}
