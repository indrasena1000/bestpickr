// scripts/seedNews.js — Inserts 5 dummy published news articles for the Blog page
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const articles = [
  {
    slug: 'apple-vision-pro-india-launch-2026',
    title: 'Apple Vision Pro Officially Lands in India: Price, Availability & First Look',
    summary: 'Apple has confirmed the Vision Pro spatial computing headset will go on sale in India starting March 2026, priced at ₹2,99,900. Pre-orders open this week across Apple Stores and select authorised resellers.',
    content: `Apple's most ambitious product launch in a decade is finally heading to Indian shores. The Vision Pro — Apple's spatial computing headset that blurs the line between digital and physical — will be available in India from March 15, 2026, at a starting price of ₹2,99,900.\n\nThe India launch comes roughly a year after the US debut, and Apple has made several software tweaks for the Indian market, including expanded Hindi voice control and localised Apple TV+ content in 4K spatial video format.\n\n"India is one of our most important markets globally, and we wanted to make sure the Vision Pro experience was truly ready for Indian customers," said Tim Cook during a virtual press briefing.\n\nThe headset features Apple's M2 and R1 chips, offering 12 milliseconds display latency — imperceptible to the human eye. The 4K micro-OLED displays per eye deliver resolution sharper than a physical 4K TV viewed at close range.\n\nPre-orders open on bestpickr.in and the official Apple website from February 25. Apple has confirmed 14 Apple Authorized Resellers across Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, and Pune will carry the device from day one.\n\nAccessories including the separate battery pack (₹22,900), AppleCare+ (₹29,900/2 years), and the ZEISS optical inserts (₹9,900) will also be available.`,
    aiSummary: 'Apple Vision Pro arrives in India at ₹2,99,900 in March 2026 with Hindi support and local retail availability.',
    imageUrl: 'https://images.unsplash.com/photo-1617802690992-15d93263d3a9?w=800&q=80',
    source: 'TechCrunch India',
    sourceLink: 'https://techcrunch.com',
    publishDate: new Date('2026-02-22T08:00:00Z'),
    trendScore: 9.8,
    relevance: 9.5,
    status: 'Published',
    visible: true,
    tags: ['Apple', 'Vision Pro', 'XR', 'India Launch', 'Tech'],
  },
  {
    slug: 'flipkart-big-billion-days-march-2026',
    title: 'Flipkart\'s Big Billion Days Returns in March — Biggest Sale of the Year Preview',
    summary: 'Flipkart has announced its Big Billion Days sale for March 20–25, 2026. Over 50 million products on discount, with smartphones, laptops, and appliances expected to see price cuts of up to 80%.',
    content: `Flipkart has officially announced that Big Billion Days — its flagship mega-sale event — will return from March 20 to March 25, 2026. This will be the largest edition yet, with over 50 million products participating across categories.\n\nHere are the biggest deals already confirmed for the event:\n\n**Smartphones:** Redmi Note 14 Pro+ at ₹19,999 (down from ₹27,999), Samsung Galaxy S24 FE at ₹34,999, and the iQOO Neo 9 starting at ₹24,499.\n\n**Laptops:** HP Pavilion 15 at ₹39,990 (down 30%), ASUS VivoBook 16X at ₹44,990, and Lenovo IdeaPad Slim 5 at ₹42,990.\n\n**Large Appliances:** LG 1.5-ton inverter ACs at ₹28,990, Samsung 8kg washing machines at ₹19,990, and Sony 55-inch 4K TVs from ₹35,990.\n\nFlipkart Plus members get 2-hour early access starting at midnight on March 19. HDFC Bank and Axis Bank customers get an additional 10% instant discount on card payments.\n\nFlipkart has also confirmed that Flipkart Quick — its 10-minute delivery service — will be active across 50 cities during the sale, covering a curated set of electronics and household essentials.`,
    aiSummary: 'Flipkart Big Billion Days returns March 20–25 with up to 80% off smartphones, laptops, and appliances. HDFC/Axis cardholders get extra 10% off.',
    imageUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80',
    source: 'Economic Times Tech',
    sourceLink: 'https://economictimes.com',
    publishDate: new Date('2026-02-22T07:30:00Z'),
    trendScore: 9.4,
    relevance: 9.6,
    status: 'Published',
    visible: true,
    tags: ['Flipkart', 'Sale', 'Big Billion Days', 'E-Commerce', 'Deals'],
  },
  {
    slug: 'samsung-galaxy-s26-ultra-specs-leak',
    title: 'Samsung Galaxy S26 Ultra Specs Leaked: 200MP Camera, 6000mAh Battery, Titanium Build',
    summary: 'Leaked benchmark and regulatory filings reveal the Samsung Galaxy S26 Ultra will feature a 200MP periscopic main camera, a 6000mAh battery with 65W charging, and a new titanium chassis. Launch expected at MWC 2026.',
    content: `A comprehensive leak from a reliable Korean supply chain source has revealed near-complete specifications for the Samsung Galaxy S26 Ultra, expected to launch at Mobile World Congress 2026 in Barcelona.\n\n**Key Specifications (via leak):**\n- **Processor:** Snapdragon 8 Elite Gen 2 (TSMC 3nm) + Exynos 2600 for select markets\n- **Display:** 6.9-inch QHD+ Dynamic AMOLED 3X, 2600 nits peak brightness, 1–120Hz adaptive\n- **Main Camera:** 200MP f/1.7 periscopic with optical image stabilisation, 10x optical zoom up to 100x Space Zoom\n- **Battery:** 6000mAh with 65W wired + 25W wireless charging\n- **Build:** Titanium Grade 5 frame (same grade as Apple iPhone 15 Pro)\n- **RAM:** 12GB or 16GB LPDDR5X\n- **Storage:** 256GB, 512GB, 1TB UFS 4.1\n- **S Pen:** Retained with AI-powered handwriting features integrated with Samsung Notes\n\nSamsung has internally codenamed the device "Crocus." The Indian launch pricing is expected in the ₹1,20,000–₹1,60,000 range depending on storage tier.\n\nThe S26 Ultra will also reportedly debut Samsung's new AI Live Translate Calling feature, enabling real-time voice translation in 15 languages including Hindi, Tamil, and Telugu during phone calls.`,
    aiSummary: 'Samsung Galaxy S26 Ultra specs leak: 200MP camera, 6000mAh battery, titanium build. India launch pricing expected ₹1.2L–₹1.6L.',
    imageUrl: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800&q=80',
    source: 'GSMArena',
    sourceLink: 'https://gsmarena.com',
    publishDate: new Date('2026-02-21T10:00:00Z'),
    trendScore: 9.1,
    relevance: 9.2,
    status: 'Published',
    visible: true,
    tags: ['Samsung', 'Galaxy S26', 'Smartphone', 'Leak', 'Camera'],
  },
  {
    slug: 'amazon-india-same-day-delivery-50-cities',
    title: 'Amazon India Expands Same-Day Delivery to 50 Cities — Including Tier 2 Markets',
    summary: 'Amazon India has extended same-day delivery to 50 cities, now including Tier 2 cities like Coimbatore, Nagpur, Indore, and Vizag. Prime members get same-day delivery free on eligible orders over ₹499.',
    content: `Amazon India has announced a major expansion of its same-day delivery network, now covering 50 cities across the country. The expansion for the first time brings same-day delivery to major Tier 2 cities including Coimbatore, Nagpur, Indore, Visakhapatnam, Bhopal, and Lucknow.\n\nFor Prime members, same-day delivery is free on eligible orders above ₹499 placed before 10 AM. For non-Prime customers, a same-day delivery fee of ₹49 applies.\n\n"We've invested significantly in local fulfillment infrastructure over the past 18 months," said Manish Tiwary, CEO of Amazon India. "This expansion reflects our commitment to bringing the speed and reliability of Amazon delivery to every corner of India."\n\n**Cities newly added (Tier 2):**\n- Coimbatore, Madurai, Tiruchirappalli (Tamil Nadu)\n- Nagpur, Nashik, Aurangabad (Maharashtra)\n- Indore, Bhopal, Jabalpur (Madhya Pradesh)\n- Visakhapatnam, Vijayawada, Tirupati (Andhra Pradesh)\n- Lucknow, Agra, Kanpur (Uttar Pradesh)\n\nAmazon has deployed 12 new fulfillment centres and 34 new last-mile delivery stations to enable this rollout. The company says same-day delivery is available for over 15 million products, spanning electronics, fashion, grocery, and home essentials.\n\nAmazon Fresh grocery same-day delivery remains limited to the original 8 metro cities.`,
    aiSummary: 'Amazon India same-day delivery now covers 50 cities including major Tier 2 markets. Free for Prime members on orders ₹499+.',
    imageUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80',
    source: 'Mint',
    sourceLink: 'https://livemint.com',
    publishDate: new Date('2026-02-21T06:00:00Z'),
    trendScore: 8.7,
    relevance: 9.0,
    status: 'Published',
    visible: true,
    tags: ['Amazon', 'Delivery', 'E-Commerce', 'India', 'Prime'],
  },
  {
    slug: 'oneplus-13r-review-best-mid-range-2026',
    title: 'OnePlus 13R Review: The Best Mid-Range Android Phone You Can Buy in India Right Now',
    summary: 'The OnePlus 13R at ₹39,999 delivers flagship-class performance with the Snapdragon 8s Gen 4, a 50MP main camera, and 100W SUPERVOOC charging in a package that embarrasses phones costing twice as much.',
    content: `After two weeks with the OnePlus 13R, I'm prepared to say it definitively: this is the best mid-range Android phone available in India in 2026.\n\n**Performance**\nThe Snapdragon 8s Gen 4 (TSMC 4nm) is no compromise chip. In our benchmarks, the 13R outpaced the Dimensity 9200-powered competition and came within 15% of full Snapdragon 8 Elite devices. Day-to-day, it handles everything from RAW photo editing to 60FPS Genshin Impact without a stutter.\n\n**Display**\nThe 6.78-inch AMOLED panel with 4500 nits peak brightness is genuinely stunning — better than what Samsung was putting in flagship phones two years ago. HDR10+ content looks immaculate.\n\n**Camera**\nThe main 50MP Sony LYT-600 sensor is excellent in daylight — sharp, accurate colours, and impressive dynamic range. Night mode processing has improved significantly over the 12R. The ultrawide is a 8MP unit that's merely adequate; this isn't a camera phone.\n\n**Battery**\n5500mAh + 100W SUPERVOOC = full charge in 28 minutes. This is a superpower. I've never once felt battery anxiety with this phone.\n\n**The Case For Buying It**\nAt ₹39,999, you're getting a phone that would have cost ₹70,000 two years ago. OnePlus OxygenOS 15 is clean, fast, and gets 3 years of Android updates. It's not perfect — the ultrawide camera and mediocre haptics hold it back — but nothing at this price comes close.\n\n**bestpickr AI Score: 8.4/10**`,
    aiSummary: 'OnePlus 13R wins bestpickr\'s mid-range recommendation: flagship Snapdragon 8s Gen 4 performance, 100W charging, and great display at ₹39,999.',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80',
    source: 'bestpickr',
    sourceLink: 'https://bestpickr.in',
    publishDate: new Date('2026-02-20T12:00:00Z'),
    trendScore: 8.5,
    relevance: 8.8,
    status: 'Published',
    visible: true,
    tags: ['OnePlus', 'Review', 'Smartphone', 'Mid-Range', 'Android'],
  },
]

async function main() {
  console.log('🌱 Seeding dummy news articles...')
  for (const article of articles) {
    await prisma.newsArticle.upsert({
      where:  { slug: article.slug },
      update: article,
      create: article,
    })
    console.log(`  ✅ ${article.title.slice(0, 60)}…`)
  }
  console.log('\n✨ Done! 5 articles seeded with status=Published, visible=true')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
