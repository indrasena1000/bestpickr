// components/detail/DetailBreadcrumb.jsx
export default function DetailBreadcrumb({ name, onHome, onBack }) {
  return (
    <div className="bc">
      <a onClick={onHome} style={{ cursor: 'pointer' }}>Home</a>
      <span className="bc-sep">›</span>
      <a onClick={onBack} style={{ cursor: 'pointer' }}>Search Results</a>
      <span className="bc-sep">›</span>
      <span>{name?.slice(0, 40)}{name?.length > 40 ? '…' : ''}</span>
    </div>
  )
}
