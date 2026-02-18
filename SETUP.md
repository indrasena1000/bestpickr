# bestpickr — Complete Setup Guide

## What's been built

```
bestpickr/
├── README.md
├── .gitignore
│
├── Backend/                          ← Node.js + Express API
│   ├── server.js                     ← Entry point, middleware, routes
│   ├── package.json
│   ├── .env.example                  ← Copy to .env and fill keys
│   ├── prisma/
│   │   ├── schema.prisma             ← Database schema (PostgreSQL)
│   │   └── seed.js                   ← Seeds initial categories
│   └── src/
│       ├── agents/
│       │   └── rankingAgent.js       ← 🧠 THE BRAIN — orchestrates all APIs
│       ├── services/
│       │   ├── amazonService.js      ← Amazon PA5 API + mock
│       │   ├── flipkartService.js    ← Flipkart Affiliate API + mock
│       │   └── myntraService.js      ← Myntra scraper (Playwright) + mock
│       ├── controllers/
│       │   └── searchController.js
│       ├── routes/
│       │   ├── search.js             ← POST /api/search
│       │   ├── products.js           ← GET /api/products/top
│       │   ├── categories.js         ← GET /api/categories
│       │   └── health.js             ← GET /api/health
│       └── utils/
│           ├── scorer.js             ← AI scoring algorithm
│           └── logger.js             ← Winston structured logs
│
└── UI/                               ← React + Vite frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js                ← Proxies /api → localhost:5000
    └── src/
        ├── main.jsx                  ← React entry point
        ├── App.jsx                   ← Router + global state
        ├── services/
        │   └── api.js                ← All API calls (axios)
        ├── hooks/
        │   └── useSearch.js          ← useSearch + useSuggestions
        ├── components/
        │   ├── Navbar.jsx            ← Sticky nav + autocomplete search
        │   ├── Footer.jsx
        │   └── Skeleton.jsx          ← Loading skeletons
        ├── pages/
        │   ├── HomePage.jsx          ← Hero + categories + live top-picks
        │   ├── ResultsPage.jsx       ← Ranked results + filters + AI summary
        │   └── DetailPage.jsx        ← Product detail + price table + reviews
        └── styles/
            └── global.css            ← Complete design system (your approved design)
```

---

## Step 1 — Database Setup (Free, Secure)

We use **PostgreSQL** with **Prisma ORM**.

### Option A: Neon (Recommended — free cloud Postgres, no credit card)
1. Go to https://neon.tech → Sign up free
2. Create a new project → name it `bestpickr`
3. Copy the connection string — looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/bestpickr?sslmode=require
   ```
4. Paste it as `DATABASE_URL` in your `.env`

### Option B: Local PostgreSQL
```bash
# macOS
brew install postgresql
brew services start postgresql
createdb bestpickr

# Ubuntu/Debian
sudo apt install postgresql
sudo -u postgres createdb bestpickr
```
Connection string: `postgresql://postgres:yourpassword@localhost:5432/bestpickr`

---

## Step 2 — Backend Setup

```bash
cd bestpickr/Backend

# Install all dependencies
npm install

# Also install Playwright browsers (for Myntra scraping)
npx playwright install chromium

# Copy environment template
cp .env.example .env
# Now edit .env with your values (see Step 3)

# Create database tables
npx prisma migrate dev --name init

# Seed initial data (categories)
node prisma/seed.js

# Start the server
npm run dev
# → Server running on http://localhost:5000
```

Test it works:
```bash
curl http://localhost:5000/api/health
# → {"status":"ok","services":{"database":"ok","api":"ok"}}

curl -X POST http://localhost:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Sony headphones","category":"headphones"}'
# → Returns ranked products (mock data until API keys added)
```

---

## Step 3 — API Keys

### 🛒 Amazon Product Advertising API (PA5)
1. Sign up for Amazon Associates: https://affiliate-program.amazon.in
2. Once approved (24-48hrs), go to: Tools → Product Advertising API
3. Click "Manage your credentials" → Create new credentials
4. Copy **Access Key**, **Secret Key**, and your **Associate Tag** (e.g., `mysite-21`)
5. Add to `.env`:
   ```
   AMAZON_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
   AMAZON_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AMAZON_ASSOCIATE_TAG=mysite-21
   ```

### 🔵 Flipkart Affiliate API
1. Sign up: https://affiliate.flipkart.com
2. Login → My Account → API section
3. Generate token
4. Add to `.env`:
   ```
   FLIPKART_AFFILIATE_ID=your_id
   FLIPKART_TOKEN=your_token
   ```

### 🛍️ Myntra
No API key needed — we scrape (respectfully with delays).
The scraper runs automatically. Just ensure Playwright is installed:
```bash
npx playwright install chromium
```

> **During development:** If you don't have API keys yet, the app runs on **mock data** automatically. You'll see realistic results immediately.

---

## Step 4 — Frontend Setup

```bash
cd bestpickr/UI

# Install dependencies
npm install

# Start dev server
npm run dev
# → App running on http://localhost:5173
```

Open http://localhost:5173 — the full app should be working with mock data.

---

## Step 5 — How the Data Flow Works

```
User types "Sony headphones" → clicks Search
          │
          ▼
POST /api/search { query: "Sony headphones", category: "headphones" }
          │
          ▼
rankingAgent.js starts:
  ┌──────────────────────────────────────────┐
  │ 1. Check SearchCache in DB (TTL: 1 hour) │
  │    → If found: return immediately ⚡      │
  │    → If not: continue                    │
  └──────────────────────────────────────────┘
          │
          ▼ (parallel, all 3 at once)
  ┌───────┬──────────────┬───────────────┐
  │Amazon │  Flipkart    │  Myntra       │
  │  API  │   API        │  Scraper      │
  └───────┴──────────────┴───────────────┘
          │
          ▼
  Group same products across platforms
  (Sony WH-1000XM5 on Amazon + Flipkart = 1 product)
          │
          ▼
  Calculate AI Score for each:
    Rating (40%) + Sentiment (30%) + Value (15%) + Volume (15%)
          │
          ▼
  Sort by AI Score → Return Top 10
  Save to DB cache (1 hour TTL)
          │
          ▼
React receives ranked array → renders ResultsPage
```

---

## API Reference

| Method | Endpoint | Body/Params | Returns |
|--------|----------|-------------|---------|
| POST | `/api/search` | `{query, category}` | Top 10 ranked products |
| GET | `/api/search/suggestions?q=sony` | — | Autocomplete suggestions |
| GET | `/api/categories` | — | All categories |
| GET | `/api/products/top?category=X` | — | DB-cached top products |
| GET | `/api/products/:id` | — | Single product + history |
| GET | `/api/health` | — | Server + DB status |

---

## Next Steps (What to Build Next)

1. **User authentication** — JWT login, save wishlists to DB
2. **Price alerts** — Cron job checks prices daily, email when drops
3. **Review scraping** — Playwright to get actual review text → send to LLM for sentiment
4. **More platforms** — JioMart, Meesho, Ajio
5. **Deploy** — Backend on Railway/Render (free), Frontend on Vercel (free)
6. **React Native app** — Reuse the same backend API
