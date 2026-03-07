'use strict';

/**
 * VXTicker — real SSE pipeline messages in the original animated step-card UI.
 *
 * Key timing facts:
 *   - open() is called during handleSearch(), BEFORE qualifying chat runs
 *   - SSE pipeline messages fire during qualifying chat
 *   - startAnim() is called AFTER qualifying, when the progress panel shows
 *
 * Strategy:
 *   - open(): reset visual state (classes + icons only, NOT text), open SSE, buffer messages
 *   - SSE messages arrive → buffered in _msgQueue
 *   - startAnim(): start timer; do NOT reset anything
 *   - activateStep(idx): drain next buffered message onto the step text
 *   - Messages collected during qualifying are waiting in the buffer when steps activate
 */

(function() {

  var _es         = null;
  var _key        = null;
  var _msgQueue   = [];
  var _timerID    = null;
  var _elapsedID  = null;
  var _startTime  = null;
  var _stepIndex  = 0;

  var STEP_DURATION = 1200;
  var STEP_COUNT    = 5;

  function getSteps() {
    return document.querySelectorAll('.progress-step');
  }

  // Reset only visual state — classes and icons. Never touch text here.
  function resetVisual() {
    getSteps().forEach(function(s, i) {
      s.classList.remove('active', 'completed');
      var icon = s.querySelector('.step-icon');
      if (icon) icon.textContent = String(i + 1);
    });
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

    // Apply next buffered real message to this step's text
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
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function open(key) {
    close();
    _key       = key;
    _msgQueue  = [];
    _stepIndex = 0;

    // Reset visual state NOW, before SSE messages arrive
    resetVisual();

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

  // Called from showSearchProgress() when panel becomes visible.
  // Messages already buffered from qualifying phase drain into steps as they activate.
  function startAnim() {
    _stepIndex = 0;
    startElapsed();

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
    _msgQueue  = [];
    _stepIndex = 0;
  }

  window.VXTicker = { open: open, startAnim: startAnim, close: close };

})();
