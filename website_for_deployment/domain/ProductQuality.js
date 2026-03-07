/**
 * Domain: Product quality and query-relevance rules.
 * No I/O — pure functions.
 */

/**
 * Product-type nouns. If any of these appear in a search query, the product text
 * must contain at least one of them or the relevance score is zeroed.
 *
 * This prevents cross-category pollution (e.g. searching "patent leather shoes"
 * should not surface pants that happen to contain the words "patent" and "leather").
 *
 * Extend this list as new product categories are added to the platform.
 */
const PRODUCT_NOUNS = new Set([
  // footwear
  'shoes', 'shoe', 'sneakers', 'sneaker', 'boots', 'boot', 'heels', 'heel',
  'loafers', 'loafer', 'sandals', 'sandal', 'flats', 'flat', 'mules', 'mule',
  'trainers', 'trainer', 'pumps', 'pump', 'clogs', 'clog', 'slides', 'slide',
  'oxfords', 'oxford', 'derbies', 'derby', 'stilettos', 'stiletto',
  // legwear / bottoms
  'pants', 'trousers', 'jeans', 'shorts', 'skirt', 'skirts', 'leggings',
  'joggers', 'chinos', 'shorts', 'culottes',
  // tops
  'shirt', 'shirts', 'blouse', 'blouses', 'top', 'tops', 'tee', 'tees',
  't-shirt', 't-shirts', 'jumper', 'jumpers', 'sweater', 'sweaters',
  'hoodie', 'hoodies', 'sweatshirt', 'sweatshirts', 'cardigan', 'cardigans',
  'polo', 'polos', 'tank', 'tanks', 'vest', 'vests',
  // outerwear
  'jacket', 'jackets', 'coat', 'coats', 'blazer', 'blazers', 'parka', 'parkas',
  'anorak', 'anoraks', 'trench',
  // dresses / full garments
  'dress', 'dresses', 'jumpsuit', 'jumpsuits', 'romper', 'rompers',
  'suit', 'suits', 'overalls',
  // bags / accessories
  'bag', 'bags', 'handbag', 'handbags', 'backpack', 'backpacks', 'tote', 'totes',
  'clutch', 'wallet', 'wallets', 'purse', 'purses', 'satchel', 'satchels',
  'luggage', 'suitcase', 'suitcases', 'duffle',
  // eyewear
  'glasses', 'sunglasses', 'frames', 'eyewear', 'goggles',
  // accessories
  'belt', 'belts', 'scarf', 'scarves', 'hat', 'hats', 'cap', 'caps',
  'gloves', 'socks', 'underwear', 'bra', 'bras',
  // skincare / beauty
  'moisturiser', 'moisturizer', 'serum', 'serums', 'cleanser', 'cleansers',
  'toner', 'toners', 'sunscreen', 'foundation', 'lipstick', 'mascara',
  'blush', 'eyeshadow', 'concealer', 'primer', 'highlighter', 'bronzer',
  'perfume', 'fragrance', 'cologne',
  // bedding / home
  'mattress', 'mattresses', 'pillow', 'pillows', 'sheets', 'duvet', 'duvets',
  'blanket', 'blankets', 'towel', 'towels', 'rug', 'rugs',
  // furniture
  'chair', 'chairs', 'desk', 'desks', 'table', 'tables',
  'sofa', 'sofas', 'couch', 'couches', 'shelf', 'shelves', 'dresser',
  // electronics
  'phone', 'phones', 'laptop', 'laptops', 'headphones', 'earbuds',
  'speaker', 'speakers', 'watch', 'watches', 'tablet', 'tablets',
  'keyboard', 'keyboards', 'monitor', 'monitors',
  // activewear
  'leggings', 'shorts', 'sports bra', 'joggers', 'tracksuit',
]);

function isQualifiedProduct(product) {
  if (!product) return false;
  const price = typeof product.price === 'number' ? product.price : parseFloat(product.price);
  if (!price || price <= 0) return false;
  if (!product.imageUrl || !product.imageUrl.startsWith('http')) return false;
  if (product.availability === 'OutOfStock') return false;
  return true;
}

/**
 * Compute a 0–100 relevance score for a product against a search query.
 *
 * Scoring model:
 *   1. Extract meaningful query terms (strip noise words).
 *   2. ANCHOR CHECK: if any query term is a known product-type noun, at least one
 *      must appear in the product text. Failure → score 0.
 *      This eliminates cross-category false positives (e.g. pants returned for
 *      a "patent leather shoes" query because "patent" and "leather" matched).
 *   3. Term match rate → base score (0–80).
 *   4. Exact phrase or adjacent-term bonus (0–20).
 */
function computeQueryRelevance(product, query) {
  if (!product || !query) return 0;

  const noiseWords = new Set([
    'the', 'a', 'an', 'for', 'and', 'or', 'in', 'on', 'at', 'to', 'of',
    'with', 'under', 'over', 'best', 'top', 'good', 'cheap', 'buy', 'new',
  ]);

  const queryTerms = query.toLowerCase().split(/\s+/)
    .filter(w => w.length > 1 && !noiseWords.has(w));

  if (queryTerms.length === 0) return 100;

  const productText = [
    product.name  || product.title || '',
    product.category || '',
    (product.categories || []).join(' '),
    product.brand || '',
    (product.description || '').substring(0, 200),
  ].join(' ').toLowerCase();

  // ── Anchor check ───────────────────────────────────────────────────────────
  // Identify query terms that are known product-type nouns.
  const anchorTerms = queryTerms.filter(t => PRODUCT_NOUNS.has(t));

  if (anchorTerms.length > 0) {
    const anchorMatched = anchorTerms.some(t => productText.includes(t));
    if (!anchorMatched) {
      // None of the product-type nouns in the query appear in this product.
      // Hard zero — this product is the wrong category.
      return 0;
    }
  }

  // ── Term match scoring ─────────────────────────────────────────────────────
  let matchedTerms = 0;
  queryTerms.forEach(term => {
    if (productText.includes(term)) matchedTerms++;
  });

  let exactPhraseBonus = 0;
  if (queryTerms.length > 1) {
    const phrase = queryTerms.join(' ');
    if (productText.includes(phrase)) {
      exactPhraseBonus = 20;
    } else {
      for (let i = 0; i < queryTerms.length - 1; i++) {
        if (productText.includes(queryTerms[i]) && productText.includes(queryTerms[i + 1])) {
          exactPhraseBonus = Math.max(exactPhraseBonus, 10);
        }
      }
    }
  }

  const termMatchRate = matchedTerms / queryTerms.length;
  const baseScore = Math.round(termMatchRate * 80) + exactPhraseBonus;
  return Math.min(100, Math.max(0, baseScore));
}

function filterByQueryRelevance(products, query, minRelevance = 20) {
  if (!products || products.length === 0) return [];
  if (!query) return products;

  return products.filter(product => {
    const relevance = computeQueryRelevance(product, query);
    product.queryRelevance = relevance;
    if (product.matchScore && relevance < 30) {
      product.matchScore = Math.min(product.matchScore, relevance + 20);
    }
    return relevance >= minRelevance;
  });
}

module.exports = { isQualifiedProduct, computeQueryRelevance, filterByQueryRelevance };
