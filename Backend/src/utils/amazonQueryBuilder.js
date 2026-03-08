// src/utils/amazonQueryBuilder.js
// ─────────────────────────────────────────────────────────────────
// Intelligent Amazon Query Builder
//
// Converts user intent → optimized Amazon API parameters:
//   • buildAmazonQuery  — category-specific keywords + browse node + search index
//   • filterAmazonResults   — reject products that don't match the expected category
//   • rankAmazonResults     — score results by text+category+brand relevance
//
// WHY THIS EXISTS:
//   Sending raw user input like "smart watches" to Amazon returns TVs and phones
//   because Amazon treats it as keyword soup. Sending "smartwatch" with the
//   Wearable Technology browse node (1350387031) returns only smartwatches.
// ─────────────────────────────────────────────────────────────────
'use strict';

// ── Category → base Amazon search keyword ──────────────────────────────────
// These replace raw user input for Amazon API calls. The user's brand/model
// is prepended separately so Amazon gets a clean, structured query.
const CATEGORY_BASE_KEYWORDS = {
  smartwatch:  'smartwatch',
  mobile:      'smartphone',
  laptop:      'laptop',
  headphones:  'headphones',
  televisions: 'smart tv',
  gaming:      'gaming accessories',
  camera:      'digital camera',
  footwear:    'footwear',
  skincare:    'skincare products',
  appliances:  'home appliances',
  books:       'books',
  fashion:     'clothing',
  tablets:     'tablet',
};

// Sub-type overrides — more specific than category base keyword
const SUBTYPE_BASE_KEYWORDS = {
  // appliances
  washing_machine:   'washing machine',
  refrigerator:      'refrigerator',
  air_conditioner:   'split air conditioner',
  microwave:         'microwave oven',
  air_fryer:         'air fryer',
  stove:             'gas stove',
  geyser:            'water heater geyser',
  water_purifier:    'ro water purifier',
  mixer_grinder:     'mixer grinder',
  vacuum_cleaner:    'vacuum cleaner',
  chimney:           'kitchen chimney',
  induction_cooktop: 'induction cooktop',
  pressure_cooker:   'pressure cooker',
  dishwasher:        'dishwasher',
  iron:              'steam iron',
  // headphones
  earphones:         'wireless earbuds',
  neckband:          'neckband bluetooth earphone',
  over_ear:          'over ear headphones',
  speaker:           'bluetooth speaker',
  soundbar:          'soundbar',
  // footwear
  running_shoes:     'running shoes',
  sneakers:          'sneakers',
  sandals:           'sandals',
  slippers:          'slippers',
  // skincare
  sunscreen:         'sunscreen spf',
  serum:             'face serum',
  moisturizer:       'face moisturizer',
  face_wash:         'face wash',
  toner:             'face toner',
  // camera
  dslr:              'dslr camera',
  mirrorless:        'mirrorless camera',
  webcam:            'webcam',
  action_camera:     'action camera',
  // gaming
  controller:        'gaming controller',
  console:           'gaming console',
};

// ── Category → Amazon Creators API browse node (India marketplace) ───────────
// Nodes lock the search to a specific Amazon category tree,
// dramatically reducing noise (e.g. "watch" → no more TV results)
const CATEGORY_BROWSE_NODES = {
  smartwatch:  '1350387031',  // Electronics > Wearable Technology
  mobile:      '1805560031',  // Electronics > Smartphones
  laptop:      '1375424031',  // Computers > Laptops
  headphones:  '1388921031',  // Electronics > Headphones
  televisions: '1389396031',  // Electronics > Televisions
  camera:      '1389175031',  // Electronics > Cameras
  tablets:     '1375508031',  // Computers > Tablets
  skincare:    '1355016031',  // Beauty > Skin Care
  footwear:    '1983518031',  // Shoes & Handbags
  // Gaming and appliances intentionally omitted:
  //   gaming:    broad "VideoGames" node misses PC peripherals
  //   appliances: browse node too broad — keyword search is more precise
};

// ── Category → PA-API v5 SearchIndex (legacy fallback path) ─────────────────
const CATEGORY_SEARCH_INDEX = {
  smartwatch:  'Electronics',
  mobile:      'Electronics',
  laptop:      'Computers',
  headphones:  'Electronics',
  televisions: 'Electronics',
  gaming:      'VideoGames',
  camera:      'Electronics',
  tablets:     'Computers',
  footwear:    'Shoes',
  skincare:    'Beauty',
  fashion:     'Apparel',
  books:       'Books',
  appliances:  'Kitchen',
};

