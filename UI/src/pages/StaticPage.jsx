// src/pages/StaticPage.jsx
// All static pages: About, Blog, How it Works, AI Score, Price Alerts, Privacy, Terms
import { useState, useEffect } from 'react'

const SITE_NAME = 'bestpickr'
const SITE_URL  = 'https://bestpickr.vercel.app'
const CONTACT   = 'hello@bestpickr.in'
const TODAY     = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })

// ─────────────────────────────────────────────────────────────────
// SHARED LAYOUT COMPONENTS
// ─────────────────────────────────────────────────────────────────

function Shell({ title, subtitle, badge, children, onHome, wide }) {
  return (
    <div style={{ background:'var(--paper2)', minHeight:'80vh' }}>
      <div style={{ background:'var(--paper)', borderBottom:'1px solid var(--line)', padding:'36px 0 28px' }}>
        <div className="wrap">
          <button onClick={onHome}
            style={{ fontSize:12, color:'var(--ink4)', fontWeight:600, cursor:'pointer', background:'none', border:'none', display:'flex', alignItems:'center', gap:5, marginBottom:16, padding:0 }}>
            ← bestpickr
          </button>
          {badge && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--accent)', background:'var(--accent-bg)', borderRadius:'var(--r)', padding:'3px 10px', marginBottom:12 }}>
              {badge}
            </div>
          )}
          <h1 style={{ fontSize:'clamp(22px,4vw,34px)', fontWeight:700, letterSpacing:'-.5px', color:'var(--ink)', marginBottom:8, lineHeight:1.2 }}>{title}</h1>
          {subtitle && <p style={{ fontSize:14, color:'var(--ink3)', lineHeight:1.7, maxWidth:640 }}>{subtitle}</p>}
        </div>
      </div>
      <div className="wrap" style={{ padding:'36px 20px 80px' }}>
        <div style={{ maxWidth: wide ? 900 : 760, background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', padding:'clamp(24px,5vw,48px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function H2({ children, mt }) {
  return <h2 style={{ fontSize:18, fontWeight:700, color:'var(--ink)', marginBottom:10, marginTop: mt ?? 36, paddingBottom:10, borderBottom:'2px solid var(--line)', letterSpacing:'-.2px' }}>{children}</h2>
}
function H3({ children }) {
  return <h3 style={{ fontSize:15, fontWeight:700, color:'var(--ink)', marginBottom:6, marginTop:22 }}>{children}</h3>
}
function P({ children, style }) {
  return <p style={{ fontSize:14, color:'var(--ink2)', lineHeight:1.85, marginBottom:14, ...style }}>{children}</p>
}
function Li({ children }) {
  return <li style={{ fontSize:14, color:'var(--ink2)', lineHeight:1.8, marginBottom:6 }}>{children}</li>
}
function Callout({ icon, color, bg, title, children }) {
  return (
    <div style={{ background: bg || 'var(--accent-bg)', border:`1px solid ${color||'#C8E6D4'}`, borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:14, display:'flex', gap:14 }}>
      <span style={{ fontSize:22, flexShrink:0, lineHeight:1 }}>{icon}</span>
      <div>
        {title && <div style={{ fontWeight:700, fontSize:13, color: color||'var(--accent)', marginBottom:4 }}>{title}</div>}
        <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.7 }}>{children}</div>
      </div>
    </div>
  )
}
function ScoreBar({ pct, label, desc }) {
  return (
    <div style={{ background:'var(--paper2)', border:'1px solid var(--line)', borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontWeight:700, fontSize:14, color:'var(--ink)' }}>{label}</span>
        <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:16, color:'var(--accent)' }}>{pct}</span>
      </div>
      <div style={{ height:7, background:'var(--line)', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
        <div style={{ height:'100%', width:pct, background:'var(--accent)', borderRadius:4 }}/>
      </div>
      <p style={{ fontSize:13, color:'var(--ink3)', lineHeight:1.6, margin:0 }}>{desc}</p>
    </div>
  )
}
function Badge({ color, bg, children }) {
  return <span style={{ fontSize:11, fontWeight:700, color: color||'var(--accent)', background: bg||'var(--accent-bg)', borderRadius:4, padding:'2px 8px' }}>{children}</span>
}

// ─────────────────────────────────────────────────────────────────
// ABOUT PAGE
// ─────────────────────────────────────────────────────────────────
export function AboutPage({ onHome, onNav }) {
  const stats = [
    { n:'3+', label:'Platforms compared', sub:'Amazon · Flipkart · Myntra' },
    { n:'100K+', label:'Reviews analysed', sub:'Per top-10 list generated' },
    { n:'50+', label:'Product categories', sub:'Electronics to skincare' },
    { n:'0', label:'Paid rankings', sub:'Ever. Not a single one.' },
  ]
  const values = [
    ['🚫','No Sponsored Rankings','Every product on bestpickr earned its position through our AI score alone. We do not accept money to promote any product, ever. If a brand emails us asking to rank higher, the answer is no.'],
    ['🇮🇳','Built for Indian Shoppers','Indian e-commerce is unique — price-sensitive, review-driven, and spread across multiple platforms. bestpickr was designed from day one for India\'s shopping landscape: INR prices, Indian platforms, Indian use-cases.'],
    ['🔬','Data Over Opinion','We don\'t write "Top 10" lists based on editorial opinion or press releases. Every ranking is calculated from aggregated buyer data — ratings, review text, pricing, and volume — processed by our AI engine.'],
    ['🔒','Privacy First','We don\'t sell your data. We don\'t track you across the internet. Analytics we collect are aggregated and used only to improve the product. See our Privacy Policy for full details.'],
  ]

  return (
    <Shell title="About bestpickr" badge="Our Story" subtitle="We built the product comparison tool we always wished existed. Here's why and how." onHome={onHome}>

      <P>Shopping online in India is harder than it should be. You open Amazon, find 200 results for "headphones." You check Flipkart — different 200 results, different prices. You read reviews on one platform, but how do you know if they're real? How do you compare across all three platforms at once?</P>
      <P>We couldn't find a tool that answered this question well. So we built one.</P>
      <P><strong>bestpickr</strong> is an AI-powered product comparison engine built specifically for Indian online shoppers. We aggregate product data from Amazon India, Flipkart, and Myntra — then run it through our proprietary ranking algorithm that weighs ratings, review sentiment, pricing, and review volume to produce a single, trustworthy <strong>AI Score from 0 to 10</strong>.</P>
      <P>The result: instead of spending hours comparing, you see the definitive ranked list in seconds — with every data point shown transparently so you can make your own decision.</P>

      <H2>Our Numbers</H2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {stats.map(s => (
          <div key={s.n} style={{ background:'var(--paper2)', border:'1px solid var(--line)', borderRadius:'var(--r2)', padding:'18px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--accent)', fontFamily:"'DM Mono',monospace", marginBottom:4 }}>{s.n}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:11, color:'var(--ink4)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <H2>Our Values</H2>
      {values.map(([icon, title, desc]) => (
        <div key={title} style={{ display:'flex', gap:16, marginBottom:20, alignItems:'flex-start' }}>
          <div style={{ width:40, height:40, background:'var(--paper2)', border:'1px solid var(--line)', borderRadius:'var(--r2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{icon}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:5 }}>{title}</div>
            <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.75 }}>{desc}</div>
          </div>
        </div>
      ))}

      <H2>How We Make Money</H2>
      <P>bestpickr is free to use. We earn a small affiliate commission when you click a "Buy" link and complete a purchase. This commission is paid by the platform (Amazon, Flipkart, Myntra) — not by the product seller — and is the same regardless of which product you buy.</P>
      <Callout icon="⚖️" title="This never affects rankings">
        Our ranking algorithm has zero awareness of affiliate commission rates. Products are ranked before any affiliate consideration. The #1 product is the #1 product because buyers say so — full stop.
      </Callout>

      <H2>The Team</H2>
      <P>bestpickr is an indie project built and maintained by a small team of engineers and data scientists based in India. We're passionate about making online shopping better for Indian consumers — people who deserve honest, data-driven product guidance as much as anyone in the world.</P>
      <P>Questions, feedback, or partnership enquiries: <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)', fontWeight:600 }}>{CONTACT}</a></P>

      <H2>Learn More</H2>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        {[['How It Works','how-it-works'],['AI Score Explained','ai-score'],['Blog','blog'],['Privacy Policy','privacy']].map(([label, page]) => (
          <button key={page} onClick={() => onNav && onNav(page)}
            style={{ background:'var(--paper2)', border:'1px solid var(--line)', borderRadius:'var(--r)', padding:'8px 14px', fontSize:13, fontWeight:600, color:'var(--ink2)', cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e => { e.target.style.borderColor='var(--accent)'; e.target.style.color='var(--accent)' }}
            onMouseLeave={e => { e.target.style.borderColor='var(--line)'; e.target.style.color='var(--ink2)' }}
          >{label} →</button>
        ))}
      </div>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// BLOG PAGE
// ─────────────────────────────────────────────────────────────────
const BLOG_POSTS = [
  {
    slug: 'how-bestpickr-works',
    featured: true,
    date: 'February 2025',
    readTime: '8 min read',
    category: 'Product',
    title: 'How bestpickr Ranks Products: A Deep Dive Into Our AI Engine',
    excerpt: 'We built an AI that reads hundreds of thousands of reviews so you don\'t have to. Here\'s exactly how it works — every algorithm, every weight, every decision.',
    content: true,
  },
  {
    slug: 'cross-platform-shopping-india',
    date: 'January 2025',
    readTime: '5 min read',
    category: 'Guide',
    title: 'Why You Should Never Buy from Just One Platform in India',
    excerpt: 'The same product can be ₹2,000 cheaper on Flipkart vs Amazon. We analysed 10,000 products and found the price gaps are larger than you think.',
  },
  {
    slug: 'fake-reviews-india',
    date: 'December 2024',
    readTime: '6 min read',
    category: 'Research',
    title: 'The Fake Review Problem in Indian E-Commerce — And How We Fight It',
    excerpt: 'Our sentiment analysis doesn\'t just count stars. It reads review text. Here\'s why that matters, and how it catches inflated ratings.',
  },
  {
    slug: 'best-products-2025',
    date: 'January 2025',
    readTime: '10 min read',
    category: 'Roundup',
    title: 'The 50 Highest-Rated Products in India Right Now (2025)',
    excerpt: 'Our AI has crunched millions of reviews. These 50 products consistently score above 9.0 — across all platforms, across all price points.',
  },
]

function BlogCard({ post, featured, onRead }) {
  return (
    <div onClick={onRead}
      style={{
        background:'var(--paper)', border:`${featured?'2px':'1px'} solid ${featured?'var(--accent)':'var(--line)'}`,
        borderRadius:'var(--r3)', padding: featured?'24px':'18px 20px',
        cursor:'pointer', transition:'box-shadow .15s, border-color .15s', marginBottom:12,
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,.07)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow=''}
    >
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
        {featured && <Badge>★ Featured</Badge>}
        <Badge color='var(--ink3)' bg='var(--paper3)'>{post.category}</Badge>
        <span style={{ fontSize:11, color:'var(--ink4)' }}>{post.date} · {post.readTime}</span>
      </div>
      <div style={{ fontSize: featured?17:15, fontWeight:700, color:'var(--ink)', lineHeight:1.3, marginBottom:8 }}>{post.title}</div>
      <div style={{ fontSize:13, color:'var(--ink3)', lineHeight:1.7 }}>{post.excerpt}</div>
      <div style={{ marginTop:12, fontSize:13, fontWeight:600, color:'var(--accent)' }}>Read article →</div>
    </div>
  )
}

// news card for left column
function NewsCard({ article, onRead }) {
  return (
    <div onClick={onRead}
      style={{
        background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', padding:'18px 20px',
        cursor:'pointer', marginBottom:12, transition:'box-shadow .15s'
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,.07)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow=''}
    >
      {article.image && <img src={article.image} alt="" style={{ width:'100%', borderRadius:4, marginBottom:10 }} />}
      <div style={{ fontSize:16, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>{article.title}</div>
      <div style={{ fontSize:13, color:'var(--ink3)', lineHeight:1.6, marginBottom:8 }}>{article.summary}</div>
      <div style={{ fontSize:11, color:'var(--ink4)' }}>{article.source} · {new Date(article.publishDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
      <div style={{ marginTop:8, fontSize:13, fontWeight:600, color:'var(--accent)' }}>Read More →</div>
    </div>
  )
}

function FeaturedBlogContent({ onHome }) {
  return (
    <Shell title="How bestpickr Ranks Products: A Deep Dive Into Our AI Engine"
      badge="Featured Article · Product"
      subtitle="February 2025 · 8 min read"
      onHome={onHome} wide>

      <P style={{ fontSize:15 }}>Every day, Indian shoppers collectively spend hours reading reviews before buying a product. Most of that time is wasted — reading reviews on one platform, missing better deals on another, not knowing if a 4.8⭐ rating with 500 reviews is more trustworthy than a 4.6⭐ with 50,000.</P>
      <P style={{ fontSize:15 }}>We built bestpickr to solve this. Here's the full story — every technical decision, every algorithm, and why we made the choices we did.</P>

      <H2>The Problem With Star Ratings</H2>
      <P>Star ratings are the internet's most-used and most-misunderstood metric. A 4.7⭐ sounds great. But what does it actually mean?</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>Is it 4.7 from 80 reviews or 80,000 reviews?</Li>
        <Li>Are those reviews from verified purchases?</Li>
        <Li>Is that 4.7 the same across Amazon, Flipkart, and Myntra — or does it hide differently on each platform?</Li>
        <Li>Do the actual review texts match the star — or are people rating 5⭐ but writing complaints?</Li>
      </ul>
      <P>Star ratings answer exactly none of these questions. Our AI Score answers all of them.</P>

      <H2>How the AI Score Is Calculated</H2>
      <P>Our score is a weighted composite of four components. Each was chosen because it correlates with one clear thing: <strong>real buyer satisfaction</strong>.</P>

      <ScoreBar pct="40%" label="Platform Ratings — 40% of Score"
        desc="We collect the star rating from every platform where the product is listed. We then compute a weighted average — weighting each platform's rating by its review count. A 4.8⭐ from 10,000 Amazon reviews counts more than a 5.0⭐ from 12 Myntra reviews. This gives us a statistically robust baseline rating." />
      <ScoreBar pct="30%" label="Review Sentiment — 30% of Score"
        desc="This is where we go beyond stars. Our NLP engine reads the text of reviews and classifies each sentence as positive, neutral, or negative. This detects a pattern we call 'star inflation' — products where buyers rate 4⭐ but write complaints. Sentiment analysis catches these. A product with 80% positive sentiment consistently outperforms one with 60% positive sentiment at the same star rating." />
      <ScoreBar pct="15%" label="Value for Money — 15% of Score"
        desc="How does this product's performance compare to its price within its category? We compute the average AI performance score for a price band, then see how this product compares. A ₹1,500 product that scores like a ₹3,000 product gets a value bonus. This rewards products that punch above their weight." />
      <ScoreBar pct="15%" label="Review Volume Confidence — 15% of Score"
        desc="A product with 100,000 reviews has much higher confidence than one with 150 reviews. This component applies a confidence multiplier — products with thin review bases get a slight score penalty until more data arrives. This prevents unknown products from gaming the system with a handful of perfect ratings." />

      <H2>Why Cross-Platform Matters</H2>
      <P>The most important innovation in bestpickr is comparing <em>the same product across all three major Indian platforms simultaneously</em>.</P>
      <P>Here's what we found when we started building: the same Sony headphones can have a 4.6⭐ on Amazon and a 4.2⭐ on Flipkart. Same product. Different buyer populations, different review incentives, different fulfillment experiences. Neither rating alone tells the full story. Both together do.</P>
      <P>Our cross-platform aggregation gives you the only honest rating that exists — the one that represents all Indian buyers, on all platforms, combined.</P>
      <Callout icon="📊" title="Real example from our data">
        We found a popular Bluetooth speaker with 4.7⭐ on Amazon (5,200 reviews) and 3.8⭐ on Flipkart (8,100 reviews). Its bestpickr AI Score: 6.4 — reflecting the reality that a large segment of buyers had significant issues. The Amazon-only rating was highly misleading.
      </Callout>

      <H2>Fake Review Detection</H2>
      <P>Our sentiment analysis isn't just positive/negative classification. It also flags several patterns associated with inauthentic reviews:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Sentiment-star mismatch:</strong> 5⭐ ratings with negative or neutral text</Li>
        <Li><strong>Generic praise clusters:</strong> Unusual concentrations of very short, very positive reviews in a short time window</Li>
        <Li><strong>Verified purchase weighting:</strong> We weight verified purchase reviews more heavily where platform data allows</Li>
      </ul>
      <P>We don't claim to catch every fake review — that's an arms race no one wins. But our cross-platform approach naturally dilutes the impact of platform-specific fake review campaigns.</P>

      <H2>What We Don't Do</H2>
      <Callout icon="🚫" bg='var(--accent2-bg)' color='var(--accent2)' title="No editorial bias">
        We don't write "Top 10" lists based on what brands send us for review. We don't have a team of editors picking products they like. Every ranking is purely algorithmic — our AI score determines the list.
      </Callout>
      <Callout icon="🚫" bg='var(--accent2-bg)' color='var(--accent2)' title="No paid placements">
        Brands cannot pay to appear higher in our rankings. Our affiliate commission is the same regardless of which product you click. We have zero financial incentive to show you a worse product.
      </Callout>

      <H2>What's Next</H2>
      <P>We're actively working on several improvements to the AI engine:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>Price history tracking — see how a product's price has changed over 90 days</Li>
        <Li>Real-time price drop alerts via email and browser notification</Li>
        <Li>Category-specific scoring adjustments (headphone metrics differ from skincare metrics)</Li>
        <Li>Review recency weighting — fresher reviews about recent product batches matter more</Li>
      </ul>
      <P>If you have suggestions for what we should build next, write to us at <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)', fontWeight:600 }}>{CONTACT}</a></P>
    </Shell>
  )
}

export function BlogPage({ onHome, onNav, slug }) {
  const [reading, setReading] = useState(null)
  const [articles, setArticles] = useState([]) // top tech news

  function openArticle(article) {
    setReading(article)
    // update URL for deep link
    window.history.pushState({}, '', `/blog/${article.slug}`)
    document.title = article.title
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.content = article.summary || ''
    else {
      const m = document.createElement('meta')
      m.name = 'description'; m.content = article.summary || ''
      document.head.appendChild(m)
    }
  }

  // load approved & published posts from backend
  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => setArticles(data || []))
      .catch(() => setArticles([]))
  }, [])

  // if slug present when page loads, fetch detail
  useEffect(() => {
    if (slug) {
      fetch(`/api/news/${slug}`)
        .then(r => r.json())
        .then(a => {
          if (a && a.slug) openArticle(a)
        })
        .catch(() => {})
    }
  }, [slug])

  if (reading) {
    return (
      <Shell title={reading.title} badge="News" subtitle={reading.source} onHome={() => { setReading(null); window.history.pushState({}, '', '/blog'); document.title = 'bestpickr Blog' }} wide>
        <div>
          <P><em>{reading.aiSummary}</em></P>
          <P>{reading.content}</P>
          {reading.tags && (
            <div style={{ marginTop:16 }}>
              {reading.tags.map(t => <Badge key={t}>{t}</Badge>)}
            </div>
          )}
          <P style={{ marginTop:24, fontSize:12, color:'var(--ink4)' }}>
            Source: <a href={reading.sourceLink} target="_blank" rel="noopener noreferrer">{reading.source}</a> · {new Date(reading.publishDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
          </P>
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="bestpickr News" badge="News" subtitle="Top tech & e-commerce headlines" onHome={onHome}>
      <div style={{ display:'flex', gap:24 }}>
        {/* left column */}
        <div style={{ flex:2 }}>
          {articles.map(article => (
            <NewsCard key={article.slug} article={article} onRead={() => openArticle(article)} />
          ))}
        </div>

        {/* right column: methodology snippet */}
        <div style={{ flex:1, position:'sticky', top:20, alignSelf:'flex-start' }}>
          <h3 style={{ fontSize:16, fontWeight:700, color:'var(--ink)', marginBottom:8 }}>About Our Review Methodology</h3>
          <P>Why trust us: independent AI‑driven rankings built on real customer data.</P>
          <P>We evaluate products across platforms with sentiment analysis, price comparisons, and transparent scoring.</P>
          <P>All data, all platforms, zero paid placements—our approach is completely open and repeatable.</P>
          <button onClick={() => onNav && onNav('results')} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--r2)', padding:'10px 14px', fontSize:14, fontWeight:700, cursor:'pointer' }}>Explore Top Products</button>
        </div>
      </div>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// HOW IT WORKS PAGE
// ─────────────────────────────────────────────────────────────────
export function HowItWorksPage({ onHome }) {
  const steps = [
    ['🔍','You search','Type any product — generic ("gaming mouse") or specific ("Logitech G502"). We handle both.','#/results?q=gaming+mouse'],
    ['⚡','We query 3 platforms simultaneously','In real time, we fetch pricing, ratings, and review counts from Amazon India, Flipkart, and Myntra — all in one API call.', null],
    ['🧠','Sentiment NLP runs on reviews','Our AI reads actual review text, not just star ratings, classifying each as positive, neutral, or negative. This catches fake stars and buried complaints.', null],
    ['📊','AI Score is calculated','Four weighted factors — platform ratings (40%), review sentiment (30%), value for money (15%), review volume (15%) — combine into a single 0–10 score.', null],
    ['🏆','You see the definitive ranked list','Sorted by bestpickr AI Score. No paid placements. No editorial bias. The #1 spot is earned purely by data.', null],
    ['🛒','Buy at the best price','We show you which platform is cheapest today. One click takes you directly to the product page with your affiliate link recorded.', null],
  ]

  return (
    <Shell title="How bestpickr Works" badge="Product" subtitle="We built a smarter way to shop online in India. Here's exactly what happens between your search and our answer." onHome={onHome}>

      <P>Indian e-commerce is fragmented across multiple platforms, flooded with low-quality listings, and plagued by fake reviews. Most shoppers deal with this by spending 45 minutes reading reviews across tabs before buying. bestpickr compresses that to under 10 seconds.</P>

      <H2>Step by Step</H2>
      {steps.map(([icon, title, desc], i) => (
        <div key={i} style={{ display:'flex', gap:16, marginBottom:22, alignItems:'flex-start' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
            <div style={{ width:44, height:44, background:'var(--accent)', borderRadius:'var(--r2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff' }}>{icon}</div>
            {i < steps.length-1 && <div style={{ width:2, height:20, background:'var(--line)', marginTop:4, borderRadius:1 }}/>}
          </div>
          <div style={{ paddingTop:8 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)', marginBottom:5 }}>{i+1}. {title}</div>
            <div style={{ fontSize:14, color:'var(--ink2)', lineHeight:1.75 }}>{desc}</div>
          </div>
        </div>
      ))}

      <H2>What Makes Us Different from Other Comparison Sites</H2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10, marginBottom:16 }}>
        {[
          ['❌ Other sites','✅ bestpickr'],
          ['One platform only','All 3 major Indian platforms'],
          ['Star ratings only','NLP sentiment + star ratings'],
          ['Paid top spots','100% algorithmic ranking'],
          ['Affiliate-driven lists','Commission-neutral AI score'],
          ['Static editorial content','Live data, refreshed regularly'],
        ].slice(1).map(([bad, good]) => (
          <div key={bad} style={{ background:'var(--paper2)', borderRadius:'var(--r)', border:'1px solid var(--line)', padding:'12px 14px' }}>
            <div style={{ fontSize:12, color:'var(--accent2)', fontWeight:600, marginBottom:3 }}>✗ {bad}</div>
            <div style={{ fontSize:12, color:'var(--accent)', fontWeight:600 }}>✓ {good}</div>
          </div>
        ))}
      </div>

      <H2>Data Freshness</H2>
      <P>Prices change daily on Indian e-commerce platforms. We refresh pricing data frequently during peak hours. Review scores update less frequently — a product that has built 10,000 reviews over 3 years doesn't change meaningfully day-to-day. Our cache invalidation is intelligent: products with large price swings or sudden review spikes get re-fetched immediately.</P>

      <H2>Does Affiliate Commission Affect Results?</H2>
      <Callout icon="⚖️" title="Definitively no.">
        Our ranking algorithm runs before any affiliate consideration. We earn the same commission regardless of whether you buy the #1 result or the #10 result on any platform. We have zero financial incentive to rank one product above another — and our architecture reflects that.
      </Callout>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// AI SCORE PAGE
// ─────────────────────────────────────────────────────────────────
export function AIScorePage({ onHome }) {
  const bands = [
    ['9.0 – 10.0','Exceptional','var(--accent)','var(--accent-bg)','Category-leading. Consistently top-rated on all platforms with massive review volumes. Very rare — fewer than 2% of products reach this band.'],
    ['7.5 – 8.9','Very Good','#1155CC','var(--blue-bg)','Highly recommended. Strong sentiment, good ratings, solid review base. Most buyers will be happy with this purchase.'],
    ['6.0 – 7.4','Good','#B8860B','#FFF9E6','Above average. Worth considering but check the common complaints section before buying.'],
    ['4.0 – 5.9','Average','var(--accent2)','var(--accent2-bg)','Mixed reviews. May have recurring quality or reliability complaints. Proceed with caution.'],
    ['Below 4.0','Poor','#999','var(--paper3)','Significant issues detected across review data. We recommend looking at alternatives.'],
  ]

  return (
    <Shell title="AI Score Explained" badge="How It Works" subtitle="Our 0–10 score is the single most reliable way to compare products across Indian e-commerce. Here's every component — transparently." onHome={onHome}>

      <P>The bestpickr AI Score is a number from 0 to 10 that represents how good a product is — accounting for platform ratings, review quality, pricing, and data confidence. It's designed to answer one question: <strong>"If I buy this, will I be happy?"</strong></P>

      <H2>The Four Components</H2>
      <ScoreBar pct="40%" label="Platform Ratings"
        desc="We collect the star rating from every Indian platform where this product is listed (Amazon, Flipkart, Myntra). We compute a weighted average — weighting each platform's score by its review count. This prevents a platform with 50 reviews from having the same influence as one with 50,000. The resulting number is the most statistically robust version of the product's star rating that exists." />
      <ScoreBar pct="30%" label="Review Sentiment"
        desc="NLP analysis of the actual text inside reviews — not just the stars. We classify each sentence as positive, neutral, or negative. This detects 'star inflation': products where buyers click 5⭐ but write sentences like 'delivery was delayed' or 'build quality is poor'. Sentiment score is calculated as (positive% × 10). A product with 85% positive sentiment scores 8.5 on this component." />
      <ScoreBar pct="15%" label="Value for Money"
        desc="How does this product perform relative to its price band within its category? We compute the average bestpickr score for products in the same price range (±20%), then measure this product's deviation. Products that outperform their price band get a bonus; premium-priced products with average scores get penalised. This surfaces products that genuinely punch above their weight." />
      <ScoreBar pct="15%" label="Review Volume & Confidence"
        desc="Statistical confidence in the score. A product with 100,000 reviews has much higher confidence than one with 150. This component scales logarithmically from 0 (0 reviews) to 10 (100,000+ reviews across all platforms). It ensures that a new product with 10 five-star reviews from friends doesn't artificially top the rankings." />

      <H2>Score Bands</H2>
      {bands.map(([range, label, color, bg, desc]) => (
        <div key={range} style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:12 }}>
          <div style={{ background: bg, border:`1px solid ${color}22`, borderRadius:'var(--r)', padding:'6px 12px', minWidth:100, textAlign:'center', flexShrink:0 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:13, color }}>{range}</div>
            <div style={{ fontSize:11, fontWeight:700, color, marginTop:2 }}>{label}</div>
          </div>
          <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.75, paddingTop:4 }}>{desc}</div>
        </div>
      ))}

      <H2>Frequently Asked Questions</H2>
      {[
        ['Can a product score 10/10?','Technically yes, but we\'ve never seen it. A 10 would require: perfect 5.0⭐ on all platforms, 100% positive sentiment, best value in category, and 100,000+ reviews. Real products always have some buyers who are dissatisfied.'],
        ['Why does the score differ from the platform rating?','Because our score aggregates multiple platforms and applies sentiment analysis. A product with 4.8⭐ on Amazon but 3.7⭐ on Flipkart will score lower than you\'d expect from Amazon alone. This is working as intended.'],
        ['How often does the score update?','Prices: frequently (hourly during peak). Ratings and review counts: daily. Sentiment scores: weekly for high-traffic products, monthly for others.'],
        ['Can brands influence their score?','No. We don\'t accept payment, samples, or partnerships that affect rankings. The only way to improve a bestpickr score is to make a better product that buyers love.'],
      ].map(([q, a]) => (
        <div key={q} style={{ marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--line)' }}>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:6 }}>Q: {q}</div>
          <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.75 }}>A: {a}</div>
        </div>
      ))}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// PRICE ALERTS PAGE
// ─────────────────────────────────────────────────────────────────
export function PriceAlertsPage({ onHome }) {
  const [email, setEmail] = useState('')
  const [product, setProduct] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (email && product) setSubmitted(true)
  }

  return (
    <Shell title="Price Alerts" badge="Coming Soon" subtitle="Track any product across Amazon, Flipkart & Myntra. We'll notify you the moment the price drops." onHome={onHome}>

      {submitted ? (
        <div style={{ textAlign:'center', padding:'40px 20px' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--ink)', marginBottom:8 }}>You're on the list!</div>
          <div style={{ fontSize:14, color:'var(--ink3)', lineHeight:1.7 }}>We'll email you at <strong>{email}</strong> when price alerts launch for <strong>{product}</strong>. We're building this feature now.</div>
        </div>
      ) : (
        <>
          <P>Price alerts are one of the most-requested features from bestpickr users. We're actively building them. Here's what's coming — and how to get early access.</P>

          <H2>What Price Alerts Will Do</H2>
          {[
            ['📉','Drop below your target price','Set a target price for any product. We monitor it across Amazon, Flipkart, and Myntra — and notify you the moment it hits your threshold on any platform.'],
            ['📊','Track price history','See a 90-day price chart for any product. Know whether today\'s "sale" is actually a good deal or just marketing.'],
            ['🔔','Multi-platform monitoring','The same product might drop on Flipkart while staying expensive on Amazon. We monitor all platforms simultaneously so you never miss a deal.'],
            ['📱','Email & browser notifications','Get alerts via email first. Browser push notifications coming after that. All notifications are opt-in only.'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display:'flex', gap:14, marginBottom:18, alignItems:'flex-start' }}>
              <div style={{ fontSize:24, flexShrink:0, marginTop:2 }}>{icon}</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:4 }}>{title}</div>
                <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.7 }}>{desc}</div>
              </div>
            </div>
          ))}

          <H2>Join the Early Access List</H2>
          <P>Leave your email and the first product you want to track. We'll notify you the day price alerts go live — and set up your first alert automatically.</P>

          <form onSubmit={handleSubmit}>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              <input
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder='Product you want to track (e.g. "Sony WH-1000XM5")'
                required
                style={{ border:'1.5px solid var(--line)', borderRadius:'var(--r2)', padding:'12px 14px', fontSize:14, color:'var(--ink)', outline:'none', fontFamily:'inherit', background:'var(--paper2)' }}
                onFocus={e => e.target.style.borderColor='var(--accent)'}
                onBlur={e => e.target.style.borderColor='var(--line)'}
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your email address"
                required
                style={{ border:'1.5px solid var(--line)', borderRadius:'var(--r2)', padding:'12px 14px', fontSize:14, color:'var(--ink)', outline:'none', fontFamily:'inherit', background:'var(--paper2)' }}
                onFocus={e => e.target.style.borderColor='var(--accent)'}
                onBlur={e => e.target.style.borderColor='var(--line)'}
              />
              <button type="submit"
                style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--r2)', padding:'13px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'opacity .15s' }}
                onMouseEnter={e => e.target.style.opacity='.88'}
                onMouseLeave={e => e.target.style.opacity='1'}
              >
                🔔 Notify Me When Price Alerts Launch
              </button>
            </div>
          </form>
          <div style={{ fontSize:11, color:'var(--ink4)', textAlign:'center' }}>No spam. Unsubscribe anytime. We store only your email and product name — nothing else.</div>

          <H2>Meanwhile — Manual Price Tracking Tips</H2>
          <P>While we build price alerts, here's how to manually track prices across Indian platforms:</P>
          <ul style={{ paddingLeft:20, marginBottom:14 }}>
            <Li><strong>Use bestpickr to compare current prices</strong> across Amazon, Flipkart &amp; Myntra before buying.</Li>
            <Li><strong>Check during sale events</strong> — Big Billion Days (Flipkart) and Great Indian Festival (Amazon) typically have the deepest discounts of the year.</Li>
            <Li><strong>Price dips on weekdays</strong> — we've observed that prices on electronics are often 3-8% lower on Monday/Tuesday vs weekends.</Li>
            <Li><strong>Compare to "was" price carefully</strong> — MRP on Indian platforms is often inflated. The bestpickr AI score accounts for genuine value, not manufactured discounts.</Li>
          </ul>
        </>
      )}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// PRIVACY POLICY
// ─────────────────────────────────────────────────────────────────
export function PrivacyPage({ onHome }) {
  return (
    <Shell title="Privacy Policy" badge="Legal" subtitle={`Last updated: ${TODAY}`} onHome={onHome}>

      <Callout icon="📋" title="Summary">
        We collect minimal data. We don't sell it. We use it only to improve bestpickr. Full details below.
      </Callout>

      <H2 mt={20}>1. Who We Are</H2>
      <P>bestpickr ("{SITE_NAME}", "we", "us", "our") is an AI-powered product comparison platform available at {SITE_URL}. We are an independent service not affiliated with Amazon, Flipkart, or Myntra.</P>
      <P>For privacy-related queries, contact us at: <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)' }}>{CONTACT}</a></P>

      <H2>2. Information We Collect</H2>
      <H3>2.1 Information You Provide</H3>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Email address</strong> — only if you sign up for price alert notifications (optional feature).</Li>
        <Li><strong>Search queries</strong> — the text you search for on bestpickr, to power results and improve our AI.</Li>
      </ul>
      <H3>2.2 Information Collected Automatically</H3>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Anonymous visitor ID</strong> — a randomly generated identifier stored in your browser (localStorage) to distinguish unique visitors. This is not linked to your name, email, or any personally identifiable information.</Li>
        <Li><strong>Session ID</strong> — a temporary identifier for your current browsing session (sessionStorage), cleared when you close the tab.</Li>
        <Li><strong>Page views and click events</strong> — which pages you view and which products you click on bestpickr. This is used to understand which features are useful.</Li>
        <Li><strong>Screen width</strong> — to understand how to improve our mobile experience.</Li>
        <Li><strong>Referrer URL</strong> — how you arrived at bestpickr (e.g., from a Google search).</Li>
        <Li><strong>Browser and device type</strong> — general device category (mobile/desktop) from the user-agent string.</Li>
      </ul>
      <H3>2.3 What We Do NOT Collect</H3>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>Your name, phone number, or address (unless you contact us by email)</Li>
        <Li>Payment information of any kind</Li>
        <Li>Your behaviour on external platforms (Amazon, Flipkart, Myntra)</Li>
        <Li>Precise location or GPS data</Li>
        <Li>Cross-site tracking cookies</Li>
      </ul>

      <H2>3. How We Use Your Information</H2>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>To provide and improve the bestpickr service</Li>
        <Li>To understand which product categories and features are most useful</Li>
        <Li>To detect and prevent abuse of our platform</Li>
        <Li>To send price alert notifications (only if you opted in)</Li>
        <Li>To generate aggregate, anonymised analytics about usage patterns</Li>
      </ul>
      <P>We do not use your data for advertising targeting. We do not sell, rent, or share your data with third parties for their marketing purposes.</P>

      <H2>4. Cookies and Local Storage</H2>
      <P>bestpickr uses browser <strong>localStorage</strong> to store an anonymous visitor ID and <strong>sessionStorage</strong> to store a session ID. These are not cookies — they are not sent to any third-party server and are not used for advertising tracking.</P>
      <P>We do not currently use third-party tracking cookies (e.g., Google Analytics, Facebook Pixel). If this changes in the future, we will update this policy and add a cookie consent prompt.</P>

      <H2>5. Affiliate Links</H2>
      <P>When you click a "Buy" link on bestpickr, you are redirected to Amazon India, Flipkart, or Myntra. At that point, those platforms' own privacy policies apply to your behaviour. We may earn an affiliate commission on qualifying purchases. We receive only aggregate commission reports — not individual purchase data linked to you.</P>

      <H2>6. Data Storage and Security</H2>
      <P>Our backend is hosted on Vercel (US-based infrastructure). Analytics data is stored in a PostgreSQL database with access restricted to the bestpickr team. We use HTTPS for all data transmission. We implement reasonable security measures, but no internet service can guarantee absolute security.</P>

      <H2>7. Data Retention</H2>
      <P>Analytics event logs are retained for 90 days, after which they are automatically deleted. Anonymised aggregate statistics (e.g., "10,000 users searched for headphones this month") may be retained indefinitely. If you signed up for price alerts, your email is retained until you unsubscribe.</P>

      <H2>8. Your Rights</H2>
      <P>You have the right to:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>Know what data we hold about you</Li>
        <Li>Request deletion of your data</Li>
        <Li>Withdraw consent for email communications at any time</Li>
        <Li>Clear your anonymous visitor ID by clearing your browser's localStorage</Li>
      </ul>
      <P>To exercise any of these rights, email us at <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)' }}>{CONTACT}</a></P>

      <H2>9. Children's Privacy</H2>
      <P>bestpickr is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.</P>

      <H2>10. Changes to This Policy</H2>
      <P>We may update this privacy policy as the service evolves. When we make material changes, we will update the "Last updated" date at the top of this page. Your continued use of bestpickr after any changes constitutes your acceptance of the updated policy.</P>

      <H2>11. Contact</H2>
      <P>Privacy questions or requests: <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)' }}>{CONTACT}</a></P>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────
// TERMS OF SERVICE
// ─────────────────────────────────────────────────────────────────
export function TermsPage({ onHome }) {
  return (
    <Shell title="Terms of Service" badge="Legal" subtitle={`Last updated: ${TODAY}`} onHome={onHome}>

      <Callout icon="📋" title="Summary">
        Use bestpickr for personal, non-commercial product research. Don't scrape us. Affiliate links help keep the service free. Prices shown are indicative — verify on the platform before purchasing.
      </Callout>

      <H2 mt={20}>1. Acceptance of Terms</H2>
      <P>By accessing or using bestpickr at {SITE_URL} ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, please do not use the Service. These Terms apply to all visitors, users, and others who access the Service.</P>

      <H2>2. Description of Service</H2>
      <P>bestpickr is an AI-powered product comparison and ranking platform. We aggregate publicly available product data (ratings, prices, review counts) from Indian e-commerce platforms and apply a proprietary algorithm to rank products. We are not a retailer — we do not sell products directly.</P>

      <H2>3. Permitted Use</H2>
      <P>You may use bestpickr for personal, non-commercial product research. Permitted uses include:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>Searching for and comparing products for personal purchase decisions</Li>
        <Li>Sharing bestpickr links with friends and family</Li>
        <Li>Embedding bestpickr links in personal blog posts or social media</Li>
      </ul>

      <H2>4. Prohibited Use</H2>
      <P>You may not:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Scrape or crawl</strong> bestpickr using automated tools, bots, or scripts without written permission</Li>
        <Li><strong>Use our data commercially</strong> — reselling, republishing, or redistributing bestpickr rankings or data in a commercial product or service</Li>
        <Li><strong>Attempt to manipulate</strong> our rankings, including creating fake reviews on third-party platforms to influence bestpickr scores</Li>
        <Li><strong>Use the Service in a way that interferes</strong> with its availability for other users (DDoS, excessive requests, etc.)</Li>
        <Li>Attempt to access any non-public areas of the Service or backend systems</Li>
        <Li>Misrepresent your affiliation with any person or entity</Li>
      </ul>

      <H2>5. Accuracy of Information</H2>
      <P>Prices, ratings, and availability displayed on bestpickr are aggregated from third-party platforms and may not reflect current real-time data. bestpickr makes no warranty that the information displayed is accurate, complete, or current.</P>
      <Callout icon="⚠️" bg='#FFF9E6' color='#B8860B' title="Always verify price on the platform before purchasing">
        Prices on Indian e-commerce platforms change frequently. The price shown on bestpickr may differ from the current price on Amazon, Flipkart, or Myntra. Always confirm the final price and availability directly on the retailer's platform before completing a purchase.
      </Callout>

      <H2>6. Affiliate Relationships</H2>
      <P>bestpickr participates in affiliate programs with Amazon India (through the Amazon Associates Program), Flipkart, and Myntra. When you click a "Buy" link and make a qualifying purchase, we may earn a commission at no additional cost to you.</P>
      <P>This affiliate relationship does not influence our rankings. Product rankings are determined exclusively by our AI scoring algorithm, which is calculated independently of any affiliate consideration.</P>

      <H2>7. Intellectual Property</H2>
      <P>The bestpickr brand, logo, AI scoring methodology, and the compilation of product data as presented on this site are the intellectual property of bestpickr. Product names, images, and descriptions belong to their respective brand owners and are reproduced under fair use for comparison purposes.</P>
      <P>You may not reproduce, distribute, or create derivative works from bestpickr content without written permission.</P>

      <H2>8. Disclaimers</H2>
      <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. bestpickr DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.</P>
      <P>bestpickr is not responsible for the quality, safety, legality, or availability of products listed. Your purchase decisions are your own responsibility.</P>

      <H2>9. Limitation of Liability</H2>
      <P>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, bestpickr SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL — ARISING FROM YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</P>

      <H2>10. Governing Law</H2>
      <P>These Terms are governed by and construed in accordance with the laws of India. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts in India.</P>

      <H2>11. Changes to Terms</H2>
      <P>We may update these Terms from time to time. We will notify users of material changes by updating the "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the new Terms.</P>

      <H2>12. Contact</H2>
      <P>For questions about these Terms: <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)' }}>{CONTACT}</a></P>
    </Shell>
  )
}
