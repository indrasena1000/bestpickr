// src/utils/sounds.js
// BUG #5 FIX: Sound effects for future enhancements
// Uses Web Audio API — no external files needed, all synthesized
// Usage: import { playSound } from '../utils/sounds'
//        playSound('click') | playSound('success') | playSound('search') | playSound('save')

const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)

let ctx = null
function getCtx() {
  if (!ctx && AudioCtx) ctx = new AudioCtx()
  return ctx
}

// Enabled by default — user can disable via localStorage
export function isSoundEnabled() {
  try { return localStorage.getItem('bp_sound') !== 'off' } catch { return true }
}
export function toggleSound() {
  try {
    const next = isSoundEnabled() ? 'off' : 'on'
    localStorage.setItem('bp_sound', next)
    return next === 'on'
  } catch { return false }
}

function playTone(frequency, type = 'sine', duration = 0.1, gain = 0.3, delay = 0) {
  if (!isSoundEnabled()) return
  const c = getCtx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const vol = c.createGain()
    osc.connect(vol)
    vol.connect(c.destination)
    osc.type = type
    osc.frequency.setValueAtTime(frequency, c.currentTime + delay)
    vol.gain.setValueAtTime(0, c.currentTime + delay)
    vol.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.01)
    vol.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration)
    osc.start(c.currentTime + delay)
    osc.stop(c.currentTime + delay + duration + 0.05)
  } catch (_) {}
}

export const playSound = {
  // Light click — button press
  click() {
    playTone(800, 'sine', 0.06, 0.2)
  },

  // Success ding — found results, saved
  success() {
    playTone(523, 'sine', 0.08, 0.25, 0)
    playTone(659, 'sine', 0.08, 0.25, 0.08)
    playTone(784, 'sine', 0.12, 0.25, 0.16)
  },

  // Search whoosh — initiating search
  search() {
    playTone(300, 'sine', 0.15, 0.15, 0)
    playTone(600, 'sine', 0.1, 0.1, 0.1)
  },

  // Save — bookmark
  save() {
    playTone(440, 'triangle', 0.08, 0.2, 0)
    playTone(550, 'triangle', 0.08, 0.2, 0.06)
  },

  // Error — subtle low buzz
  error() {
    playTone(200, 'sawtooth', 0.15, 0.15)
  },

  // Navigate — page change
  navigate() {
    playTone(440, 'sine', 0.05, 0.12, 0)
    playTone(360, 'sine', 0.05, 0.08, 0.05)
  },

  // Buy — cash register feel
  buy() {
    playTone(523, 'triangle', 0.06, 0.2, 0)
    playTone(784, 'triangle', 0.06, 0.2, 0.05)
    playTone(1047, 'triangle', 0.1, 0.2, 0.1)
  },
}

export default playSound
