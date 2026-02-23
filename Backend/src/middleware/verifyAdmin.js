// src/middleware/verifyAdmin.js
// JWT access-token verification middleware for all admin routes
// Usage: router.post('/some-route', verifyAdmin, handler)

const jwt = require('jsonwebtoken')

module.exports = function verifyAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      console.error('[verifyAdmin] JWT_SECRET not set in environment')
      return res.status(500).json({ error: 'Server misconfiguration' })
    }

    const payload = jwt.verify(token, secret)

    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    req.admin = payload
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}
