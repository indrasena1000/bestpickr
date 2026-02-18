// src/App.jsx
import { useState, useCallback } from 'react'
import Navbar    from './components/Navbar.jsx'
import Footer    from './components/Footer.jsx'
import HomePage   from './pages/HomePage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import DetailPage  from './pages/DetailPage.jsx'

// ── SIMPLE CLIENT-SIDE ROUTER ──────────────────────────────────────
// We use a simple state-based router instead of React Router
// to keep dependencies minimal. When the app grows, swap this
// for React Router v6 (already in package.json, ready to use).
//
// State shape:
//   page: 'home' | 'results' | 'detail'
//   query: string
//   category: string
//   selectedProduct: object | null
export default function App() {
  const [page,            setPage]            = useState('home')
  const [query,           setQuery]           = useState('')
  const [category,        setCategory]        = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchResults,   setSearchResults]   = useState([])

  const navigate = useCallback((to, params = {}) => {
    setPage(to)
    if (params.query)    setQuery(params.query)
    if (params.category !== undefined) setCategory(params.category)
    if (params.product)  setSelectedProduct(params.product)
    if (params.results)  setSearchResults(params.results)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <>
      <Navbar
        currentPage={page}
        currentQuery={query}
        onSearch={(q) => navigate('results', { query: q })}
        onHome={() => navigate('home')}
      />

      {page === 'home' && (
        <HomePage
          onSearch={(q, cat) => navigate('results', { query: q, category: cat })}
          onViewProduct={(product, results) => navigate('detail', { product, results })}
        />
      )}

      {page === 'results' && (
        <ResultsPage
          query={query}
          category={category}
          onViewProduct={(product, results) => navigate('detail', { product, results })}
          onSearch={(q, cat) => navigate('results', { query: q, category: cat })}
        />
      )}

      {page === 'detail' && (
        <DetailPage
          product={selectedProduct}
          allResults={searchResults}
          onBack={() => navigate('results')}
          onHome={() => navigate('home')}
        />
      )}

      <Footer onSearch={(q) => navigate('results', { query: q })} />
    </>
  )
}
