// src/seoRoutes.js
// ─────────────────────────────────────────────────────────────────
// SEO LANDING PAGES — How This Works:
//
// When someone searches "best mobiles to buy in 2026 february" on Google,
// we want our page bestpickr.in/best-mobiles-to-buy-2026 to show up.
//
// When they click that result and land on bestpickr.in/best-mobiles-to-buy-2026,
// the app reads this file, finds the matching route, and AUTOMATICALLY
// fires a search for "best smartphones india 2026" — showing them
// exactly what they were looking for, with real Amazon + Flipkart data.
//
// HOW TO ADD MORE:
//   1. Add a new entry to SEO_ROUTES below
//   2. Add the URL to UI/public/sitemap.xml
//   3. Google will index it within days of you submitting the sitemap
//
// URL FORMAT: bestpickr.in/best-CATEGORY-india-YEAR
// ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR  = new Date().getFullYear()
const CURRENT_MONTH = new Date().toLocaleString('en-IN', { month: 'long' })

export const SEO_ROUTES = {
  // ── MOBILES / SMARTPHONES ───────────────────────────────────────
  'best-mobiles-india-2026': {
    query:       'best smartphones india 2026',
    category:    'smartphones',
    title:       `Best Mobiles to Buy in India 2026 — bestpickr`,
    h1:          `Best Mobiles to Buy in India in 2026`,
    description: `Top rated smartphones in India for 2026 — ranked by AI across Amazon & Flipkart. Unbiased scores based on ${CURRENT_MONTH} ${CURRENT_YEAR} buyer reviews.`,
    keywords:    'best mobiles india 2026, best smartphones to buy 2026, best phone under 20000 india, top mobile phones india 2026, best 5g phones india',
  },
  'best-mobiles-under-20000': {
    query:       'best smartphones under 20000',
    category:    'smartphones',
    title:       `Best Mobiles Under ₹20,000 in India 2026 — bestpickr`,
    h1:          `Best Mobiles Under ₹20,000 — AI Ranked`,
    description: `Find the best smartphone under ₹20,000 in India. AI-ranked across Amazon & Flipkart using ${CURRENT_MONTH} ${CURRENT_YEAR} buyer data.`,
    keywords:    'best mobile under 20000, best phone under 20000 india 2026, best budget smartphone india, best 5g phone under 20000',
  },
  'best-5g-phones-india-2026': {
    query:       'best 5g smartphones india 2026',
    category:    'smartphones',
    title:       `Best 5G Phones in India 2026 — bestpickr`,
    h1:          `Best 5G Smartphones in India 2026`,
    description: `Top 5G phones in India ranked by AI — real buyer ratings from Amazon & Flipkart. Updated ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best 5g phones india 2026, top 5g smartphones india, best 5g mobile under 15000, best 5g phone 2026',
  },

  // ── HEADPHONES / AUDIO ──────────────────────────────────────────
  'best-headphones-india-2026': {
    query:       'best headphones india 2026',
    category:    'headphones',
    title:       `Best Headphones in India 2026 — bestpickr`,
    h1:          `Best Headphones to Buy in India in 2026`,
    description: `AI-ranked headphones across Amazon & Flipkart. Best noise cancelling, wireless & budget headphones in India — updated ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best headphones india 2026, best wireless headphones india, best noise cancelling headphones india, best earphones under 2000 india',
  },
  'best-earbuds-india-2026': {
    query:       'best true wireless earbuds india 2026',
    category:    'headphones',
    title:       `Best Earbuds in India 2026 — bestpickr`,
    h1:          `Best True Wireless Earbuds in India 2026`,
    description: `Top rated TWS earbuds in India. AI score based on real buyer reviews from Amazon & Flipkart — ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best earbuds india 2026, best tws earbuds india, best earphones india 2026, best boat earbuds, best nothing ear',
  },

  // ── LAPTOPS ─────────────────────────────────────────────────────
  'best-laptops-india-2026': {
    query:       'best laptops india 2026',
    category:    'laptops',
    title:       `Best Laptops in India 2026 — bestpickr`,
    h1:          `Best Laptops to Buy in India in 2026`,
    description: `Top laptops ranked by AI across Amazon & Flipkart. Best for students, gaming & professionals in India — ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best laptops india 2026, best laptop for students india, best gaming laptop india, best laptop under 50000 india',
  },
  'best-laptops-for-students': {
    query:       'best laptops for students india under 50000',
    category:    'laptops',
    title:       `Best Laptops for Students in India 2026 — bestpickr`,
    h1:          `Best Laptops for Students in India 2026`,
    description: `Best student laptops in India ranked by AI. Affordable, long battery, lightweight — AI score from real Amazon & Flipkart buyers.`,
    keywords:    'best laptop for students india 2026, best budget laptop india, laptop under 40000 india, best laptop for college students',
  },

  // ── GAMING ──────────────────────────────────────────────────────
  'best-gaming-mouse-india-2026': {
    query:       'best gaming mouse india 2026',
    category:    'gaming',
    title:       `Best Gaming Mouse in India 2026 — bestpickr`,
    h1:          `Best Gaming Mouse in India 2026`,
    description: `Top gaming mice ranked by AI from real buyer reviews on Amazon India. Best wired, wireless & budget gaming mice — ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best gaming mouse india 2026, best wireless gaming mouse india, best gaming mouse under 2000, logitech vs razer india',
  },

  // ── HOME APPLIANCES ─────────────────────────────────────────────
  'best-air-fryer-india-2026': {
    query:       'best air fryer india 2026',
    category:    'appliances',
    title:       `Best Air Fryer in India 2026 — bestpickr`,
    h1:          `Best Air Fryers in India 2026 — AI Ranked`,
    description: `Best air fryers in India ranked by AI. Real buyer ratings from Amazon & Flipkart — ${CURRENT_MONTH} ${CURRENT_YEAR}. Find the best one for your budget.`,
    keywords:    'best air fryer india 2026, best air fryer under 5000 india, best air fryer brand india, philips vs instant vortex india',
  },

  // ── SKINCARE / BEAUTY ───────────────────────────────────────────
  'best-skincare-india-2026': {
    query:       'best skincare products india 2026',
    category:    'skincare',
    title:       `Best Skincare Products in India 2026 — bestpickr`,
    h1:          `Best Skincare Products in India 2026`,
    description: `AI-ranked skincare across Amazon, Flipkart & Myntra. Best serums, sunscreens & moisturisers in India — updated ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best skincare products india 2026, best serum india, best sunscreen india 2026, minimalist vs the ordinary india',
  },

  // ── BLOG SEO LANDING PAGES ──────────────────────────────────────
  'blog/smartphones': {
    query:       'best smartphones india',
    category:    'smartphones',
    title:       `Smartphone Reviews & Buying Guides | bestpickr blog`,
    h1:          `Smartphone Reviews & Buying Guides for India`,
    description: `Expert smartphone reviews and buying guides for Indian buyers. Compare prices across Amazon & Flipkart with AI-powered analysis — updated ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'smartphone review india 2026, best phone india, smartphone buying guide india, android review india',
  },
  'blog/laptops': {
    query:       'best laptops india',
    category:    'laptops',
    title:       `Laptop Reviews & Buying Guides | bestpickr blog`,
    h1:          `Laptop Reviews & Buying Guides for India`,
    description: `In-depth laptop reviews and buying guides for Indian consumers. Best laptops for students, work & gaming — AI-analyzed across Amazon & Flipkart.`,
    keywords:    'laptop review india 2026, best laptop india, laptop buying guide india, gaming laptop review india',
  },
  'blog/deals': {
    query:       'best deals india',
    category:    'Deals',
    title:       `Best Tech Deals India | bestpickr blog`,
    h1:          `Best Tech Deals & Offers in India`,
    description: `Latest tech deals and discounts on Amazon.in and Flipkart. AI-curated best offers updated daily — save money on smartphones, laptops, earbuds & more.`,
    keywords:    'tech deals india, amazon deals india today, flipkart offers india, best discount india 2026',
  },

  // ── SMART HOME ──────────────────────────────────────────────────
  'best-smartwatch-india-2026': {
    query:       'best smartwatch india 2026',
    category:    'electronics',
    title:       `Best Smartwatch in India 2026 — bestpickr`,
    h1:          `Best Smartwatches in India 2026`,
    description: `Top smartwatches ranked by AI. Apple Watch vs Samsung Galaxy Watch vs budget options — real India buyer data, ${CURRENT_MONTH} ${CURRENT_YEAR}.`,
    keywords:    'best smartwatch india 2026, best smartwatch under 5000 india, apple watch india price, best fitness tracker india',
  },
}

// Helper — check if a URL path is an SEO route
export function matchSeoRoute(path) {
  return SEO_ROUTES[path] || null
}

// All SEO route paths (for sitemap generation reference)
export const SEO_PATHS = Object.keys(SEO_ROUTES)
