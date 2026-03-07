/**
 * VendeeX — MerchantData (server-side)
 * Server-side port of js/merchant-data.js.
 * Structured so it can later be replaced with live ACP/UCP data.
 *
 * VERIFICATION REQUIRED before merge.
 * Layer: Data Access Layer (read-only reference data, no persistence calls).
 */

'use strict';

const MERCHANTS = {
  gymshark: {
    id: 'gymshark',
    name: 'Gymshark',
    categories: ['Activewear', 'Fitness', 'Apparel'],
    catalogueSize: 1247,
    rating: 4.8,
    reviewCount: 125000,
    terms: {
      freeReturns: true,
      returnWindow: '30 days',
      restockingFee: 0,
      maxDeliveryDays: 5,
      freeShippingThreshold: 50,
      shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'],
      warranty: '6 months manufacturing defects',
      paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay']
    },
    sustainability: { certified: true, credentials: ['Recycled materials program', 'Carbon neutral shipping'], score: 'B+' }
  },
  allbirds: {
    id: 'allbirds', name: 'Allbirds',
    categories: ['Footwear', 'Sustainable', 'Apparel'],
    catalogueSize: 847, rating: 4.7, reviewCount: 89000,
    terms: { freeReturns: true, returnWindow: '30 days', restockingFee: 0, maxDeliveryDays: 7, freeShippingThreshold: 75, shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'], warranty: '1 year limited warranty', paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay', 'Google Pay'] },
    sustainability: { certified: true, credentials: ['B Corp Certified', 'Carbon neutral', 'Sustainable materials'], score: 'A' }
  },
  glossier: {
    id: 'glossier', name: 'Glossier',
    categories: ['Beauty', 'Skincare', 'Makeup'],
    catalogueSize: 432, rating: 4.6, reviewCount: 156000,
    terms: { freeReturns: true, returnWindow: '30 days', restockingFee: 0, maxDeliveryDays: 5, freeShippingThreshold: 30, shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'], warranty: 'Satisfaction guarantee', paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay'] },
    sustainability: { certified: true, credentials: ['Cruelty-free', 'Recyclable packaging'], score: 'B' }
  },
  'kylie-cosmetics': {
    id: 'kylie-cosmetics', name: 'Kylie Cosmetics',
    categories: ['Beauty', 'Cosmetics', 'Skincare'],
    catalogueSize: 318, rating: 4.2, reviewCount: 78000,
    terms: { freeReturns: false, returnWindow: '14 days', restockingFee: 7.95, maxDeliveryDays: 10, freeShippingThreshold: 40, shippingMethods: ['Standard (5-10 days)', 'Express (3-5 days)'], warranty: 'None', paymentMethods: ['Visa', 'Mastercard', 'PayPal'] },
    sustainability: { certified: false, credentials: [], score: 'C' }
  },
  away: {
    id: 'away', name: 'Away',
    categories: ['Travel', 'Luggage', 'Accessories'],
    catalogueSize: 156, rating: 4.7, reviewCount: 45000,
    terms: { freeReturns: true, returnWindow: '100 days', restockingFee: 0, maxDeliveryDays: 5, freeShippingThreshold: 0, shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'], warranty: 'Limited lifetime warranty', paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay'] },
    sustainability: { certified: true, credentials: ['Recycled polycarbonate shells', 'Carbon offset shipping'], score: 'B+' }
  },
  brooklinen: {
    id: 'brooklinen', name: 'Brooklinen',
    categories: ['Home', 'Bedding', 'Bath'],
    catalogueSize: 523, rating: 4.8, reviewCount: 67000,
    terms: { freeReturns: true, returnWindow: '365 days', restockingFee: 0, maxDeliveryDays: 7, freeShippingThreshold: 50, shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'], warranty: '1 year quality guarantee', paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay'] },
    sustainability: { certified: true, credentials: ['OEKO-TEX certified', 'Responsible sourcing'], score: 'B+' }
  },
  casper: {
    id: 'casper', name: 'Casper',
    categories: ['Home', 'Sleep', 'Mattresses'],
    catalogueSize: 287, rating: 4.6, reviewCount: 92000,
    terms: { freeReturns: true, returnWindow: '100 nights', restockingFee: 0, maxDeliveryDays: 7, freeShippingThreshold: 0, shippingMethods: ['Standard (5-7 days)'], warranty: '10 year limited warranty', paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Affirm'] },
    sustainability: { certified: true, credentials: ['CertiPUR-US certified foams', 'Recyclable mattress program'], score: 'B' }
  },
  'warby-parker': {
    id: 'warby-parker', name: 'Warby Parker',
    categories: ['Eyewear', 'Fashion', 'Accessories'],
    catalogueSize: 634, rating: 4.7, reviewCount: 134000,
    terms: { freeReturns: true, returnWindow: '30 days', restockingFee: 0, maxDeliveryDays: 5, freeShippingThreshold: 0, shippingMethods: ['Standard (3-5 days)', 'Express (1-2 days)'], warranty: '1 year scratch-free guarantee', paymentMethods: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'FSA/HSA'] },
    sustainability: { certified: true, credentials: ['Buy a Pair, Give a Pair program', 'Carbon neutral operations'], score: 'A-' }
  },
  everlane: {
    id: 'everlane', name: 'Everlane',
    categories: ['Fashion', 'Sustainable', 'Basics'],
    catalogueSize: 912, rating: 4.5, reviewCount: 78000,
    terms: { freeReturns: true, returnWindow: '30 days', restockingFee: 0, maxDeliveryDays: 7, freeShippingThreshold: 75, shippingMethods: ['Standard (5-7 days)', 'Express (2-3 days)'], warranty: '1 year quality guarantee', paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay'] },
    sustainability: { certified: true, credentials: ['Radical Transparency', 'Ethical factories', 'Organic cotton'], score: 'A' }
  }
};

