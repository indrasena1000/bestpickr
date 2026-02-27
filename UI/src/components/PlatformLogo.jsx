// UI/src/components/PlatformLogo.jsx
// ─────────────────────────────────────────────────────────────────
// Reusable platform branding — logo images for Amazon & Flipkart,
// emoji fallback for Myntra. Use these everywhere instead of
// duplicating PLT_ICONS = { Amazon:'🛒', Flipkart:'🔵', Myntra:'🛍️' }.
//
// Exports:
//   <PlatformLogo name="Amazon" size={16} />   — image or emoji
//   <PlatformPill name="Amazon" />              — full .plt-pill span
//   PLT_ICONS                                   — legacy emoji map
// ─────────────────────────────────────────────────────────────────
import amazonImg   from '../images/amazon.png'
import flipkartImg from '../images/flipkart1.png'
import myntraImg   from '../images/myntra.png'

// ── logo image map ───────────────────────────────────────────────
const PLATFORM_IMAGES = {
  Amazon:   amazonImg,
  Flipkart: flipkartImg,
  Myntra:   myntraImg,
}

// ── fallback emoji map (kept for places that just need a string) ─
export const PLT_ICONS = {
  Amazon:   '🛒',
  Flipkart: '🔵',
  Myntra:   '🛍️',
}

// ── PlatformLogo ─────────────────────────────────────────────────
// Renders the platform's logo <img> when available, otherwise the
// emoji. Pass `size` in px (default 16).
export function PlatformLogo({ name, size = 16 }) {
  const src = PLATFORM_IMAGES[name]
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width:          size,
          height:         size,
          objectFit:      'contain',
          verticalAlign:  'middle',
          display:        'inline-block',
          flexShrink:     0,
          borderRadius:   2,
        }}
      />
    )
  }
  // Emoji fallback (Myntra, or any future unknown platform)
  return <span style={{ fontSize: size * 0.875, lineHeight: 1 }}>{PLT_ICONS[name] || '🛍️'}</span>
}

// ── PlatformPill ─────────────────────────────────────────────────
// Drop-in replacement for the old:
//   <span className="plt-pill">{PLT_ICONS[name]} {name}</span>
// Now uses the real logo image.
export function PlatformPill({ name }) {
  return (
    <span
      className="plt-pill"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      <PlatformLogo name={name} size={14} />
      {name}
    </span>
  )
}