// ── Category → title keywords that MUST appear in a valid product ─────────────
// If NONE of these terms appear in a product title, it's rejected as off-topic.
// Kept conservative — prefer slightly over-inclusive to avoid rejecting good products.
const CATEGORY_TITLE_TERMS = {
  smartwatch:  ['watch', 'band', 'tracker', 'fitness', 'wearable', 'smartwatch', 'fitbit'],
  mobile:      ['phone', 'mobile', 'smartphone', 'android', 'iphone', '5g'],
  laptop:      ['laptop', 'notebook', 'macbook', 'chromebook', 'ultrabook'],
  headphones:  ['headphone', 'earphone', 'earbud', 'speaker', 'neckband', 'headset', 'tws', 'soundbar', 'buds'],
  televisions: ['tv', 'television'],
  monitors:    ['monitor', 'display', 'led display'],
  gaming:      ['gaming', 'game', 'controller', 'gamepad', 'joystick', 'console', 'keyboard', 'mouse', 'headset', 'playstation', 'xbox'],
  camera:      ['camera', 'lens', 'dslr', 'mirrorless', 'webcam', 'gopro'],
  tablets:     ['tablet', 'ipad'],
  footwear:    ['shoe', 'sneaker', 'sandal', 'slipper', 'boot', 'chappal', 'footwear', 'trainer', 'loafer'],
  skincare:    ['serum', 'sunscreen', 'moisturizer', 'moisturiser', 'cleanser', 'face wash', 'toner', 'cream', 'spf', 'skin'],
  appliances:  [
    'washing machine', 'refrigerator', 'fridge', 'air conditioner', ' ac ', 'microwave',
    'air fryer', 'geyser', 'water heater', 'purifier', 'mixer', 'vacuum', 'oven',
    'chimney', 'stove', 'cooktop', 'dishwasher', 'iron', 'kettle', 'blender', 'cooler',
  ],
  books:       ['book', 'novel', 'edition', 'volume', 'paperback', 'hardcover'],
  fashion:     ['shirt', 't-shirt', 'tshirt', 'jeans', 'dress', 'kurta', 'jacket', 'trouser', 'saree', 'hoodie'],
};

