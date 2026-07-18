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

export function getDesktopLogTurnStates(logTexts) {
  const latestByConversation = new Map();

  for (const text of logTexts) {
    for (const line of text.split('\n')) {
      const signal = getDesktopLogTurnSignal(line);

      if (!signal) {
        continue;
      }

      const previous = latestByConversation.get(signal.conversationId);

      if (!previous || signal.timestampMs >= previous.timestampMs) {
        latestByConversation.set(signal.conversationId, signal);
      }
    }
  }

  return [...latestByConversation.values()].sort(
    (left, right) => right.timestampMs - left.timestampMs,
  );
}

function getDesktopLogTurnSignal(line) {
  let turnState;

  if (
    line.includes('Reasoning summary turn-start') ||
    line.includes('Reasoning summary part added') ||
    line.includes('Reasoning summary item completed') ||
    (line.includes('response_routed') && line.includes('method=turn/start'))
  ) {
    turnState = TURN_STATE.ACTIVE;
  } else if (
    line.includes('[electron-message-handler]') &&
    line.includes('[desktop-notifications] show turn-complete')
  ) {
    turnState = TURN_STATE.COMPLETE;
  } else {
    return undefined;
  }

  const timestamp = line.match(/^(\S+)/)?.[1];
  const conversationId =
    line.match(/\bconversationId=([0-9a-f-]{36})\b/)?.[1] ??
    line.match(/\bthreadId=([0-9a-f-]{36})\b/)?.[1];
  const timestampMs = Date.parse(timestamp ?? '');

  if (!conversationId || !Number.isFinite(timestampMs)) {
    return undefined;
  }

  return {
    conversationId,
    timestamp,
    timestampMs,
    turnState,
  };
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
