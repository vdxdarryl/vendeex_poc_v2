/**
 * VendeeX Customer Profile
 *
 * Loads customer context from avatar data (registration or returning login).
 * All user data comes from the Avatar Registration flow.
 * If no avatar exists, redirects to registration.
 */

// Country code mapping: avatar country codes -> PricingEngine location codes
const COUNTRY_TO_LOCATION = {
    'JE': 'JE', 'GG': 'GG', 'GB': 'UK', 'UK': 'UK',
    'US': 'US-CA', 'AU': 'AU', 'NZ': 'NZ', 'IE': 'IE',
    'FR': 'FR', 'DE': 'DE', 'SG': 'SG', 'JP': 'JP', 'CA': 'US-CA'
};

// US state -> PricingEngine location code
const US_STATE_MAP = {
    'california': 'US-CA', 'ca': 'US-CA',
    'new york': 'US-NY', 'ny': 'US-NY',
    'texas': 'US-TX', 'tx': 'US-TX',
    'florida': 'US-FL', 'fl': 'US-FL',
    'washington': 'US-WA', 'wa': 'US-WA'
};

const LOCATION_TO_CURRENCY = {
    'UK': 'GBP', 'JE': 'GBP', 'GG': 'GBP',
    'AU': 'AUD', 'NZ': 'NZD',
    'DE': 'EUR', 'FR': 'EUR', 'IE': 'EUR',
    'SG': 'SGD', 'JP': 'JPY',
    'US-CA': 'USD', 'US-NY': 'USD', 'US-TX': 'USD',
    'US-FL': 'USD', 'US-WA': 'USD'
};

/**
 * Resolve buyer location from avatar data
 */
function resolveLocationFromAvatar(avatar) {
    if (!avatar || !avatar.location) return null;
    var country = (avatar.location.country || '').toUpperCase();
    var stateProvince = (avatar.location.stateProvince || '').toLowerCase().trim();

    if (country === 'US' && stateProvince) {
        var matched = US_STATE_MAP[stateProvince];
        if (matched) return matched;
        return 'US-CA';
    }
    return COUNTRY_TO_LOCATION[country] || null;
}

/**
 * Initialise customer context from avatar registration data.
 * If no avatar exists, redirects to registration.
 */
