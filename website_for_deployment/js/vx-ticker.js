'use strict';

/**
 * VXTicker — client-side SSE subscriber for the VendeeX pipeline ticker.
 *
 * Opens a GET /api/search/progress/:key stream before any search request fires.
 * Each server event appends a real pipeline stage line to the ticker panel.
 * On 'done', collapses to a slim summary bar pinned above the results section.
 *
 * No simulated timers. Every line shown corresponds to a pipeline step that
 * actually completed on the server at that moment.
 */

(function() {

  var _es        = null;   // EventSource
  var _key       = null;   // current searchKey
  var _lineCount = 0;
  var _summary   = null;   // summary message built from last line

  // ─── DOM helpers ────────────────────────────────────────────────────────────

  function panel()   { return document.getElementById('vxTickerPanel'); }
  function linesEl() { return document.getElementById('vxTickerLines'); }

  function appendLine(msg, isActive) {
    var el = linesEl();
    if (!el) return;

    // Mark previous active line as done
    var prev = el.querySelector('.vx-ticker__line--active');
    if (prev) prev.classList.replace('vx-ticker__line--active', 'vx-ticker__line--done');

    var line = document.createElement('div');
    line.className = 'vx-ticker__line' + (isActive !== false ? ' vx-ticker__line--active' : '');
    line.textContent = msg;
    el.appendChild(line);
    _lineCount++;
    _summary = msg;

    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Open SSE stream for a new search.
   * Must be called before any qualify or search fetch is fired.
   */
  function open(key) {
    close(); // terminate any previous stream
    _key = key;
    _lineCount = 0;
    _summary = null;

    // Show the ticker panel, hide results
    var p = panel();
    if (p) {
      p.classList.remove('vx-ticker--summary');
      var linesDiv = linesEl();
      if (linesDiv) linesDiv.innerHTML = '';
      var cursor = document.getElementById('vxTickerCursor');
      if (cursor) cursor.style.display = '';
      var progressEl = document.getElementById('searchProgress');
      if (progressEl) progressEl.style.display = '';
    }

    var url = '/api/search/progress/' + encodeURIComponent(key);
    _es = new EventSource(url);

    _es.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.stage === 'connected') {
          appendLine('VendeeX agent pipeline initialised\u2026');
        } else if (data.stage === 'progress' && data.msg) {
          appendLine(data.msg);
        } else if (data.stage === 'done') {
          _collapse();
        }
      } catch (e) {
        // Malformed event — ignore
      }
    };

    _es.onerror = function() {
      // Connection closed by server after 'done', or network error.
      // Either way, collapse gracefully.
      _collapse();
    };
  }

  /**
   * Collapse the full ticker into the slim summary bar.
   * Called when the server sends stage:'done' or on error.
   */
  function _collapse() {
    close();
    var p = panel();
    if (!p) return;

    // Hide the lines and cursor, just show the header as a slim bar
    var linesDiv = linesEl();
    if (linesDiv) linesDiv.style.display = 'none';
    var cursor = document.getElementById('vxTickerCursor');
    if (cursor) cursor.style.display = 'none';

    p.classList.add('vx-ticker--summary');

    var titleEl = p.querySelector('.vx-ticker__title');
    if (titleEl) titleEl.textContent = '\u2713 Pipeline complete \u2014 ' + _lineCount + ' stage' + (_lineCount !== 1 ? 's' : '') + ' executed';
  }

  /**
   * Close and discard the current EventSource without collapsing the UI.
   * Used when opening a new stream for a subsequent search.
   */
  function close() {
    if (_es) {
      try { _es.close(); } catch (_) {}
      _es = null;
    }
  }

  window.VXTicker = { open: open, close: close };

})();
