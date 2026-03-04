// src/services/aiAnalysisService.js — Core AI Analysis Pipeline
// ─────────────────────────────────────────────────────────────────
// THE MOST IMPORTANT SERVICE IN BESTPICKR.
//
// Takes raw reviews (temporary, never stored) and produces the
// AI insights that power the entire product ranking experience.
//
// PIPELINE:
//   Step 1 → Review authenticity check (statistical, no AI)
//   Step 2 → Build dynamic GPT prompt based on category aspects
//   Step 3 → Send to GPT-4o-mini (JSON mode, temp=0.3)
//   Step 4 → Calculate final AI score (weighted formula)
//   Step 5 → Return combined analysis object
//
// ARCHITECTURE RULE:
//   Raw review text enters this function and is NEVER returned.
//   Only AI-generated insights leave this service.
//   reviews → analyze → insights out → reviews discarded.
//
// COST:
//   ~800-1200 tokens input per analysis (50 reviews compressed)
//   ~400-600 tokens output (structured JSON)
//   At GPT-4o-mini pricing: ~$0.001-0.002 per product analysis
//   Monthly (1000 products): ~$1-2
// ─────────────────────────────────────────────────────────────────
"use strict";

const OpenAI = require("openai");
const { getAspects, getCategoryConfig } = require("../config/categoryAspects");
const { checkReviewAuthenticity } = require("./reviewAuthenticityService");
const logger = require("../utils/logger");

// ── OPENAI CLIENT ───────────────────────────────────────────────
// Initialized lazily on first call (avoids crash if key not set during import)
let openai = null;

function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set — AI analysis requires an OpenAI key",
      );
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// ── CONFIG ──────────────────────────────────────────────────────
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3; // Low temp = consistent, deterministic outputs
const MAX_TOKENS = 2000; // Enough for full JSON response
const MIN_REVIEWS_FOR_ANALYSIS = 3; // Below this, confidence is too low
const ASPECT_MIN_MENTIONS = 3; // Aspect must appear in ≥3 reviews to be scored

// ── SCORING WEIGHTS ─────────────────────────────────────────────
// Final AI Score (0-10) formula:
const SCORE_WEIGHTS = {
  aspectSentiment: 0.35, // Average of aspect scores from GPT
  authenticity: 0.25, // Review authenticity score (0-100 → 0-10)
  recency: 0.2, // More recent reviews = higher confidence
  valueForMoney: 0.1, // If AI identified value aspects
  reviewVolume: 0.1, // Log-scale volume score
};

// ═════════════════════════════════════════════════════════════════
// MAIN EXPORT: analyzeProduct()
// ═════════════════════════════════════════════════════════════════
/**
 * Run the full AI analysis pipeline on a product's reviews.
 *
 * @param {Array}  reviews          — From amazonReviewScraper.fetchReviews().reviews
 *   Each: { starRating, title, body, date, verifiedPurchase, helpfulVotes }
 * @param {string} productName      — e.g. "Sony WH-1000XM5"
 * @param {string} category         — Category slug e.g. "headphones"
 * @param {Object} starDistribution — { 1: n, 2: n, 3: n, 4: n, 5: n }
 * @returns {Object|null} — Analysis result or null if pipeline fails
 */
