// src/utils/categoryKeyMap.js
// Maps any category keyword → canonical Redis key (top50:{category})
// Single source of truth — used by searchIntentService, relatedProductService,
// fallbackService, and rankingSnapshotCron.
"use strict";

// Canonical categories — these MUST match cron snapshot keys exactly
const CANONICAL_CATEGORIES = [
  "mobile",
  "laptop",
  "headphones",
  "smartwatch",
  "camera",
  "televisions",
  "gaming",
  "appliances",
  "footwear",
  "skincare",
  "fashion",
  "bags",
  "books",
];

// Any keyword → canonical category slug
const KEYWORD_TO_CATEGORY = {
  // Mobile
  mobile: "mobile",
  phone: "mobile",
  phones: "mobile",
  smartphone: "mobile",
  smartphones: "mobile",
  iphone: "mobile",
  android: "mobile",
  redmi: "mobile",
  realme: "mobile",
  oneplus: "mobile",
  vivo: "mobile",
  oppo: "mobile",
  pixel: "mobile",

  // Laptop
  laptop: "laptop",
  laptops: "laptop",
  macbook: "laptop",
  notebook: "laptop",
  notebooks: "laptop",
  chromebook: "laptop",
  ultrabook: "laptop",

  // Headphones / Audio
  headphone: "headphones",
  headphones: "headphones",
  earphone: "headphones",
  earphones: "headphones",
  earbuds: "headphones",
  earbud: "headphones",
  headset: "headphones",
  tws: "headphones",
  neckband: "headphones",
  airpods: "headphones",
  speaker: "headphones",
  speakers: "headphones",
  audio: "headphones",
  buds: "headphones",
  soundbar: "headphones", // soundbars are filed under headphones/audio category
  soundbars: "headphones",
  woofer: "headphones",
  "sound bar": "headphones",

  // Tablets
  tablet: "tablets",
  tablets: "tablets",
  ipad: "tablets",

  // Smartwatch
  smartwatch: "smartwatch",
  smartwatches: "smartwatch",
  watch: "smartwatch",
  fitnessband: "smartwatch",
  fitbit: "smartwatch",

  // Camera
  camera: "camera",
  cameras: "camera",
  dslr: "camera",
  mirrorless: "camera",
  gopro: "camera",
  webcam: "camera",
  lens: "camera",

  // Televisions
  tv: "televisions",
  tvs: "televisions",
  television: "televisions",
  televisions: "televisions",
  "smart tv": "televisions",
  smarttv: "televisions",
  qled: "televisions",
  oled: "televisions",
  "led tv": "televisions",
  "lcd tv": "televisions",
  "4k tv": "televisions",
  bravia: "televisions",

  // Televisions
  televisions: {
    smart_tv_budget: "best smart tv under 20000 india",
    smart_tv_mid: "best smart tv 43 inch india",
    smart_tv_premium: "best 4k smart tv 55 inch india",
    oled_tv: "best oled tv india",
  },

  // Gaming + Computer Peripherals
  gaming: "gaming",
  game: "gaming",
  gamer: "gaming",
  controller: "gaming",
  gamepad: "gaming",
  console: "gaming",
  playstation: "gaming",
  xbox: "gaming",
  ps5: "gaming",
  ps4: "gaming",
  nintendo: "gaming",
  keyboard: "gaming",
  keyboards: "gaming",
  mouse: "gaming",
  mice: "gaming",
  monitor: "gaming",
  monitors: "gaming",
  mousepad: "gaming",

  // Appliances
  appliance: "appliances",
  appliances: "appliances",
  mixer: "appliances",
  grinder: "appliances",
  microwave: "appliances",
  oven: "appliances",
  toaster: "appliances",
  blender: "appliances",
  juicer: "appliances",
  "washing machine": "appliances",
  "air fryer": "appliances",
  washing: "appliances",
  washer: "appliances",
  machine: "appliances",
  fridge: "appliances",
  refrigerator: "appliances",
  "air conditioner": "appliances",
  conditioner: "appliances",
  vacuum: "appliances",
  cooker: "appliances",
  induction: "appliances",
  purifier: "appliances",
  dishwasher: "appliances",
  dryer: "appliances",
  geyser: "appliances",
  geysers: "appliances",
  heater: "appliances",
  kettle: "appliances",
  fryer: "appliances",
  chimney: "appliances",
  iron: "appliances",
  inverter: "appliances",
  ac: "appliances",
  // "ton" is the capacity unit for ACs (1 ton, 1.5 ton, 2 ton) — always → appliances
  ton: "appliances",
  stove: "appliances",
  cooktop: "appliances",
  geyser: "appliances",
  robovac: "appliances",

  // Footwear
  footwear: "footwear",
  shoe: "footwear",
  shoes: "footwear",
  sneaker: "footwear",
  sneakers: "footwear",
  sandal: "footwear",
  sandals: "footwear",
  slipper: "footwear",
  slippers: "footwear",
  boot: "footwear",
  boots: "footwear",
  trainer: "footwear",
  trainers: "footwear",
  clogs: "footwear",
  loafer: "footwear",
  loafers: "footwear",
  chappal: "footwear",
  chappals: "footwear",

  // Skincare / Beauty
  skincare: "skincare",
  serum: "skincare",
  sunscreen: "skincare",
  moisturizer: "skincare",
  cleanser: "skincare",
  "face wash": "skincare",
  facewash: "skincare",
  toner: "skincare",
  spf: "skincare",
  cosmetic: "skincare",
  beauty: "skincare",
  lotion: "skincare",
  cream: "skincare",
  scrub: "skincare",
  mask: "skincare",

  // Fashion
  fashion: "fashion",
  clothing: "fashion",
  clothes: "fashion",
  apparel: "fashion",
  shirt: "fashion",
  tshirt: "fashion",
  jeans: "fashion",
  kurta: "fashion",
  dress: "fashion",
  jacket: "fashion",
  hoodie: "fashion",
  trouser: "fashion",
  saree: "fashion",

  // Books
  book: "books",
  books: "books",
  novel: "books",
  textbook: "books",
  fiction: "books",

  // Bags & Luggage
  bag: "bags",
  bags: "bags",
  luggage: "bags",
  backpack: "bags",
  backpacks: "bags",
  handbag: "bags",
  handbags: "bags",
  purse: "bags",
  suitcase: "bags",
  suitcases: "bags",
  trolley: "bags",
  trolleys: "bags",
  tote: "bags",
  satchel: "bags",
  duffel: "bags",
  duffle: "bags",
  clutch: "bags",
  briefcase: "bags",
  messenger: "bags",
  schoolbag: "bags",
  laptop_bag: "bags",
  travel_bag: "bags",
};

