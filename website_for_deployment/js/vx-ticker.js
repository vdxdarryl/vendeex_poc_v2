'use strict';

/**
 * VXTicker — SSE client driving the original step-card progress UI with real pipeline data.
 *
 * Visual appearance: unchanged original (robot, progress circle, 5 step cards, elapsed timer).
 * Data: real server events from the pipeline replace the fake static step text.
 *
 * Each SSE event advances one step card — updating its label to the real pipeline message
 * and marking it complete. Steps that fire faster than the card count are absorbed by the
 * last card. Steps beyond 5 are silently dropped (won't happen in practice).
 */

(function() {

  var _es          = null;
  var _key         = null;
  var _stepIndex   = 0;    // which step card to activate next (0-4)
  var _timerID     = null;
  var _startTime   = null;

  var STEP_COUNT = 5;

  function steps() {
    return document.querySelectorAll('.progress-step');
  }

  function markComplete(idx) {
    var all = steps();
    if (!all[idx]) return;
    all[idx].classList.remove('active');
    all[idx].classList.add('completed');
    var icon = all[idx].querySelector('.step-icon');
    if (icon) icon.innerHTML = '&#x2713;';
  }

  function activateStep(idx, msg) {
    var all = steps();
    if (!all[idx]) return;

    // Mark previous step complete
    if (idx > 0) markComplete(idx - 1);

    all[idx].classList.add('active');

    // Update step text with real pipeline message
    var textEl = all[idx].querySelector('.step-text');
    if (textEl && msg) textEl.textContent = msg;
  }

  function startElapsedTimer() {
    _startTime = Date.now();
    var el = document.getElementById('searchElapsed');
    if (!el) {
      // Create the "Searching across providers" bar if it doesn't exist yet
      el = document.createElement('div');
      el.className = 'still-searching-indicator';
      el.id = 'stillSearchingIndicator';
      el.innerHTML = '<span class="still-searching__dot-pulse"></span>'
        + '<span class="still-searching__text">Searching across providers</span>'
        + '<span class="still-searching__elapsed" id="searchElapsed"></span>';
      var stepsEl = document.querySelector('.progress-steps');
      if (stepsEl) stepsEl.parentNode.insertBefore(el, stepsEl.nextSibling);
    }
    el.style.display = '';
    _timerID = setInterval(function() {
      var elapsedEl = document.getElementById('searchElapsed');
      if (elapsedEl) elapsedEl.textContent = Math.round((Date.now() - _startTime) / 1000) + 's';
    }, 1000);
  }

  function stopElapsedTimer() {
    if (_timerID) { clearInterval(_timerID); _timerID = null; }
    var ind = document.getElementById('stillSearchingIndicator');
    if (ind) ind.style.display = 'none';
  }

  function resetSteps() {
    steps().forEach(function(s) {
      s.classList.remove('active', 'completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.textContent = icon.closest('[data-step]').getAttribute('data-step');
    });
    // Restore original default text
    var defaults = [
      'Analyzing your requirements\u2026',
      'Searching across 500+ retailers\u2026',
      'Comparing prices and features\u2026',
      'Analyzing reviews and ratings\u2026',
      'Curating top recommendations\u2026'
    ];
    steps().forEach(function(s, i) {
      var t = s.querySelector('.step-text');
      if (t) t.textContent = defaults[i];
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function open(key) {
    close();
    _key = key;
    _stepIndex = 0;

    resetSteps();
    startElapsedTimer();

    var url = '/api/search/progress/' + encodeURIComponent(key);
    _es = new EventSource(url);

    _es.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);

        if (data.stage === 'connected') {
          // Activate step 0 with default text — real messages will follow
          activateStep(0, null);

        } else if (data.stage === 'progress' && data.msg) {
          var idx = Math.min(_stepIndex, STEP_COUNT - 1);
          activateStep(idx, data.msg);
          _stepIndex++;

        } else if (data.stage === 'done') {
          // Complete all remaining steps
          for (var i = _stepIndex - 1; i < STEP_COUNT; i++) {
            markComplete(i);
          }
          stopElapsedTimer();
          _close();
        }
      } catch (e) { /* ignore malformed events */ }
    };

    _es.onerror = function() {
      stopElapsedTimer();
      _close();
    };
  }

  function _close() {
    if (_es) {
      try { _es.close(); } catch (_) {}
      _es = null;
    }
  }

  function close() {
    stopElapsedTimer();
    _close();
  }

  window.VXTicker = { open: open, close: close };

})();
