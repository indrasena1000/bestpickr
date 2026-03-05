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
// chip.cat is passed as the category arg to onSearch so backend filters correctly
const CAT_BUDGETS = {
  mobile:      [{ label: 'Under ₹10K', q: 'budget smartphone', cat: 'smartphones' }, { label: 'Under ₹20K', q: 'mid range smartphone', cat: 'smartphones' }, { label: '₹20K–40K', q: 'premium mid range smartphone', cat: 'smartphones' }, { label: 'Above ₹50K', q: 'flagship smartphone', cat: 'smartphones' }],
  laptop:      [{ label: 'Under ₹30K', q: 'budget laptop', cat: 'laptops' }, { label: 'Under ₹50K', q: 'mid range laptop', cat: 'laptops' }, { label: '₹50K–80K', q: 'premium laptop', cat: 'laptops' }, { label: 'Above ₹80K', q: 'high end laptop', cat: 'laptops' }],
  headphones:  [{ label: 'Under ₹1K', q: 'budget earphones', cat: 'headphones' }, { label: 'Under ₹5K', q: 'best earphones', cat: 'headphones' }, { label: 'Under ₹15K', q: 'best wireless headphones', cat: 'headphones' }, { label: 'Above ₹15K', q: 'premium headphones noise cancelling', cat: 'headphones' }],
  tablets:     [{ label: 'Under ₹15K', q: 'budget tablet', cat: 'tablets' }, { label: 'Under ₹30K', q: 'mid range tablet', cat: 'tablets' }, { label: 'Above ₹40K', q: 'premium tablet', cat: 'tablets' }],
  smartwatch:  [{ label: 'Under ₹3K', q: 'budget smartwatch', cat: 'smartwatch' }, { label: 'Under ₹10K', q: 'best smartwatch', cat: 'smartwatch' }, { label: 'Above ₹20K', q: 'premium smartwatch', cat: 'smartwatch' }],
  camera:      [{ label: 'Under ₹30K', q: 'budget DSLR camera', cat: 'camera' }, { label: 'Under ₹60K', q: 'mid range mirrorless camera', cat: 'camera' }, { label: 'Above ₹1L', q: 'professional camera', cat: 'camera' }],
  appliances:  [{ label: 'Under ₹10K', q: 'best home appliance', cat: 'appliances' }, { label: 'Under ₹30K', q: 'mid range appliance', cat: 'appliances' }, { label: 'Above ₹50K', q: 'premium appliance', cat: 'appliances' }],
  footwear:    [{ label: 'Under ₹2K', q: 'budget running shoes', cat: 'footwear' }, { label: 'Under ₹5K', q: 'best sports shoes', cat: 'footwear' }, { label: 'Above ₹8K', q: 'premium sneakers', cat: 'footwear' }],
}

// ── Use-case chips per category (for CATEGORY/GENERIC searches) ──
const CAT_USE_CASES = {
  mobile:     [{ label: 'Gaming', q: 'gaming phone', cat: 'smartphones' }, { label: 'Best camera', q: 'best camera phone', cat: 'smartphones' }, { label: 'Long battery', q: 'long battery phone', cat: 'smartphones' }, { label: '5G', q: '5G phone', cat: 'smartphones' }],
  laptop:     [{ label: 'Gaming', q: 'gaming laptop', cat: 'laptops' }, { label: 'Student', q: 'student laptop', cat: 'laptops' }, { label: 'Business', q: 'business laptop', cat: 'laptops' }, { label: 'Thin & light', q: 'thin light laptop', cat: 'laptops' }],
  headphones: [{ label: 'Wireless', q: 'wireless headphones', cat: 'headphones' }, { label: 'Noise cancelling', q: 'noise cancelling headphones', cat: 'headphones' }, { label: 'Earbuds', q: 'wireless earbuds', cat: 'headphones' }, { label: 'Gaming', q: 'gaming headset', cat: 'headphones' }],
  tablets:    [{ label: 'Kids', q: 'kids tablet', cat: 'tablets' }, { label: 'Drawing', q: 'drawing tablet', cat: 'tablets' }, { label: 'Work', q: 'work tablet', cat: 'tablets' }],
  smartwatch: [{ label: 'Fitness', q: 'fitness smartwatch', cat: 'smartwatch' }, { label: 'GPS', q: 'GPS smartwatch', cat: 'smartwatch' }, { label: 'AMOLED', q: 'AMOLED smartwatch', cat: 'smartwatch' }],
  camera:     [{ label: 'DSLR', q: 'DSLR camera', cat: 'camera' }, { label: 'Mirrorless', q: 'mirrorless camera', cat: 'camera' }, { label: 'Action', q: 'action camera', cat: 'camera' }],
  appliances: [{ label: 'Washing machine', q: 'washing machine', cat: 'appliances' }, { label: 'Air fryer', q: 'air fryer', cat: 'appliances' }, { label: 'Refrigerator', q: 'refrigerator', cat: 'appliances' }, { label: 'Air conditioner', q: 'air conditioner', cat: 'appliances' }],
}

