/**
 * VendeeX 2.0 — Universal Jurisdiction / Currency Switcher
 *
 * Drop this script (after pricing-engine.js) onto ANY page to get
 * the floating "Demo: Buyer Location" panel in the bottom-right corner.
 *
 * It writes `vendeeX_buyerLocation` only. Currency is set exclusively from
 * avatar preferences on login and registration (never by this switcher).
 *
 * On the demo page the full switchJurisdiction() in demo.js takes over
 * (it re-renders product cards etc.). On other pages this script handles
 * its own lightweight refresh: it fires a `vendeex:jurisdictionChanged`
 * custom event so page-specific code can react.
 */
(function () {
    'use strict';

    // ---- Jurisdiction data ------------------------------------------------
    var jurisdictions = [
        { code: 'UK',    label: 'United Kingdom (VAT 20%)',         name: 'UK buyer' },
        { code: 'JE',    label: 'Jersey (GST 5%)',                  name: 'Jersey buyer' },
        { code: 'GG',    label: 'Guernsey (No GST)',                name: 'Guernsey buyer' },
        { code: 'AU',    label: 'Australia (GST 10%)',              name: 'Australian buyer' },
        { code: 'US-CA', label: 'California (Sales Tax 7.25%)',     name: 'California buyer' },
        { code: 'US-TX', label: 'Texas (Sales Tax 6.25%)',          name: 'Texas buyer' },
        { code: 'US-NY', label: 'New York (Sales Tax 8%)',          name: 'New York buyer' },
        { code: 'DE',    label: 'Germany (MwSt 19%)',               name: 'German buyer' },
        { code: 'FR',    label: 'France (TVA 20%)',                 name: 'French buyer' },
        { code: 'SG',    label: 'Singapore (GST 9%)',               name: 'Singapore buyer' },
        { code: 'JP',    label: 'Japan (10%)',                      name: 'Japanese buyer' }
    ];

    // ---- Ensure CSS is loaded --------------------------------------------
    function ensureCSS() {
        if (document.querySelector('link[href*="transparent-pricing.css"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        // Determine path prefix: pages/ needs "../css/", root needs "css/"
        var isSubDir = /\/pages\//.test(window.location.pathname);
        link.href = (isSubDir ? '../css/' : 'css/') + 'transparent-pricing.css?v=3.3';
        document.head.appendChild(link);
    }

    // ---- Build the switcher HTML -----------------------------------------
    function buildSwitcher(currentCode) {
        var options = jurisdictions.map(function (j) {
            var sel = j.code === currentCode ? ' selected' : '';
            return '<option value="' + j.code + '"' + sel + '>' + j.label + '</option>';
        }).join('');

        var currentName = 'UK buyer';
        jurisdictions.forEach(function (j) { if (j.code === currentCode) currentName = j.name; });

        // Get currency info
        var currencyInfo = '';
        if (typeof PricingEngine !== 'undefined') {
            var c = PricingEngine.getCurrencyForLocation(currentCode);
            var sym = PricingEngine.getCurrencySymbol(c);
            currencyInfo = ' &mdash; ' + sym + ' ' + c;
        }

        var container = document.createElement('div');
        container.className = 'jurisdiction-switcher';
        container.id = 'jurisdictionSwitcher';
        container.innerHTML =
            '<div class="jurisdiction-switcher__label">Demo: Buyer Location</div>' +
            '<select id="jurisdictionSelect">' + options + '</select>' +
            '<div class="jurisdiction-switcher__current" id="jurisdictionCurrent">' +
                'Viewing as: ' + currentName + currencyInfo +
            '</div>';
        return container;
    }

    // ---- Handle change ---------------------------------------------------
    function onJurisdictionChange(code) {
        // Update localStorage (currency is set only from avatar preferences on login/registration)
        localStorage.setItem('vendeeX_buyerLocation', code);

        // Update the display text
        var currentEl = document.getElementById('jurisdictionCurrent');
        if (currentEl) {
            var name = code + ' buyer';
            jurisdictions.forEach(function (j) { if (j.code === code) name = j.name; });
            var currencyInfo = '';
            if (typeof PricingEngine !== 'undefined') {
                var c = PricingEngine.getCurrencyForLocation(code);
                var sym = PricingEngine.getCurrencySymbol(c);
                currencyInfo = ' \u2014 ' + sym + ' ' + c;
            }
            currentEl.textContent = 'Viewing as: ' + name + currencyInfo;
        }

        // If the demo page's full switchJurisdiction() exists, delegate to it
        if (typeof window.switchJurisdiction === 'function') {
            window.switchJurisdiction(code);
            return;
        }

        // Otherwise fire a custom event so page-specific code can react
        window.dispatchEvent(new CustomEvent('vendeex:jurisdictionChanged', { detail: { code: code } }));

        // On checkout page, re-render session if available
        if (typeof renderSession === 'function') {
            renderSession();
        }
        if (typeof calculateShippingOptions === 'function' && typeof currentSession !== 'undefined' && currentSession) {
            calculateShippingOptions();
        }
    }

    // ---- Init on DOMContentLoaded ----------------------------------------
    function init() {
        // Don't double-inject if the demo page already has it inline
        if (document.getElementById('jurisdictionSwitcher')) {
            // Just ensure the select is wired up
            var existing = document.getElementById('jurisdictionSelect');
            if (existing && !existing._jsWired) {
                existing._jsWired = true;
                existing.addEventListener('change', function () { onJurisdictionChange(this.value); });
            }
            return;
        }

        ensureCSS();

        var currentCode = localStorage.getItem('vendeeX_buyerLocation') || 'UK';
        var switcher = buildSwitcher(currentCode);
        document.body.appendChild(switcher);

        var select = switcher.querySelector('select');
        select._jsWired = true;
        select.addEventListener('change', function () { onJurisdictionChange(this.value); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
