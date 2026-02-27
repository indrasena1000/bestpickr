// src/utils/categoryKeyMap.js
// Maps any category keyword → canonical Redis key (top50:{category})
// Single source of truth — used by searchIntentService, relatedProductService,
// fallbackService, and rankingSnapshotCron.
'use strict'

// Canonical categories — these MUST match cron snapshot keys exactly
const CANONICAL_CATEGORIES = [
  'mobile',
  'laptop',
  'headphones',
  'tablets',
  'smartwatch',
  'camera',
  'gaming',
  'appliances',
  'footwear',
  'skincare',
  'fashion',
  'books',
]

// Any keyword → canonical category slug
const KEYWORD_TO_CATEGORY = {
  // Mobile
  mobile:       'mobile',
  phone:        'mobile',
  phones:       'mobile',
  smartphone:   'mobile',
  smartphones:  'mobile',
  iphone:       'mobile',
  android:      'mobile',
  redmi:        'mobile',
  realme:       'mobile',
  oneplus:      'mobile',
  vivo:         'mobile',
  oppo:         'mobile',
  pixel:        'mobile',

  // Laptop
  laptop:       'laptop',
  laptops:      'laptop',
  macbook:      'laptop',
  notebook:     'laptop',
  notebooks:    'laptop',
  chromebook:   'laptop',
  ultrabook:    'laptop',

  // Headphones / Audio
  headphone:    'headphones',
  headphones:   'headphones',
  earphone:     'headphones',
  earphones:    'headphones',
  earbuds:      'headphones',
  earbud:       'headphones',
  headset:      'headphones',
  tws:          'headphones',
  neckband:     'headphones',
  airpods:      'headphones',
  speaker:      'headphones',
  audio:        'headphones',

  // Tablets
  tablet:       'tablets',
  tablets:      'tablets',
  ipad:         'tablets',

  // Smartwatch
  smartwatch:   'smartwatch',
  smartwatches: 'smartwatch',
  watch:        'smartwatch',
  fitnessband:  'smartwatch',
  fitbit:       'smartwatch',

  // Camera
  camera:       'camera',
  cameras:      'camera',
  dslr:         'camera',
  mirrorless:   'camera',
  gopro:        'camera',
  webcam:       'camera',
  lens:         'camera',

  // Gaming
  gaming:       'gaming',
  game:         'gaming',
  gamer:        'gaming',
  controller:   'gaming',
  gamepad:      'gaming',
  console:      'gaming',
  playstation:  'gaming',
  xbox:         'gaming',
  ps5:          'gaming',
  ps4:          'gaming',
  nintendo:     'gaming',

  // Appliances
  appliance:        'appliances',
  appliances:       'appliances',
  mixer:            'appliances',
  grinder:          'appliances',
  microwave:        'appliances',
  oven:             'appliances',
  toaster:          'appliances',
  blender:          'appliances',
  juicer:           'appliances',
  'washing machine':'appliances',
  fridge:           'appliances',
  refrigerator:     'appliances',
  'air conditioner':'appliances',
  vacuum:           'appliances',
  cooker:           'appliances',
  induction:        'appliances',
  purifier:         'appliances',

  // Footwear
  footwear:   'footwear',
  shoe:       'footwear',
  shoes:      'footwear',
  sneaker:    'footwear',
  sneakers:   'footwear',
  sandal:     'footwear',
  slipper:    'footwear',
  boot:       'footwear',
  boots:      'footwear',
  trainer:    'footwear',
  trainers:   'footwear',
  clogs:      'footwear',
  loafer:     'footwear',

  // Skincare / Beauty
  skincare:    'skincare',
  serum:       'skincare',
  sunscreen:   'skincare',
  moisturizer: 'skincare',
  cleanser:    'skincare',
  'face wash': 'skincare',
  toner:       'skincare',
  spf:         'skincare',
  cosmetic:    'skincare',
  beauty:      'skincare',

  // Fashion
  fashion:    'fashion',
  clothing:   'fashion',
  clothes:    'fashion',
  apparel:    'fashion',
  shirt:      'fashion',
  tshirt:     'fashion',
  jeans:      'fashion',
  kurta:      'fashion',
  dress:      'fashion',
  jacket:     'fashion',
  hoodie:     'fashion',
  trouser:    'fashion',
  saree:      'fashion',

  // Books
  book:       'books',
  books:      'books',
  novel:      'books',
  textbook:   'books',
  fiction:    'books',
}

/**
 * Resolve any keyword to a Redis top50 key.
 * @param {string} keyword
 * @returns {string|null} e.g. "top50:mobile" or null if unknown
 */
function getRedisKey(keyword) {
  if (!keyword) return null
  const slug = KEYWORD_TO_CATEGORY[keyword.toLowerCase().trim()]
  return slug ? `top50:${slug}` : null
}

/**
 * Resolve to the canonical category slug only.
 * @param {string} keyword
 * @returns {string|null}
 */
function getCategory(keyword) {
  if (!keyword) return null
  return KEYWORD_TO_CATEGORY[keyword.toLowerCase().trim()] || null
}

module.exports = { KEYWORD_TO_CATEGORY, CANONICAL_CATEGORIES, getRedisKey, getCategory }
