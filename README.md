# bestpickr 🛍️
> AI-powered cross-platform product intelligence — Amazon · Flipkart · Myntra

## 📁 Project Structure
```
bestpickr/
├── UI/          → React frontend (Vite)
├── Backend/     → Node.js + Express API + AI Agent
└── README.md
```

## 🚀 Quick Start

### 1. Prerequisites
```bash
node >= 18.x
npm >= 9.x
PostgreSQL (or use free Neon.tech cloud)
```

### 2. Backend Setup
```bash
cd Backend
npm install
cp .env.example .env      # fill in your API keys
npx prisma migrate dev    # creates database tables
npx prisma db seed        # optional: seed test data
npm run dev               # starts on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd UI
npm install
npm run dev               # starts on http://localhost:5173
```

## 🔑 API Keys You Need

| Platform | Where to get |
|----------|-------------|
| Amazon PA5 | https://affiliate-program.amazon.in → Tools → Product Advertising API |
| Flipkart Affiliate | https://affiliate.flipkart.com → API section |
| Myntra | Scraped via Playwright (no public API) |

## 🗄️ Database
We use **PostgreSQL** with **Prisma ORM**.
- Free cloud option: https://neon.tech (serverless Postgres, no credit card)
- Local: `postgresql://user:password@localhost:5432/bestpickr`

## 🏗️ Architecture
```
User Search
    │
    ▼
React UI ──► Express API ──► Ranking Agent
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼               ▼
              Amazon PA5    Flipkart API    Myntra Scraper
                    │              │               │
                    └──────────────┴───────────────┘
                                   │
                            Score + Rank
                                   │
                            PostgreSQL Cache
                                   │
                            Return Top 10
```
