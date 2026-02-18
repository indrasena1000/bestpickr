// src/components/Footer.jsx
export default function Footer({ onSearch }) {
  const suggests = ['Best headphones', 'Gaming mouse', 'Running shoes', 'Air fryer', 'Skincare serum']
  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-brand"><b>best</b><span>pickr</span></div>
            <div className="footer-desc">We compare products across Amazon, Flipkart & Myntra using AI — so you always find the best-rated product at the best price.</div>
            <div style={{ marginTop:12, fontSize:12, color:'var(--ink4)' }}>Made in India 🇮🇳</div>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              {['How it works','AI Score explained','Price alerts','Browser extension'].map(l => (
                <div key={l} className="footer-link">{l}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              {['About','Blog','Careers','Contact'].map(l => (
                <div key={l} className="footer-link">{l}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <div className="footer-links">
              {['Privacy Policy','Terms','Affiliate Disclosure'].map(l => (
                <div key={l} className="footer-link">{l}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2025 bestpickr. All rights reserved.</div>
          <div style={{ fontSize:11, color:'var(--ink4)', maxWidth:500, lineHeight:1.5 }}>
            bestpickr earns affiliate commissions when you click Buy links. This never affects rankings — products are ranked purely by AI score.
          </div>
        </div>
      </div>
    </footer>
  )
}