// ── Variant chips for PRODUCT_SPECIFIC searches ───────────────────
// These APPEND to the current query, not replace it.
// e.g. "icall wireless" + "over ear" → "icall wireless over ear headphones"
const CAT_VARIANTS = {
  headphones: {
    label: 'What type are you looking for?',
    groups: [
      {
        label: 'Type',
        chips: [
          { label: 'Over-Ear', append: 'over ear headphones' },
          { label: 'TWS Earbuds', append: 'true wireless earbuds' },
          { label: 'Neckband', append: 'neckband earphones' },
          { label: 'In-Ear', append: 'in ear earphones' },
          { label: 'Gaming Headset', append: 'gaming headset' },
          { label: 'Wired', append: 'wired headphones' },
        ],
      },
      {
        label: 'Feature',
        chips: [
          { label: 'With Mic', append: 'with microphone' },
          { label: 'Noise Cancelling', append: 'noise cancelling' },
          { label: 'Bass Boost', append: 'bass boost' },
          { label: 'Long Battery', append: '40 hours battery' },
        ],
      },
    ],
  },
  mobile: {
    label: 'Which variant are you looking for?',
    groups: [
      {
        label: 'Feature',
        chips: [
          { label: '5G', append: '5G' },
          { label: 'Gaming', append: 'gaming' },
          { label: 'Best Camera', append: '108MP camera' },
          { label: 'Big Battery', append: '6000mAh battery' },
          { label: 'Slim Design', append: 'slim design' },
        ],
      },
      {
        label: 'Storage',
        chips: [
          { label: '128GB', append: '128GB' },
          { label: '256GB', append: '256GB' },
          { label: '512GB', append: '512GB' },
        ],
      },
    ],
  },
  laptop: {
    label: 'What will you use it for?',
    groups: [
      {
        label: 'Use',
        chips: [
          { label: 'Gaming', append: 'gaming laptop' },
          { label: 'Student', append: 'student thin light' },
          { label: 'Video Editing', append: 'video editing' },
          { label: 'Office Work', append: 'office business' },
        ],
      },
      {
        label: 'Spec',
        chips: [
          { label: 'Core i5', append: 'i5 processor' },
          { label: 'Core i7', append: 'i7 processor' },
          { label: 'Ryzen 5', append: 'ryzen 5' },
          { label: 'M2 chip', append: 'M2 chip' },
        ],
      },
    ],
  },
  camera: {
    label: 'Which type of camera?',
    groups: [
      {
        label: 'Type',
        chips: [
          { label: 'DSLR', append: 'DSLR' },
          { label: 'Mirrorless', append: 'mirrorless' },
          { label: 'Action Cam', append: 'action camera' },
          { label: 'Vlog Camera', append: 'vlog camera' },
        ],
      },
    ],
  },
  smartwatch: {
    label: 'What features matter most?',
    groups: [
      {
        label: 'Feature',
        chips: [
          { label: 'AMOLED Display', append: 'AMOLED' },
          { label: 'GPS', append: 'GPS' },
          { label: 'SpO2 & HR', append: 'SpO2 heart rate' },
          { label: 'Long Battery', append: '7 day battery' },
          { label: 'Calling', append: 'calling smartwatch' },
        ],
      },
    ],
  },
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

// ── Category detection fallback (when backend category not available) ─
const CAT_KEYWORDS = {
  mobile:      ['mobile', 'phone', 'smartphone', 'iphone', 'galaxy', 'android'],
  laptop:      ['laptop', 'notebook', 'macbook', 'chromebook'],
  headphones:  ['headphone', 'earphone', 'earbuds', 'headset', 'airpods'],
  tablets:     ['tablet', 'ipad'],
  smartwatch:  ['smartwatch', 'watch', 'band'],
  camera:      ['camera', 'dslr', 'mirrorless'],
  gaming:      ['gaming', 'console', 'playstation', 'xbox', 'nintendo'],
  appliances:  ['washing', 'refrigerator', 'fridge', 'ac ', 'microwave', 'vacuum', 'fryer'],
  footwear:    ['shoes', 'sneakers', 'footwear', 'sandals', 'boots'],
  skincare:    ['skincare', 'moisturizer', 'serum', 'sunscreen', 'cleanser'],
}

function detectCategoryFromQuery(query) {
  const q = query.toLowerCase()
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    if (kws.some(kw => q.includes(kw))) return cat
  }
  return null
}

// ── Human-readable labels for category keys ────────────────────
const CAT_DISPLAY_LABELS = {
  mobile:     'smartphone',
  laptop:     'laptop',
  headphones: 'headphones',
  tablets:    'tablet',
  smartwatch: 'smartwatch',
  camera:     'camera',
  gaming:     'console',
  appliances: 'appliance',
  footwear:   'footwear',
  skincare:   'skincare product',
}

