'use strict';

/**
 * VXTicker — real SSE pipeline messages in the original animated step-card UI.
 *
 * Animation: identical original — 5 step cards activating on a 1.2s timer,
 * pulsing icon, green tick on complete, elapsed counter.
 *
 * Data strategy: no queue, no drain. When an SSE message arrives it immediately
 * updates the text of whichever step is currently active (or the last activated
 * one). Because the pipeline fires 6-8 events and we have 5 cards, the last
 * active card accumulates the final messages — always showing real data.
 */

(function() {

  var _es         = null;
  var _key        = null;
  var _stepIndex  = 0;     // index of currently active step (0-4)
  var _timerID    = null;
  var _elapsedID  = null;
  var _startTime  = null;
  var _animActive = false;

  var STEP_DURATION = 1200;
  var STEP_COUNT    = 5;

  function getSteps() {
    return document.querySelectorAll('.progress-step');
  }

  // Update the text of whichever step is currently active
  function updateActiveText(msg) {
    var all = getSteps();
    var idx = Math.min(_stepIndex, STEP_COUNT - 1);
    if (!all[idx]) return;
    var text = all[idx].querySelector('.step-text');
    if (text) text.textContent = msg;
  }

  function activateStep(idx) {
    var all = getSteps();

    // Complete the previous step
    if (idx > 0 && all[idx - 1]) {
      all[idx - 1].classList.remove('active');
      all[idx - 1].classList.add('completed');
      var prevIcon = all[idx - 1].querySelector('.step-icon');
      if (prevIcon) prevIcon.innerHTML = '&#x2713;';
    }

    if (!all[idx]) return;
    all[idx].classList.add('active');
  }

  function completeAllSteps() {
    getSteps().forEach(function(s) {
      s.classList.remove('active');
      s.classList.add('completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.innerHTML = '&#x2713;';
    });
  }

  function resetSteps() {
    // Reset visual state only — leave text blank so real messages fill it
    getSteps().forEach(function(s, i) {
      s.classList.remove('active', 'completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.textContent = String(i + 1);
      var text = s.querySelector('.step-text');
      if (text) text.textContent = '\u2026';  // placeholder ellipsis until real message arrives
    });
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

  function finishAnimation() {
    if (_timerID) { clearTimeout(_timerID); _timerID = null; }
    completeAllSteps();
    stopElapsed();
    _animActive = false;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function open(key) {
    close();
    _key = key;

    var url = '/api/search/progress/' + encodeURIComponent(key);
    _es = new EventSource(url);

    _es.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.stage === 'progress' && data.msg) {
          // Immediately write real message into whichever step card is active now
          updateActiveText(data.msg);
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

  // Called from showSearchProgress() when the panel becomes visible
  function startAnim() {
    resetSteps();
    startElapsed();
    _stepIndex  = 0;
    _animActive = true;

    function tick() {
      if (_stepIndex < STEP_COUNT) {
        activateStep(_stepIndex);
        _stepIndex++;
        _timerID = setTimeout(tick, STEP_DURATION);
      }
    }
    tick();
  }

  function _closeSSE() {
    if (_es) { try { _es.close(); } catch (_) {} _es = null; }
  }

  function close() {
    _closeSSE();
    if (_timerID) { clearTimeout(_timerID); _timerID = null; }
    stopElapsed();
    _animActive = false;
  }

  window.VXTicker = { open: open, startAnim: startAnim, close: close };

})();
