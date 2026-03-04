#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# importAllBlogs.sh
# Batch-import all 10 SEO blog posts into BestPickr MongoDB.
#
# SETUP:
#   1. Save each blog as a .md file in Backend/blogs/ (or any folder).
#      The first line of each file should be:  # Your Blog Title
#      Followed by the full markdown body.
#
#   2. Set your admin secret:
#        export BLOG_ADMIN_TOKEN="your_admin_secret_from_env"
#
#   3. (Optional) Set backend URL if not local:
#        export BACKEND_URL="https://api.bestpickr.in"
#
#   4. Run:
#        bash scripts/importAllBlogs.sh
#
# The script posts each blog as status=published (change to draft to review first).
# ──────────────────────────────────────────────────────────────────────────────

set -e

BLOGS_DIR="./blogs"          # directory containing your .md files
STATUS="published"           # "draft" to review before publishing
SCRIPT="./scripts/importBlog.js"

# ADMIN_PASS is loaded automatically from Backend/.env by importBlog.js
# No manual export needed — just run the script from the Backend directory.

if [[ ! -d "$BLOGS_DIR" ]]; then
  echo "❌  $BLOGS_DIR directory not found. Create it and save your .md files there."
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo " BestPickr SEO Blog Importer"
echo " Status: $STATUS"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Blog 1 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "how-to-spot-fake-reviews-amazon-india" \
  --file "$BLOGS_DIR/01-spot-fake-reviews.md" \
  --status "$STATUS" \
  --tags "fake reviews,amazon india,online shopping tips,review manipulation,bestpickr"

# ── Blog 2 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "best-time-to-buy-electronics-india" \
  --file "$BLOGS_DIR/02-best-time-to-buy.md" \
  --status "$STATUS" \
  --tags "best time to buy,electronics india,sale seasons,price drop,amazon sale"

# ── Blog 3 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "amazon-vs-flipkart-vs-myntra-india" \
  --file "$BLOGS_DIR/03-amazon-vs-flipkart.md" \
  --status "$STATUS" \
  --tags "amazon vs flipkart,which is better,india shopping,platform comparison,best deals"

# ── Blog 4 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "how-to-get-best-price-online-india" \
  --file "$BLOGS_DIR/04-get-best-price.md" \
  --status "$STATUS" \
  --tags "best price online,price comparison,india deals,save money,online shopping"

# ── Blog 5 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "why-high-rated-products-disappoint-india" \
  --file "$BLOGS_DIR/05-high-rated-disappointments.md" \
  --status "$STATUS" \
  --tags "fake ratings amazon,4 star products,review analysis,quality check india"

# ── Blog 6 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "online-shopping-guide-india-beginners" \
  --file "$BLOGS_DIR/06-beginners-guide.md" \
  --status "$STATUS" \
  --tags "online shopping guide india,beginners,how to shop online,tips tricks"

# ── Blog 7 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "how-ai-is-changing-online-shopping-india" \
  --file "$BLOGS_DIR/07-ai-shopping.md" \
  --status "$STATUS" \
  --tags "ai shopping,artificial intelligence,product recommendations,bestpickr ai"

# ── Blog 8 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "price-comparison-tips-indian-shoppers" \
  --file "$BLOGS_DIR/08-price-comparison.md" \
  --status "$STATUS" \
  --tags "price comparison india,shopping tips,save money,best deals,comparison tools"

# ── Blog 9 ───────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "big-billion-days-vs-great-indian-festival" \
  --file "$BLOGS_DIR/09-big-billion-vs-gif.md" \
  --status "$STATUS" \
  --tags "big billion days,great indian festival,flipkart vs amazon sale,which sale is better"

# ── Blog 10 ──────────────────────────────────────────────────────
node "$SCRIPT" \
  --slug "why-same-product-different-prices-india" \
  --file "$BLOGS_DIR/10-price-differences.md" \
  --status "$STATUS" \
  --tags "same product different prices,amazon flipkart price difference,why prices vary"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " ✅  All blogs imported!"
echo " View at: https://bestpickr.in/blog"
echo "═══════════════════════════════════════════════════════"
