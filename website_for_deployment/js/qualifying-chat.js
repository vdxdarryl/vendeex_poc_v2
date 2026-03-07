/**
 * VendeeX Pre-Search Qualifying Chat
 * Agent asks qualifying questions before executing a product search
 */

const QualifyingChat = (function() {
    let conversationHistory = [];
    let originalQuery = '';
    let isWaiting = false;
    let onSearchReady = null; // callback when qualifying is done

    function init() {
        const sendBtn = document.getElementById('qualifySend');
        const input = document.getElementById('qualifyInput');
        const skipBtn = document.getElementById('qualifySkip');

        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        if (skipBtn) {
            skipBtn.addEventListener('click', skipQualifying);
        }
    }

    /**
     * Start the qualifying conversation
     * @param {string} query - The buyer's initial search query
     * @param {Function} callback - Called with refined query when ready to search
     */
    async function start(query, callback) {
        originalQuery = query;
        onSearchReady = callback;
        conversationHistory = [];

        // Show the chat panel
        const panel = document.getElementById('qualifyingChat');
        const messagesDiv = document.getElementById('qualifyMessages');
        if (!panel || !messagesDiv) {
            // No qualifying UI, skip straight to search
            if (callback) callback(query);
            return;
        }

        panel.style.display = 'block';
        messagesDiv.innerHTML = '';

        // Get avatar data if available (sessionStorage first, server fallback)
        let avatarData = null;
        try {
            const stored = sessionStorage.getItem('vendeeAvatar');
            if (stored) avatarData = JSON.parse(stored);
        } catch (e) { /* ignore */ }
        if (!avatarData) {
            const token = localStorage.getItem('vendeeX_sessionToken');
            if (token) {
                try {
                    const resp = await fetch('/api/user/avatar', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        avatarData = data.avatar;
                        sessionStorage.setItem('vendeeAvatar', JSON.stringify(avatarData));
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // Enrich avatarData with full 7-category preferences (new key first, old fallback)
        const enrichedData = Object.assign({}, avatarData || {});
        if (typeof PreferenceReader !== 'undefined') {
            var allPrefs = PreferenceReader.getAll();
            if (allPrefs) enrichedData.avatarPreferences = allPrefs;
            enrichedData.valueRanking = PreferenceReader.getValueRanking();
            enrichedData.prefFreeReturns = PreferenceReader.getFreeReturnsPreferred();
            enrichedData.prefDeliverySpeed = PreferenceReader.getDeliverySpeed();
            enrichedData.prefSustainability = PreferenceReader.getSustainabilityPreferred();
            enrichedData.prefSustainabilityWeight = PreferenceReader.getSustainabilityWeight();
            enrichedData.standingInstructions = PreferenceReader.getStandingInstructions();
            enrichedData.jurisdiction = PreferenceReader.getJurisdiction();
            enrichedData.currency = PreferenceReader.getCurrency();
            var _sp = PreferenceReader.getSourcingPreference ? PreferenceReader.getSourcingPreference() : null;
            if (_sp) enrichedData.sourcingPreference = _sp;
        } else {
            try { var vr = localStorage.getItem('vendeeX_valueRanking'); if (vr) enrichedData.valueRanking = JSON.parse(vr); } catch(e) {}
            enrichedData.prefFreeReturns = localStorage.getItem('vendeeX_prefFreeReturns') === 'true';
            enrichedData.prefDeliverySpeed = localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
            enrichedData.prefSustainability = localStorage.getItem('vendeeX_prefSustainability') === 'true';
            enrichedData.prefSustainabilityWeight = localStorage.getItem('vendeeX_prefSustainabilityWeight') || '3';
            enrichedData.standingInstructions = localStorage.getItem('vendeeX_standingInstructions') || '';
            enrichedData.jurisdiction = localStorage.getItem('vendeeX_jurisdiction') || '';
            enrichedData.currency = localStorage.getItem('vendeeX_currency') || '';
        }
        // Include sourcing preference regardless of PreferenceReader availability
        if (typeof PreferenceReader !== 'undefined' && PreferenceReader.getSourcingPreference) {
            var sp2 = PreferenceReader.getSourcingPreference();
            if (sp2) enrichedData.sourcingPreference = sp2;
        }
        if (window.currentSearchRules) {
            enrichedData.searchRules = window.currentSearchRules;
        }

        // Show thinking indicator
        addMessage('Analyzing your request...', 'agent');

        try {
            const response = await fetch('/api/chat/qualify', {
                method: 'POST',
                headers: Object.assign(
                    { 'Content-Type': 'application/json' },
                    Object.assign({}, window.vxSearchKey ? { 'x-search-key': window.vxSearchKey } : {}, { 'x-lang': (typeof window.getLang === 'function' ? window.getLang() : localStorage.getItem('vx-lang') || 'en') })
                ),
                body: JSON.stringify({
                    query,
                    conversationHistory: [{ role: 'user', content: query }],
                    avatarData: enrichedData
                })
            });

            const data = await response.json();

            // Remove thinking indicator
            messagesDiv.lastChild.remove();

            if (!data.success || data.readyToSearch) {
                // Agent says query is detailed enough, or no LLM available
                if (data.skipReason) {
                    // No LLM, skip straight to search
                    panel.style.display = 'none';
                    if (callback) callback(query);
                    return;
                }
                showConfirmation(data.message || `Searching for: "${query}"`, data.searchParams?.query || query);
            } else {
                // Agent has qualifying questions
                conversationHistory.push({ role: 'user', content: query });
                conversationHistory.push({ role: 'assistant', content: JSON.stringify(data) });
                addMessage(data.message, 'agent');

                // Show questions as quick-reply buttons if provided
                if (data.questions && data.questions.length > 0) {
                    const questionsHtml = data.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
                    addMessage(questionsHtml, 'agent');
                }
            }

            // Focus input
            const input = document.getElementById('qualifyInput');
            if (input) input.focus();

        } catch (err) {
            console.error('[QualifyingChat] Error:', err);
            // On error, skip qualifying
            panel.style.display = 'none';
            if (callback) callback(query);
        }
    }

    async function sendMessage() {
        if (isWaiting) return;

        const input = document.getElementById('qualifyInput');
        const message = input.value.trim();
        if (!message) return;

        input.value = '';
        addMessage(message, 'user');
        conversationHistory.push({ role: 'user', content: message });

        isWaiting = true;
        addMessage('Thinking...', 'agent');

        try {
            let avatarData = null;
            try {
                const stored = sessionStorage.getItem('vendeeAvatar');
                if (stored) avatarData = JSON.parse(stored);
            } catch (e) { /* ignore */ }

            // Enrich with full 7-category preferences (new key first, old fallback)
            const enrichedData = Object.assign({}, avatarData || {});
            if (typeof PreferenceReader !== 'undefined') {
                var allPrefs = PreferenceReader.getAll();
                if (allPrefs) enrichedData.avatarPreferences = allPrefs;
                enrichedData.valueRanking = PreferenceReader.getValueRanking();
                enrichedData.prefFreeReturns = PreferenceReader.getFreeReturnsPreferred();
                enrichedData.prefDeliverySpeed = PreferenceReader.getDeliverySpeed();
                enrichedData.standingInstructions = PreferenceReader.getStandingInstructions();
            } else {
                try { var vr = localStorage.getItem('vendeeX_valueRanking'); if (vr) enrichedData.valueRanking = JSON.parse(vr); } catch(e) {}
                enrichedData.prefFreeReturns = localStorage.getItem('vendeeX_prefFreeReturns') === 'true';
                enrichedData.prefDeliverySpeed = localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
                enrichedData.standingInstructions = localStorage.getItem('vendeeX_standingInstructions') || '';
            }
            if (window.currentSearchRules) {
                enrichedData.searchRules = window.currentSearchRules;
            }

            const response = await fetch('/api/chat/qualify', {
                method: 'POST',
                headers: Object.assign(
                    { 'Content-Type': 'application/json' },
                    Object.assign({}, window.vxSearchKey ? { 'x-search-key': window.vxSearchKey } : {}, { 'x-lang': (typeof window.getLang === 'function' ? window.getLang() : localStorage.getItem('vx-lang') || 'en') })
                ),
                body: JSON.stringify({
                    query: originalQuery,
                    conversationHistory,
                    avatarData: enrichedData
                })
            });

            const data = await response.json();

            // Remove thinking indicator
            const messagesDiv = document.getElementById('qualifyMessages');
            if (messagesDiv.lastChild) messagesDiv.lastChild.remove();

            if (data.readyToSearch) {
                conversationHistory.push({ role: 'assistant', content: JSON.stringify(data) });
                showConfirmation(data.message, data.searchParams?.query || originalQuery);
            } else {
                conversationHistory.push({ role: 'assistant', content: JSON.stringify(data) });
                addMessage(data.message, 'agent');
                if (data.questions && data.questions.length > 0) {
                    const questionsHtml = data.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
                    addMessage(questionsHtml, 'agent');
                }
            }
        } catch (err) {
            console.error('[QualifyingChat] Send error:', err);
            const messagesDiv = document.getElementById('qualifyMessages');
            if (messagesDiv.lastChild) messagesDiv.lastChild.remove();
            skipQualifying();
        }

        isWaiting = false;
    }

    function addMessage(text, type) {
        const messagesDiv = document.getElementById('qualifyMessages');
        if (!messagesDiv) return;

        const msg = document.createElement('div');
        msg.className = `qualify-msg qualify-msg--${type}`;
        msg.textContent = text;
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function showConfirmation(message, refinedQuery) {
        const messagesDiv = document.getElementById('qualifyMessages');
        if (!messagesDiv) return;

        const msg = document.createElement('div');
        msg.className = 'qualify-msg qualify-msg--confirm';
        msg.innerHTML = `<div>${escapeHtml(message)}</div><button class="confirm-btn" id="confirmSearchBtn">${typeof window.t === 'function' ? window.t('qualify.searchNow') : 'Search Now'}</button>`;
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Hide input area
        const inputArea = document.querySelector('.qualifying-chat__input');
        if (inputArea) inputArea.style.display = 'none';

        document.getElementById('confirmSearchBtn').addEventListener('click', function() {
            executeSearch(refinedQuery);
        });
    }

    function skipQualifying() {
        executeSearch(originalQuery);
    }

    function executeSearch(query) {
        const panel = document.getElementById('qualifyingChat');
        if (panel) panel.style.display = 'none';

        // Restore input area for next use
        const inputArea = document.querySelector('.qualifying-chat__input');
        if (inputArea) inputArea.style.display = '';

        if (onSearchReady) onSearchReady(query);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { init, start };
})();
