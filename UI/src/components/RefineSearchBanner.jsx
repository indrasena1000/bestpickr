// src/components/RefineSearchBanner.jsx
// Smart refinement banner shown for vague/generic queries.
// Suggests brands, budgets, series, or use-cases as clickable chips.
import { useState } from 'react'

// ── Known brands per category ─────────────────────────────────────
const CAT_BRANDS = {
  mobile:      ['Samsung', 'Apple', 'OnePlus', 'Poco', 'Realme', 'Vivo', 'OPPO', 'Motorola', 'Xiaomi'],
  laptop:      ['HP', 'Dell', 'Lenovo', 'Asus', 'Apple', 'Acer', 'MSI'],
  headphones:  ['Sony', 'boAt', 'JBL', 'Bose', 'Sennheiser', 'Jabra', 'Skullcandy'],
  tablets:     ['Apple', 'Samsung', 'Lenovo', 'Realme'],
  smartwatch:  ['Apple', 'Samsung', 'Noise', 'boAt', 'Garmin', 'Amazfit'],
  camera:      ['Sony', 'Canon', 'Nikon', 'Fujifilm'],
  gaming:      ['PlayStation', 'Xbox', 'Nintendo', 'Asus ROG', 'MSI'],
  appliances:  ['LG', 'Samsung', 'Whirlpool', 'Bosch', 'IFB', 'Havells'],
  footwear:    ['Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Skechers'],
  skincare:    ['Minimalist', 'Dot & Key', 'Plum', 'Mamaearth', 'Cetaphil', 'Himalaya'],
}

// ── Budget chips per category ─────────────────────────────────────
const CAT_BUDGETS = {
  mobile:      [{ label: 'Under ₹10K', q: 'mobile under 10000' }, { label: 'Under ₹20K', q: 'mobile under 20000' }, { label: '₹20K–40K', q: 'mobile 20000 to 40000' }, { label: 'Above ₹50K', q: 'flagship mobile above 50000' }],
  laptop:      [{ label: 'Under ₹30K', q: 'laptop under 30000' }, { label: 'Under ₹50K', q: 'laptop under 50000' }, { label: '₹50K–80K', q: 'laptop 50000 to 80000' }, { label: 'Above ₹80K', q: 'premium laptop above 80000' }],
  headphones:  [{ label: 'Under ₹1K', q: 'headphones under 1000' }, { label: 'Under ₹5K', q: 'headphones under 5000' }, { label: 'Under ₹15K', q: 'headphones under 15000' }, { label: 'Above ₹15K', q: 'premium headphones above 15000' }],
  tablets:     [{ label: 'Under ₹15K', q: 'tablet under 15000' }, { label: 'Under ₹30K', q: 'tablet under 30000' }, { label: 'Above ₹40K', q: 'premium tablet above 40000' }],
  smartwatch:  [{ label: 'Under ₹3K', q: 'smartwatch under 3000' }, { label: 'Under ₹10K', q: 'smartwatch under 10000' }, { label: 'Above ₹20K', q: 'premium smartwatch above 20000' }],
  camera:      [{ label: 'Under ₹30K', q: 'camera under 30000' }, { label: 'Under ₹60K', q: 'camera under 60000' }, { label: 'Above ₹1L', q: 'professional camera above 100000' }],
  appliances:  [{ label: 'Under ₹10K', q: 'appliance under 10000' }, { label: 'Under ₹30K', q: 'appliance under 30000' }, { label: 'Above ₹50K', q: 'premium appliance above 50000' }],
  footwear:    [{ label: 'Under ₹2K', q: 'shoes under 2000' }, { label: 'Under ₹5K', q: 'shoes under 5000' }, { label: 'Above ₹8K', q: 'premium shoes above 8000' }],
}

