// src/utils/synonyms.js — Typesense Synonym Rules
// ─────────────────────────────────────────────────────────────────
// Two types:
//   equivalents  — bidirectional: "tv" matches "television" and vice versa
//   directional  — one-way: "fitness band" expands to "smartwatch" search
//                  (but searching "smartwatch" does NOT return fitness band results)
//
// HOW TO ADD MORE:
//   equivalents: push { id: "key", synonyms: ["word1","word2"] }
//   directional: push { id: "key", root: "canonical term", synonyms: ["variant1","variant2"] }
//
// Loaded by typesenseService.js → initSynonyms() on startup.
// ─────────────────────────────────────────────────────────────────
"use strict";

// ── Bidirectional equivalents ────────────────────────────────────────────────
// Any word in the synonyms array will match any other word.
const equivalents = [
  // Audio
  {
    id: "syn-headphones",
    synonyms: ["headphones", "earphones", "headset", "hearphones"],
  },
  {
    id: "syn-earbuds",
    synonyms: ["earbuds", "earphones", "tws", "true wireless earphones", "ear pods"],
  },
  {
    id: "syn-speaker",
    synonyms: ["speaker", "speakers", "bluetooth speaker", "soundbar"],
  },

  // Mobile
  {
    id: "syn-mobile",
    synonyms: ["mobile", "phone", "smartphone", "handset", "cellphone", "cell phone"],
  },

  // Television
  {
    id: "syn-tv",
    synonyms: ["tv", "television", "smart tv", "led tv", "oled tv", "qled tv"],
  },

  // Laptop
  {
    id: "syn-laptop",
    synonyms: ["laptop", "notebook", "notebook computer", "ultrabook"],
  },

  // Watch
  {
    id: "syn-smartwatch",
    synonyms: ["smartwatch", "smart watch"],
  },

  // Appliance variants
  {
    id: "syn-fridge",
    synonyms: ["refrigerator", "fridge", "double door fridge", "single door fridge"],
  },
  {
    id: "syn-ac",
    synonyms: ["air conditioner", "ac", "split ac", "window ac"],
  },
  {
    id: "syn-washing-machine",
    synonyms: ["washing machine", "washer", "front load washing machine", "top load washing machine"],
  },
  {
    id: "syn-vacuum",
    synonyms: ["vacuum cleaner", "vacuum", "robot vacuum", "robovac"],
  },
  {
    id: "syn-airfryer",
    synonyms: ["air fryer", "airfryer"],
  },
  {
    id: "syn-microwave",
    synonyms: ["microwave", "microwave oven", "convection oven"],
  },

  // Footwear
  {
    id: "syn-shoes",
    synonyms: ["shoes", "footwear", "sneakers", "trainers", "kicks"],
  },
  {
    id: "syn-running-shoes",
    synonyms: ["running shoes", "sports shoes", "athletic shoes", "jogging shoes"],
  },

  // Skincare
  {
    id: "syn-serum",
    synonyms: ["serum", "face serum", "skin serum"],
  },
  {
    id: "syn-moisturizer",
    synonyms: ["moisturizer", "moisturiser", "face cream", "face moisturizer"],
  },
  {
    id: "syn-sunscreen",
    synonyms: ["sunscreen", "sunblock", "spf cream", "spf lotion"],
  },

  // Camera
  {
    id: "syn-camera",
    synonyms: ["camera", "digital camera", "dslr", "mirrorless camera"],
  },

  // Gaming
  {
    id: "syn-gaming-controller",
    synonyms: ["controller", "gamepad", "game controller", "joystick"],
  },

  // Books / E-Readers
  {
    id: "syn-ereader",
    synonyms: ["kindle", "e-reader", "ereader", "e reader"],
  },
];

// ── Directional synonyms ─────────────────────────────────────────────────────
// root: the term in the INDEX to match against
// synonyms: user query terms that should also match the root
// e.g. user types "fitness band" → Typesense searches for "smartwatch" products too
const directional = [
  // Smartwatch variants → smartwatch
  {
    id: "dir-fitness-band",
    root: "smartwatch",
    synonyms: ["fitness band", "fitness tracker", "activity tracker", "activity band"],
  },
  {
    id: "dir-smart-band",
    root: "smartwatch",
    synonyms: ["smart band", "mi band", "honor band"],
  },

  // Running shoes → footwear (category expansion)
  {
    id: "dir-running-footwear",
    root: "footwear",
    synonyms: ["running shoes", "sports shoes", "gym shoes"],
  },

  // TWS → earbuds
  {
    id: "dir-tws",
    root: "earbuds",
    synonyms: ["tws", "true wireless", "wireless earbuds"],
  },

  // Induction cooktop → appliances
  {
    id: "dir-induction",
    root: "appliances",
    synonyms: ["induction cooktop", "induction stove", "induction cooker"],
  },

  // Water purifier → appliances
  {
    id: "dir-purifier",
    root: "appliances",
    synonyms: ["water purifier", "ro purifier", "water filter", "ro water filter"],
  },

  // Geyser → appliances
  {
    id: "dir-geyser",
    root: "appliances",
    synonyms: ["geyser", "water heater", "instant geyser", "storage geyser"],
  },

  // Trimmer / electric shaver → grooming (maps to appliances for now)
  {
    id: "dir-trimmer",
    root: "appliances",
    synonyms: ["trimmer", "beard trimmer", "electric shaver", "hair trimmer"],
  },

  // Steam iron → appliances
  {
    id: "dir-iron",
    root: "appliances",
    synonyms: ["steam iron", "clothing iron", "garment iron", "dry iron"],
  },
];

module.exports = { equivalents, directional };
