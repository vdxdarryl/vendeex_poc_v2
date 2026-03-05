/**
 * VendeeX 2.0 — Preference Scorer
 * Scores products against the member's 7-category avatar preferences.
 * Categories 3 (Data & Privacy) and 4 (Communication) are platform-operational
 * and not scored against products.
 *
 * Usage:
 *   var result = PreferenceScorer.score(product, avatarPreferences);
 *   // result.overall          → 0-100
 *   // result.hardFilterFailed → boolean
 *   // result.failReason       → string | null
 *   // result.categories       → { valuesEthics, trustRisk, payment, delivery, quality }
 *   //   each: { score: 0-100, details: [{ label, passed, note }] }
 */
(function() {
    'use strict';

    // ─── Sustainability score map (merchant letter grade → numeric) ───
    var SUSTAINABILITY_SCORES = {
        'A+': 100, 'A': 95, 'A-': 90,
        'B+': 80, 'B': 70, 'B-': 60,
        'C+': 50, 'C': 40, 'C-': 30,
        'D': 20, 'F': 0
    };

    // ─── Eco/ethical keywords for description scanning ───
    var ECO_KEYWORDS = [
        'organic', 'sustainable', 'eco-friendly', 'eco friendly', 'recycled',
        'biodegradable', 'compostable', 'renewable', 'carbon neutral',
        'carbon-neutral', 'zero waste', 'zero-waste', 'green', 'natural'
    ];
    var FAIR_TRADE_KEYWORDS = [
        'fair trade', 'fairtrade', 'fair-trade', 'ethically sourced',
        'ethical sourcing', 'ethical', 'responsibly sourced'
    ];
    var VEGAN_KEYWORDS = [
        'vegan', 'plant-based', 'plant based', 'no animal'
    ];
    var CRUELTY_FREE_KEYWORDS = [
        'cruelty-free', 'cruelty free', 'not tested on animals', 'leaping bunny'
    ];
    var BCORP_KEYWORDS = ['b corp', 'b-corp', 'bcorp', 'certified b'];

    // ─── Defaults (scores don't count when member uses defaults) ───
    var DEFAULTS = {
        valuesEthics: {
            carbonSensitivity: 'medium',
            circularEconomy: false,
            packagingPreference: 'any',
            fairTrade: false,
            labourStandards: 'medium',
            localEconomy: 'medium',
            bCorpPreference: false,
            supplierDiversity: false,
            animalWelfare: 'none'
        },
        trustRisk: {
            minSellerRating: 'any',
            minWarrantyMonths: 0,
            disputeResolution: 'either',
            minReturnWindowDays: 14
        },
        paymentDefaults: {
            preferredMethods: ['card'],
            currency: 'USD',
            instalmentsAcceptable: false
        },
        deliveryLogistics: {
            deliveryMethod: 'delivery',
            speedPreference: 'balanced',
            packagingPreference: 'standard'
        },
        qualityDefaults: {
            conditionTolerance: 'new',
            brandExclusions: [],
            countryPreferences: []
        }
    };

    // ─── Helpers ───

    function textContains(text, keywords) {
        if (!text) return false;
        var lower = text.toLowerCase();
        return keywords.some(function(kw) { return lower.indexOf(kw) !== -1; });
    }

    function parseReturnDays(returnWindow) {
        if (!returnWindow) return 0;
        var str = String(returnWindow).toLowerCase();
        var match = str.match(/(\d+)/);
        if (!match) return 0;
        var num = parseInt(match[1], 10);
        if (str.indexOf('night') !== -1) return num; // "100 nights" = 100 days
        if (str.indexOf('year') !== -1) return num * 365;
        if (str.indexOf('month') !== -1) return num * 30;
        return num; // assume days
    }

    function parseWarrantyMonths(warranty) {
        if (!warranty) return 0;
        var str = String(warranty).toLowerCase();
        if (str === 'none' || str === 'n/a') return 0;
        if (str.indexOf('lifetime') !== -1) return 120; // 10 years cap
        var match = str.match(/(\d+)/);
        if (!match) {
            // "Satisfaction guarantee" or similar
            if (str.indexOf('guarantee') !== -1) return 3;
            return 0;
        }
        var num = parseInt(match[1], 10);
        if (str.indexOf('year') !== -1) return num * 12;
        if (str.indexOf('month') !== -1) return num;
        if (str.indexOf('day') !== -1) return Math.max(1, Math.round(num / 30));
        return num; // assume months
    }

    function parseSellerRating(pillValue) {
        var map = { 'any': 0, '3': 3, '4': 4, '4.5': 4.5 };
        return map[pillValue] || 0;
    }

    function normalisePaymentMethod(method) {
        var m = method.toLowerCase().trim();
        if (m.indexOf('visa') !== -1 || m.indexOf('mastercard') !== -1 || m.indexOf('amex') !== -1 || m === 'card') return 'card';
        if (m.indexOf('paypal') !== -1) return 'paypal';
        if (m.indexOf('apple') !== -1) return 'apple-pay';
        if (m.indexOf('google') !== -1) return 'google-pay';
        if (m.indexOf('bank') !== -1 || m.indexOf('transfer') !== -1) return 'bank-transfer';
        if (m.indexOf('affirm') !== -1 || m.indexOf('klarna') !== -1 || m.indexOf('afterpay') !== -1) return 'instalments';
        return m;
    }

    function isDefault(categoryKey, prefs) {
        var def = DEFAULTS[categoryKey];
        var actual = prefs[categoryKey];
        if (!def || !actual) return true;
        return JSON.stringify(def) === JSON.stringify(actual);
    }

    // ─── Hard Filter ───

    function getHardFilterResult(product, prefs) {
        var qd = prefs.qualityDefaults;
        if (!qd) return { passed: true, reason: null };

        // Brand exclusions
        if (qd.brandExclusions && qd.brandExclusions.length > 0 && product.brand) {
            var lowerBrand = product.brand.toLowerCase();
            var excluded = qd.brandExclusions.some(function(ex) {
                return lowerBrand.indexOf(ex.toLowerCase()) !== -1;
            });
            if (excluded) {
                return { passed: false, reason: 'Brand "' + product.brand + '" is on your exclusion list' };
            }
        }

        // Condition tolerance
        if (qd.conditionTolerance === 'new' && product.condition) {
            var cond = product.condition.toLowerCase();
            if (cond !== 'new' && cond !== '' && cond !== 'brand new') {
                return { passed: false, reason: 'Product is "' + product.condition + '" but you require new only' };
            }
        }
        if (qd.conditionTolerance === 'refurbished' && product.condition) {
            var cond2 = product.condition.toLowerCase();
            if (cond2 === 'pre-owned' || cond2 === 'used') {
                return { passed: false, reason: 'Product is "' + product.condition + '" but you accept refurbished at most' };
            }
        }

        return { passed: true, reason: null };
    }

    // ─── Category Scorers ───

    function scoreValuesEthics(product, merchant, prefs) {
        var ve = prefs.valuesEthics;
        if (!ve) return { score: 50, details: [] };

        var details = [];
        var points = 0;
        var maxPoints = 0;
        var desc = (product.description || '') + ' ' + (product.name || '') + ' ' + ((product.tags || []).join(' ')) + ' ' + ((product.material || ''));
        var creds = (merchant && merchant.sustainability && merchant.sustainability.credentials) || [];
        var credsText = creds.join(' ').toLowerCase();

        // Carbon sensitivity
        if (ve.carbonSensitivity !== 'low') {
            maxPoints += 30;
            var susScore = 0;
            if (merchant && merchant.sustainability) {
                susScore = SUSTAINABILITY_SCORES[merchant.sustainability.score] || 0;
            }
            var hasEcoKeywords = textContains(desc, ECO_KEYWORDS);
            var threshold = ve.carbonSensitivity === 'high' ? 70 : 40;

            if (susScore >= threshold || (hasEcoKeywords && susScore >= threshold - 20)) {
                points += 30;
                details.push({ label: 'Carbon sensitivity', passed: 'pass', note: merchant ? 'Sustainability: ' + (merchant.sustainability.score || 'N/A') : 'Eco keywords found' });
            } else if (susScore > 0 || hasEcoKeywords) {
                points += 15;
                details.push({ label: 'Carbon sensitivity', passed: 'partial', note: merchant ? 'Sustainability: ' + (merchant.sustainability.score || 'N/A') + ' (below your threshold)' : 'Some eco indicators' });
            } else {
                details.push({ label: 'Carbon sensitivity', passed: 'fail', note: 'No sustainability data available' });
            }
        }

        // Fair trade
        if (ve.fairTrade) {
            maxPoints += 20;
            var hasFT = textContains(desc, FAIR_TRADE_KEYWORDS) || textContains(credsText, FAIR_TRADE_KEYWORDS) || credsText.indexOf('ethical') !== -1;
            if (hasFT) {
                points += 20;
                details.push({ label: 'Fair trade', passed: 'pass', note: 'Fair trade indicators found' });
            } else {
                details.push({ label: 'Fair trade', passed: 'fail', note: 'No fair trade certification detected' });
            }
        }

        // B-Corp preference
        if (ve.bCorpPreference) {
            maxPoints += 15;
            var hasBCorp = textContains(credsText, BCORP_KEYWORDS) || (merchant && merchant.sustainability && merchant.sustainability.certified);
            if (hasBCorp) {
                points += 15;
                details.push({ label: 'B-Corp / certified', passed: 'pass', note: 'Certified sustainable merchant' });
            } else {
                details.push({ label: 'B-Corp / certified', passed: 'fail', note: 'Merchant not certified' });
            }
        }

        // Animal welfare
        if (ve.animalWelfare !== 'none') {
            maxPoints += 20;
            if (ve.animalWelfare === 'vegan') {
                var isVegan = textContains(desc, VEGAN_KEYWORDS) || textContains(credsText, VEGAN_KEYWORDS);
                if (isVegan) {
                    points += 20;
                    details.push({ label: 'Animal welfare', passed: 'pass', note: 'Vegan product' });
                } else {
                    var isCF = textContains(desc, CRUELTY_FREE_KEYWORDS) || textContains(credsText, CRUELTY_FREE_KEYWORDS);
                    if (isCF) {
                        points += 10;
                        details.push({ label: 'Animal welfare', passed: 'partial', note: 'Cruelty-free but not confirmed vegan' });
                    } else {
                        details.push({ label: 'Animal welfare', passed: 'fail', note: 'No vegan certification' });
                    }
                }
            } else {
                // cruelty-free
                var isCF2 = textContains(desc, CRUELTY_FREE_KEYWORDS) || textContains(desc, VEGAN_KEYWORDS) || textContains(credsText, CRUELTY_FREE_KEYWORDS);
                if (isCF2) {
                    points += 20;
                    details.push({ label: 'Animal welfare', passed: 'pass', note: 'Cruelty-free confirmed' });
                } else {
                    details.push({ label: 'Animal welfare', passed: 'fail', note: 'No cruelty-free certification' });
                }
            }
        }

        // Circular economy
        if (ve.circularEconomy) {
            maxPoints += 15;
            var hasCircular = textContains(desc, ['recycled', 'reclaimed', 'upcycled', 'circular', 'refurbish']) || textContains(credsText, ['recycl', 'circular']);
            if (hasCircular) {
                points += 15;
                details.push({ label: 'Circular economy', passed: 'pass', note: 'Recycled/circular economy product' });
            } else {
                details.push({ label: 'Circular economy', passed: 'fail', note: 'No circular economy indicators' });
            }
        }

        var score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 50;
        return { score: score, details: details };
    }

    function scoreTrustRisk(product, merchant, prefs) {
        var tr = prefs.trustRisk;
        if (!tr) return { score: 50, details: [] };

        var details = [];
        var points = 0;
        var maxPoints = 0;

        // Seller rating
        var minRating = parseSellerRating(tr.minSellerRating);
        if (minRating > 0) {
            maxPoints += 30;
            var merchantRating = merchant ? merchant.rating : null;
            if (merchantRating !== null && merchantRating >= minRating) {
                points += 30;
                details.push({ label: 'Seller rating', passed: 'pass', note: merchantRating.toFixed(1) + '\u2605 \u2265 your minimum ' + minRating.toFixed(1) + '\u2605' });
            } else if (merchantRating !== null) {
                var ratio = merchantRating / minRating;
                points += Math.round(30 * Math.min(ratio, 0.9));
                details.push({ label: 'Seller rating', passed: 'partial', note: merchantRating.toFixed(1) + '\u2605 below your minimum ' + minRating.toFixed(1) + '\u2605' });
            } else {
                details.push({ label: 'Seller rating', passed: 'fail', note: 'Seller rating unknown' });
            }
        }

        // Warranty
        if (tr.minWarrantyMonths && tr.minWarrantyMonths > 0) {
            maxPoints += 25;
            var actualWarranty = merchant ? parseWarrantyMonths(merchant.terms.warranty) : 0;
            if (actualWarranty >= tr.minWarrantyMonths) {
                points += 25;
                details.push({ label: 'Warranty', passed: 'pass', note: (merchant ? merchant.terms.warranty : 'N/A') + ' \u2265 ' + tr.minWarrantyMonths + ' months' });
            } else if (actualWarranty > 0) {
                points += Math.round(25 * (actualWarranty / tr.minWarrantyMonths));
                details.push({ label: 'Warranty', passed: 'partial', note: (merchant ? merchant.terms.warranty : 'N/A') + ' < ' + tr.minWarrantyMonths + ' months' });
            } else {
                details.push({ label: 'Warranty', passed: 'fail', note: 'No warranty information' });
            }
        }

        // Return window
        if (tr.minReturnWindowDays && tr.minReturnWindowDays > 0) {
            maxPoints += 25;
            var actualReturn = merchant ? parseReturnDays(merchant.terms.returnWindow) : 0;
            if (actualReturn >= tr.minReturnWindowDays) {
                points += 25;
                details.push({ label: 'Return window', passed: 'pass', note: (merchant ? merchant.terms.returnWindow : 'N/A') + ' \u2265 ' + tr.minReturnWindowDays + ' days' });
            } else if (actualReturn > 0) {
                points += Math.round(25 * (actualReturn / tr.minReturnWindowDays));
                details.push({ label: 'Return window', passed: 'partial', note: (merchant ? merchant.terms.returnWindow : 'N/A') + ' < ' + tr.minReturnWindowDays + ' days' });
            } else {
                details.push({ label: 'Return window', passed: 'fail', note: 'Return policy unknown' });
            }
        }

        // Free returns (check when member has strong return window expectation)
        if (merchant && merchant.terms.freeReturns) {
            maxPoints += 20;
            points += 20;
            details.push({ label: 'Free returns', passed: 'pass', note: 'Free returns offered' });
        } else if (merchant) {
            maxPoints += 20;
            details.push({ label: 'Free returns', passed: 'fail', note: 'Returns may incur fees' });
        }

        var score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 50;
        return { score: score, details: details };
    }

    function scorePayment(product, merchant, prefs) {
        var pd = prefs.paymentDefaults;
        if (!pd) return { score: 50, details: [] };

        var details = [];
        var points = 0;
        var maxPoints = 0;

        // Payment methods overlap
        if (pd.preferredMethods && pd.preferredMethods.length > 0 && merchant) {
            maxPoints += 60;
            var merchantMethods = (merchant.terms.paymentMethods || []).map(normalisePaymentMethod);
            var overlap = pd.preferredMethods.filter(function(pm) {
                return merchantMethods.indexOf(pm) !== -1;
            });
            var ratio = overlap.length / pd.preferredMethods.length;
            points += Math.round(60 * ratio);
            if (ratio >= 1) {
                details.push({ label: 'Payment methods', passed: 'pass', note: 'All preferred methods accepted' });
            } else if (ratio > 0) {
                details.push({ label: 'Payment methods', passed: 'partial', note: overlap.length + ' of ' + pd.preferredMethods.length + ' preferred methods accepted' });
            } else {
                details.push({ label: 'Payment methods', passed: 'fail', note: 'None of your preferred methods accepted' });
            }
        }

        // Instalments
        if (pd.instalmentsAcceptable) {
            maxPoints += 40;
            var hasInstalments = merchant && (merchant.terms.paymentMethods || []).some(function(m) {
                var lm = m.toLowerCase();
                return lm.indexOf('affirm') !== -1 || lm.indexOf('klarna') !== -1 || lm.indexOf('afterpay') !== -1;
            });
            if (hasInstalments) {
                points += 40;
                details.push({ label: 'Instalments', passed: 'pass', note: 'Buy-now-pay-later available' });
            } else {
                details.push({ label: 'Instalments', passed: 'fail', note: 'No instalment options detected' });
            }
        }

        var score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 50;
        return { score: score, details: details };
    }

    function scoreDelivery(product, merchant, prefs) {
        var dl = prefs.deliveryLogistics;
        if (!dl) return { score: 50, details: [] };

        var details = [];
        var points = 0;
        var maxPoints = 0;

        // Speed preference
        if (dl.speedPreference && dl.speedPreference !== 'balanced') {
            maxPoints += 50;
            if (merchant) {
                var maxDays = merchant.terms.maxDeliveryDays || 14;
                if (dl.speedPreference === 'fastest') {
                    if (maxDays <= 3) {
                        points += 50;
                        details.push({ label: 'Delivery speed', passed: 'pass', note: maxDays + '-day delivery matches fastest preference' });
                    } else if (maxDays <= 5) {
                        points += 30;
                        details.push({ label: 'Delivery speed', passed: 'partial', note: maxDays + '-day delivery (you prefer fastest)' });
                    } else {
                        details.push({ label: 'Delivery speed', passed: 'fail', note: maxDays + '-day delivery too slow for fastest preference' });
                    }
                } else if (dl.speedPreference === 'cheapest') {
                    // Cheapest = free shipping matters more
                    var hasFreeShip = merchant.terms.freeShippingThreshold === 0;
                    if (hasFreeShip) {
                        points += 50;
                        details.push({ label: 'Shipping cost', passed: 'pass', note: 'Free shipping available' });
                    } else {
                        points += 25;
                        details.push({ label: 'Shipping cost', passed: 'partial', note: 'Free shipping over $' + merchant.terms.freeShippingThreshold });
                    }
                }
            } else {
                details.push({ label: 'Delivery speed', passed: 'fail', note: 'Delivery information unavailable' });
            }
        } else if (dl.speedPreference === 'balanced' && merchant) {
            maxPoints += 50;
            var balDays = merchant.terms.maxDeliveryDays || 14;
            if (balDays <= 7) {
                points += 50;
                details.push({ label: 'Delivery speed', passed: 'pass', note: balDays + '-day delivery within balanced range' });
            } else {
                points += 25;
                details.push({ label: 'Delivery speed', passed: 'partial', note: balDays + '-day delivery slightly slow' });
            }
        }

        // Packaging preference
        if (dl.packagingPreference && dl.packagingPreference !== 'standard') {
            maxPoints += 50;
            var creds = (merchant && merchant.sustainability && merchant.sustainability.credentials) || [];
            var credsLower = creds.join(' ').toLowerCase();
            var desc = (product.description || '').toLowerCase();
            var hasMinimal = credsLower.indexOf('minimal') !== -1 || credsLower.indexOf('recyclable packaging') !== -1 || desc.indexOf('minimal packaging') !== -1;
            var hasPlasticFree = credsLower.indexOf('plastic-free') !== -1 || credsLower.indexOf('plastic free') !== -1 || desc.indexOf('plastic-free') !== -1;

            if (dl.packagingPreference === 'plastic-free') {
                if (hasPlasticFree) {
                    points += 50;
                    details.push({ label: 'Packaging', passed: 'pass', note: 'Plastic-free packaging' });
                } else if (hasMinimal) {
                    points += 25;
                    details.push({ label: 'Packaging', passed: 'partial', note: 'Minimal packaging (not confirmed plastic-free)' });
                } else {
                    details.push({ label: 'Packaging', passed: 'fail', note: 'No packaging preference data' });
                }
            } else {
                // minimal
                if (hasMinimal || hasPlasticFree) {
                    points += 50;
                    details.push({ label: 'Packaging', passed: 'pass', note: 'Minimal/eco packaging' });
                } else {
                    details.push({ label: 'Packaging', passed: 'fail', note: 'No packaging preference data' });
                }
            }
        }

        var score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 50;
        return { score: score, details: details };
    }

    function scoreQuality(product, merchant, prefs) {
        var qd = prefs.qualityDefaults;
        if (!qd) return { score: 50, details: [] };

        var details = [];
        var points = 0;
        var maxPoints = 0;

        // Condition (non-hard-filter scoring for partial match)
        if (qd.conditionTolerance) {
            maxPoints += 40;
            if (!product.condition || product.condition.toLowerCase() === 'new' || product.condition === '') {
                points += 40;
                details.push({ label: 'Condition', passed: 'pass', note: product.condition ? 'New product' : 'Assumed new' });
            } else if (qd.conditionTolerance === 'refurbished') {
                var cond = product.condition.toLowerCase();
                if (cond === 'refurbished' || cond === 'renewed' || cond === 'certified refurbished') {
                    points += 40;
                    details.push({ label: 'Condition', passed: 'pass', note: 'Refurbished (accepted)' });
                }
            } else if (qd.conditionTolerance === 'pre-owned') {
                points += 40; // accepts anything
                details.push({ label: 'Condition', passed: 'pass', note: product.condition + ' (all conditions accepted)' });
            }
        }

        // Country preferences (boost)
        if (qd.countryPreferences && qd.countryPreferences.length > 0) {
            maxPoints += 30;
            if (product.country) {
                var lowerCountry = product.country.toLowerCase();
                var countryMatch = qd.countryPreferences.some(function(cp) {
                    return lowerCountry.indexOf(cp.toLowerCase()) !== -1;
                });
                if (countryMatch) {
                    points += 30;
                    details.push({ label: 'Country of origin', passed: 'pass', note: product.country + ' matches your preference' });
                } else {
                    details.push({ label: 'Country of origin', passed: 'fail', note: product.country + ' not in your preferred countries' });
                }
            } else {
                points += 15; // neutral when unknown
                details.push({ label: 'Country of origin', passed: 'partial', note: 'Country of origin not specified' });
            }
        }

        // Product rating (general quality signal)
        if (product.rating) {
            maxPoints += 30;
            var rating = parseFloat(product.rating);
            if (rating >= 4.5) {
                points += 30;
                details.push({ label: 'Product rating', passed: 'pass', note: rating.toFixed(1) + '\u2605 (excellent)' });
            } else if (rating >= 3.5) {
                points += 20;
                details.push({ label: 'Product rating', passed: 'partial', note: rating.toFixed(1) + '\u2605 (good)' });
            } else {
                points += 5;
                details.push({ label: 'Product rating', passed: 'fail', note: rating.toFixed(1) + '\u2605 (below average)' });
            }
        }

        var score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 50;
        return { score: score, details: details };
    }

    // ─── Main Scorer ───

    var PreferenceScorer = {

        /**
         * Score a single product against the member's avatar preferences.
         * @param {object} product — product object from search results
         * @param {object} prefs — parsed vendeeX_avatarPreferences object
         * @returns {object} { overall, categories, hardFilterFailed, failReason, activeCategories }
         */
        score: function(product, prefs) {
            if (!prefs || Object.keys(prefs).length === 0) {
                return {
                    overall: -1, // signals "no preferences set"
                    categories: {},
                    hardFilterFailed: false,
                    failReason: null,
                    activeCategories: 0
                };
            }

            // Hard filter first
            var hardFilter = getHardFilterResult(product, prefs);
            if (!hardFilter.passed) {
                return {
                    overall: 0,
                    categories: {},
                    hardFilterFailed: true,
                    failReason: hardFilter.reason,
                    activeCategories: 0
                };
            }

            // Resolve merchant for this product
            var merchant = null;
            if (typeof ACPMerchantData !== 'undefined' && product.brand) {
                merchant = ACPMerchantData.findMerchantByBrand(product.brand);
            }

            // Score each category (only if member changed from defaults)
            var categories = {};
            var totalScore = 0;
            var activeCount = 0;

            if (!isDefault('valuesEthics', prefs)) {
                categories.valuesEthics = scoreValuesEthics(product, merchant, prefs);
                totalScore += categories.valuesEthics.score;
                activeCount++;
            }
            if (!isDefault('trustRisk', prefs)) {
                categories.trustRisk = scoreTrustRisk(product, merchant, prefs);
                totalScore += categories.trustRisk.score;
                activeCount++;
            }
            if (!isDefault('paymentDefaults', prefs)) {
                categories.payment = scorePayment(product, merchant, prefs);
                totalScore += categories.payment.score;
                activeCount++;
            }
            if (!isDefault('deliveryLogistics', prefs)) {
                categories.delivery = scoreDelivery(product, merchant, prefs);
                totalScore += categories.delivery.score;
                activeCount++;
            }
            if (!isDefault('qualityDefaults', prefs)) {
                categories.quality = scoreQuality(product, merchant, prefs);
                totalScore += categories.quality.score;
                activeCount++;
            }

            // Always score trust & quality even if defaults (they have product-level signals)
            if (!categories.trustRisk) {
                categories.trustRisk = scoreTrustRisk(product, merchant, prefs);
            }
            if (!categories.quality) {
                categories.quality = scoreQuality(product, merchant, prefs);
            }

            // Compute overall: use active categories if any, else average trust+quality
            var overall;
            if (activeCount > 0) {
                overall = Math.round(totalScore / activeCount);
            } else {
                // No customised categories — use trust + quality as baseline
                var baseline = 0;
                var baseCount = 0;
                if (categories.trustRisk && categories.trustRisk.details.length > 0) { baseline += categories.trustRisk.score; baseCount++; }
                if (categories.quality && categories.quality.details.length > 0) { baseline += categories.quality.score; baseCount++; }
                overall = baseCount > 0 ? Math.round(baseline / baseCount) : -1;
            }

            return {
                overall: overall,
                categories: categories,
                hardFilterFailed: false,
                failReason: null,
                activeCategories: activeCount
            };
        },

        /**
         * Check if a product passes hard filters only (brand exclusions, condition).
         */
        passesHardFilter: function(product, prefs) {
            return getHardFilterResult(product, prefs).passed;
        },

        /**
         * Get blended score combining relevance and preference match.
         * @param {number} matchScore — 0-100 relevance score
         * @param {number} prefScore — 0-100 preference score (-1 = no prefs)
         * @returns {number} blended score 0-100
         */
        blendedScore: function(matchScore, prefScore) {
            if (prefScore < 0) return matchScore; // no prefs set, use relevance only
            var ms = matchScore || 85; // default relevance
            return Math.round((ms * 0.5) + (prefScore * 0.5));
        }
    };

    // Export
    if (typeof window !== 'undefined') {
        window.PreferenceScorer = PreferenceScorer;
    }
})();