// ── Generate hints based on intent + query + category ────────────
// Returns { message, groups, appendMode }
// appendMode=true → chips append to current query (e.g. for PRODUCT_SPECIFIC)
// appendMode=false → chips replace query (e.g. for CATEGORY/GENERIC)
function buildHints(intent, query, category, showVariants) {
  // Always detect from query text too — backend category can be wrong for
  // brand+model queries (e.g. "Boat BassHeads" classified as mobile not headphones)
  const queryCat = detectCategoryFromQuery(query)
  const cat      = category?.toLowerCase() || queryCat
  const brand    = detectBrandFromQuery(query)

  if (intent === 'LOW_CONFIDENCE' || intent === 'FALLBACK') return null
  if (!cat && !brand) return null

  // ── PRODUCT_SPECIFIC: user typed a product but we want to help narrow down ──
  // Show when: lazy-loading (exact product not in DB) OR variants flag set
  // Chips APPEND to the existing query so context is preserved
  if (intent === 'PRODUCT_SPECIFIC' && showVariants && cat) {
    const varDef = CAT_VARIANTS[cat]
    if (varDef) {
      return {
        message: varDef.label,
        groups:  varDef.groups,
        appendMode: true,  // chips will be `query + " " + chip.append`
      }
    }
    // No variant map for this category — fall through to generic brand series
    const series = brand ? BRAND_SERIES[brand]?.[cat] : null
    if (series) {
      const brandLabel = brand.charAt(0).toUpperCase() + brand.slice(1)
      return {
        message: `Looking for a specific ${brandLabel} model?`,
        groups: [{ label: 'Series', chips: series }],
        appendMode: false,
      }
    }
    return null
  }

  if (intent === 'PRODUCT_SPECIFIC') return null  // exact search — no hints needed

  // ── BRAND_CATEGORY: has brand + category → suggest series & budget ──
  if ((intent === 'BRAND_CATEGORY' || brand) && cat) {
    // Prefer query-inferred category for chip lookups (more accurate than backend cat)
    const chipCat = queryCat || cat
    const series  = BRAND_SERIES[brand]?.[chipCat]
    const budgets = CAT_BUDGETS[chipCat] || []
    if (series || budgets.length > 0) {
      const groups = []
      if (series)          groups.push({ label: 'Series / Model', chips: series })
      if (budgets.length)  groups.push({ label: 'Budget', chips: budgets })
      const brandLabel  = brand.charAt(0).toUpperCase() + brand.slice(1)
      const catLabel    = CAT_DISPLAY_LABELS[chipCat] || chipCat
      return {
        message: `Which ${brandLabel} ${catLabel} are you looking for?`,
        groups,
        appendMode: false,
      }
    }
  }

  // ── CATEGORY / GENERIC → suggest brands + use-cases + budget ──
  if (cat) {
    const brands   = CAT_BRANDS[cat] || []
    const useCases = CAT_USE_CASES[cat] || []
    const budgets  = CAT_BUDGETS[cat] || []
    const groups   = []
    if (brands.length)    groups.push({ label: 'Brand',    chips: brands.map(b => ({ label: b, q: `${b} ${cat}` })) })
    if (useCases.length)  groups.push({ label: 'Use Case', chips: useCases })
    if (budgets.length)   groups.push({ label: 'Budget',   chips: budgets })
    if (groups.length === 0) return null
    // Add cat field to brand chips so onSearch gets the correct category param
    const brandGroup = groups.find(g => g.label === 'Brand')
    if (brandGroup) {
      brandGroup.chips = brandGroup.chips.map(chip => ({ ...chip, cat: cat || '' }))
    }
    return {
      message: 'Narrow down for better results:',
      groups,
      appendMode: false,
    }
  }

  return null
}

// ── Main component ────────────────────────────────────────────────
// showVariants: pass true for PRODUCT_SPECIFIC when suggestions exist (inexact match)
export default function RefineSearchBanner({ intent, query, category, onSearch, showVariants = false }) {
  const [dismissed, setDismissed] = useState(false)
  const [prevQuery, setPrevQuery] = useState(query)

  // Reset dismiss when query changes
  if (query !== prevQuery) { setDismissed(false); setPrevQuery(query) }

  const hints = buildHints(intent, query, category, showVariants)
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
            appendMode={hints.appendMode}
            baseQuery={query}
            onSearch={onSearch}
          />
        ))}
      </div>
    </div>
  )
}

function ChipGroup({ group, appendMode, baseQuery, onSearch }) {
  const MAX_VISIBLE = 6
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? group.chips : group.chips.slice(0, MAX_VISIBLE)
  const hasMore = group.chips.length > MAX_VISIBLE

  function handleChip(chip) {
    if (appendMode && chip.append) {
      // Append to current query: "icall wireless" + "over ear headphones"
      onSearch?.(`${baseQuery} ${chip.append}`)
    } else {
      // Pass chip.cat as the category arg (second param) so backend can filter correctly.
      // e.g. budget chip for headphones: onSearch('headphones under 5000', 'headphones')
      onSearch?.(chip.q || chip.label, chip.cat || '')
    }
  }

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
            onClick={() => handleChip(chip)}
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
