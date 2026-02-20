// config/categoryAspects.js — Category Configuration for AI Analysis
// ─────────────────────────────────────────────────────────────────
// Central config for the bestpickr AI review analysis pipeline.
// Used by GPT-4o-mini to know WHAT to analyze in reviews per category.
//
// USAGE:
//   const { CATEGORY_ASPECTS } = require('../config/categoryAspects');
//   const config = CATEGORY_ASPECTS['smartphones'];
//   // → config.aspects = ['camera quality', 'battery life', ...]
//   // → config.priceRanges = [{ label: 'Budget', ... }, ...]
//   // → config.topBrands = ['Samsung', 'Apple', ...]
//   // → config.searchKeywords = ['best phone under 15000', ...]
//
// ARCHITECTURE:
//   aspects[]        → Fed to GPT-4o-mini prompt: "Rate these aspects 0-10"
//                      Each aspect maps to ProductAnalysis.aspectScores Map
//   searchKeywords[] → Used for SEO, cron preloading, query expansion
//   priceRanges[]    → Indian market segments (₹) for value-for-money scoring
//   topBrands[]      → Brand detection, filtering, authenticity checks
//
// DESIGN RULES:
//   • Aspects must be SPECIFIC and measurable from review text
//     ✓ "camera quality", "battery life", "heating issues"
//     ✗ "quality", "value", "good" (too generic — AI can't score these)
//   • Price ranges reflect Indian market reality (not US pricing)
//   • Brands are India-relevant (includes local + international)
//   • searchKeywords match real Indian search patterns
// ─────────────────────────────────────────────────────────────────
"use strict";

