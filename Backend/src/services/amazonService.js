// src/services/amazonService.js — Amazon PA5 API Integration
// ─────────────────────────────────────────────────────────────────
// Uses: Amazon Product Advertising API v5
// Docs: https://webservices.amazon.in/paapi5/documentation/
//
// HOW IT WORKS:
//   1. We send a signed HTTP request to Amazon's API
//   2. Amazon returns product data (name, price, rating, reviews, image)
//   3. We normalize it to our standard format
//   4. Affiliate links include our Associate Tag → we earn commission
// ─────────────────────────────────────────────────────────────────
const axios = require("axios");
const crypto = require("crypto");
const logger = require("../utils/logger");

const {
  AMAZON_ACCESS_KEY,
  AMAZON_SECRET_KEY,
  AMAZON_ASSOCIATE_TAG,
  AMAZON_HOST = "webservices.amazon.in",
  AMAZON_REGION = "eu-west-1",
} = process.env;

const SERVICE = "ProductAdvertisingAPI";
const PATH = "/paapi5/searchitems";

// ── AWS SIGNATURE V4 (required by Amazon API) ─────────────────────
// Amazon requires every request to be signed with your secret key.
// This proves you're authorized and prevents tampering.
function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}
function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = sign(`AWS4${secretKey}`, dateStamp);
  const kRegion = sign(kDate, region);
  const kService = sign(kRegion, service);
  return sign(kService, "aws4_request");
}

function buildSignedRequest(payload) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    Host: AMAZON_HOST,
    "X-Amz-Date": amzDate,
    "X-Amz-Target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
  };

  const canonicalHeaders =
    Object.entries(headers)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
      .join("\n") + "\n";

  const signedHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .join(";");

  const canonicalRequest = [
    "POST",
    PATH,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${AMAZON_REGION}/${SERVICE}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n` +
    crypto.createHash("sha256").update(canonicalRequest).digest("hex");

  const signingKey = getSignatureKey(
    AMAZON_SECRET_KEY,
    dateStamp,
    AMAZON_REGION,
    SERVICE,
  );
  const signature = sign(signingKey, stringToSign).toString("hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${AMAZON_ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: { ...headers, Authorization: authorizationHeader },
    url: `https://${AMAZON_HOST}${PATH}`,
  };
}

// ── SEARCH PRODUCTS ───────────────────────────────────────────────
/**
 * Search Amazon for products matching the query.
 * Returns normalized product array.
 *
 * @param {string} query     - Search term (e.g., "Sony headphones")
 * @param {string} category  - Amazon search index (e.g., "Electronics")
 * @returns {Array}          - Normalized products
 */
async function searchProducts(query, category = "All") {
  if (!AMAZON_ACCESS_KEY || !AMAZON_SECRET_KEY) {
    logger.warn("Amazon API keys not configured — skipping Amazon");
    return [];
  }

  const payload = {
    Keywords: query,
    SearchIndex: mapToAmazonIndex(category),
    Resources: [
      "ItemInfo.Title",
      "ItemInfo.ByLineInfo",
      "ItemInfo.Features",
      "Offers.Listings.Price",
      "Offers.Listings.Availability.Type",
      "CustomerReviews.Count",
      "CustomerReviews.StarRating",
      "Images.Primary.Large",
    ],
    PartnerTag: AMAZON_ASSOCIATE_TAG,
    PartnerType: "Associates",
    Marketplace: "www.amazon.in",
    ItemCount: 10,
  };

  try {
    const { headers, url } = buildSignedRequest(payload);
    const response = await axios.post(url, payload, {
      headers,
      timeout: 10000,
    });
    const items = response.data?.SearchResult?.Items || [];
    return items.map(normalizeAmazonItem);
  } catch (err) {
    logger.error("Amazon API error:", {
      message: err.message,
      status: err.response?.status,
    });
    return [];
  }
}

// ── YOUR AFFILIATE URLS ───────────────────────────────────────────
// Add your Amazon Associates links here, keyed by ASIN.
// Get the full URL from Associates portal, then remove:
//   social_share=..., badgeInsights=..., th=1
// Keep: tag=, linkCode=, linkId=, ref_=
//
// These are used when the API returns a product matching this ASIN.
const MANUAL_AFFILIATE_URLS = {
  B0CCLMLRY8:
    "https://www.amazon.in/dp/B0CCLMLRY8?tag=bestpickr-21&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl",
  B0C591TT8F:
    "https://www.amazon.in/dp/B0C591TT8F?tag=bestpickr-21&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl",
  B07DQXH8JZ:
    "https://www.amazon.in/dp/B07DQXH8JZ?tag=bestpickr-21&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl",
  // Add more as you generate links from Amazon Associates portal
};

