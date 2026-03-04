# blogs/

Save your 10 SEO blog markdown files here before running the import script.

## File naming convention (must match importAllBlogs.sh)

| File                               | Slug                                        |
| ---------------------------------- | ------------------------------------------- |
| `01-spot-fake-reviews.md`          | `how-to-spot-fake-reviews-amazon-india`     |
| `02-best-time-to-buy.md`           | `best-time-to-buy-electronics-india`        |
| `03-amazon-vs-flipkart.md`         | `amazon-vs-flipkart-vs-myntra-india`        |
| `04-get-best-price.md`             | `how-to-get-best-price-online-india`        |
| `05-high-rated-disappointments.md` | `why-high-rated-products-disappoint-india`  |
| `06-beginners-guide.md`            | `online-shopping-guide-india-beginners`     |
| `07-ai-shopping.md`                | `how-ai-is-changing-online-shopping-india`  |
| `08-price-comparison.md`           | `price-comparison-tips-indian-shoppers`     |
| `09-big-billion-vs-gif.md`         | `big-billion-days-vs-great-indian-festival` |
| `10-price-differences.md`          | `why-same-product-different-prices-india`   |

## Format

Each `.md` file should start with the H1 title:

```markdown
# How to Spot Fake Reviews on Amazon India

This is the excerpt paragraph — first non-empty, non-heading line is auto-used.

## Introduction

...rest of the blog content...
```

## Running the import

```bash
cd Backend

# Set your admin secret (same as ADMIN_SECRET in .env)
export BLOG_ADMIN_TOKEN="your_admin_secret_here"

# Import all 10 blogs as published
bash scripts/importAllBlogs.sh

# Or import a single blog
node scripts/importBlog.js \
  --slug how-to-spot-fake-reviews-amazon-india \
  --file blogs/01-spot-fake-reviews.md \
  --status published
```
