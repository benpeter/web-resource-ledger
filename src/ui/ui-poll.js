// tva
// Polling module for WRL captures view.
// startPolling(captureId, onUpdate) -- begin polling a capture until terminal state.
// stopAllPolling() -- cancel all active polls (call on navigation away).

export const POLL_JS = `
// ---------------------------------------------------------------------------
// Polling state
// ---------------------------------------------------------------------------

// Map of captureId -> { timerId, startedAt, retryCount, stopped }
var _polls = {};

var POLL_DEFAULT_MS  = 5000;
var POLL_MAX_MS      = 30000;
var POLL_TIMEOUT_MS  = 120000;

// ---------------------------------------------------------------------------
// startPolling(captureId, onUpdate)
// ---------------------------------------------------------------------------
// onUpdate is called with a status object on every terminal transition:
//   { status: 'complete', id, captureUrl }
//   { status: 'failed',   id, error, retryable }
//   { status: 'timeout',  id }
//   { status: 'poll_error', id, message }

function startPolling(captureId, onUpdate) {
  if (_polls[captureId]) return; // already polling

  var state = { timerId: null, startedAt: Date.now(), retryCount: 0, stopped: false };
  _polls[captureId] = state;

  function scheduleNext(delayMs) {
    if (state.stopped) return;
    state.timerId = setTimeout(tick, delayMs);
  }

  function stop() {
    state.stopped = true;
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    delete _polls[captureId];
  }

  function tick() {
    if (state.stopped) return;

    // Pause when tab hidden; resume on visible
    if (document.visibilityState === 'hidden') {
      var resumeOnVisible = function() {
        document.removeEventListener('visibilitychange', resumeOnVisible);
        if (!state.stopped) scheduleNext(POLL_DEFAULT_MS);
      };
      document.addEventListener('visibilitychange', resumeOnVisible);
      return;
    }

    // Timeout guard
    if (Date.now() - state.startedAt >= POLL_TIMEOUT_MS) {
      stop();
      onUpdate({ status: 'timeout', id: captureId });
      return;
    }

    apiFetch('/v1/captures/' + captureId + '/status').then(function(res) {
      if (state.stopped) return;

      if (!res.ok) {
        state.retryCount++;
        if (state.retryCount >= 3) {
          onUpdate({ status: 'poll_error', id: captureId, message: 'Status check failed after multiple attempts.' });
          stop();
        } else {
          scheduleNext(POLL_DEFAULT_MS);
        }
        return;
      }

      // Reset retry counter on success
      state.retryCount = 0;

      // Parse Retry-After for next interval
      var retryAfterRaw = res.headers.get('Retry-After');
      var nextMs = retryAfterRaw ? Math.min(parseInt(retryAfterRaw, 10) * 1000 || POLL_DEFAULT_MS, POLL_MAX_MS) : POLL_DEFAULT_MS;

      res.json().then(function(data) {
        if (state.stopped) return;

        if (data.status === 'complete') {
          stop();
          onUpdate({ status: 'complete', id: captureId, captureUrl: data.captureUrl || null });
        } else if (data.status === 'failed') {
          stop();
          onUpdate({ status: 'failed', id: captureId, error: data.error || null, retryable: data.retryable || false });
        } else {
          // still pending
          scheduleNext(nextMs);
        }
      }).catch(function() {
        if (state.stopped) return;
        state.retryCount++;
        if (state.retryCount >= 3) {
          onUpdate({ status: 'poll_error', id: captureId, message: 'Could not parse status response.' });
          stop();
        } else {
          scheduleNext(POLL_DEFAULT_MS);
        }
      });
    }).catch(function() {
      if (state.stopped) return;
      state.retryCount++;
      if (state.retryCount >= 3) {
        onUpdate({ status: 'poll_error', id: captureId, message: 'Network error while checking status.' });
        stop();
      } else {
        scheduleNext(POLL_DEFAULT_MS);
      }
    });
  }

  // Kick off immediately
  scheduleNext(0);
}

// ---------------------------------------------------------------------------
// stopAllPolling() -- called by router when navigating away
// ---------------------------------------------------------------------------

function stopAllPolling() {
  var ids = Object.keys(_polls);
  for (var i = 0; i < ids.length; i++) {
    var s = _polls[ids[i]];
    if (s) {
      s.stopped = true;
      if (s.timerId !== null) clearTimeout(s.timerId);
    }
  }
  _polls = {};
}
`;
