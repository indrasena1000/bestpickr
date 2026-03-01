// src/services/jobStatusService.js
// In-memory + Redis job state machine for async live-fetch jobs.
// States: pending → partial → ready | failed
// jobId is scoped to session (prefixed) — not globally enumerable.
'use strict'

const logger = require('../utils/logger')
const crypto = require('crypto')

// In-memory store (fast reads; Redis used for cross-process persistence)
const JOB_STORE = new Map()

// Job TTL in Redis: 5 minutes (jobs are short-lived)
const JOB_TTL = 300

/**
 * createJob(redis, normalizedQuery) → jobId
 */
async function createJob(redis, normalizedQuery) {
  // Scoped, non-enumerable jobId — prefix + random bytes
  const jobId = `bp_${crypto.randomBytes(8).toString('hex')}`

  const job = {
    jobId,
    normalizedQuery,
    status:         'pending',
    primaryProduct: null,
    suggestions:    [],
    source:         'pending',
    executionTimeMs: 0,
    createdAt:      Date.now(),
  }

  // Store in memory for fast reads
  JOB_STORE.set(jobId, job)

  // Store in Redis for cross-process access (SSR, multi-instance)
  if (redis) {
    try {
      await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', JOB_TTL)
    } catch (err) {
      logger.warn(`JobSvc: Redis write failed for ${jobId}: ${err.message}`)
    }
  }

  logger.info(`JobSvc: created job ${jobId} for "${normalizedQuery}"`)
  return jobId
}

/**
 * updateJob(redis, jobId, patch) — merge patch into existing job
 */
async function updateJob(redis, jobId, patch) {
  const existing = JOB_STORE.get(jobId) || {}
  const updated  = { ...existing, ...patch, jobId }

  JOB_STORE.set(jobId, updated)

  if (redis) {
    try {
      await redis.set(`job:${jobId}`, JSON.stringify(updated), 'EX', JOB_TTL)
    } catch (err) {
      logger.warn(`JobSvc: Redis update failed for ${jobId}: ${err.message}`)
    }
  }

  logger.info(`JobSvc: ${jobId} → status="${updated.status}"`)
}

/**
 * getJob(redis, jobId) → job object | null
 */
async function getJob(redis, jobId) {
  // Memory-first
  if (JOB_STORE.has(jobId)) return JOB_STORE.get(jobId)

  // Redis fallback (other process / restart)
  if (redis) {
    try {
      const raw = await redis.get(`job:${jobId}`)
      if (raw) {
        const job = JSON.parse(raw)
        JOB_STORE.set(jobId, job)   // warm local cache
        return job
      }
    } catch (err) {
      logger.warn(`JobSvc: Redis read failed for ${jobId}: ${err.message}`)
    }
  }

  return null
}

/**
 * cleanupJob(redis, jobId) — remove from memory after terminal state
 */
async function cleanupJob(redis, jobId) {
  JOB_STORE.delete(jobId)
  if (redis) {
    try { await redis.del(`job:${jobId}`) } catch (_) {}
  }
}

module.exports = { createJob, updateJob, getJob, cleanupJob }
