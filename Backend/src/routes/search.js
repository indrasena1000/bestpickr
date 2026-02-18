// src/routes/search.js
const express    = require('express');
const { body }   = require('express-validator');
const controller = require('../controllers/searchController');
const router     = express.Router();

// Validation middleware for search
const validateSearch = [
  body('query')
    .trim()
    .notEmpty().withMessage('Search query is required')
    .isLength({ min: 2, max: 200 }).withMessage('Query must be 2–200 characters'),
  body('category').optional().isString(),
];

// POST /api/search — main search endpoint
router.post('/', validateSearch, controller.search);

// GET /api/search/suggestions?q=sony — autocomplete
router.get('/suggestions', controller.suggestions);

module.exports = router;