/**
 * Resolve any keyword to a Redis top50 key.
 * @param {string} keyword
 * @returns {string|null} e.g. "top50:mobile" or null if unknown
 */
function getRedisKey(keyword) {
  if (!keyword) return null;
  const slug = KEYWORD_TO_CATEGORY[keyword.toLowerCase().trim()];
  return slug ? `top50:${slug}` : null;
}

/**
 * Resolve to the canonical category slug only.
 * @param {string} keyword
 * @returns {string|null}
 */
function getCategory(keyword) {
  if (!keyword) return null;
  return KEYWORD_TO_CATEGORY[keyword.toLowerCase().trim()] || null;
}

// ─────────────────────────────────────────────────────────────────
// SUB-TYPE SYSTEM
// Resolves specific product types within broad categories.
// e.g. "washing machine" → subType='washing_machine' within 'appliances'
//
// Why: top50:appliances mixes 15 sub-types. A user searching "washing machine"
// should see only washing machines, not fridges, stoves, and ACs.
// Sub-type pools (top50:appliances:washing_machine) are seeded by the 1 AM
// cron and served free all day — 0 Amazon calls per search.
// ─────────────────────────────────────────────────────────────────

// Amazon search queries for each sub-type — used by 1 AM cron only
// Designed to return the best Indian market results for that sub-type
const SUBTYPE_AMAZON_QUERIES = {
  appliances: {
    washing_machine: "best washing machine india",
    refrigerator: "best refrigerator india",
    air_conditioner: "best split air conditioner india",
    microwave: "best microwave oven india",
    air_fryer: "best air fryer india",
    stove: "best gas stove 4 burner india",
    geyser: "best geyser water heater india",
    water_purifier: "best ro water purifier india",
    mixer_grinder: "best mixer grinder india",
    vacuum_cleaner: "best vacuum cleaner india",
    tv: "best smart tv 43 inch india",
    chimney: "best kitchen chimney auto clean india",
    induction_cooktop: "best induction cooktop india",
    pressure_cooker: "best electric pressure cooker india",
    dishwasher: "best dishwasher india",
    iron: "best steam iron india",
  },
  headphones: {
    earphones: "best wireless earbuds tws india",
    neckband: "best neckband earphones bluetooth india",
    over_ear: "best over ear headphones india",
    speaker: "best bluetooth speaker portable india",
    soundbar: "best soundbar for tv india",
  },
  mobile: {
    smartphone: "best smartphone india 2025",
  },
  laptop: {
    laptop: "best laptop india 2025",
  },
  tablets: {
    tablet: "best tablet india 2025",
  },
  smartwatch: {
    smartwatch: "best smartwatch india 2025",
  },
  camera: {
    dslr: "best dslr camera india",
    mirrorless: "best mirrorless camera india",
    action_camera: "best action camera india",
    webcam: "best webcam india",
  },
  gaming: {
    controller: "best gaming controller india",
    console: "best gaming console india",
  },
  footwear: {
    running_shoes: "best running shoes india",
    sneakers: "best casual sneakers india",
    sandals: "best sandals india",
    slippers: "best slippers india",
  },
  skincare: {
    sunscreen: "best sunscreen spf50 india",
    serum: "best vitamin c serum india",
    moisturizer: "best face moisturizer india",
    face_wash: "best face wash india",
    toner: "best face toner india",
  },
  books: {
    books: "bestseller books india",
  },
  fashion: {
    tshirt: "best casual t-shirt men india",
  },
  bags: {
    backpack: "best backpack india",
    luggage: "best trolley luggage india",
    handbag: "best women handbag india",
  },
};

