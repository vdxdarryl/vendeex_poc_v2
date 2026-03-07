/**
 * VendeeX 2.0 — Preference Reader Utility
 *
 * Centralised read-with-fallback logic for the 7-category avatar preferences.
 * Reads from vendeeX_avatarPreferences (JSONB) first, falling back to old
 * individual localStorage keys for backward compatibility with pre-Phase-1 users.
 *
 * Usage:
 *   var prefs = PreferenceReader.getAll();
 *   var speed = PreferenceReader.getDeliverySpeed();
 *   var freeReturns = PreferenceReader.getFreeReturnsPreferred();
 */
(function() {
    'use strict';

    function readNewPrefs() {
        try {
            var raw = localStorage.getItem('vendeeX_avatarPreferences');
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return null;
    }

    var PreferenceReader = {

        /** Return the full 7-category object, or null if not available */
        getAll: function() {
            return readNewPrefs();
        },

        /** Delivery speed: 'fastest' | 'balanced' | 'cheapest' */
        getDeliverySpeed: function() {
            var prefs = readNewPrefs();
            if (prefs && prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference) {
                return prefs.deliveryLogistics.speedPreference;
            }
            return localStorage.getItem('vendeeX_prefDeliverySpeed') || 'balanced';
        },

        /** Whether the user prefers free returns (based on min return window >= 14 days) */
        getFreeReturnsPreferred: function() {
            var prefs = readNewPrefs();
            if (prefs && prefs.trustRisk) {
                return (prefs.trustRisk.minReturnWindowDays || 0) >= 14;
            }
            return localStorage.getItem('vendeeX_prefFreeReturns') === 'true';
        },

        /** Carbon sensitivity level: 'low' | 'medium' | 'high' */
        getCarbonSensitivity: function() {
            var prefs = readNewPrefs();
            if (prefs && prefs.valuesEthics) {
                return prefs.valuesEthics.carbonSensitivity || 'medium';
            }
            return localStorage.getItem('vendeeX_prefSustainability') === 'true' ? 'medium' : 'low';
        },

        /** Sustainability weight as string '1'-'5' (mapped from carbon sensitivity) */
        getSustainabilityWeight: function() {
            var prefs = readNewPrefs();
            if (prefs && prefs.valuesEthics) {
                var map = { low: '2', medium: '3', high: '5' };
                return map[prefs.valuesEthics.carbonSensitivity] || '3';
            }
            return localStorage.getItem('vendeeX_prefSustainabilityWeight') || '3';
        },

        /** Whether sustainability is preferred (boolean) */
        getSustainabilityPreferred: function() {
            var prefs = readNewPrefs();
            if (prefs && prefs.valuesEthics) {
                return prefs.valuesEthics.carbonSensitivity !== 'low';
            }
            return localStorage.getItem('vendeeX_prefSustainability') === 'true';
        },

        /** Value ranking object: { cost, quality, speed, ethics } (derived from 7-category prefs) */
        getValueRanking: function() {
            var prefs = readNewPrefs();
            if (prefs) {
                var speedMap = { fastest: 4, balanced: 3, cheapest: 2 };
                var ethicsMap = { low: 2, medium: 3, high: 5 };
                return {
                    cost: 4,
                    quality: (prefs.qualityDefaults && prefs.qualityDefaults.conditionTolerance === 'new') ? 4 : 3,
                    speed: speedMap[(prefs.deliveryLogistics && prefs.deliveryLogistics.speedPreference)] || 3,
                    ethics: ethicsMap[(prefs.valuesEthics && prefs.valuesEthics.carbonSensitivity)] || 3
                };
            }
            try {
                var vr = localStorage.getItem('vendeeX_valueRanking');
                if (vr) return JSON.parse(vr);
            } catch(e) {}
            return null;
        },

        /** Standing instructions (always its own key, not part of 7 categories) */
        getStandingInstructions: function() {
            return localStorage.getItem('vendeeX_standingInstructions') || '';
        },

        /** Currency — standalone key first, then avatarPreferences.paymentDefaults.currency */
        getCurrency: function() {
            var standalone = localStorage.getItem('vendeeX_currency');
            if (standalone) return standalone;
            var prefs = readNewPrefs();
            if (prefs && prefs.paymentDefaults && prefs.paymentDefaults.currency) {
                return prefs.paymentDefaults.currency;
            }
            return '';
        },

        /** Jurisdiction (identity key, not part of 7 categories) */
        getJurisdiction: function() {
            return localStorage.getItem('vendeeX_jurisdiction') || '';
        },

        getSourcingPreference: function() {
            // Read from avatarPreferences blob (server-saved) first,
            // then fall back to the per-email preferences key (local only)
            try {
                var ap = JSON.parse(localStorage.getItem('vendeeX_avatarPreferences') || 'null');
                if (ap && ap.ethical && ap.ethical.sourcingPreference) return ap.ethical.sourcingPreference;
            } catch(e) {}
            try {
                var email = localStorage.getItem('vendeeX_userEmail');
                if (email) {
                    var key = 'vendeeX_prefs_' + email;
                    var saved = JSON.parse(localStorage.getItem(key) || 'null');
                    if (saved && saved.ethical && saved.ethical.sourcingPreference) return saved.ethical.sourcingPreference;
                }
            } catch(e) {}
            return null;
        }
    };

    if (typeof window !== 'undefined') {
        window.PreferenceReader = PreferenceReader;
    }
})();