// ── Use-case chips per category ───────────────────────────────────
const CAT_USE_CASES = {
  mobile:     [{ label: 'Gaming', q: 'gaming phone' }, { label: 'Best camera', q: 'best camera phone' }, { label: 'Long battery', q: 'long battery phone' }, { label: '5G', q: '5G phone' }],
  laptop:     [{ label: 'Gaming', q: 'gaming laptop' }, { label: 'Student', q: 'student laptop' }, { label: 'Business', q: 'business laptop' }, { label: 'Thin & light', q: 'thin light laptop' }],
  headphones: [{ label: 'Wireless', q: 'wireless headphones' }, { label: 'Noise cancelling', q: 'noise cancelling headphones' }, { label: 'Earbuds', q: 'wireless earbuds' }, { label: 'Gaming', q: 'gaming headset' }],
  tablets:    [{ label: 'Kids', q: 'kids tablet' }, { label: 'Drawing', q: 'drawing tablet' }, { label: 'Work', q: 'work tablet' }],
  smartwatch: [{ label: 'Fitness', q: 'fitness smartwatch' }, { label: 'GPS', q: 'GPS smartwatch' }, { label: 'AMOLED', q: 'AMOLED smartwatch' }],
  camera:     [{ label: 'DSLR', q: 'DSLR camera' }, { label: 'Mirrorless', q: 'mirrorless camera' }, { label: 'Action', q: 'action camera' }],
  appliances: [{ label: 'Washing machine', q: 'washing machine' }, { label: 'Air fryer', q: 'air fryer' }, { label: 'Refrigerator', q: 'refrigerator' }, { label: 'Air conditioner', q: 'air conditioner' }],
}

// ── Series per brand+category ─────────────────────────────────────
const BRAND_SERIES = {
  samsung: {
    mobile: [{ label: 'Galaxy S series', q: 'Samsung Galaxy S series' }, { label: 'Galaxy A series', q: 'Samsung Galaxy A series' }, { label: 'Galaxy M series', q: 'Samsung Galaxy M series' }, { label: 'Galaxy F series', q: 'Samsung Galaxy F series' }],
    laptop: [{ label: 'Galaxy Book', q: 'Samsung Galaxy Book' }],
  },
  apple: {
    mobile: [{ label: 'iPhone 16', q: 'Apple iPhone 16' }, { label: 'iPhone 15', q: 'Apple iPhone 15' }, { label: 'iPhone SE', q: 'Apple iPhone SE' }],
    laptop: [{ label: 'MacBook Air M2', q: 'MacBook Air M2' }, { label: 'MacBook Air M3', q: 'MacBook Air M3' }, { label: 'MacBook Pro', q: 'MacBook Pro M3' }],
    tablets: [{ label: 'iPad Pro', q: 'Apple iPad Pro' }, { label: 'iPad Air', q: 'Apple iPad Air' }, { label: 'iPad mini', q: 'Apple iPad mini' }],
  },
  oneplus: {
    mobile: [{ label: 'OnePlus 12', q: 'OnePlus 12' }, { label: 'OnePlus Nord 4', q: 'OnePlus Nord 4' }, { label: 'OnePlus Nord CE', q: 'OnePlus Nord CE' }],
  },
  oppo: {
    mobile: [{ label: 'Reno series', q: 'OPPO Reno' }, { label: 'A series', q: 'OPPO A series' }, { label: 'K series', q: 'OPPO K series' }, { label: 'Find series', q: 'OPPO Find' }],
  },
  xiaomi: {
    mobile: [{ label: 'Mi series', q: 'Xiaomi Mi series' }, { label: 'Redmi Note', q: 'Redmi Note' }, { label: 'Poco F', q: 'Poco F series' }],
  },
  realme: {
    mobile: [{ label: 'Narzo series', q: 'Realme Narzo' }, { label: 'Realme GT', q: 'Realme GT' }, { label: 'Realme C series', q: 'Realme C series' }],
  },
  sony: {
    headphones: [{ label: 'WH-1000XM5', q: 'Sony WH-1000XM5' }, { label: 'WF-1000XM5', q: 'Sony WF-1000XM5' }, { label: 'LinkBuds', q: 'Sony LinkBuds' }],
    camera: [{ label: 'Alpha series', q: 'Sony Alpha mirrorless' }, { label: 'ZV series', q: 'Sony ZV camera' }],
  },
  hp: {
    laptop: [{ label: 'Pavilion', q: 'HP Pavilion laptop' }, { label: 'Omen', q: 'HP Omen gaming laptop' }, { label: 'Envy', q: 'HP Envy laptop' }, { label: 'Victus', q: 'HP Victus gaming' }],
  },
  dell: {
    laptop: [{ label: 'Inspiron', q: 'Dell Inspiron laptop' }, { label: 'XPS', q: 'Dell XPS laptop' }, { label: 'Vostro', q: 'Dell Vostro laptop' }],
  },
  lenovo: {
    laptop: [{ label: 'IdeaPad', q: 'Lenovo IdeaPad laptop' }, { label: 'ThinkPad', q: 'Lenovo ThinkPad laptop' }, { label: 'Legion', q: 'Lenovo Legion gaming' }],
  },
  asus: {
    laptop: [{ label: 'VivoBook', q: 'Asus VivoBook laptop' }, { label: 'ZenBook', q: 'Asus ZenBook laptop' }, { label: 'TUF Gaming', q: 'Asus TUF gaming laptop' }, { label: 'ROG', q: 'Asus ROG gaming laptop' }],
  },
}

