#!/usr/bin/env node
// scripts/preloadCategories.js — Manually trigger category preload for all categories
// ─────────────────────────────────────────────────────────────────
// USAGE:
//   node scripts/preloadCategories.js
//   node scripts/preloadCategories.js headphones        # single category only
//   node scripts/preloadCategories.js headphones laptops smartphones  # multiple
//
// WHAT IT DOES:
//   Runs the same preload logic as the 12 AM cron:
//   - Searches Amazon for each category
//   - Stores top 10 results in Redis (category cache)
//   - Next time a user clicks a category, results load instantly from cache
//
// REQUIREMENTS:
//   .env must have: REDIS_URL, DATABASE_URL (Postgres), SCRAPER_API_KEY
// ─────────────────────────────────────────────────────────────────
'use strict'

require('dotenv').config()

const { PrismaClient } = require('@prisma/client')
const { connectRedis } = require('../src/utils/redis')
const {
  preloadAllCategories,
  setSearchAgent,
  CATEGORIES,
} = require('../src/cron/categoryPreloader')
const { setPrisma: setAgentPrisma, runSearchAgent } = require('../src/agents/rankingAgent')
const logger = require('../src/utils/logger')

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  bestpickr — Category Preloader (Manual Trigger)')
  console.log('═══════════════════════════════════════════════════════')

  // Which categories to run (from CLI args, or all)
  const argSlugs = process.argv.slice(2).map(s => s.toLowerCase().trim())
  const targetSlugs = argSlugs.length > 0 ? argSlugs : null

  if (targetSlugs) {
    const valid = CATEGORIES.map(c => c.slug)
    const unknown = targetSlugs.filter(s => !valid.includes(s))
    if (unknown.length > 0) {
      console.error(`❌ Unknown categories: ${unknown.join(', ')}`)
      console.log(`   Valid options: ${valid.join(', ')}`)
      process.exit(1)
    }
    console.log(`  Categories:  ${targetSlugs.join(', ')}`)
  } else {
    console.log(`  Categories:  ALL (${CATEGORIES.length} total)`)
  }

  console.log(`  ScraperAPI:  ${process.env.SCRAPER_API_KEY ? '✅ set' : '❌ MISSING'}`)
  console.log(`  Redis:       ${process.env.REDIS_URL ? '✅ set' : '❌ MISSING'}`)
  console.log(`  Postgres:    ${process.env.DATABASE_URL ? '✅ set' : '❌ MISSING'}`)
  console.log('═══════════════════════════════════════════════════════\n')

  if (!process.env.SCRAPER_API_KEY) {
    console.error('❌ SCRAPER_API_KEY is required. Add it to your .env file.')
    process.exit(1)
  }

  // 1. Connect Postgres
  const prisma = new PrismaClient()
  try {
    await prisma.$connect()
    console.log('✅ Postgres connected')
  } catch (err) {
    console.error('❌ Postgres connection failed:', err.message)
    process.exit(1)
  }

  // 2. Connect Redis
  try {
    await connectRedis()
    console.log('✅ Redis connected')
  } catch (err) {
    console.error('❌ Redis connection failed:', err.message)
    process.exit(1)
  }

  // 3. Wire up ranking agent
  setAgentPrisma(prisma)
  setSearchAgent(runSearchAgent)
  console.log('✅ Ranking agent wired\n')

  // 4. Run preload
  let result
  if (targetSlugs) {
    // Partial preload: override CATEGORIES temporarily with only selected ones
    const { setCategoryCache } = require('../src/utils/redis')
    let success = 0, failed = 0
    for (const slug of targetSlugs) {
      const cat = CATEGORIES.find(c => c.slug === slug)
      console.log(`\n→ Preloading "${slug}" (query: "${cat.searchQuery}")...`)
      try {
        const res = await runSearchAgent(cat.searchQuery, slug)
        if (res.results && res.results.length > 0) {
          await setCategoryCache(slug, res.results)
          console.log(`  ✅ ${res.results.length} products cached for "${slug}"`)
          success++
        } else {
          console.log(`  ⚠️  0 products returned for "${slug}"`)
          failed++
        }
      } catch (err) {
        console.error(`  ❌ Error preloading "${slug}": ${err.message}`)
        failed++
      }
      // Brief pause between categories
      await new Promise(r => setTimeout(r, 2000))
    }
    result = { success, failed }
  } else {
    result = await preloadAllCategories()
  }

  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`  Done! ${result.success} cached, ${result.failed} failed`)
  console.log('═══════════════════════════════════════════════════════\n')

  await prisma.$disconnect()
  process.exit(result.failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