// Noise words excluded from query relevance scoring (same as QUERY_STOP_WORDS in search.js)
const STOP_WORDS = new Set([
  'best', 'top', 'cheap', 'cheapest', 'affordable', 'good', 'great', 'latest',
  'new', 'popular', 'under', 'below', 'above', 'budget', 'premium', 'india',
  'buy', 'review', 'compare', 'vs', 'versus', 'for', 'the', 'and', 'in',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// buildAmazonQuery(intent, rawQuery) → { keywords, browseNode, searchIndex }
//
// Builds the optimal Amazon API parameters from classified intent.
// Always prefer category-specific keywords over raw user input
// so Amazon's index returns the right product type.
// ═══════════════════════════════════════════════════════════════════════════════
function buildAmazonQuery(intent, rawQuery) {
  const cat = intent?.category || null;
  const brand = intent?.brand || null;
  const subType = intent?.subType || null;
  const model = intent?.model || null;
  const priceMax = intent?.price_max || null;

  // ── Step 1: Determine base product keyword ─────────────────────
  let baseKeyword;
  if (subType && SUBTYPE_BASE_KEYWORDS[subType]) {
    // Sub-type is most specific: "washing machine", "earbuds", etc.
    baseKeyword = SUBTYPE_BASE_KEYWORDS[subType];
  } else if (cat && CATEGORY_BASE_KEYWORDS[cat]) {
    // Category base keyword: "smartwatch", "smartphone", etc.
    baseKeyword = CATEGORY_BASE_KEYWORDS[cat];
  } else {
    // Unknown category — clean up raw query (strip stop words + price)
    baseKeyword = rawQuery
      .toLowerCase()
      .replace(/\b\d+k\b/g, '')           // strip "40k", "30k"
      .replace(/\b\d{4,}\b/g, '')         // strip bare numbers like "40000"
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .slice(0, 5)
      .join(' ')
      .trim() || rawQuery;
  }

  // ── Step 2: Prepend brand if known (and not already in base) ────
  let keywords = baseKeyword;
  if (brand && !keywords.toLowerCase().includes(brand.toLowerCase())) {
    keywords = `${brand} ${keywords}`;
  }

  // ── Step 3: Append model if known (highly specific queries) ─────
  if (model && !keywords.toLowerCase().includes(model.toLowerCase())) {
    keywords = `${keywords} ${model}`;
  }

  // ── Step 4: Cap at 6 words — Amazon search quality falls off at 7+ ──
  keywords = keywords.trim().split(/\s+/).slice(0, 6).join(' ');

  // ── Step 5: Browse node + SearchIndex ───────────────────────────
  const browseNode = cat ? (CATEGORY_BROWSE_NODES[cat] || null) : null;
  const searchIndex = cat ? (CATEGORY_SEARCH_INDEX[cat] || 'All') : 'All';

  return { keywords, browseNode, searchIndex };
}

// ═══════════════════════════════════════════════════════════════════════════════
// filterAmazonResults(products, intent) → filtered products array
//
// Removes products that clearly don't belong to the expected category.
// Example: "smart watches" search → any TV/phone in Amazon results is rejected.
// Returns original array if <2 products pass (avoids a jarring empty result).
// ═══════════════════════════════════════════════════════════════════════════════
function filterAmazonResults(products, intent) {
  if (!products || products.length === 0) return products;
  const cat = intent?.category;
  if (!cat) return products; // no category intent → don't filter

  const validTerms = CATEGORY_TITLE_TERMS[cat];
  if (!validTerms || validTerms.length === 0) return products;

  const filtered = products.filter((p) => {
    const title = `${p.name || ''} ${p.brand || ''}`.toLowerCase();
    return validTerms.some((term) => title.includes(term));
  });

  // Safety: if filter removes everything (unexpected), fall back to original
  if (filtered.length === 0) {
    return products;
  }

  // If filter is too agressive and leaves < 2, keep original
  if (filtered.length < 2 && products.length >= 2) {
    return products;
  }

  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// rankAmazonResults(products, intent, rawQuery) → sorted products array
//
// Scores each product for relevance. Higher score = more relevant.
// Scoring:
//   +5 per query keyword found in title
//   +3 if title contains a category-canonical term
//   +2 exact brand match (brand field or title)
//   +0–2 rating bonus (rating * 0.4, max 2)
//   -2 penalty if title clearly belongs to a DIFFERENT category
// ═══════════════════════════════════════════════════════════════════════════════
function rankAmazonResults(products, intent, rawQuery) {
  if (!products || products.length === 0) return products;

  const cat = intent?.category;
  const brand = (intent?.brand || '').toLowerCase();

  // Extract meaningful words from raw query
  const queryWords = (rawQuery || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+k?$/.test(w));

  const catTerms = cat ? (CATEGORY_TITLE_TERMS[cat] || []) : [];

  // Build penalty terms — terms belonging to OTHER categories
  const penaltyTerms = Object.entries(CATEGORY_TITLE_TERMS)
    .filter(([c]) => c !== cat)
    .flatMap(([, terms]) => terms)
    // Only include terms that unambiguously identify the wrong category
    .filter((t) => t.length > 5 && !catTerms.includes(t));
  const penaltySet = new Set(penaltyTerms);

  const scored = products.map((p) => {
    const title = `${p.name || ''} ${p.brand || ''}`.toLowerCase();
    let score = 0;

    // Text match: each query word found in title adds 5 pts
    for (const word of queryWords) {
      if (title.includes(word)) score += 5;
    }

    // Category match: product title contains known category terms
    if (catTerms.some((t) => title.includes(t))) score += 3;

    // Brand match: exact brand name in product brand field or title
    if (brand) {
      const pBrand = (p.brand || '').toLowerCase();
      if (pBrand === brand || pBrand.includes(brand) || title.includes(brand)) score += 2;
    }

    // Rating bonus (up to 2 pts)
    if (p.rating) score += Math.min(p.rating * 0.4, 2);

    // Penalty: title clearly matches a different category
    if (penaltySet.has(title)) score -= 2; // light penalty (filter already handles hard exclusion)

    return { ...p, _relevanceScore: score };
  });

  // Sort descending by score, preserve original order on tie
  scored.sort((a, b) => b._relevanceScore - a._relevanceScore);
  return scored;
}

module.exports = {
  buildAmazonQuery,
  filterAmazonResults,
  rankAmazonResults,
  CATEGORY_BROWSE_NODES,
  CATEGORY_SEARCH_INDEX,
  CATEGORY_TITLE_TERMS,
};