// ── Brand detection from raw query ───────────────────────────────
const ALL_BRANDS = ['samsung', 'apple', 'oneplus', 'oppo', 'xiaomi', 'redmi', 'realme', 'vivo', 'motorola', 'poco', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'msi', 'sony', 'boat', 'jbl', 'bose', 'sennheiser', 'jabra']

function detectBrandFromQuery(query) {
  const q = query.toLowerCase()
  return ALL_BRANDS.find(b => q.includes(b)) || null
}

// ── Generate hints based on intent + query + category ────────────
function buildHints(intent, query, category) {
  const cat   = category?.toLowerCase() || null
  const brand = detectBrandFromQuery(query)

  // No hints for PRODUCT_SPECIFIC (user already knows what they want)
  if (intent === 'PRODUCT_SPECIFIC' || intent === 'LOW_CONFIDENCE' || intent === 'FALLBACK') return null
  if (!cat && !brand) return null

  // BRAND_CATEGORY: has brand + category → suggest series & budget
  if ((intent === 'BRAND_CATEGORY' || brand) && cat) {
    const series = BRAND_SERIES[brand]?.[cat]
    const budgets = CAT_BUDGETS[cat] || []
    if (series || budgets.length > 0) {
      const groups = []
      if (series)          groups.push({ label: 'Series / Model', chips: series })
      if (budgets.length)  groups.push({ label: 'Budget', chips: budgets })
      const brandLabel = brand.charAt(0).toUpperCase() + brand.slice(1)
      return {
        message: `Which ${brandLabel} ${cat} are you looking for?`,
        groups,
      }
    }
  }

  // CATEGORY / GENERIC: has category but no specific brand → suggest brands + use-cases + budget
  if (cat) {
    const brands    = CAT_BRANDS[cat] || []
    const useCases  = CAT_USE_CASES[cat] || []
    const budgets   = CAT_BUDGETS[cat] || []
    const groups = []
    if (brands.length)    groups.push({ label: 'Brand', chips: brands.map(b => ({ label: b, q: `${b} ${cat}` })) })
    if (useCases.length)  groups.push({ label: 'Use Case', chips: useCases })
    if (budgets.length)   groups.push({ label: 'Budget', chips: budgets })
    if (groups.length === 0) return null
    return {
      message: 'Narrow down for better results:',
      groups,
    }
  }

  return null
}

// ── Main component ────────────────────────────────────────────────
export default function RefineSearchBanner({ intent, query, category, onSearch }) {
  const [dismissed, setDismissed] = useState(false)

  const hints = buildHints(intent, query, category)
  if (!hints || dismissed) return null

  return (
    <div style={{
      background: 'var(--paper2)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 18,
      position: 'relative',
    }}>
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute', top: 10, right: 12,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, color: 'var(--ink4)', lineHeight: 1,
        }}
        aria-label="Dismiss"
      >×</button>

      {/* Header */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--ink)',
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12,
      }}>
        <span>💡</span>
        {hints.message}
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hints.groups.map((group) => (
          <ChipGroup
            key={group.label}
            group={group}
            onSearch={onSearch}
          />
        ))}
      </div>
    </div>
  )
}

function ChipGroup({ group, onSearch }) {
  const MAX_VISIBLE = 6
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? group.chips : group.chips.slice(0, MAX_VISIBLE)
  const hasMore = group.chips.length > MAX_VISIBLE

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--ink4)',
        textTransform: 'uppercase', letterSpacing: '.6px',
        paddingTop: 5, minWidth: 60, flexShrink: 0,
      }}>
        {group.label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
        {visible.map((chip) => (
          <button
            key={chip.label}
            onClick={() => onSearch?.(chip.q || chip.label)}
            style={{
              padding: '4px 11px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--line)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              cursor: 'pointer',
              transition: 'background .15s, border-color .15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink)' }}
          >
            {chip.label}
          </button>
        ))}
        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: '1px dashed var(--line)', background: 'none',
              color: 'var(--ink4)', cursor: 'pointer',
            }}
          >
            +{group.chips.length - MAX_VISIBLE} more
          </button>
        )}
      </div>
    </div>
  )
}