// Build the affiliate URL: manual link first, then auto-generated fallback
function buildAffiliateUrl(asin, detailPageUrl) {
  if (MANUAL_AFFILIATE_URLS[asin]) return MANUAL_AFFILIATE_URLS[asin];
  if (asin && AMAZON_ASSOCIATE_TAG) {
    return `https://www.amazon.in/dp/${asin}?tag=${AMAZON_ASSOCIATE_TAG}&linkCode=ll1&ref_=as_li_ss_tl`;
  }
  return detailPageUrl;
}

// ── NORMALIZE: Amazon → bestpickr format ─────────────────────────
function normalizeAmazonItem(item) {
  const price = item.Offers?.Listings?.[0]?.Price?.Amount;
  const reviews = item.CustomerReviews;
  const asin = item.ASIN;

  return {
    platform: "Amazon",
    platformId: asin,
    name: item.ItemInfo?.Title?.DisplayValue || "Unknown Product",
    brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue,
    price: price ? parseFloat(price) : null,
    currency: "INR",
    rating: reviews?.StarRating?.Value
      ? parseFloat(reviews.StarRating.Value)
      : null,
    reviewCount: reviews?.Count?.Value ? parseInt(reviews.Count.Value) : 0,
    imageUrl: item.Images?.Primary?.Large?.URL,
    url: item.DetailPageURL,
    affiliateUrl: buildAffiliateUrl(asin, item.DetailPageURL),
    inStock: item.Offers?.Listings?.[0]?.Availability?.Type === "Now",
    positivePct: null,
  };
}

// ── CATEGORY MAPPING ──────────────────────────────────────────────
function mapToAmazonIndex(category) {
  const map = {
    headphones: "Electronics",
    smartphones: "Electronics",
    laptops: "Computers",
    gaming: "VideoGames",
    footwear: "Shoes",
    skincare: "Beauty",
    fashion: "Apparel",
    books: "Books",
    appliances: "Kitchen",
  };
  return map[category?.toLowerCase()] || "All";
}

// ── MOCK DATA (when API keys not available) ───────────────────────
// ✅ All URLs use clean dp/ASIN?tag= format — no amzn.to shortlinks
// ✅ Mock data uses the same 3 products as your Hot Deals section for consistency
function getMockData(query) {
  logger.info(`Amazon mock data for: "${query}"`);
  const tag = AMAZON_ASSOCIATE_TAG || "bestpickr-21";
  return [
    {
      platform: "Amazon",
      platformId: "B0CCLMLRY8",
      name: "LEMBOSE Plastic Fridge Storage Refrigerator Organizer Container with Lid - 5L, Transparent",
      brand: "LEMBOSE",
      price: 249,
      rating: 4.5,
      reviewCount: 41200,
      imageUrl:
        "https://m.media-amazon.com/images/I/71WqBJFa2TL._SX342_SY445_.jpg",
      url: `https://www.amazon.in/dp/B0CCLMLRY8`,
      affiliateUrl: `https://www.amazon.in/dp/B0CCLMLRY8?tag=${tag}&linkCode=ll2&linkId=3224d39e3ae39a53dc87cfaca0257221&ref_=as_li_ss_tl`,
      inStock: true,
      positivePct: 84,
      currency: "INR",
    },
    {
      platform: "Amazon",
      platformId: "B07DQXH8JZ",
      name: "Scotch-Brite Microfiber Polishing Wipe for cleaning TV, Mobile, Laptop, Tablet screens & Spectacles (Pack of 1, Grey)",
      brand: "Scotch-Brite",
      price: 169,
      rating: 4.2,
      reviewCount: 3665,
      imageUrl:
        "https://m.media-amazon.com/images/I/61RI+lFf3HL._SX342_SY445_.jpg",
      url: `https://www.amazon.in/dp/B07DQXH8JZ`,
      affiliateUrl: `https://www.amazon.in/dp/B07DQXH8JZ?tag=${tag}&linkCode=ll2&linkId=87747a090d2be209a3f34aed820729aa&ref_=as_li_ss_tl`,
      inStock: true,
      positivePct: 79,
      currency: "INR",
    },
    {
      platform: "Amazon",
      platformId: "B0C591TT8F",
      name: "Cubic Classic A5 Journal – 160 Pages, 80 gsm | PU Leather Hardbound Notebook with Pen Loop | Black Diary",
      brand: "Cubic",
      price: 167,
      rating: 4.2,
      reviewCount: 780,
      imageUrl:
        "https://m.media-amazon.com/images/I/71k3o+gJgFL._SX342_SY445_.jpg",
      url: `https://www.amazon.in/dp/B0C591TT8F`,
      affiliateUrl: `https://www.amazon.in/dp/B0C591TT8F?tag=${tag}&linkCode=ll2&linkId=2657a6de8c2932c182b76deb8e749024&ref_=as_li_ss_tl`,
      inStock: true,
      positivePct: 76,
      currency: "INR",
    },
  ];
}

module.exports = { searchProducts };
