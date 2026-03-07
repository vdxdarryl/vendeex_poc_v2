'use strict';

/**
 * VXTicker — real SSE pipeline data in the original animated step-card UI.
 *
 * Visual behaviour: identical to original — robot icon, spinning circle, 5 step cards
 * each lighting up in sequence with the 1.2s timer, elapsed counter, green ticks.
 *
 * Data: SSE events from the server pipeline are buffered. As each step card activates
 * in the animation loop, its label is replaced with the next real pipeline message.
 * If more events arrive than step cards, extras are discarded. If fewer, remaining
 * cards keep their default text. Either way all 5 cards animate as expected.
 */

(function() {

  var _es          = null;
  var _key         = null;
  var _msgQueue    = [];   // real pipeline messages buffered from SSE
  var _timerID     = null;
  var _elapsedID   = null;
  var _startTime   = null;
  var _stepIndex   = 0;
  var _animActive  = false;

  var STEP_DURATION = 1200;
  var STEP_COUNT    = 5;

  var DEFAULT_TEXTS = [
    'Analyzing your requirements\u2026',
    'Searching across 500+ retailers\u2026',
    'Comparing prices and features\u2026',
    'Analyzing reviews and ratings\u2026',
    'Curating top recommendations\u2026'
  ];

  function getSteps() {
    return document.querySelectorAll('.progress-step');
  }

  function resetSteps() {
    getSteps().forEach(function(s, i) {
      s.classList.remove('active', 'completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.textContent = String(i + 1);
      var text = s.querySelector('.step-text');
      if (text) text.textContent = DEFAULT_TEXTS[i];
    });
  }

  function activateStep(idx) {
    var all = getSteps();

    // Complete previous step
    if (idx > 0 && all[idx - 1]) {
      all[idx - 1].classList.remove('active');
      all[idx - 1].classList.add('completed');
      var prevIcon = all[idx - 1].querySelector('.step-icon');
      if (prevIcon) prevIcon.innerHTML = '&#x2713;';
    }

    if (!all[idx]) return;

    all[idx].classList.add('active');

    // Replace label with next real pipeline message if one is queued
    if (_msgQueue.length > 0) {
      var msg = _msgQueue.shift();
      var text = all[idx].querySelector('.step-text');
      if (text) text.textContent = msg;
    }
  }

  function completeAllSteps() {
    getSteps().forEach(function(s) {
      s.classList.remove('active');
      s.classList.add('completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.innerHTML = '&#x2713;';
    });
  }

  function startAnimation() {
    if (_animActive) return;
    _animActive = true;
    _stepIndex  = 0;

    function tick() {
      if (_stepIndex < STEP_COUNT) {
        activateStep(_stepIndex);
        _stepIndex++;
        _timerID = setTimeout(tick, STEP_DURATION);
      }
      // Last step stays active until search completes (handled in done/finishAnimation)
    }
    tick();
  }

  function finishAnimation() {
    // Called when search is done — complete all remaining steps immediately
    if (_timerID) { clearTimeout(_timerID); _timerID = null; }
    completeAllSteps();
    stopElapsed();
    _animActive = false;
  }

  function startElapsed() {
    _startTime = Date.now();
    var ind = document.getElementById('stillSearchingIndicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.className = 'still-searching-indicator';
      ind.id = 'stillSearchingIndicator';
      ind.innerHTML = '<span class="still-searching__dot-pulse"></span>'
        + '<span class="still-searching__text">Searching across providers</span>'
        + '<span class="still-searching__elapsed" id="searchElapsed"></span>';
      var stepsEl = document.querySelector('.progress-steps');
      if (stepsEl) stepsEl.parentNode.insertBefore(ind, stepsEl.nextSibling);
    }
    ind.style.display = '';
    _elapsedID = setInterval(function() {
      var el = document.getElementById('searchElapsed');
      if (el) el.textContent = Math.round((Date.now() - _startTime) / 1000) + 's';
    }, 1000);
  }

  function stopElapsed() {
    if (_elapsedID) { clearInterval(_elapsedID); _elapsedID = null; }
    var ind = document.getElementById('stillSearchingIndicator');
    if (ind) ind.style.display = 'none';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Open the SSE stream and start buffering real pipeline messages.
   * Animation starts when showSearchProgress() calls VXTicker.startAnim().
   */
  function open(key) {
    close();
    _key      = key;
    _msgQueue = [];

    var url = '/api/search/progress/' + encodeURIComponent(key);
    _es = new EventSource(url);

    _es.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.stage === 'progress' && data.msg) {
          _msgQueue.push(data.msg);
        } else if (data.stage === 'done') {
          finishAnimation();
          _closeSSE();
        }
      } catch (e) {}
    };

    _es.onerror = function() {
      finishAnimation();
      _closeSSE();
    };
  }

  /**
   * Called from showSearchProgress() — starts the step-card animation loop
   * and elapsed timer. SSE messages already buffered will slot into steps.
   */
  function startAnim() {
    resetSteps();
    startElapsed();
    startAnimation();
  }

  function _closeSSE() {
    if (_es) { try { _es.close(); } catch (_) {} _es = null; }
  }

  function close() {
    _closeSSE();
    if (_timerID)   { clearTimeout(_timerID);   _timerID   = null; }
    stopElapsed();
    _animActive = false;
    _msgQueue   = [];
  }

  window.VXTicker = { open: open, startAnim: startAnim, close: close };

})();
