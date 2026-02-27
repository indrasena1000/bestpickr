// src/utils/categoryHierarchy.js
// ─────────────────────────────────────────────────────────────────
// Maps each canonical category to:
//   parent   — broader category to fall back to when exact has < 9 results
//   siblings — related categories at the same level (used for trending fill)
//
// Used by relatedProductService Priority 3 and Priority 4.
// ─────────────────────────────────────────────────────────────────
'use strict'

const HIERARCHY = {
  // Electronics sub-categories
  mobile:      { parent: 'electronics', siblings: ['tablets', 'smartwatch', 'laptop'] },
  laptop:      { parent: 'electronics', siblings: ['tablets', 'mobile', 'gaming'] },
  tablets:     { parent: 'electronics', siblings: ['mobile', 'laptop', 'smartwatch'] },
  smartwatch:  { parent: 'electronics', siblings: ['mobile', 'headphones', 'camera'] },
  headphones:  { parent: 'electronics', siblings: ['mobile', 'gaming', 'smartwatch'] },
  camera:      { parent: 'electronics', siblings: ['mobile', 'laptop', 'gaming'] },
  gaming:      { parent: 'electronics', siblings: ['laptop', 'headphones', 'mobile'] },

  // Lifestyle sub-categories
  footwear:    { parent: 'lifestyle',   siblings: ['fashion', 'skincare'] },
  fashion:     { parent: 'lifestyle',   siblings: ['footwear', 'skincare'] },
  skincare:    { parent: 'lifestyle',   siblings: ['fashion', 'footwear'] },

  // Home
  appliances:  { parent: 'home',        siblings: ['gaming', 'camera'] },

  // Knowledge
  books:       { parent: 'education',   siblings: ['fashion', 'skincare'] },
}

// Parent-level groupings → all child categories
const PARENT_TO_CHILDREN = {
  electronics: ['mobile', 'laptop', 'tablets', 'smartwatch', 'headphones', 'camera', 'gaming'],
  lifestyle:   ['footwear', 'fashion', 'skincare'],
  home:        ['appliances'],
  education:   ['books'],
}

/**
 * getParentCategory(category) → string | null
 * Returns the broader category slug, e.g. 'mobile' → 'electronics'
 */
function getParentCategory(category) {
  return HIERARCHY[category]?.parent || null
}

/**
 * getSiblingCategories(category) → string[]
 * Returns related categories at the same level (for suggestion fill-in)
 */
function getSiblingCategories(category) {
  return HIERARCHY[category]?.siblings || []
}

/**
 * getChildrenOfParent(parentCategory) → string[]
 * Returns all canonical child categories under a parent
 */
function getChildrenOfParent(parentCategory) {
  return PARENT_TO_CHILDREN[parentCategory] || []
}

module.exports = { HIERARCHY, getParentCategory, getSiblingCategories, getChildrenOfParent }