async function analyzeProduct(
  reviews,
  productName,
  category,
  starDistribution,
) {
  const startTime = Date.now();
  logger.info(
    `🤖 AI Analysis: starting for "${productName}" [${category}] — ${reviews.length} reviews`,
  );

  // ── Guard: not enough reviews ───────────────────────────────
  if (!reviews || reviews.length < MIN_REVIEWS_FOR_ANALYSIS) {
    logger.warn(
      `🤖 AI Analysis: only ${reviews?.length || 0} reviews for "${productName}" — ` +
        `minimum ${MIN_REVIEWS_FOR_ANALYSIS} required`,
    );
    return buildLowConfidenceResult(
      productName,
      category,
      reviews,
      starDistribution,
    );
  }

  try {
    // ── STEP 1: Review Authenticity Check ──────────────────────
    logger.info(`🤖 AI Analysis: Step 1 — running authenticity check`);
    const authenticity = checkReviewAuthenticity(reviews, starDistribution);

    if (authenticity.badge === "suspicious") {
      logger.warn(
        `🤖 AI Analysis: ⚠️ "${productName}" has SUSPICIOUS reviews ` +
          `(score=${authenticity.authenticityScore}). Proceeding with analysis but flagging.`,
      );
    }

    // ── STEP 2: Build Dynamic Prompt ──────────────────────────
    logger.info(`🤖 AI Analysis: Step 2 — building category-aware prompt`);
    const { systemPrompt, userPrompt, filteredAspects } = buildPrompt(
      reviews,
      productName,
      category,
      starDistribution,
      authenticity,
    );

    // ── STEP 3: Call GPT-4o-mini ──────────────────────────────
    logger.info(
      `🤖 AI Analysis: Step 3 — calling ${MODEL} ` +
        `(${filteredAspects.length} aspects, ${reviews.length} reviews compressed)`,
    );
    const aiOutput = await callGPT(systemPrompt, userPrompt);

    if (!aiOutput) {
      logger.error(
        `🤖 AI Analysis: GPT returned null for "${productName}" — pipeline aborted`,
      );
      return null;
    }

    logger.info(
      `🤖 AI Analysis: Step 3 complete — GPT response parsed successfully`,
    );

    // ── STEP 4: Calculate Final AI Score ──────────────────────
    logger.info(`🤖 AI Analysis: Step 4 — calculating final AI score`);
    const aiScore = calculateFinalScore(
      aiOutput,
      authenticity,
      reviews,
      starDistribution,
    );

    // ── STEP 5: Assemble Final Result ─────────────────────────
    const elapsed = Date.now() - startTime;
    logger.info(
      `🤖 AI Analysis: COMPLETE for "${productName}" — ` +
        `aiScore=${aiScore} badge=${authenticity.badge} in ${elapsed}ms`,
    );

    return {
      // AI-generated insights (from GPT)
      aspectScores: aiOutput.aspectScores || {},
      overallSentiment: aiOutput.overallSentiment || {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
      whatPeopleLove: aiOutput.whatPeopleLove || [],
      commonComplaints: aiOutput.commonComplaints || [],
      redFlags: aiOutput.redFlags || [],
      buyRecommendation: aiOutput.buyRecommendation || null,
      avoidIf: aiOutput.avoidIf || null,
      confidenceLevel: aiOutput.confidenceLevel || "medium",
      reviewQualitySummary: aiOutput.reviewQualitySummary || null,

      // Calculated score
      aiScore,

      // Authenticity data (from statistical analysis, not AI)
      authenticityBadge: authenticity.badge,
      authenticityFlags: authenticity.flags,

      // Metadata
      reviewsAnalyzed: reviews.length,
      analysisDate: new Date(),

      // Raw reviews are NOT included — they are discarded here.
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error(
      `🤖 AI Analysis: FAILED for "${productName}" after ${elapsed}ms — ${err.message}`,
    );
    logger.error(
      `🤖 AI Analysis: stack: ${err.stack?.split("\n").slice(1, 3).join(" | ")}`,
    );
    // Return null — don't crash the pipeline. The caller handles null gracefully.
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// STEP 2: PROMPT BUILDER
// ═════════════════════════════════════════════════════════════════
// Builds a category-specific GPT prompt that:
//   - Includes only aspects mentioned in ≥3 reviews
//   - Compresses reviews into a token-efficient format
//   - Enforces specific, evidence-based output rules
// ─────────────────────────────────────────────────────────────────

function buildPrompt(
  reviews,
  productName,
  category,
  starDistribution,
  authenticity,
) {
  // Get category-specific aspects (or fallback generic ones)
  const allAspects = getAspects(category);

  // Filter to aspects actually mentioned in reviews (≥3 mentions)
  const filteredAspects = filterAspectsByReviewContent(allAspects, reviews);

  // Compress reviews into a token-efficient format:
  // [5★ Verified] Great headphones: Battery lasts 30 hours, noise cancellation is...
  const compressedReviews = compressReviews(reviews);

  // Star distribution summary
  const distSummary = Object.entries(starDistribution)
    .filter(([, count]) => count > 0)
    .map(([star, count]) => `${star}★: ${count}`)
    .join(", ");

  // Category context
  const catConfig = getCategoryConfig(category);
  const categoryName = catConfig ? catConfig.name : category;

  // ── SYSTEM PROMPT ─────────────────────────────────────────
  const systemPrompt = `You are a senior product analyst for bestpickr.in, an AI-powered product ranking platform for Indian shoppers. You analyze Amazon India reviews to produce brutally honest, evidence-based product insights.

CRITICAL OUTPUT RULES — VIOLATIONS WILL BE REJECTED:
1. Every single insight MUST cite specific evidence from the reviews. Never make a claim without backing it.
2. FORBIDDEN generic phrases (automatic rejection if used as standalone points):
   - "good quality", "value for money", "nice product", "worth the price"
   - "positive experience", "highly recommended", "must buy"
   - "decent product", "does the job", "as expected"
   These are meaningless. Instead, say exactly WHAT is good/bad and cite how many reviewers mention it.
3. Include approximate percentages: "~40% of reviewers mention...", "roughly 1 in 3 users report..."
4. Be SPECIFIC to this exact product. Mention the product name, brand, and compare to competitors when reviewers do.
5. Red flags must be genuinely concerning issues, not minor preferences. If there are no real red flags, return an empty array.
6. Confidence level rules:
   - "high": 30+ reviews, good verified ratio, consistent patterns
   - "medium": 10-29 reviews or mixed signals
   - "low": <10 reviews or highly suspicious review patterns

You must respond with ONLY a valid JSON object. No markdown, no explanation, no preamble.`;

  // ── USER PROMPT ───────────────────────────────────────────
  const userPrompt = `Analyze these ${reviews.length} Amazon India reviews for:

PRODUCT: ${productName}
CATEGORY: ${categoryName}
STAR DISTRIBUTION: ${distSummary}
REVIEW AUTHENTICITY: ${authenticity.badge} (score: ${authenticity.authenticityScore}/100)${
    authenticity.flags.length > 0
      ? "\nAUTHENTICITY CONCERNS: " + authenticity.flags.slice(0, 3).join("; ")
      : ""
  }

ASPECTS TO EVALUATE (score each 0-10, skip any not mentioned in reviews):
${filteredAspects.map((a, i) => `${i + 1}. ${a}`).join("\n")}

REVIEWS:
${compressedReviews}

Respond with this exact JSON structure:
{
  "aspectScores": {
    ${filteredAspects.map((a) => `"${a}": <0-10 score based on review evidence>`).join(",\n    ")}
  },
  "overallSentiment": {
    "positive": <percentage 0-100>,
    "neutral": <percentage 0-100>,
    "negative": <percentage 0-100>
  },
  "whatPeopleLove": [
    "<3-5 specific points, each with evidence and approximate percentages>",
    "<e.g. 'Noise cancellation praised by ~70% of reviewers, with several comparing it favorably to Bose QC45'>",
    "<e.g. '30-hour battery life confirmed by multiple users, with ~85% saying it meets or exceeds the claim'>"
  ],
  "commonComplaints": [
    "<2-4 specific complaints with evidence>",
    "<e.g. 'Carrying case design criticized as bulky and impractical in ~35% of negative reviews'>"
  ],
  "redFlags": [
    "<genuinely concerning issues only — empty array if none>",
    "<e.g. 'Multiple reviewers report left ear driver failing after 6 months of regular use'>"
  ],
  "buyRecommendation": "<One paragraph: who is this product perfect for? Be specific about use cases and user types>",
  "avoidIf": "<One sentence: who should NOT buy this? Be specific about the dealbreaker>",
  "confidenceLevel": "<high|medium|low based on review quality and quantity>",
  "reviewQualitySummary": "<One line assessing review authenticity and usefulness>"
}`;

  return { systemPrompt, userPrompt, filteredAspects };
}

// ── Filter aspects to only those mentioned in reviews ───────────
// An aspect must appear in at least ASPECT_MIN_MENTIONS reviews to be scored.
// This prevents the AI from hallucinating scores for unmentioned features.
function filterAspectsByReviewContent(aspects, reviews) {
  // Combine all review text into one searchable corpus
  const corpus = reviews
    .map((r) => `${r.title || ""} ${r.body || ""}`.toLowerCase())
    .join(" ");

  // Build keyword variants for each aspect
  const filtered = aspects.filter((aspect) => {
    const keywords = buildAspectKeywords(aspect);
    // Count reviews that mention at least one keyword
    let mentionCount = 0;
    for (const review of reviews) {
      const text = `${review.title || ""} ${review.body || ""}`.toLowerCase();
      if (keywords.some((kw) => text.includes(kw))) {
        mentionCount++;
        if (mentionCount >= ASPECT_MIN_MENTIONS) return true; // Early exit
      }
    }
    return false;
  });

  // Always include at least 3 aspects (use top ones from the category)
  if (filtered.length < 3) {
    const fallbacks = aspects.slice(0, 5).filter((a) => !filtered.includes(a));
    filtered.push(...fallbacks.slice(0, 3 - filtered.length));
  }

  return filtered;
}

// Build keyword variants for an aspect.
// "battery life" → ["battery", "battery life", "charge", "charging", "mah"]
// "noise cancellation effectiveness" → ["noise cancel", "anc", "noise", "cancellation"]
function buildAspectKeywords(aspect) {
  const base = aspect.toLowerCase();
  const words = base.split(/\s+/);
  const keywords = [base]; // Full aspect phrase

  // Add individual words (except very common ones)
  const stopWords = new Set([
    "quality",
    "for",
    "and",
    "the",
    "of",
    "in",
    "at",
    "on",
    "a",
    "an",
    "is",
    "it",
    "to",
    "with",
    "issues",
    "level",
    "effectiveness",
  ]);
  for (const w of words) {
    if (w.length > 3 && !stopWords.has(w)) {
      keywords.push(w);
    }
  }

  // Aspect-specific synonyms for better detection
  const synonymMap = {
    "battery life": [
      "battery",
      "charge",
      "charging",
      "backup",
      "mah",
      "hours",
      "drain",
    ],
    "camera quality": [
      "camera",
      "photo",
      "picture",
      "selfie",
      "portrait",
      "night mode",
      "lens",
    ],
    "performance speed": [
      "performance",
      "speed",
      "fast",
      "slow",
      "lag",
      "hang",
      "smooth",
      "ram",
      "processor",
    ],
    "heating issues": [
      "heat",
      "hot",
      "warm",
      "overheat",
      "thermal",
      "temperature",
    ],
    "display quality": [
      "display",
      "screen",
      "brightness",
      "amoled",
      "lcd",
      "oled",
      "color",
      "colour",
    ],
    "build quality": [
      "build",
      "premium",
      "plastic",
      "metal",
      "sturdy",
      "flimsy",
      "solid",
      "cheap feel",
    ],
    "sound quality": [
      "sound",
      "audio",
      "music",
      "bass",
      "treble",
      "loud",
      "clear",
      "crisp",
    ],
    "noise cancellation": [
      "noise cancel",
      "anc",
      "noise",
      "cancellation",
      "isolation",
      "ambient",
    ],
    comfort: [
      "comfort",
      "comfortable",
      "fit",
      "tight",
      "loose",
      "hurts",
      "padding",
      "cushion",
    ],
    "microphone clarity": [
      "mic",
      "microphone",
      "call quality",
      "calls",
      "voice",
      "wind noise",
    ],
    "bluetooth connectivity": [
      "bluetooth",
      "connection",
      "pairing",
      "disconnect",
      "range",
      "latency",
      "lag",
    ],
    "water resistance": [
      "water",
      "waterproof",
      "rain",
      "sweat",
      "splash",
      "ip67",
      "ip68",
      "ipx",
    ],
    "charging speed": [
      "charge",
      "charging",
      "fast charge",
      "watt",
      "turbo",
      "dash charge",
      "quick charge",
    ],
    "software experience": [
      "software",
      "ui",
      "update",
      "bloatware",
      "ads",
      "notification",
      "bug",
      "os",
    ],
    "after-sales service": [
      "service",
      "warranty",
      "support",
      "repair",
      "replacement",
      "customer care",
    ],
    "cooling performance": [
      "cooling",
      "cool",
      "cold",
      "temperature",
      "frost",
      "ice",
      "chill",
    ],
    "energy efficiency": [
      "energy",
      "power",
      "electricity",
      "bill",
      "consumption",
      "star rating",
      "inverter",
    ],
    "noise level": [
      "noise",
      "noisy",
      "silent",
      "quiet",
      "loud",
      "sound",
      "vibration",
      "hum",
    ],
    "wash quality": ["wash", "clean", "stain", "dirt", "detergent", "rinse"],
    "grinding power": [
      "grind",
      "grinding",
      "blend",
      "chutney",
      "batter",
      "idli",
      "dosa",
    ],
    "skin improvement": [
      "skin",
      "glow",
      "acne",
      "pimple",
      "hydrat",
      "moistur",
      "dry",
      "oily",
      "soft",
    ],
    "fit and comfort": [
      "fit",
      "comfort",
      "ear tip",
      "falls",
      "secure",
      "loose",
      "tight",
      "hurt",
    ],
  };

  // Add synonyms if aspect matches a known pattern
  for (const [key, syns] of Object.entries(synonymMap)) {
    if (base.includes(key) || key.includes(base)) {
      keywords.push(...syns);
      break; // Only match one synonym group
    }
    // Partial match: if any word of the aspect is in a synonym key
    if (words.some((w) => key.includes(w) && w.length > 4)) {
      keywords.push(...syns);
      break;
    }
  }

  // Deduplicate
  return [...new Set(keywords)];
}

// ── Compress reviews into token-efficient format ────────────────
// 50 reviews × ~100 words each = ~5000 words = ~7500 tokens (too much)
// Compressed: 50 reviews × ~30 words each = ~1500 words = ~2000 tokens (good)
function compressReviews(reviews) {
  return reviews
    .map((r) => {
      const star = r.starRating || "?";
      const verified = r.verifiedPurchase ? " Verified" : "";
      const helpful = r.helpfulVotes > 0 ? ` (${r.helpfulVotes} helpful)` : "";

      // Title: keep as-is (usually short and informative)
      const title = r.title ? r.title.trim() : "";

      // Body: truncate to first 200 chars (captures the main point)
      let body = r.body ? r.body.trim() : "";
      if (body.length > 200) {
        // Cut at last complete sentence within 200 chars
        const cutPoint = body.lastIndexOf(".", 200);
        body =
          cutPoint > 80
            ? body.slice(0, cutPoint + 1)
            : body.slice(0, 200) + "...";
      }

      // Skip empty reviews
      if (!title && !body) return null;

      return `[${star}★${verified}]${helpful} ${title}${title && body ? ": " : ""}${body}`;
    })
    .filter(Boolean)
    .join("\n");
}

// ═════════════════════════════════════════════════════════════════
// STEP 3: GPT CALL
// ═════════════════════════════════════════════════════════════════

async function callGPT(systemPrompt, userPrompt) {
  const client = getOpenAIClient();

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      logger.error("🤖 AI Analysis: GPT response has no content");
      return null;
    }

    // Log token usage for cost tracking
    const usage = response.usage;
    if (usage) {
      logger.info(
        `🤖 AI Analysis: tokens — prompt=${usage.prompt_tokens} ` +
          `completion=${usage.completion_tokens} total=${usage.total_tokens}`,
      );
    }

    // Parse JSON response
    const parsed = parseGPTResponse(content);
    return parsed;
  } catch (err) {
    // Handle specific OpenAI errors
    if (err.status === 429) {
      logger.error(
        "🤖 AI Analysis: OpenAI rate limited (429) — back off and retry later",
      );
    } else if (err.status === 401) {
      logger.error(
        "🤖 AI Analysis: OpenAI auth failed (401) — check OPENAI_API_KEY",
      );
    } else if (err.status === 500 || err.status === 503) {
      logger.error(
        `🤖 AI Analysis: OpenAI server error (${err.status}) — transient, retry later`,
      );
    } else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      logger.error(
        `🤖 AI Analysis: OpenAI connection failed (${err.code}) — network issue`,
      );
    } else {
      logger.error(`🤖 AI Analysis: OpenAI call failed — ${err.message}`);
    }
    return null;
  }
}

// ── Parse and validate GPT JSON response ────────────────────────
function parseGPTResponse(content) {
  try {
    // Strip markdown code fences if present (GPT sometimes wraps JSON)
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Validate required fields exist (don't crash on partial responses)
    if (!parsed.aspectScores || typeof parsed.aspectScores !== "object") {
      logger.warn(
        "🤖 AI Analysis: GPT response missing aspectScores — using empty object",
      );
      parsed.aspectScores = {};
    }

    if (
      !parsed.overallSentiment ||
      typeof parsed.overallSentiment !== "object"
    ) {
      logger.warn(
        "🤖 AI Analysis: GPT response missing overallSentiment — using defaults",
      );
      parsed.overallSentiment = { positive: 50, neutral: 30, negative: 20 };
    }

    // Ensure arrays
    if (!Array.isArray(parsed.whatPeopleLove)) parsed.whatPeopleLove = [];
    if (!Array.isArray(parsed.commonComplaints)) parsed.commonComplaints = [];
    if (!Array.isArray(parsed.redFlags)) parsed.redFlags = [];

    // Ensure strings
    if (typeof parsed.buyRecommendation !== "string")
      parsed.buyRecommendation = null;
    if (typeof parsed.avoidIf !== "string") parsed.avoidIf = null;
    if (typeof parsed.reviewQualitySummary !== "string")
      parsed.reviewQualitySummary = null;

    // Validate confidence level
    if (!["high", "medium", "low"].includes(parsed.confidenceLevel)) {
      parsed.confidenceLevel = "medium";
    }

    // Clamp aspect scores to 0-10
    for (const [key, val] of Object.entries(parsed.aspectScores)) {
      if (typeof val !== "number") {
        parsed.aspectScores[key] = parseFloat(val) || 5;
      }
      parsed.aspectScores[key] = Math.max(
        0,
        Math.min(10, parsed.aspectScores[key]),
      );
    }

    // Clamp sentiment percentages
    for (const key of ["positive", "neutral", "negative"]) {
      if (typeof parsed.overallSentiment[key] !== "number") {
        parsed.overallSentiment[key] =
          parseFloat(parsed.overallSentiment[key]) || 0;
      }
      parsed.overallSentiment[key] = Math.max(
        0,
        Math.min(100, parsed.overallSentiment[key]),
      );
    }

    return parsed;
  } catch (parseErr) {
    logger.error(
      `🤖 AI Analysis: failed to parse GPT JSON — ${parseErr.message}`,
    );
    logger.error(
      `🤖 AI Analysis: raw content (first 500 chars): ${content.slice(0, 500)}`,
    );
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// STEP 4: FINAL AI SCORE CALCULATION
// ═════════════════════════════════════════════════════════════════
// Formula:
//   aspectSentimentAvg  × 0.35  (GPT's aspect scores averaged)
//   authenticityScore   × 0.25  (statistical authenticity → 0-10)
//   recencyScore        × 0.20  (recent reviews = higher trust)
//   valueForMoneyScore  × 0.10  (from GPT aspects if available)
//   reviewVolumeScore   × 0.10  (log-scale confidence)
// ─────────────────────────────────────────────────────────────────

function calculateFinalScore(
  aiOutput,
  authenticity,
  reviews,
  starDistribution,
) {
  // ── 1. Aspect Sentiment Average (0-10) ──────────────────────
  const aspectValues = Object.values(aiOutput.aspectScores || {});
  const aspectSentimentAvg =
    aspectValues.length > 0
      ? aspectValues.reduce((sum, v) => sum + v, 0) / aspectValues.length
      : sentimentToScore(aiOutput.overallSentiment);

  // ── 2. Authenticity Score (0-100 → 0-10) ───────────────────
  const authenticityNorm = (authenticity.authenticityScore / 100) * 10;

  // ── 3. Recency Score (0-10) ─────────────────────────────────
  // Reviews from the last 90 days get full weight. Older reviews decay.
  const recencyScore = computeRecencyScore(reviews);

  // ── 4. Value For Money Score (0-10) ─────────────────────────
  // Pull from aspect scores if the AI evaluated it, otherwise neutral 6.0
  const valueForMoneyScore = extractValueScore(aiOutput.aspectScores);

  // ── 5. Review Volume Score (0-10, log scale) ────────────────
  // 0 reviews → 0, 10 → ~2.5, 50 → ~4.2, 100 → ~5, 1000 → ~7.5, 10000 → 10
  const volumeScore =
    reviews.length === 0
      ? 0
      : Math.min(10, (Math.log10(reviews.length + 1) / Math.log10(10001)) * 10);

  // ── WEIGHTED FINAL SCORE ────────────────────────────────────
  const rawScore =
    aspectSentimentAvg * SCORE_WEIGHTS.aspectSentiment +
    authenticityNorm * SCORE_WEIGHTS.authenticity +
    recencyScore * SCORE_WEIGHTS.recency +
    valueForMoneyScore * SCORE_WEIGHTS.valueForMoney +
    volumeScore * SCORE_WEIGHTS.reviewVolume;

  const finalScore = Math.round(Math.max(0, Math.min(10, rawScore)) * 10) / 10;

  logger.info(
    `🤖 Score breakdown: aspects=${aspectSentimentAvg.toFixed(1)} × 0.35 | ` +
      `auth=${authenticityNorm.toFixed(1)} × 0.25 | ` +
      `recency=${recencyScore.toFixed(1)} × 0.20 | ` +
      `value=${valueForMoneyScore.toFixed(1)} × 0.10 | ` +
      `volume=${volumeScore.toFixed(1)} × 0.10 → ` +
      `final=${finalScore}`,
  );

  return finalScore;
}

// ── Recency Score: recent reviews = more trustworthy ────────────
// Calculates a weighted score where reviews from the last 90 days
// get full points, and older reviews gradually contribute less.
function computeRecencyScore(reviews) {
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  const dated = reviews.filter((r) => r.date);

  if (dated.length === 0) return 5.0; // No dates available — neutral score

  let weightedSum = 0;
  let totalWeight = 0;

  for (const review of dated) {
    const reviewTime = new Date(review.date).getTime();
    if (isNaN(reviewTime)) continue;

    const ageMs = now - reviewTime;

    let weight;
    if (ageMs <= ninetyDaysMs) {
      // Last 90 days: full weight
      weight = 1.0;
    } else if (ageMs <= oneYearMs) {
      // 90 days to 1 year: linear decay from 1.0 to 0.3
      weight =
        1.0 - 0.7 * ((ageMs - ninetyDaysMs) / (oneYearMs - ninetyDaysMs));
    } else {
      // Older than 1 year: minimal weight
      weight = 0.2;
    }

    // Weight by star rating: 3-5 stars contribute positively, 1-2 negatively
    const starFactor = review.starRating ? (review.starRating / 5) * 10 : 5;
    weightedSum += starFactor * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 5.0;
  return Math.min(10, Math.max(0, weightedSum / totalWeight));
}

// ── Extract value-for-money score from aspect scores ────────────
// Looks for any aspect related to value/price in the GPT output.
function extractValueScore(aspectScores) {
  if (!aspectScores || typeof aspectScores !== "object") return 6.0;

  const valueKeys = [
    "value for money",
    "value_for_money",
    "price",
    "pricing",
    "affordability",
    "cost",
    "worth",
  ];

  for (const [key, val] of Object.entries(aspectScores)) {
    const lowerKey = key.toLowerCase().replace(/[_-]/g, " ");
    if (valueKeys.some((vk) => lowerKey.includes(vk))) {
      return typeof val === "number" ? val : 6.0;
    }
  }

  return 6.0; // Neutral if not evaluated
}

// ── Convert sentiment percentages to a 0-10 score ──────────────
function sentimentToScore(sentiment) {
  if (!sentiment) return 5.0;
  const positive = sentiment.positive || 0;
  const negative = sentiment.negative || 0;
  // Simple: positive% mapped to 0-10, adjusted by negative
  return Math.max(0, Math.min(10, positive / 10 - negative / 20));
}

// ═════════════════════════════════════════════════════════════════
// LOW-CONFIDENCE FALLBACK
// ═════════════════════════════════════════════════════════════════
// When there are too few reviews for meaningful AI analysis,
// return a minimal result with "low" confidence.

function buildLowConfidenceResult(
  productName,
  category,
  reviews,
  starDistribution,
) {
  const reviewCount = reviews?.length || 0;
  const authenticity =
    reviewCount > 0
      ? checkReviewAuthenticity(reviews, starDistribution)
      : {
          badge: "medium",
          authenticityScore: 50,
          flags: ["Insufficient reviews"],
        };

  // Basic sentiment from star distribution
  const total = Object.values(starDistribution || {}).reduce(
    (s, n) => s + n,
    0,
  );
  let positive = 50,
    neutral = 30,
    negative = 20;
  if (total > 0) {
    positive = Math.round(
      (((starDistribution[4] || 0) + (starDistribution[5] || 0)) / total) * 100,
    );
    negative = Math.round(
      (((starDistribution[1] || 0) + (starDistribution[2] || 0)) / total) * 100,
    );
    neutral = Math.max(0, 100 - positive - negative);
  }

  logger.info(
    `🤖 AI Analysis: returning low-confidence result for "${productName}" (${reviewCount} reviews)`,
  );

  return {
    aspectScores: {},
    overallSentiment: { positive, neutral, negative },
    whatPeopleLove: [],
    commonComplaints: [],
    redFlags: [],
    buyRecommendation: null,
    avoidIf: null,
    confidenceLevel: "low",
    reviewQualitySummary: `Only ${reviewCount} review${reviewCount !== 1 ? "s" : ""} available — insufficient for detailed AI analysis.`,
    aiScore: null,
    authenticityBadge: authenticity.badge,
    authenticityFlags: authenticity.flags,
    reviewsAnalyzed: reviewCount,
    analysisDate: new Date(),
  };
}

// ═════════════════════════════════════════════════════════════════
// SPEC-BASED ANALYSIS (no reviews available)
// ═════════════════════════════════════════════════════════════════
// When Amazon review scraping returns 0 results (new products, blocked),
// use the product's official feature bullet points + platform rating
// to produce GPT-4o-mini insights.
//
// Output shape is identical to analyzeProduct() so the pipeline is unchanged.
// Confidence is always "low-medium" — flagged as spec-based in badge.
// aiScore is capped at 7.5 (can't fully trust without real reviews).
// ─────────────────────────────────────────────────────────────────

/**
 * Analyze a product using its specs/features instead of reviews.
 * Used when review scraping returns 0 results.
 *
 * @param {string}   productName     - Full product name
 * @param {string}   category        - Category slug (e.g. "laptops")
 * @param {string[]} features        - Amazon feature bullet points array
 * @param {Object}   opts
 * @param {number}   opts.platformRating  - Amazon star rating (1-5)
 * @param {number}   opts.reviewCount     - Amazon total review count (for context)
 * @param {string}   opts.brand           - Brand name
 * @param {number}   opts.price           - Current price in INR
 * @returns {Object|null}
 */
async function analyzeProductFromSpecs(
  productName,
  category,
  features = [],
  opts = {},
) {
  const {
    platformRating = null,
    reviewCount = 0,
    brand = null,
    price = null,
  } = opts;
  const startTime = Date.now();

  const hasFeatures = features && features.length > 0;
  logger.info(
    `🤖 SpecsAnalysis: starting for "${productName}" [${category}] — ${hasFeatures ? features.length + " features" : "name/brand/price only (no spec bullets)"}`,
  );

  const catConfig = getCategoryConfig(category);
  const aspects = getAspects(category).slice(0, 8); // max 8 aspects for spec-based
  const categoryName = catConfig ? catConfig.name : category;

  const priceStr = price
    ? `₹${Math.round(price).toLocaleString("en-IN")}`
    : "unknown";
  const ratingStr = platformRating
    ? `${platformRating}/5 (${reviewCount} ratings on Amazon)`
    : "not available";
  const brandStr = brand || "unknown brand";

  const specsSection = hasFeatures
    ? `OFFICIAL FEATURES / SPECS:\n${features.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
    : `OFFICIAL FEATURES / SPECS: Not available — infer strengths and trade-offs from the product name, brand reputation, category, and price tier.`;

  const systemPrompt = `You are a senior product analyst for bestpickr.in, an AI-powered product ranking platform for Indian shoppers. You are analyzing a product based on its Amazon India listing — NO customer reviews are available yet.

RULES:
1. Use product name, brand, price tier, and any provided specs to reason about the product.
2. If no spec bullets are provided, use your knowledge of the brand/product line/price tier to infer realistic pros and cons.
3. For "whatPeopleLove", list 3 genuine strengths specific to this product (specs, brand reliability, value at price point).
4. For "commonComplaints", list 2 realistic trade-offs for this product at this price.
5. "buyRecommendation": clear 1-2 sentence verdict for Indian buyers — who should buy this and why.
6. "avoidIf": 1 sentence on who should NOT buy this.
7. confidenceLevel: "low" always for spec/name-only analysis.
8. Aspect scores 0-10: use brand reputation + price tier + known product line quality. Score generously for well-known brands at fair prices.
9. Be specific — mention the product name and price in your recommendation.

You must respond with ONLY a valid JSON object. No markdown, no explanation.`;

  const userPrompt = `Analyze this ${categoryName} for Indian shoppers:

PRODUCT: ${productName}
BRAND: ${brandStr}
PRICE: ${priceStr}
AMAZON RATING: ${ratingStr}

${specsSection}

ASPECTS TO SCORE (0-10):
${aspects.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Respond with this EXACT JSON:
{
  "aspectScores": { ${aspects.map((a) => `"${a}": <0-10>`).join(", ")} },
  "overallSentiment": { "positive": <0-100>, "neutral": <0-100>, "negative": <0-100> },
  "whatPeopleLove": ["<strength 1 with specific detail>", "<strength 2>", "<strength 3>"],
  "commonComplaints": ["<trade-off 1 with specific detail>", "<trade-off 2>"],
  "redFlags": [],
  "buyRecommendation": "<1-2 sentence verdict mentioning product name and price for Indian buyers>",
  "avoidIf": "<type of user who should NOT buy this>",
  "confidenceLevel": "low",
  "reviewQualitySummary": "${hasFeatures ? "Analysis based on official product specifications — customer reviews not yet available." : "Analysis based on product name, brand, and price tier — customer reviews not yet available."}"
}`;

  try {
    const aiOutput = await callGPT(systemPrompt, userPrompt);

    if (!aiOutput) {
      logger.error(`🤖 SpecsAnalysis: GPT returned null for "${productName}"`);
      return null;
    }

    // Cap spec-based score at 7.5 — needs real reviews to earn higher
    const rawScore =
      Object.values(aiOutput.aspectScores || {}).reduce((s, v) => s + v, 0) /
      Math.max(1, Object.keys(aiOutput.aspectScores || {}).length);

    // Blend with platform rating if available
    let aiScore;
    if (platformRating) {
      const ratingNorm = (platformRating / 5) * 10; // 0-10
      const specScore = Math.min(7.5, rawScore); // cap at 7.5
      aiScore = Math.round((specScore * 0.6 + ratingNorm * 0.4) * 10) / 10;
    } else {
      aiScore = Math.round(Math.min(7.5, rawScore) * 10) / 10;
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      `🤖 SpecsAnalysis: COMPLETE for "${productName}" — aiScore=${aiScore} in ${elapsed}ms`,
    );

    return {
      aspectScores: aiOutput.aspectScores || {},
      overallSentiment: aiOutput.overallSentiment || {
        positive: 60,
        neutral: 30,
        negative: 10,
      },
      whatPeopleLove: aiOutput.whatPeopleLove || [],
      commonComplaints: aiOutput.commonComplaints || [],
      redFlags: [], // never populate red flags from specs alone
      buyRecommendation: aiOutput.buyRecommendation || null,
      avoidIf: aiOutput.avoidIf || null,
      confidenceLevel: "low",
      reviewQualitySummary:
        aiOutput.reviewQualitySummary ||
        "Analysis based on official product specifications — customer reviews not yet available.",
      aiScore,
      authenticityBadge: "spec-based", // new badge type — UI renders a different label
      authenticityFlags: [
        "Analysis based on product specs, not customer reviews",
      ],
      reviewsAnalyzed: 0,
      specsAnalyzed: hasFeatures ? features.length : 0,
      analysisDate: new Date(),
      _pipelineMeta: { source: "spec-analysis", fresh: true, elapsed },
    };
  } catch (err) {
    logger.error(
      `🤖 SpecsAnalysis: FAILED for "${productName}" — ${err.message}`,
    );
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  analyzeProduct,
  analyzeProductFromSpecs,
  // Exported for testing individual steps
  buildPrompt,
  calculateFinalScore,
  compressReviews,
  filterAspectsByReviewContent,
};