const CATEGORY_ASPECTS = {
  // ═══════════════════════════════════════════════════════════════
  // SMARTPHONES
  // ═══════════════════════════════════════════════════════════════
  smartphones: {
    slug: "smartphones",
    name: "Smartphones",
    emoji: "📱",

    aspects: [
      "camera quality",
      "battery life",
      "performance speed",
      "heating issues",
      "display quality",
      "build quality",
      "software experience",
      "charging speed",
      "fingerprint sensor accuracy",
      "call quality",
      "speaker loudness",
      "after-sales service",
    ],

    searchKeywords: [
      "best smartphone",
      "best phone under 15000",
      "best phone under 20000",
      "best camera phone",
      "best gaming phone",
      "best 5g phone india",
      "best phone under 10000",
      "best phone under 30000",
      "best battery phone",
      "best samsung phone",
      "best iphone",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 10000, tag: "under_10k" },
      { label: "Mid-Range", min: 10000, max: 20000, tag: "10k_20k" },
      { label: "Upper Mid", min: 20000, max: 40000, tag: "20k_40k" },
      { label: "Premium", min: 40000, max: 70000, tag: "40k_70k" },
      { label: "Flagship", min: 70000, max: Infinity, tag: "above_70k" },
    ],

    topBrands: [
      "Samsung",
      "Apple",
      "OnePlus",
      "Xiaomi",
      "Redmi",
      "POCO",
      "Realme",
      "Vivo",
      "Oppo",
      "Motorola",
      "Nothing",
      "iQOO",
      "Google",
      "Tecno",
      "Infinix",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // HEADPHONES (Over-ear / On-ear)
  // ═══════════════════════════════════════════════════════════════
  headphones: {
    slug: "headphones",
    name: "Headphones",
    emoji: "🎧",

    aspects: [
      "sound quality",
      "noise cancellation effectiveness",
      "comfort for long wear",
      "build quality",
      "battery life",
      "microphone clarity",
      "bluetooth connectivity",
      "ear cushion quality",
      "clamping force comfort",
      "latency in gaming",
      "sound leakage",
      "carrying case quality",
    ],

    searchKeywords: [
      "best headphones",
      "best wireless headphones",
      "best noise cancelling headphones",
      "best headphones under 2000",
      "best headphones under 5000",
      "best headphones for music",
      "best headphones for calls",
      "best gaming headset",
      "best over ear headphones",
      "best bluetooth headphones india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 1500, tag: "under_1500" },
      { label: "Mid-Range", min: 1500, max: 5000, tag: "1500_5000" },
      { label: "Premium", min: 5000, max: 15000, tag: "5000_15000" },
      { label: "Audiophile", min: 15000, max: Infinity, tag: "above_15000" },
    ],

    topBrands: [
      "Sony",
      "JBL",
      "boAt",
      "Sennheiser",
      "Audio-Technica",
      "Bose",
      "AKG",
      "Skullcandy",
      "Marshall",
      "Beyerdynamic",
      "Jabra",
      "HyperX",
      "Corsair",
      "SteelSeries",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // EARBUDS (TWS / Neckband)
  // ═══════════════════════════════════════════════════════════════
  earbuds: {
    slug: "earbuds",
    name: "Earbuds",
    emoji: "🎵",

    aspects: [
      "sound quality",
      "bass response",
      "noise cancellation effectiveness",
      "fit and comfort",
      "battery life per charge",
      "charging case battery",
      "microphone clarity for calls",
      "touch controls responsiveness",
      "bluetooth connection stability",
      "water resistance reliability",
      "ear tip seal quality",
      "latency in videos",
    ],

    searchKeywords: [
      "best earbuds",
      "best tws earbuds",
      "best earbuds under 1000",
      "best earbuds under 2000",
      "best earbuds under 5000",
      "best noise cancelling earbuds",
      "best neckband earphones",
      "best earbuds for running",
      "best earbuds for calls",
      "best anc earbuds india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 1000, tag: "under_1000" },
      { label: "Mid-Range", min: 1000, max: 3000, tag: "1000_3000" },
      { label: "Premium", min: 3000, max: 8000, tag: "3000_8000" },
      { label: "Flagship", min: 8000, max: Infinity, tag: "above_8000" },
    ],

    topBrands: [
      "boAt",
      "OnePlus",
      "Samsung",
      "Apple",
      "Sony",
      "JBL",
      "Noise",
      "Realme",
      "Oppo",
      "Nothing",
      "Jabra",
      "Sennheiser",
      "CMF",
      "Mivi",
      "Wings",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // LAPTOPS
  // ═══════════════════════════════════════════════════════════════
  laptops: {
    slug: "laptops",
    name: "Laptops",
    emoji: "💻",

    aspects: [
      "performance speed",
      "battery life",
      "display quality",
      "build quality",
      "keyboard comfort",
      "trackpad responsiveness",
      "thermal management",
      "fan noise under load",
      "port selection",
      "webcam quality",
      "speaker quality",
      "weight and portability",
      "software bloatware",
      "after-sales service",
    ],

    searchKeywords: [
      "best laptop",
      "best laptop under 50000",
      "best laptop under 40000",
      "best laptop under 60000",
      "best laptop for students",
      "best gaming laptop",
      "best laptop for coding",
      "best laptop for video editing",
      "best macbook alternative",
      "best thin and light laptop india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 35000, tag: "under_35k" },
      { label: "Mid-Range", min: 35000, max: 60000, tag: "35k_60k" },
      { label: "Performance", min: 60000, max: 100000, tag: "60k_100k" },
      { label: "Premium", min: 100000, max: Infinity, tag: "above_100k" },
    ],

    topBrands: [
      "HP",
      "Dell",
      "Lenovo",
      "ASUS",
      "Acer",
      "Apple",
      "MSI",
      "Samsung",
      "Microsoft",
      "Infinix",
      "Realme",
      "Avita",
      "LG",
      "Gigabyte",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // TABLETS
  // ═══════════════════════════════════════════════════════════════
  tablets: {
    slug: "tablets",
    name: "Tablets",
    emoji: "📲",

    aspects: [
      "display quality",
      "performance speed",
      "battery life",
      "stylus support and accuracy",
      "speaker quality",
      "build quality",
      "keyboard accessory quality",
      "app ecosystem",
      "camera quality",
      "multitasking capability",
      "weight and portability",
      "charging speed",
    ],

    searchKeywords: [
      "best tablet",
      "best tablet under 15000",
      "best tablet under 20000",
      "best tablet under 30000",
      "best tablet for students",
      "best tablet for drawing",
      "best tablet for kids",
      "best android tablet india",
      "best ipad alternative",
      "best tablet for note taking",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 15000, tag: "under_15k" },
      { label: "Mid-Range", min: 15000, max: 30000, tag: "15k_30k" },
      { label: "Premium", min: 30000, max: 60000, tag: "30k_60k" },
      { label: "Pro", min: 60000, max: Infinity, tag: "above_60k" },
    ],

    topBrands: [
      "Apple",
      "Samsung",
      "Xiaomi",
      "Lenovo",
      "Realme",
      "OnePlus",
      "Honor",
      "Redmi",
      "TCL",
      "Motorola",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // SMARTWATCHES
  // ═══════════════════════════════════════════════════════════════
  smartwatches: {
    slug: "smartwatches",
    name: "Smartwatches",
    emoji: "⌚",

    aspects: [
      "display visibility in sunlight",
      "battery life",
      "fitness tracking accuracy",
      "heart rate sensor accuracy",
      "spo2 accuracy",
      "gps accuracy",
      "notification reliability",
      "strap comfort",
      "build and water resistance",
      "app ecosystem",
      "call quality via watch",
      "sleep tracking accuracy",
    ],

    searchKeywords: [
      "best smartwatch",
      "best smartwatch under 2000",
      "best smartwatch under 5000",
      "best smartwatch under 10000",
      "best fitness tracker",
      "best smartwatch with calling",
      "best smartwatch for health tracking",
      "best apple watch alternative",
      "best smartwatch for running",
      "best amoled smartwatch india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 2000, tag: "under_2000" },
      { label: "Mid-Range", min: 2000, max: 5000, tag: "2000_5000" },
      { label: "Premium", min: 5000, max: 15000, tag: "5000_15000" },
      { label: "Flagship", min: 15000, max: Infinity, tag: "above_15000" },
    ],

    topBrands: [
      "Apple",
      "Samsung",
      "Noise",
      "boAt",
      "Fire-Boltt",
      "Amazfit",
      "OnePlus",
      "Garmin",
      "Titan",
      "Fastrack",
      "Realme",
      "Xiaomi",
      "Fitbit",
      "Crossbeats",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // CAMERAS
  // ═══════════════════════════════════════════════════════════════
  cameras: {
    slug: "cameras",
    name: "Cameras",
    emoji: "📷",

    aspects: [
      "image quality",
      "autofocus speed and accuracy",
      "low light performance",
      "video quality",
      "image stabilization",
      "battery life per charge",
      "build and weather sealing",
      "lens mount ecosystem",
      "viewfinder quality",
      "menu and ui usability",
      "continuous shooting speed",
      "connectivity and file transfer",
    ],

    searchKeywords: [
      "best camera",
      "best dslr camera",
      "best mirrorless camera",
      "best camera under 50000",
      "best camera under 30000",
      "best camera for youtube",
      "best camera for beginners",
      "best vlogging camera",
      "best gopro alternative",
      "best camera for photography india",
    ],

    priceRanges: [
      { label: "Entry", min: 0, max: 30000, tag: "under_30k" },
      { label: "Enthusiast", min: 30000, max: 70000, tag: "30k_70k" },
      { label: "Advanced", min: 70000, max: 150000, tag: "70k_150k" },
      { label: "Professional", min: 150000, max: Infinity, tag: "above_150k" },
    ],

    topBrands: [
      "Canon",
      "Nikon",
      "Sony",
      "Fujifilm",
      "Panasonic",
      "GoPro",
      "DJI",
      "Olympus",
      "Leica",
      "Insta360",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // TELEVISIONS
  // ═══════════════════════════════════════════════════════════════
  televisions: {
    slug: "televisions",
    name: "Televisions",
    emoji: "📺",

    aspects: [
      "picture quality",
      "color accuracy",
      "hdr performance",
      "sound quality from built-in speakers",
      "smart tv interface speed",
      "remote control usability",
      "viewing angle quality",
      "motion handling for sports",
      "brightness in daylight",
      "app loading speed",
      "hdmi and port availability",
      "build and bezel quality",
      "installation support",
    ],

    searchKeywords: [
      "best tv",
      "best smart tv",
      "best tv under 15000",
      "best tv under 25000",
      "best 4k tv",
      "best 43 inch tv",
      "best 55 inch tv",
      "best tv for cricket",
      "best oled tv india",
      "best led tv under 20000",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 15000, tag: "under_15k" },
      { label: "Mid-Range", min: 15000, max: 30000, tag: "15k_30k" },
      { label: "Premium", min: 30000, max: 60000, tag: "30k_60k" },
      { label: "High-End", min: 60000, max: Infinity, tag: "above_60k" },
    ],

    topBrands: [
      "Samsung",
      "LG",
      "Sony",
      "Mi",
      "TCL",
      "Hisense",
      "OnePlus",
      "Vu",
      "Redmi",
      "Toshiba",
      "Acer",
      "Panasonic",
      "Kodak",
      "Thomson",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // REFRIGERATORS
  // ═══════════════════════════════════════════════════════════════
  refrigerators: {
    slug: "refrigerators",
    name: "Refrigerators",
    emoji: "🧊",

    aspects: [
      "cooling performance",
      "energy efficiency",
      "noise level",
      "storage capacity and layout",
      "freezer performance",
      "build and door quality",
      "temperature consistency",
      "ice making speed",
      "vegetable crisper freshness",
      "compressor reliability",
      "installation and delivery",
      "after-sales service",
    ],

    searchKeywords: [
      "best refrigerator",
      "best fridge under 15000",
      "best fridge under 20000",
      "best fridge under 25000",
      "best double door fridge",
      "best single door fridge",
      "best side by side fridge",
      "best 5 star fridge",
      "best convertible fridge",
      "best refrigerator india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 15000, tag: "under_15k" },
      { label: "Mid-Range", min: 15000, max: 25000, tag: "15k_25k" },
      { label: "Premium", min: 25000, max: 45000, tag: "25k_45k" },
      { label: "High-End", min: 45000, max: Infinity, tag: "above_45k" },
    ],

    topBrands: [
      "Samsung",
      "LG",
      "Whirlpool",
      "Haier",
      "Godrej",
      "Bosch",
      "Panasonic",
      "Voltas",
      "Hitachi",
      "IFB",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // WASHING MACHINES
  // ═══════════════════════════════════════════════════════════════
  washing_machines: {
    slug: "washing_machines",
    name: "Washing Machines",
    emoji: "🫧",

    aspects: [
      "wash quality and cleanliness",
      "noise and vibration level",
      "energy efficiency",
      "water consumption",
      "spin dry effectiveness",
      "drum quality",
      "wash program variety",
      "build and door quality",
      "ease of operation",
      "installation and plumbing",
      "after-sales service",
      "detergent compatibility",
    ],

    searchKeywords: [
      "best washing machine",
      "best washing machine under 15000",
      "best washing machine under 20000",
      "best front load washing machine",
      "best top load washing machine",
      "best fully automatic washing machine",
      "best semi automatic washing machine",
      "best 7 kg washing machine",
      "best washing machine for hard water",
      "best washing machine india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 12000, tag: "under_12k" },
      { label: "Mid-Range", min: 12000, max: 25000, tag: "12k_25k" },
      { label: "Premium", min: 25000, max: 45000, tag: "25k_45k" },
      { label: "High-End", min: 45000, max: Infinity, tag: "above_45k" },
    ],

    topBrands: [
      "LG",
      "Samsung",
      "Whirlpool",
      "Bosch",
      "IFB",
      "Haier",
      "Godrej",
      "Panasonic",
      "Voltas",
      "Toshiba",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // AIR CONDITIONERS
  // ═══════════════════════════════════════════════════════════════
  air_conditioners: {
    slug: "air_conditioners",
    name: "Air Conditioners",
    emoji: "❄️",

    aspects: [
      "cooling speed",
      "energy efficiency",
      "noise level at night",
      "temperature consistency",
      "compressor reliability",
      "air flow distribution",
      "smart and wifi features",
      "filter and air purification",
      "build and panel quality",
      "installation ease and cost",
      "after-sales service",
      "performance in extreme heat",
    ],

    searchKeywords: [
      "best ac",
      "best ac under 30000",
      "best ac under 35000",
      "best 1.5 ton ac",
      "best 1 ton ac",
      "best split ac",
      "best inverter ac",
      "best 5 star ac",
      "best ac for bedroom",
      "best ac india 2026",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 25000, tag: "under_25k" },
      { label: "Mid-Range", min: 25000, max: 40000, tag: "25k_40k" },
      { label: "Premium", min: 40000, max: 60000, tag: "40k_60k" },
      { label: "High-End", min: 60000, max: Infinity, tag: "above_60k" },
    ],

    topBrands: [
      "Daikin",
      "Voltas",
      "LG",
      "Samsung",
      "Blue Star",
      "Carrier",
      "Hitachi",
      "Whirlpool",
      "Panasonic",
      "Lloyd",
      "Godrej",
      "Haier",
      "Toshiba",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // AIR PURIFIERS
  // ═══════════════════════════════════════════════════════════════
  air_purifiers: {
    slug: "air_purifiers",
    name: "Air Purifiers",
    emoji: "🌬️",

    aspects: [
      "air purification effectiveness",
      "cadr rating accuracy",
      "filter life and replacement cost",
      "noise level on max speed",
      "coverage area accuracy",
      "aqi sensor accuracy",
      "pm2.5 and pm10 removal",
      "odor and gas removal",
      "smart app connectivity",
      "build and design quality",
      "energy consumption",
      "filter change indicator reliability",
    ],

    searchKeywords: [
      "best air purifier",
      "best air purifier india",
      "best air purifier under 10000",
      "best air purifier under 15000",
      "best air purifier for delhi pollution",
      "best hepa air purifier",
      "best air purifier for bedroom",
      "best air purifier for dust",
      "best air purifier for asthma",
      "best air purifier for smoke",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 8000, tag: "under_8k" },
      { label: "Mid-Range", min: 8000, max: 15000, tag: "8k_15k" },
      { label: "Premium", min: 15000, max: 30000, tag: "15k_30k" },
      { label: "High-End", min: 30000, max: Infinity, tag: "above_30k" },
    ],

    topBrands: [
      "Dyson",
      "Philips",
      "MI",
      "Coway",
      "Honeywell",
      "Sharp",
      "Samsung",
      "Blueair",
      "Kent",
      "Eureka Forbes",
      "Havells",
      "IQAir",
      "Winix",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // MIXERS & GRINDERS
  // ═══════════════════════════════════════════════════════════════
  mixers_grinders: {
    slug: "mixers_grinders",
    name: "Mixers & Grinders",
    emoji: "🍹",

    aspects: [
      "grinding power and consistency",
      "motor overheating tendency",
      "jar quality and durability",
      "lid locking mechanism",
      "noise level",
      "wet grinding performance",
      "dry grinding performance",
      "chutney grinding quality",
      "ease of cleaning",
      "blade sharpness retention",
      "suction cup grip stability",
      "cord length and storage",
    ],

    searchKeywords: [
      "best mixer grinder",
      "best mixer grinder under 3000",
      "best mixer grinder under 5000",
      "best juicer mixer grinder",
      "best mixer grinder for indian cooking",
      "best mixer grinder 750 watt",
      "best mixer grinder for chutney",
      "best hand blender",
      "best food processor india",
      "best mixer grinder india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 2000, tag: "under_2000" },
      { label: "Mid-Range", min: 2000, max: 4000, tag: "2000_4000" },
      { label: "Premium", min: 4000, max: 8000, tag: "4000_8000" },
      { label: "Professional", min: 8000, max: Infinity, tag: "above_8000" },
    ],

    topBrands: [
      "Preethi",
      "Butterfly",
      "Bajaj",
      "Philips",
      "Sujata",
      "Bosch",
      "Morphy Richards",
      "Hamilton Beach",
      "Prestige",
      "Havells",
      "Crompton",
      "Usha",
      "Maharaja Whiteline",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // MICROWAVE OVENS
  // ═══════════════════════════════════════════════════════════════
  microwave_ovens: {
    slug: "microwave_ovens",
    name: "Microwave Ovens",
    emoji: "🍕",

    aspects: [
      "heating uniformity",
      "convection baking quality",
      "grill performance",
      "auto cook menu accuracy",
      "build and door quality",
      "control panel usability",
      "interior capacity accuracy",
      "cleaning ease",
      "noise level",
      "defrost performance",
      "timer and preset accuracy",
      "after-sales service",
    ],

    searchKeywords: [
      "best microwave oven",
      "best microwave under 10000",
      "best microwave under 15000",
      "best convection microwave",
      "best solo microwave",
      "best grill microwave",
      "best otg oven",
      "best microwave for baking",
      "best 30 litre microwave",
      "best microwave oven india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 7000, tag: "under_7k" },
      { label: "Mid-Range", min: 7000, max: 15000, tag: "7k_15k" },
      { label: "Premium", min: 15000, max: 25000, tag: "15k_25k" },
      { label: "High-End", min: 25000, max: Infinity, tag: "above_25k" },
    ],

    topBrands: [
      "Samsung",
      "LG",
      "IFB",
      "Panasonic",
      "Whirlpool",
      "Bajaj",
      "Godrej",
      "Morphy Richards",
      "Bosch",
      "Philips",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // GAMING MICE
  // ═══════════════════════════════════════════════════════════════
  gaming_mice: {
    slug: "gaming_mice",
    name: "Gaming Mice",
    emoji: "🖱️",

    aspects: [
      "sensor accuracy and tracking",
      "click responsiveness",
      "ergonomic comfort for long sessions",
      "build quality and durability",
      "scroll wheel quality",
      "side button placement",
      "weight and balance",
      "cable quality or wireless latency",
      "software customization",
      "dpi switching smoothness",
      "rgb lighting quality",
      "mouse feet glide smoothness",
    ],

    searchKeywords: [
      "best gaming mouse",
      "best gaming mouse under 1000",
      "best gaming mouse under 2000",
      "best gaming mouse under 3000",
      "best wireless gaming mouse",
      "best lightweight gaming mouse",
      "best mouse for fps games",
      "best ergonomic mouse",
      "best budget gaming mouse india",
      "best mouse for csgo valorant",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 1000, tag: "under_1000" },
      { label: "Mid-Range", min: 1000, max: 3000, tag: "1000_3000" },
      { label: "Premium", min: 3000, max: 6000, tag: "3000_6000" },
      { label: "Pro", min: 6000, max: Infinity, tag: "above_6000" },
    ],

    topBrands: [
      "Logitech",
      "Razer",
      "SteelSeries",
      "HyperX",
      "Corsair",
      "Zowie",
      "Glorious",
      "Pulsar",
      "Lamzu",
      "Ant Esports",
      "Cosmic Byte",
      "Lenovo Legion",
      "Asus ROG",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // GAMING KEYBOARDS
  // ═══════════════════════════════════════════════════════════════
  gaming_keyboards: {
    slug: "gaming_keyboards",
    name: "Gaming Keyboards",
    emoji: "⌨️",

    aspects: [
      "key switch feel and feedback",
      "typing comfort",
      "build quality and flex",
      "keycap quality and material",
      "rgb lighting customization",
      "software and macro support",
      "anti-ghosting and nkey rollover",
      "stabilizer rattle",
      "wrist rest comfort",
      "cable quality or wireless latency",
      "noise level of switches",
      "media keys and volume knob",
    ],

    searchKeywords: [
      "best gaming keyboard",
      "best mechanical keyboard",
      "best keyboard under 2000",
      "best keyboard under 3000",
      "best keyboard under 5000",
      "best wireless mechanical keyboard",
      "best 60 percent keyboard",
      "best tkl keyboard",
      "best red switch keyboard",
      "best gaming keyboard india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 2000, tag: "under_2000" },
      { label: "Mid-Range", min: 2000, max: 5000, tag: "2000_5000" },
      { label: "Premium", min: 5000, max: 10000, tag: "5000_10000" },
      { label: "Enthusiast", min: 10000, max: Infinity, tag: "above_10000" },
    ],

    topBrands: [
      "Logitech",
      "Razer",
      "Corsair",
      "HyperX",
      "SteelSeries",
      "Keychron",
      "Royal Kludge",
      "Redragon",
      "Ant Esports",
      "Cosmic Byte",
      "Zebronics",
      "TVS Gold",
      "Ducky",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // MONITORS
  // ═══════════════════════════════════════════════════════════════
  monitors: {
    slug: "monitors",
    name: "Monitors",
    emoji: "🖥️",

    aspects: [
      "display clarity and sharpness",
      "color accuracy",
      "brightness and hdr performance",
      "refresh rate smoothness",
      "response time for gaming",
      "viewing angles",
      "stand adjustability",
      "build and bezel quality",
      "eye strain at long use",
      "backlight bleed and uniformity",
      "port selection",
      "osd menu usability",
    ],

    searchKeywords: [
      "best monitor",
      "best monitor under 10000",
      "best monitor under 15000",
      "best monitor under 20000",
      "best gaming monitor",
      "best 4k monitor",
      "best 27 inch monitor",
      "best monitor for coding",
      "best 144hz monitor india",
      "best ultrawide monitor india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 10000, tag: "under_10k" },
      { label: "Mid-Range", min: 10000, max: 20000, tag: "10k_20k" },
      { label: "Premium", min: 20000, max: 40000, tag: "20k_40k" },
      { label: "Pro", min: 40000, max: Infinity, tag: "above_40k" },
    ],

    topBrands: [
      "LG",
      "Samsung",
      "Dell",
      "BenQ",
      "ASUS",
      "Acer",
      "MSI",
      "AOC",
      "ViewSonic",
      "Lenovo",
      "HP",
      "Gigabyte",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // SPEAKERS
  // ═══════════════════════════════════════════════════════════════
  speakers: {
    slug: "speakers",
    name: "Speakers",
    emoji: "🔊",

    aspects: [
      "sound quality and clarity",
      "bass depth and punch",
      "volume loudness at max",
      "distortion at high volume",
      "battery life",
      "bluetooth range and stability",
      "water resistance reliability",
      "build and portability",
      "microphone quality for calls",
      "stereo pairing quality",
      "aux and usb playback quality",
      "charging speed",
    ],

    searchKeywords: [
      "best bluetooth speaker",
      "best speaker under 1000",
      "best speaker under 2000",
      "best speaker under 5000",
      "best portable speaker",
      "best party speaker",
      "best waterproof speaker",
      "best soundbar",
      "best home theatre system",
      "best speaker india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 1500, tag: "under_1500" },
      { label: "Mid-Range", min: 1500, max: 5000, tag: "1500_5000" },
      { label: "Premium", min: 5000, max: 15000, tag: "5000_15000" },
      { label: "High-End", min: 15000, max: Infinity, tag: "above_15000" },
    ],

    topBrands: [
      "JBL",
      "boAt",
      "Sony",
      "Marshall",
      "Bose",
      "Ultimate Ears",
      "Mivi",
      "Harman Kardon",
      "Tribit",
      "Creative",
      "Zebronics",
      "Portronics",
      "Anker Soundcore",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // POWER BANKS
  // ═══════════════════════════════════════════════════════════════
  power_banks: {
    slug: "power_banks",
    name: "Power Banks",
    emoji: "🔋",

    aspects: [
      "actual capacity vs advertised",
      "charging speed output",
      "self charging speed",
      "number of full phone charges",
      "build quality and durability",
      "weight and portability",
      "led indicator accuracy",
      "cable quality included",
      "simultaneous device charging",
      "heating during charging",
      "passthrough charging support",
      "airline carry compatibility",
    ],

    searchKeywords: [
      "best power bank",
      "best power bank 10000mah",
      "best power bank 20000mah",
      "best power bank under 1000",
      "best power bank under 2000",
      "best fast charging power bank",
      "best power bank for iphone",
      "best 65w power bank",
      "best power bank for laptop",
      "best power bank india",
    ],

    priceRanges: [
      { label: "Budget", min: 0, max: 800, tag: "under_800" },
      { label: "Mid-Range", min: 800, max: 2000, tag: "800_2000" },
      { label: "Premium", min: 2000, max: 4000, tag: "2000_4000" },
      { label: "High-Power", min: 4000, max: Infinity, tag: "above_4000" },
    ],

    topBrands: [
      "Mi",
      "Anker",
      "Samsung",
      "Ambrane",
      "boAt",
      "Portronics",
      "Syska",
      "Baseus",
      "Belkin",
      "Mivi",
      "Realme",
      "URBN",
      "Croma",
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // SKINCARE (Myntra relevance)
  // ═══════════════════════════════════════════════════════════════
  skincare: {
    slug: "skincare",
    name: "Skincare",
    emoji: "✨",

    aspects: [
      "skin improvement visible results",
      "texture and absorption speed",
      "fragrance intensity",
      "irritation or breakout risk",
      "suitability for oily skin",
      "suitability for dry skin",
      "suitability for sensitive skin",
      "hydration lasting duration",
      "spf protection effectiveness",
      "packaging quality and hygiene",
      "ingredient transparency",
      "value per ml or gram",
    ],

    searchKeywords: [
      "best sunscreen",
      "best moisturizer",
      "best face wash",
      "best serum for face",
      "best vitamin c serum",
      "best retinol serum india",
      "best cleanser for oily skin",
      "best skincare for acne",
      "best niacinamide serum",
      "best korean skincare india",
      "best sunscreen for oily skin india",
    ],

    priceRanges: [
      { label: "Affordable", min: 0, max: 500, tag: "under_500" },
      { label: "Mid-Range", min: 500, max: 1500, tag: "500_1500" },
      { label: "Premium", min: 1500, max: 3000, tag: "1500_3000" },
      { label: "Luxury", min: 3000, max: Infinity, tag: "above_3000" },
    ],

    topBrands: [
      "Minimalist",
      "Cetaphil",
      "CeraVe",
      "Neutrogena",
      "The Derma Co",
      "Dot & Key",
      "Plum",
      "Biotique",
      "Mamaearth",
      "Nivea",
      "L'Oreal",
      "Olay",
      "Simple",
      "The Ordinary",
      "Fixderma",
      "Deconstruct",
      "Re'equil",
      "Episoft",
    ],
  },
};

// ═════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════

/**
 * Get category config by slug. Returns null if not found.
 * @param {string} slug — e.g. 'smartphones', 'gaming_mice'
 * @returns {Object|null}
 */
function getCategoryConfig(slug) {
  if (!slug) return null;
  return CATEGORY_ASPECTS[slug.toLowerCase().trim()] || null;
}

/**
 * Get all category slugs.
 * @returns {string[]}
 */
function getAllCategorySlugs() {
  return Object.keys(CATEGORY_ASPECTS);
}

/**
 * Get aspects array for a category (fed to GPT-4o-mini prompt).
 * Returns a generic fallback if category not found.
 * @param {string} slug
 * @returns {string[]}
 */
function getAspects(slug) {
  const config = getCategoryConfig(slug);
  if (config) return config.aspects;

  // Generic fallback for unknown categories
  return [
    "build quality",
    "performance",
    "value for money",
    "durability",
    "ease of use",
    "customer support experience",
  ];
}

/**
 * Detect category from a search query string.
 * Scans searchKeywords across all categories for a match.
 * @param {string} query
 * @returns {string|null} — category slug or null
 */
function detectCategoryFromQuery(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();

  // First pass: check if query directly matches a slug
  if (CATEGORY_ASPECTS[q]) return q;

  // Second pass: check searchKeywords (most specific)
  for (const [slug, config] of Object.entries(CATEGORY_ASPECTS)) {
    if (config.searchKeywords.some((kw) => q.includes(kw) || kw.includes(q))) {
      return slug;
    }
  }

  // Third pass: check brand names (e.g. "logitech" → gaming_mice or headphones)
  // Return first match — imperfect but useful for brand-only searches
  for (const [slug, config] of Object.entries(CATEGORY_ASPECTS)) {
    if (config.topBrands.some((brand) => q.includes(brand.toLowerCase()))) {
      return slug;
    }
  }

  return null;
}

/**
 * Get the price range segment for a given price in a category.
 * @param {string} slug — category slug
 * @param {number} price — product price in INR
 * @returns {{ label: string, tag: string }|null}
 */
function getPriceSegment(slug, price) {
  const config = getCategoryConfig(slug);
  if (!config || !price) return null;

  for (const range of config.priceRanges) {
    if (price >= range.min && price < range.max) {
      return { label: range.label, tag: range.tag };
    }
  }
  return null;
}

/**
 * Check if a brand is a known top brand in a category.
 * Used for authenticity and trust signals.
 * @param {string} slug — category slug
 * @param {string} brand — brand name
 * @returns {boolean}
 */
function isTopBrand(slug, brand) {
  const config = getCategoryConfig(slug);
  if (!config || !brand) return false;
  return config.topBrands.some(
    (b) => b.toLowerCase() === brand.toLowerCase().trim(),
  );
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  CATEGORY_ASPECTS,
  getCategoryConfig,
  getAllCategorySlugs,
  getAspects,
  detectCategoryFromQuery,
  getPriceSegment,
  isTopBrand,
};
