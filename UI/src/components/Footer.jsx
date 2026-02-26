// src/components/Footer.jsx
import { useState, useEffect } from 'react'
import { getLatestBlogPosts } from '../services/api.js'

export default function Footer({ onSearch, onNav, onAdmin }) {
  const [latestPosts, setLatestPosts] = useState([])

  useEffect(() => {
    getLatestBlogPosts()
      .then(d => setLatestPosts((d.posts || []).slice(0, 3)))
      .catch(() => {})
  }, [])
  const popular = [
    'Best noise cancelling headphones India',
    'Best budget smartphone 2025',
    'Best gaming mouse under ₹2000',
    'Best air fryer India',
    'Best wireless earbuds',
  ]

  function nav(page) { if (onNav) onNav(page) }

  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">

          {/* Brand */}
          <div>
            <div className="footer-brand"><b>best</b><span>pickr™</span></div>
            <div className="footer-desc">
              India's smartest product comparison engine. We rank products across Amazon, Flipkart &amp; Myntra using AI — so you always find the best-rated product at the best price.
            </div>
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.4px', textTransform:'uppercase', color:'var(--ink4)', marginBottom:8 }}>Popular Searches</div>
              {popular.map(s => (
                <div key={s} onClick={() => onSearch && onSearch(s)}
                  style={{ fontSize:12, color:'var(--ink4)', cursor:'pointer', marginBottom:5, lineHeight:1.5, transition:'color .12s' }}
                  onMouseEnter={e => e.target.style.color='var(--accent)'}
                  onMouseLeave={e => e.target.style.color='var(--ink4)'}
                >
                  → {s}
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, fontSize:12, color:'var(--ink4)' }}>Made with ❤️ in India 🇮🇳</div>
          </div>

          {/* Product */}
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <div className="footer-link" onClick={() => nav('how-it-works')}>How It Works</div>
              <div className="footer-link" onClick={() => nav('ai-score')}>AI Score Explained</div>
              <div className="footer-link" onClick={() => nav('price-alerts')}>Price Alerts</div>
              <div className="footer-link" onClick={() => onSearch && onSearch('best products')}>Top Lists</div>
              <div className="footer-link" onClick={() => onSearch && onSearch('trending electronics')}>Trending Now</div>
            </div>
          </div>

          {/* Company */}
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <div className="footer-link" onClick={() => nav('about')}>About bestpickr™</div>
              <div className="footer-link" onClick={() => nav('blog')}>Blog</div>
              {latestPosts.map(post => (
                <div key={post.slug} className="footer-link"
                  onClick={() => onNav && onNav('blog/' + post.slug)}
                  style={{ fontSize:11, paddingLeft:8, lineHeight:1.5, marginBottom:4, color:'var(--ink4)' }}
                >
                  → {post.title}
                </div>
              ))}
              <div className="footer-link">
                <a href="mailto:hello@bestpickr.in" style={{ color:'inherit', textDecoration:'none' }}>hello@bestpickr.in</a>
              </div>
            </div>
            <div style={{ marginTop:20 }}>
              <div className="footer-col-title">Categories</div>
              <div className="footer-links">
                {[
                  ['Headphones','best headphones india'],
                  ['Smartphones','best smartphones india 2025'],
                  ['Laptops','best laptops for students india'],
                  ['Gaming','best gaming accessories india'],
                  ['Skincare','best skincare products india'],
                ].map(([label, q]) => (
                  <div key={label} className="footer-link" onClick={() => onSearch && onSearch(q)}>{label}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Legal */}
          <div>
            <div className="footer-col-title">Legal</div>
            <div className="footer-links">
              <div className="footer-link" onClick={() => nav('privacy')}>Privacy Policy</div>
              <div className="footer-link" onClick={() => nav('terms')}>Terms of Service</div>
              <div className="footer-link" onClick={() => nav('affiliate-disclosure')}>Affiliate Disclosure</div>
            </div>
            <div style={{ marginTop:20, background:'var(--accent-bg)', border:'1px solid #C8E6D4', borderRadius:'var(--r2)', padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:5 }}>🛒 Affiliate Disclosure</div>
              <div style={{ fontSize:11, color:'var(--ink3)', lineHeight:1.6 }}>
                As an Amazon Associate I earn from qualifying purchases.
                We also earn commissions from Flipkart and Myntra affiliate links — at no extra cost to you. Rankings are never influenced by this.
                {' '}<span onClick={() => nav('affiliate-disclosure')} style={{ color:'var(--accent)', cursor:'pointer', textDecoration:'underline' }}>Learn more</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} bestpickr™. All rights reserved.</div>
          <div style={{ fontSize:11, color:'var(--ink4)', textAlign:'center', lineHeight:1.7 }}>
            bestpickr™ is an independent product comparison platform, not affiliated with Amazon, Flipkart or Myntra.
            bestpickr™ is a participant in the Amazon Associates Programme — an affiliate advertising programme that enables sites to earn fees by linking to Amazon.in.
          </div>
          {/* Hidden admin dot */}
          <div
            onClick={() => typeof onAdmin === 'function' && onAdmin()}
            style={{ fontSize:11, color:'var(--ink4)', cursor:'pointer', opacity:0.3, userSelect:'none', padding:'0 4px' }}
            title="·"
          >·</div>
        </div>
      </div>
    </footer>
  )
}
