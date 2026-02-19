import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// BUG #13 FIX: Reveal body only after React has mounted
// This prevents the flash of real website during maintenance mode check
requestAnimationFrame(() => {
  document.body.classList.add('bp-ready')
})