const MERCHANT_KEYWORDS = {
  gymshark: ['workout','gym','fitness','training','legging','sport','athletic','activewear','running','exercise'],
  allbirds: ['shoe','shoes','sneaker','runner','running','footwear','walk','sustainable'],
  glossier: ['beauty','skincare','makeup','skin','moistur','serum','cleanser'],
  'kylie-cosmetics': ['lip','cosmetic','makeup','beauty','foundation','concealer'],
  away: ['luggage','suitcase','travel','bag','carry-on','trip'],
  brooklinen: ['bedding','sheet','pillow','towel','duvet','bed','bath','linen','bedroom'],
  casper: ['mattress','sleep','pillow','bed','foam','bedroom'],
  'warby-parker': ['glasses','eyewear','sunglasses','frame','optical','lens'],
  everlane: ['basics','tee','t-shirt','jeans','denim','sustainable','wardrobe','clothing','fashion','outfit']
};

const RELEVANCE_THRESHOLD = 3;
const MAX_RELEVANT_MERCHANTS = 5;

function getMerchant(id) { return MERCHANTS[id] || null; }
function getAllMerchants() { return Object.values(MERCHANTS); }

function findMerchantByBrand(brandName) {
  if (!brandName) return null;
  const lower = brandName.toLowerCase().trim();
  const all = getAllMerchants();
  const direct = all.find(m => m.name.toLowerCase() === lower);
  if (direct) return direct;
  if (MERCHANTS[lower]) return MERCHANTS[lower];
  return all.find(m => { const n = m.name.toLowerCase(); return lower.includes(n) || n.includes(lower); }) || null;
}

function selectMerchantsForQuery(query) {
  const lq = query.toLowerCase();
  const scored = getAllMerchants().map(m => {
    let score = 0;
    if (lq.includes(m.name.toLowerCase())) score += 10;
    m.categories.map(c => c.toLowerCase()).forEach(c => { if (lq.includes(c)) score += 5; });
    (MERCHANT_KEYWORDS[m.id] || []).forEach(kw => { if (lq.includes(kw)) score += 3; });
    return { merchant: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  let relevant = [], skipped = [];
  scored.forEach(s => { if (s.score >= RELEVANCE_THRESHOLD) relevant.push(s.merchant); else skipped.push({ merchant: s.merchant, reason: 'No matching product categories' }); });
  if (relevant.length > MAX_RELEVANT_MERCHANTS) relevant = relevant.slice(0, MAX_RELEVANT_MERCHANTS);
  return { relevant, skipped };
}

module.exports = { getMerchant, getAllMerchants, findMerchantByBrand, selectMerchantsForQuery };
