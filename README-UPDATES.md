# bestpickr — Updated Setup Guide

## ✅ What's New in This Update

### 1. 🛒 Real Amazon Affiliate Products
- 3 featured products added with YOUR affiliate links
- "Hot Deals" section on homepage
- Click → opens Amazon with your affiliate tracking
- **To update product names/prices**: Edit `UI/src/pages/HomePage.jsx`, find `FEATURED_PRODUCTS` array at top

### 2. 📱 Mobile Fixes
- Hero section properly scales on small screens
- Product cards stack correctly on mobile
- Detail page layout fixed for phones
- Picks table columns hide/show intelligently

### 3. 📊 Analytics Tracking
- Every page view, search, and affiliate click tracked
- Stored in backend memory (upgradeable to DB)
- Admin dashboard to view all data

### 4. 🤖 Telegram Bot — Daily Reports + Instant Alerts
Set up in 3 steps:
1. Message `@BotFather` on Telegram → `/newbot` → get TOKEN
2. Message your bot → visit `https://api.telegram.org/bot<TOKEN>/getUpdates` → copy `chat.id`
3. Add to Vercel Environment Variables:
   - `TELEGRAM_BOT_TOKEN` = your token
   - `TELEGRAM_CHAT_ID` = your chat id

**What you get:**
- 📩 Instant alert every time someone clicks an affiliate link
- 📊 Daily report at 9:30 AM IST (configured in vercel.json)

### 5. 🔐 Admin Dashboard
Access your analytics dashboard at: `yoursite.vercel.app/#admin`

**Default credentials** (CHANGE THESE!):
- Username: `admin`
- Password: `bestpickr@2025`

To change: Edit `UI/src/pages/AdminDashboard.jsx`, find `ADMIN_USER` and `ADMIN_PASS`

The dashboard shows:
- Total visitors, page views, affiliate clicks, searches
- Today's unique visitors
- Top products clicked
- Top search queries
- Recent event log (type, time, screen size)
- Live user count estimate

---

## 🚀 Deploy to Vercel

### Frontend (UI)
Push to GitHub. Vercel auto-deploys.

Environment vars for UI:
```
VITE_API_URL=https://your-backend.vercel.app/api
```

### Backend
Deploy Backend folder separately OR configure as API routes.

Environment vars for Backend:
```
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_CHAT_ID=123456789
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

---

## 📦 Updating Affiliate Products

Edit `UI/src/pages/HomePage.jsx`:

```js
const FEATURED_PRODUCTS = [
  {
    id: 'fp1',
    name: 'YOUR PRODUCT NAME',       // ← Update this
    brand: 'Brand Name',              // ← Update this
    emoji: '🎧',                      // ← Pick an emoji
    price: 1299,                      // ← Current price
    oldPrice: 2990,                   // ← Original price
    discount: 57,                     // ← % off
    rating: 4.0,                      // ← Star rating
    reviewCount: 85420,               // ← Number of reviews
    badge: '🔥 Bestseller',          // ← Badge text
    affiliateUrl: 'https://amzn.to/4tHHwpX',  // ← YOUR LINK (keep this!)
    features: ['Feature 1', 'Feature 2'],
    category: 'Electronics',
  },
  // ... more products
]
```

---

## 🤖 Telegram Bot Test

After deploying, test your bot:
```
POST https://your-backend.vercel.app/api/analytics/telegram-test
```

Or trigger daily report manually:
```
POST https://your-backend.vercel.app/api/analytics/daily-report
```