// Keywords to filter a broad category pool down to a specific sub-type.
// Used when sub-type Redis pool is empty — filters top50:{category} in-memory.
// Sorted by specificity (most specific first to avoid false matches).
const SUBTYPE_FILTER_KEYWORDS = {
  // televisions
  smart_tv_budget: ["smart tv", "led tv", "android tv", "fire tv", "google tv"],
  smart_tv_mid: ["smart tv", "43 inch", "40 inch", "full hd"],
  smart_tv_premium: ["4k", "qled", "oled", "55 inch", "65 inch", "uhd"],
  oled_tv: ["oled"],
  // appliances
  washing_machine: [
    "washing machine",
    "front load",
    "top load",
    "washer",
    "fully automatic",
    "semi automatic",
  ],
  refrigerator: [
    "refrigerator",
    "fridge",
    "double door",
    "single door",
    "side by side",
    "frost free",
  ],
  air_conditioner: [
    "air conditioner",
    "split ac",
    "window ac",
    "inverter ac",
    "ton ac",
  ],
  microwave: ["microwave", "microwave oven", "convection", "solo microwave"],
  air_fryer: ["air fryer", "airfryer", "digital air fryer"],
  stove: ["gas stove", "stove", "cooktop", "burner stove", "glass top"],
  geyser: ["geyser", "water heater", "instant geyser", "storage geyser"],
  water_purifier: [
    "water purifier",
    "ro purifier",
    "uv purifier",
    "ro uv purifier",
  ],
  mixer_grinder: ["mixer grinder", "mixer", "wet grinder", "juicer mixer"],
  vacuum_cleaner: [
    "vacuum cleaner",
    "robot vacuum",
    "robovac",
    "wet dry vacuum",
  ],
  tv: [
    "smart tv",
    "television",
    "qled",
    "oled",
    "4k tv",
    "led tv",
    "android tv",
  ],
  chimney: ["chimney", "kitchen chimney", "auto clean chimney"],
  induction_cooktop: [
    "induction cooktop",
    "induction stove",
    "induction cooker",
  ],
  pressure_cooker: ["pressure cooker", "electric cooker", "instant pot"],
  dishwasher: ["dishwasher"],
  iron: ["steam iron", "dry iron", "clothes iron"],
  // headphones
  earphones: ["earbuds", "tws", "true wireless", "earphone", "in-ear"],
  neckband: ["neckband"],
  over_ear: ["over-ear", "over ear", "on-ear", "headphone", "headset"],
  speaker: ["bluetooth speaker", "portable speaker", "wireless speaker"],
  soundbar: ["soundbar", "sound bar"],
  // footwear
  running_shoes: ["running shoe", "running", "sport shoe", "athletic"],
  sneakers: ["sneaker", "casual shoe", "trainer"],
  sandals: ["sandal", "flip flop", "open toe"],
  slippers: ["slipper", "chappal", "indoor"],
  // skincare
  sunscreen: ["sunscreen", "spf", "sun block", "sun protection"],
  serum: ["serum", "face serum", "vitamin c"],
  moisturizer: ["moisturizer", "moisturiser", "face cream"],
  face_wash: ["face wash", "facewash", "cleanser", "foaming wash"],
  toner: ["toner", "face toner"],
  // camera
  dslr: ["dslr"],
  mirrorless: ["mirrorless"],
  webcam: ["webcam"],
  action_camera: ["action camera", "gopro"],
  // gaming
  controller: ["controller", "gamepad", "joystick"],
  console: ["console", "playstation", "xbox", "nintendo"],
  // general
  smartphone: ["smartphone", "android phone", "iphone", "5g phone"],
  laptop: ["laptop", "notebook", "macbook", "chromebook"],
  tablet: ["tablet", "ipad", "android tablet"],
  smartwatch: ["smartwatch", "smart watch", "fitness band"],
  // bags
  backpack: ["backpack", "rucksack", "school bag", "laptop bag"],
  luggage: ["luggage", "trolley", "suitcase", "travel bag"],
  handbag: ["handbag", "purse", "tote", "clutch", "satchel"],
};

// Flat list of all sub-types — used by 1 AM cron to iterate
const CANONICAL_SUBTYPES = Object.entries(SUBTYPE_AMAZON_QUERIES).flatMap(
  ([category, subtypes]) =>
    Object.entries(subtypes).map(([subType, searchQuery]) => ({
      category,
      subType,
      searchQuery,
    })),
);

module.exports = {
  KEYWORD_TO_CATEGORY,
  CANONICAL_CATEGORIES,
  SUBTYPE_AMAZON_QUERIES,
  SUBTYPE_FILTER_KEYWORDS,
  CANONICAL_SUBTYPES,
  getRedisKey,
  getCategory,
};