function initialiseDemoCustomer() {
    var avatarJson = sessionStorage.getItem('vendeeAvatar');
    var avatar = null;
    try { if (avatarJson) avatar = JSON.parse(avatarJson); } catch (e) { avatar = null; }

    // Returning user: sessionStorage cleared (browser was closed) but localStorage
    // still has their profile from a previous registration.
    if (!avatar || !avatar.fullName) {
        var storedName = localStorage.getItem('vendeeX_userName');
        var storedEmail = localStorage.getItem('vendeeX_userEmail');
        var isLoggedIn = localStorage.getItem('vendeeX_isLoggedIn') === 'true';

        if (isLoggedIn && storedName) {
            // Reconstruct avatar from persistent localStorage
            var storedAddress = null;
            try { storedAddress = JSON.parse(localStorage.getItem('vendeeX_buyerAddress')); } catch (e) {}

            avatar = {
                fullName: storedName,
                email: storedEmail || '',
                accountType: localStorage.getItem('vendeeX_accountType') || 'Personal',
                location: storedAddress ? {
                    townCity: storedAddress.city || '',
                    stateProvince: storedAddress.county || '',
                    country: storedAddress.country || storedAddress.countryCode || ''
                } : null
            };

            // Restore into sessionStorage so the rest of the app works as expected
            sessionStorage.setItem('vendeeAvatar', JSON.stringify(avatar));
        }
    }

    if (avatar && avatar.fullName) {
        var location = resolveLocationFromAvatar(avatar);
        var jurisdiction = localStorage.getItem('vendeeX_jurisdiction') || location || 'UK';
        var currency = LOCATION_TO_CURRENCY[jurisdiction] || 'USD';

        localStorage.setItem('vendeeX_isLoggedIn', 'true');
        localStorage.setItem('vendeeX_userName', avatar.fullName);
        localStorage.setItem('vendeeX_userEmail', avatar.email || '');
        localStorage.setItem('vendeeX_accountType', avatar.accountType || 'Personal');
        localStorage.setItem('vendeeX_buyerLocation', jurisdiction);
        localStorage.setItem('vendeeX_currency', currency);
        localStorage.setItem('vendeeX_shippingPreference', 'standard');

        // Ensure avatar preference keys exist (set defaults if not already present)
        if (!localStorage.getItem('vendeeX_jurisdiction')) {
            localStorage.setItem('vendeeX_jurisdiction', jurisdiction);
        }

        // Synthesise the new 7-category structured key from old keys for pre-Phase-1 users
        if (!localStorage.getItem('vendeeX_avatarPreferences')) {
            var existingSpeed = localStorage.getItem('vendeeX_prefDeliverySpeed');
            var existingReturns = localStorage.getItem('vendeeX_prefFreeReturns');
            var existingSustain = localStorage.getItem('vendeeX_prefSustainability');
            if (existingSpeed || existingReturns || existingSustain) {
                var synthesised = {
                    valuesEthics: {
                        carbonSensitivity: (existingSustain === 'true') ? 'medium' : 'low',
                        circularEconomy: false, packagingPreference: 'any',
                        fairTrade: false, labourStandards: 'medium', localEconomy: 'medium',
                        bCorpPreference: false, supplierDiversity: false, animalWelfare: 'none'
                    },
                    trustRisk: {
                        minSellerRating: 'any', minWarrantyMonths: 0,
                        disputeResolution: 'either',
                        minReturnWindowDays: (existingReturns === 'true') ? 14 : 7
                    },
                    dataPrivacy: { shareName: true, shareEmail: true, shareLocation: true, consentBeyondTransaction: false },
                    communication: { preferredChannel: 'email', contactWindow: 'anytime', language: 'en', notifications: 'all' },
                    paymentDefaults: { preferredMethods: ['card'], currency: currency, instalmentsAcceptable: false },
                    deliveryLogistics: {
                        deliveryMethod: 'delivery',
                        speedPreference: existingSpeed || 'balanced',
                        packagingPreference: 'standard'
                    },
                    qualityDefaults: { conditionTolerance: 'new', brandExclusions: [], countryPreferences: [] }
                };
                localStorage.setItem('vendeeX_avatarPreferences', JSON.stringify(synthesised));
            }
        }

        // Continue writing old key defaults for backward compat during transition
        if (!localStorage.getItem('vendeeX_valueRanking')) {
            localStorage.setItem('vendeeX_valueRanking', JSON.stringify(['cost', 'quality', 'speed', 'ethics']));
        }
        if (!localStorage.getItem('vendeeX_prefFreeReturns')) {
            localStorage.setItem('vendeeX_prefFreeReturns', 'true');
        }
        if (!localStorage.getItem('vendeeX_prefDeliverySpeed')) {
            localStorage.setItem('vendeeX_prefDeliverySpeed', 'balanced');
        }
        if (!localStorage.getItem('vendeeX_prefSustainability')) {
            localStorage.setItem('vendeeX_prefSustainability', 'true');
        }
        if (!localStorage.getItem('vendeeX_prefSustainabilityWeight')) {
            localStorage.setItem('vendeeX_prefSustainabilityWeight', '3');
        }
        if (!localStorage.getItem('vendeeX_standingInstructions')) {
            localStorage.setItem('vendeeX_standingInstructions', '');
        }

        var locationParts = [];
        if (avatar.location) {
            if (avatar.location.townCity) locationParts.push(avatar.location.townCity);
            if (avatar.location.stateProvince) locationParts.push(avatar.location.stateProvince);
            if (avatar.location.country) locationParts.push(avatar.location.country);
        }
        localStorage.setItem('vendeeX_buyerLocationDisplay', locationParts.join(', '));

        if (avatar.location) {
            localStorage.setItem('vendeeX_buyerAddress', JSON.stringify({
                city: avatar.location.townCity || '',
                county: avatar.location.stateProvince || '',
                country: avatar.location.country || '',
                countryCode: (avatar.location.country || '').toUpperCase()
            }));
        }
    } else {
        // No avatar data found — redirect to registration
        // Only redirect if we're on a page that needs customer data (demo/checkout)
        var path = window.location.pathname;
        if (path.indexOf('demo.html') !== -1 || path.indexOf('checkout.html') !== -1) {
            window.location.href = path.indexOf('/pages/') !== -1 ? '../register.html' : 'register.html';
            return;
        }
    }
}

// Always initialise on load
initialiseDemoCustomer();
