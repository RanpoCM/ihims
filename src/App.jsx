import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import Icon from './components/Icon'
import { supabase } from './supabaseClient'
import GapAnalysisModule from './competency/GapAnalysisModule'
import { COMPETENCIES, estimateEmployeeCompetencies, scoreLabel } from './competency/framework'
import { analyzeEmployee } from './competency/gapEngine'
import { generateAIReply, buildGreeting } from './aiAssistant'
import {
  roleLabel,
  rolesLabel,
  primaryRoleOf,
  canEditModule,
  visibleModulesFor,
  requireEdit,
  requireView,
  appendAudit,
  getAuditLog,
} from './rbac'

// ---------------------------------------------------------------------------
// localStorage helpers (self-contained storage, no backend required)
// ---------------------------------------------------------------------------
const SESSION_KEY = 'ihims_session'

const getStoredSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const setStoredSession = (s) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    // ignore storage errors
  }
}

const clearStoredSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Trusted-Device Management
//
// A "trusted device" token is stored in localStorage keyed by the user's
// email. It records:
//   - deviceId  : a stable random ID generated once per browser profile
//   - email     : the account email this trust was granted to
//   - grantedAt : Unix timestamp (ms) when OTP was last verified
//   - expiresAt : grantedAt + 7 days
//   - hash      : a simple tamper-evident fingerprint
//
// SECURITY NOTE FOR PRODUCTION:
// In a production system (e.g. after Supabase migration), trust tokens must
// be validated server-side. The server issues a signed JWT with expiry and
// the client presents it on each login. The server independently checks
// expiry and revocation, so a tampered or replayed token is rejected.
// The current implementation is client-side only and is appropriate for a
// capstone/demo environment targeting localStorage-based deployment.
// ---------------------------------------------------------------------------

const TRUST_KEY_PREFIX = 'ihims_trust_'
const DEVICE_ID_KEY = 'ihims_device_id'
const TRUST_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Get or create a stable device ID for this browser profile.
const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'dev_unknown'
  }
}

// Simple tamper-evident hash: concatenate key fields with a fixed salt.
// Not cryptographically secure but detects naive localStorage edits.
const trustHash = (email, deviceId, grantedAt) => {
  const raw = `ihims|${email}|${deviceId}|${grantedAt}|7d`
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

const trustKey = (email) => `${TRUST_KEY_PREFIX}${(email || '').toLowerCase()}`

// Grant trust for the current device after successful OTP verification.
const grantDeviceTrust = (email) => {
  try {
    const deviceId = getDeviceId()
    const grantedAt = Date.now()
    const expiresAt = grantedAt + TRUST_DURATION_MS
    const token = { deviceId, email, grantedAt, expiresAt, hash: trustHash(email, deviceId, grantedAt) }
    localStorage.setItem(trustKey(email), JSON.stringify(token))
    return token
  } catch {
    return null
  }
}

// Check if the current device is trusted for this email.
// Returns { trusted: true, daysLeft } or { trusted: false, reason }.
const checkDeviceTrust = (email) => {
  try {
    const raw = localStorage.getItem(trustKey(email))
    if (!raw) return { trusted: false, reason: 'no_token' }
    const token = JSON.parse(raw)

    // Verify device matches
    const deviceId = getDeviceId()
    if (token.deviceId !== deviceId) return { trusted: false, reason: 'device_mismatch' }

    // Verify email matches
    if ((token.email || '').toLowerCase() !== (email || '').toLowerCase()) return { trusted: false, reason: 'email_mismatch' }

    // Verify expiry
    if (Date.now() > token.expiresAt) return { trusted: false, reason: 'expired' }

    // Verify hash (tamper detection)
    const expectedHash = trustHash(token.email, token.deviceId, token.grantedAt)
    if (token.hash !== expectedHash) return { trusted: false, reason: 'tampered' }

    const daysLeft = Math.ceil((token.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    return { trusted: true, daysLeft }
  } catch {
    return { trusted: false, reason: 'error' }
  }
}

// Revoke trust for the current device (used on password change or
// "Log out of all devices"). Does NOT clear the session itself.
const revokeDeviceTrust = (email) => {
  try {
    localStorage.removeItem(trustKey(email))
  } catch {
    // ignore
  }
}

// "Log out of all devices": revoke trust on current device AND set a
// revocation timestamp in localStorage that other tabs/devices on the
// SAME browser profile can detect. True cross-device revocation requires
// server-side session management (Supabase) — documented below.
const REVOCATION_KEY = 'ihims_revocation'
const revokeAllDevices = (email) => {
  try {
    revokeDeviceTrust(email)
    // Store a revocation record so other same-browser tabs know.
    // NOTE: This cannot reach other physical devices — that requires a
    // server-side revocation list checked on each request. Implement via
    // Supabase `sessions` table in production.
    const rec = { email, revokedAt: Date.now() }
    localStorage.setItem(REVOCATION_KEY, JSON.stringify(rec))
  } catch {
    // ignore
  }
}

const checkRevocation = (email) => {
  try {
    const raw = localStorage.getItem(REVOCATION_KEY)
    if (!raw) return false
    const rec = JSON.parse(raw)
    if ((rec.email || '').toLowerCase() !== (email || '').toLowerCase()) return false
    // Revocation record is only relevant for 7 days
    return Date.now() - rec.revokedAt < TRUST_DURATION_MS
  } catch {
    return false
  }
}

const getStoredData = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Per-user profile photo persistence.
// The photo is stored under its own localStorage key (keyed by the user's
// email), NOT inside the session — so it survives logout/login. The session
// is cleared on logout, so anything stored only there would be lost.
// ---------------------------------------------------------------------------
const PHOTO_KEY_PREFIX = 'ihims_photo_'

const photoKey = (id) => {
  const k = (id || '').trim().toLowerCase()
  return k ? `${PHOTO_KEY_PREFIX}${k}` : null
}

const getStoredUserPhoto = (id) => {
  const key = photoKey(id)
  if (!key) return null
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

const setStoredUserPhoto = (id, photo) => {
  const key = photoKey(id)
  if (!key) return
  try {
    if (photo) localStorage.setItem(key, photo)
    else localStorage.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Per-user self-service profile (bio + skills), keyed by email like the
// photo above, so staff can edit their own bio/skills without touching the
// HR-managed employee record (performance/competency/training stay HR-only).
// ---------------------------------------------------------------------------
const PROFILE_KEY_PREFIX = 'ihims_profile_'

const profileKey = (id) => {
  const k = (id || '').trim().toLowerCase()
  return k ? `${PROFILE_KEY_PREFIX}${k}` : null
}

const getStoredUserProfile = (id) => {
  const key = profileKey(id)
  if (!key) return { bio: '', skills: [] }
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : { bio: '', skills: [] }
  } catch {
    return { bio: '', skills: [] }
  }
}

const setStoredUserProfile = (id, profile) => {
  const key = profileKey(id)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(profile))
  } catch {
    // ignore storage errors
  }
}

// Reconcile the stored account registry against the seed accounts so that the
// demo login identities (admin@ihims.local, hr@ihims.local, staff@ihims.local)
// always resolve to the correct roles, even if a user's browser still holds an
// older localStorage copy that predates the email field. Matching is done by
// username; any stored account whose username matches a seed keeps its own
// data but gains the seed's canonical email/role if missing.
const getAccountsWithSeeds = () => {
  const stored = getStoredData('ihims_accounts', initialAccounts)
  const byUsername = {}
  stored.forEach((a) => { if (a && a.username) byUsername[a.username.toLowerCase()] = a })
  // Start from seed to guarantee email + role always exist.
  const merged = initialAccounts.map((seed) => {
    const existing = byUsername[seed.username.toLowerCase()]
    return existing ? { ...seed, ...existing } : { ...seed }
  })
  // Append any stored accounts that aren't seed accounts.
  stored.forEach((a) => {
    if (a && a.username && !initialAccounts.some((s) => s.username === a.username)) {
      merged.push(a)
    }
  })
  return merged
}

// Employee reporting hierarchy: returns the ids of everyone who reports to
// `rootId`, directly or indirectly (BFS over managerEmployeeId), NOT
// including rootId itself.
const getTeamIds = (employees, rootId) => {
  const ids = new Set()
  const queue = [rootId]
  while (queue.length) {
    const current = queue.shift()
    employees.forEach((e) => {
      if (e.managerEmployeeId === current && !ids.has(e.id)) {
        ids.add(e.id)
        queue.push(e.id)
      }
    })
  }
  return ids
}



// ---------------------------------------------------------------------------
// First-run bootstrap: create an admin account directly so the owner can log
// in with a real Gmail immediately without first using the seeded demo admin.
// Writes straight to the account registry (localStorage) and broadcasts it so
// open tabs stay in sync.
// ---------------------------------------------------------------------------
const ACCOUNTS_KEY = 'ihims_accounts'

const createBootstrapAccount = (acc) => {
  const accounts = getStoredData(ACCOUNTS_KEY, initialAccounts)
  const email = (acc.email || '').trim().toLowerCase()
  const username = (acc.username || '').trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.')
  }
  if (!acc.password || acc.password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }
  if (username && accounts.some((a) => a.username === username)) {
    throw new Error(`An account with username "${username}" already exists.`)
  }
  if (accounts.some((a) => (a.email || '').toLowerCase() === email)) {
    throw new Error(`An account with email "${email}" already exists.`)
  }

  const id = accounts.length ? Math.max(...accounts.map((a) => Number(a.id) || 0)) + 1 : 1
  const newRow = {
    id,
    email,
    username,
    password: acc.password,
    name: acc.name,
    role: acc.role || 'admin',
    roles: acc.roles && acc.roles.length ? acc.roles : [acc.role || 'admin'],
    status: 'active',
    employeeId: null,
  }
  const next = [...accounts, newRow]
  emitDataChange(ACCOUNTS_KEY, next)
  return newRow
}

// ---------------------------------------------------------------------------
// Seed data so the system is functional on first run
// ---------------------------------------------------------------------------
const initialEmployees = [
  { id: 1, name: 'Dr. Sarah Johnson', role: 'Chief Medical Officer', department: 'Cardiology', performance: 95, competency: 92, training: 98, managerEmployeeId: null, qualifications: 'MD, Board Certified Cardiologist, PRC Lic. No. 0012345', employmentStatus: 'Regular', dateHired: '2018-03-01', competencyNotes: '' },
  { id: 2, name: 'Dr. Michael Chen', role: 'Cardiologist', department: 'Cardiology', performance: 91, competency: 88, training: 90, managerEmployeeId: 1, qualifications: 'MD, Fellow Philippine College of Cardiology', employmentStatus: 'Regular', dateHired: '2019-06-15', competencyNotes: '' },
  { id: 3, name: 'James Wilson', role: 'Senior Nurse', department: 'Nursing', performance: 88, competency: 85, training: 92, managerEmployeeId: 1, qualifications: 'BSN, RN, PRC Lic. No. 0045678', employmentStatus: 'Regular', dateHired: '2020-01-10', competencyNotes: '' },
  { id: 4, name: 'Dr. Lisa Anderson', role: 'Pediatrician', department: 'Pediatrics', performance: 93, competency: 90, training: 95, managerEmployeeId: 1, qualifications: 'MD, Diplomate Philippine Pediatric Society', employmentStatus: 'Regular', dateHired: '2019-09-01', competencyNotes: '' },
  { id: 5, name: 'Emily Brown', role: 'Lab Technician', department: 'Laboratory', performance: 84, competency: 82, training: 86, managerEmployeeId: null, qualifications: 'BS Medical Technology, RMT, PRC Lic. No. 0078901', employmentStatus: 'Regular', dateHired: '2021-02-20', competencyNotes: '' },
  { id: 6, name: 'Maria Garcia', role: 'Registered Nurse', department: 'Nursing', performance: 86, competency: 84, training: 88, managerEmployeeId: 3, qualifications: 'BSN, RN, PRC Lic. No. 0056789', employmentStatus: 'Probationary', dateHired: '2025-01-05', competencyNotes: '' },
  { id: 7, name: 'Robert Taylor', role: 'Administrator', department: 'Administration', performance: 82, competency: 80, training: 84, managerEmployeeId: 8, qualifications: 'BS Business Administration, MBA', employmentStatus: 'Regular', dateHired: '2020-07-01', competencyNotes: '' },
  { id: 8, name: 'David Martinez', role: 'HR Manager', department: 'Administration', performance: 80, competency: 78, training: 82, managerEmployeeId: null, qualifications: 'BS Psychology, SHRM-CP', employmentStatus: 'Regular', dateHired: '2018-11-15', competencyNotes: '' },
]

const initialTrainingPrograms = [
  { id: 1, title: 'Emergency Response Training', type: 'Workshop', duration: '8 hours', participants: 20, status: 'ongoing', instructor: 'Dr. Alan Reed', cost: 0, seats: 20, date: '2026-07-05', time: '9:00 AM - 4:00 PM', location: 'Training Room A', competencyIds: [1, 4] },
  { id: 2, title: 'Advanced Cardiac Life Support', type: 'Certification', duration: '2 days', participants: 15, status: 'upcoming', instructor: 'Dr. Maya Patel', cost: 250, seats: 15, date: '2026-07-08', time: '8:00 AM - 5:00 PM', location: 'Conference Hall', competencyIds: [1] },
  { id: 3, title: 'Patient Safety Protocols', type: 'Course', duration: '3 hours', participants: 30, status: 'completed', instructor: 'Nurse Kim Lee', cost: 0, seats: 30, date: '2026-06-20', time: '2:00 PM - 5:00 PM', location: 'Training Room B', competencyIds: [4] },
  { id: 4, title: 'Leadership Development', type: 'Seminar', duration: '1 day', participants: 12, status: 'upcoming', instructor: 'Dr. Sarah Johnson', cost: 150, seats: 12, date: '2026-07-12', time: '9:00 AM - 5:00 PM', location: 'Boardroom', competencyIds: [3] },
]

const initialCompetencies = [
  { id: 1, name: 'Clinical Expertise', description: 'Depth of medical and clinical knowledge', category: 'Technical Skills', weight: 30 },
  { id: 2, name: 'Communication', description: 'Effective patient and team communication', category: 'Soft Skills', weight: 20 },
  { id: 3, name: 'Leadership', description: 'Ability to lead teams and drive outcomes', category: 'Leadership', weight: 25 },
  { id: 4, name: 'Compliance', description: 'Adherence to regulatory and safety standards', category: 'Regulatory Compliance', weight: 25 },
]

const initialRecognitionAwards = [
  { id: 1, recipient: 'Dr. Sarah Johnson', type: 'Employee of Month', department: 'Cardiology', date: '2026-06-15', reason: 'Outstanding leadership during the ER reconfiguration.' },
  { id: 2, recipient: 'James Wilson', type: 'Excellence in Care', department: 'Nursing', date: '2026-06-10', reason: 'Exceptional compassion and patient care.' },
  { id: 3, recipient: 'Emily Brown', type: 'Innovation Award', department: 'Laboratory', date: '2026-06-02', reason: 'Streamlined lab result workflows.' },
]

const initialSuccessionCandidates = [
  { id: 1, currentRole: 'Chief Medical Officer', readiness: 'High', timeline: '2 years', candidates: ['Dr. Michael Chen', 'Dr. Lisa Anderson'] },
  { id: 2, currentRole: 'Head of Nursing', readiness: 'Medium', timeline: '3 years', candidates: ['James Wilson', 'Maria Garcia'] },
  { id: 3, currentRole: 'Laboratory Director', readiness: 'Medium', timeline: '4 years', candidates: ['Emily Brown'] },
]

const initialAccounts = [
  // Owner admin accounts — these Gmail addresses always have admin access.
  // `roles` is the real, multi-role source of truth; `role` is kept in sync
  // as a derived "primary" role for cosmetic display (badges, audit log).
  { id: 4, username: 'carlos18miguel', password: '', role: 'admin', roles: ['admin', 'hr', 'staff'], status: 'active', name: 'Carlos Miguel', email: 'carlos18miguel@gmail.com', employeeId: null },
  { id: 5, username: 'ihimsadmin', password: '', role: 'admin', roles: ['admin'], status: 'active', name: 'IHIMS Admin', email: 'ihimsadmin@gmail.com', employeeId: null },
]

// An account may hold multiple roles at once (e.g. Staff + HR Manager +
// Admin). `roles` is the source of truth; `role` (singular) is kept as a
// backwards-compatible fallback for any account created before this existed.
const getAccountRoles = (acc) => {
  if (acc && Array.isArray(acc.roles) && acc.roles.length) return acc.roles
  return acc && acc.role ? [acc.role] : ['staff']
}

const initialAnnouncements = [
  { id: 1, title: 'Welcome to the new IHIMS portal', body: 'We are excited to launch our AI-driven HRMS. Explore performance, learning, and more.', category: 'General', author: 'Administrator', date: '2026-06-01', pinned: true },
  { id: 2, title: 'Mandatory safety drill this Friday', body: 'All staff must attend the emergency response drill at 9:00 AM in Training Room A.', category: 'Safety', author: 'HR Manager', date: '2026-06-20', pinned: false },
  { id: 3, title: 'New certification window opens', body: 'Enrollment for Advanced Cardiac Life Support is now open in the Learning module.', category: 'Training', author: 'HR Manager', date: '2026-06-25', pinned: false },
]

// Attendance record: { id, employeeId, date, status: 'Present'|'Absent'|'Late'|'Leave', notes }
const initialAttendance = []

// ---------------------------------------------------------------------------
// Permissions matrix (admin-editable). This stores the *desired* view/edit
// matrix per module/role in localStorage. It does not yet replace rbac.js's
// hardcoded rules — wiring real enforcement requires editing rbac.js itself.
// ---------------------------------------------------------------------------
const PERMISSION_KEY = 'ihims_permission_overrides'
const ALL_ROLES = ['admin', 'hr', 'staff']
const MODULE_IDS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'performance', label: 'Performance' },
  { id: 'competency', label: 'Competency' },
  { id: 'aiCompetency', label: 'AI Competency' },
  { id: 'learning', label: 'Learning' },
  { id: 'succession', label: 'Succession' },
  { id: 'recognition', label: 'Recognition' },
  { id: 'reviews', label: 'Performance Reviews' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'orgchart', label: 'Org Chart' },
]

// Simple live-sync event so multiple tabs stay in sync in real time
const emitDataChange = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('ihims-data-change', { detail: { key, value } }))
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Reusable UI animation components (count-up numbers, circular gauges)
// ---------------------------------------------------------------------------
// Counts up from 0 to `value` with an ease-out animation when it mounts / changes.
function AnimatedNumber({ value, suffix = '', prefix = '', duration = 900, decimals = 0 }) {
  const [display, setDisplay] = useState(0)
  const target = Number(value) || 0

  useEffect(() => {
    let raf
    const start = performance.now()
    const from = 0
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (target - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setDisplay(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString()

  return (
    <span className="animated-number">
      {prefix}{formatted}{suffix}
    </span>
  )
}

// Animated SVG circular gauge (e.g. 85% ring). Color adapts to value.
function CircularGauge({ value = 0, label = '', size = 120, stroke = 12 }) {
  const [progress, setProgress] = useState(0)
  const target = Math.max(0, Math.min(100, Number(value) || 0))

  useEffect(() => {
    let raf
    const start = performance.now()
    const duration = 1000
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setProgress(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setProgress(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  const color = target >= 85 ? '#22c55e' : target >= 70 ? '#3b82f6' : target >= 55 ? '#f59e0b' : '#ef4444'

  return (
    <div className="circular-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="circular-gauge-svg">
        <circle
          className="circular-gauge-track"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={stroke}
        />
        <circle
          className="circular-gauge-fill"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="circular-gauge-center">
        <span className="circular-gauge-value">
          <AnimatedNumber value={progress} suffix="%" duration={1000} decimals={0} />
        </span>
        {label ? <span className="circular-gauge-label">{label}</span> : null}
      </div>
    </div>
  )
}

// Vertical/bar chart built with CSS for the Dashboard performance distribution.
function DistributionChart({ employees }) {
  const buckets = [
    { label: '90-100', min: 90 },
    { label: '80-89', min: 80 },
    { label: '70-79', min: 70 },
    { label: '<70', min: 0 },
  ]
const total = employees.length || 1
  // Track whether bars have animated once so they stay filled on re-render.
  const [bucketsData, setBucketsData] = useState(() => buckets.map((b) => ({ ...b, count: 0, pct: 0, height: 0 })))

  useEffect(() => {
const next = buckets.map((b) => {
      const count = employees.filter((e) =>
        b.label === '<70' ? e.performance < 70 : e.performance >= b.min && e.performance < b.min + 10
      ).length
      return { ...b, count, pct: Math.round((count / total) * 100) }
    })
    // Trigger the animation by updating heights after mount.
    setBucketsData(next)
    const timer = setTimeout(() => {
      setBucketsData((prev) => prev.map((d) => ({ ...d, height: Math.max(6, (d.count / total) * 100) })))
    }, 50)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees])

  return (
    <div className="distribution-chart">
      {bucketsData.map((d, i) => (
        <div className="dist-col" key={d.label}>
          <div className="dist-bar-wrap">
            <div
              className="dist-bar"
              style={{ height: `${d.height}%`, transitionDelay: `${i * 80}ms` }}
            >
              <span className="dist-bar-value">{d.count}</span>
            </div>
          </div>
          <span className="dist-bar-label">{d.label}</span>
          <span className="dist-bar-pct"><AnimatedNumber value={d.pct} suffix="%" duration={700} /></span>
        </div>
      ))}
    </div>
  )
}


// Gentle ding/chime synthesized with the Web Audio API (no asset needed).
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    const note = (freq, start, dur, gainVal) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + dur + 0.05)
    }

    note(880, now, 0.18, 0.18)        // A5
    note(1320, now + 0.12, 0.25, 0.16) // E6
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch {
    // ignore audio errors
  }
}

// Notification Bell - shows a bell icon with an unread badge and a dropdown panel.
// Supports a subtle sound, unread tracking (persisted per user), and clicking a
// notification marks it as read and navigates to the related module.
function NotificationBell({ announcements, trainingPrograms, employees, onNavigate, userName }) {
  const [open, setOpen] = useState(false)
  const readKey = userName ? `ihims_notif_read_${userName.toLowerCase()}` : 'ihims_notif_read'
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(readKey) || '[]')
    } catch {
      return []
    }
  })
  const [soundPref, setSoundPref] = useState(() => {
    try {
      return localStorage.getItem('ihims_notif_sound') !== 'off'
    } catch {
      return true
    }
  })

  const notifications = [
    ...(announcements || []).map((a) => ({
      id: `ann-${a.id}`,
      icon: 'announcements',
      title: a.title,
      body: a.body,
      time: a.date,
      category: a.category,
      pinned: a.pinned,
      nav: 'announcements',
    })),
    ...(trainingPrograms || [])
      .filter((p) => p.status === 'upcoming')
      .map((p) => ({
        id: `tr-${p.id}`,
        icon: 'learning',
        title: `Upcoming training: ${p.title}`,
        body: `${p.type} • ${p.date || p.duration}${p.location ? ` • ${p.location}` : ''}`,
        time: p.date || null,
        category: 'Training',
        nav: 'learning',
      })),
    ...(employees || [])
      .filter((e) => e.performance < 80)
      .map((e) => ({
        id: `emp-${e.id}`,
        icon: 'warn',
        title: `${e.name} needs attention`,
        body: `Performance is at ${e.performance}% (below 80%).`,
        time: null,
        category: 'Performance',
        nav: 'performance',
      })),
  ].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))

  const unread = notifications.filter((n) => !readIds.includes(n.id))
  const unreadCount = unread.length

  // Play a subtle chime only when the set of unread notifications grows and
  // sound is enabled (and there is at least one unread item).
  const prevUnread = useRef(new Set())
  useEffect(() => {
    const ids = new Set(unread.map((n) => n.id))
    let gained = false
    ids.forEach((id) => {
      if (!prevUnread.current.has(id)) gained = true
    })
    prevUnread.current = ids
    if (gained && unread.length > 0 && soundPref) {
      playNotificationSound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications])

  const persistRead = (next) => {
    setReadIds(next)
    try {
      localStorage.setItem(readKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const markRead = (id) => {
    if (!readIds.includes(id)) {
      persistRead([...readIds, id])
    }
  }

  const markAllRead = () => {
    persistRead(notifications.map((n) => n.id))
  }

  const toggleSound = () => {
    const next = !soundPref
    setSoundPref(next)
    try {
      localStorage.setItem('ihims_notif_sound', next ? 'on' : 'off')
    } catch {
      // ignore
    }
    if (next) playNotificationSound()
  }

  const handleNavigate = (nav, id) => {
    markRead(id)
    if (typeof onNavigate === 'function') onNavigate(nav)
    setOpen(false)
  }

  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onClickOutside)
    return () => document.removeEventListener('click', onClickOutside)
  }, [open])

  return (
    <div className="notif-bell" ref={panelRef}>
      <button
        className="notif-bell-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        aria-label="Notifications"
      >
        <span className="notif-bell-icon"><Icon name={unreadCount > 0 ? 'bell' : 'bellOff'} size={20} /></span>
        {unreadCount > 0 ? (
          <span className="notif-badge">{unreadCount}</span>
        ) : null}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <strong>Notifications</strong>
            <span className="notif-count">{unreadCount} unread</span>
          </div>
          <div className="notif-panel-tools">
            <button className="notif-tool" onClick={toggleSound} title={soundPref ? 'Mute notifications' : 'Unmute notifications'}>
              <Icon name={soundPref ? 'bell' : 'bellOff'} size={14} /> {soundPref ? 'Sound on' : 'Sound off'}
            </button>
            {unreadCount > 0 ? (
              <button className="notif-tool" onClick={markAllRead}>
                <Icon name="checkCircle" size={14} /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">You're all caught up.</div>
            ) : (
              notifications.map((n) => {
                const isRead = readIds.includes(n.id)
                return (
                  <button
                    key={n.id}
                    className={`notif-item ${n.pinned ? 'pinned' : ''} ${isRead ? 'read' : 'unread'}`}
                    onClick={(e) => { e.stopPropagation(); handleNavigate(n.nav, n.id) }}
                  >
                    {!isRead ? <span className="notif-dot"></span> : null}
                    <span className="notif-item-icon"><Icon name={n.icon} size={22} /></span>
                    <div className="notif-item-content">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-body">{n.body}</div>
                      <div className="notif-item-meta">
                        <span className={`notif-cat cat-${n.category ? n.category.toLowerCase() : ''}`}>{n.category}</span>
                        {n.time ? <span className="notif-time">{n.time}</span> : null}
                        <span className="notif-goto"><Icon name="arrowRight" size={12} /></span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Live clock component for the topbar (date + time, updates every second).
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="date-display">
      <span className="date-display-date">{now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <span className="date-display-time">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
    </span>
  )
}

// Small line-art sun / moon icons for the theme toggle (no icon set entry
// exists for these yet, so they're drawn inline to match the same stroke
// style as the rest of the Icon set).
function SunIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  )
}

function MoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />
    </svg>
  )
}

// App Content - localStorage-backed
function AppContent({ role, roles, userName, userEmail, myPhoto, onUpdateMyPhoto, onLogout, onLogoutAll, trustedDevice, trustDaysLeft }) {
  // ---- Theme (light / dark) -------------------------------------------
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('ihims_theme')
      if (stored === 'light' || stored === 'dark') return stored
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('ihims_theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const [employees, setEmployees] = useState(() => getStoredData('ihims_employees', initialEmployees))
  const [trainingPrograms, setTrainingPrograms] = useState(() => getStoredData('ihims_training', initialTrainingPrograms))
  const [competencies, setCompetencies] = useState(() => getStoredData('ihims_competencies', initialCompetencies))
  const [recognitionAwards, setRecognitionAwards] = useState(() => getStoredData('ihims_recognition', initialRecognitionAwards))
const [successionCandidates, setSuccessionCandidates] = useState(() => getStoredData('ihims_succession', initialSuccessionCandidates))
const [accounts, setAccounts] = useState(() => getStoredData('ihims_accounts', initialAccounts))
  const [registrations, setRegistrations] = useState(() => getStoredData('ihims_registrations', []))
  const [announcements, setAnnouncements] = useState(() => getStoredData('ihims_announcements', initialAnnouncements))
  const [reviewCycles, setReviewCycles] = useState(() => getStoredData('ihims_review_cycles', []))
  const [reviews, setReviews] = useState(() => getStoredData('ihims_reviews', []))
  const [attendance, setAttendance] = useState(() => getStoredData('ihims_attendance', initialAttendance))
  const [loading] = useState(false)
  const [loadError] = useState('')

const roleDisplayName = useMemo(() => roleLabel(primaryRoleOf(roles)), [roles])

  // Real-time cross-tab sync: listen for changes made in other tabs/windows
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue)
if (e.key === 'ihims_employees') setEmployees(parsed)
        if (e.key === 'ihims_training') setTrainingPrograms(parsed)
        if (e.key === 'ihims_competencies') setCompetencies(parsed)
        if (e.key === 'ihims_recognition') setRecognitionAwards(parsed)
if (e.key === 'ihims_succession') setSuccessionCandidates(parsed)
if (e.key === 'ihims_accounts') setAccounts(parsed)
        if (e.key === 'ihims_registrations') setRegistrations(parsed)
        if (e.key === 'ihims_announcements') setAnnouncements(parsed)
        if (e.key === 'ihims_review_cycles') setReviewCycles(parsed)
        if (e.key === 'ihims_reviews') setReviews(parsed)
        if (e.key === 'ihims_attendance') setAttendance(parsed)
      } catch {
        // ignore invalid JSON
      }
    }
    const onCustom = (e) => {
      const { key, value } = e.detail || {}
      if (key === 'ihims_employees') setEmployees(value)
      if (key === 'ihims_training') setTrainingPrograms(value)
      if (key === 'ihims_competencies') setCompetencies(value)
      if (key === 'ihims_recognition') setRecognitionAwards(value)
      if (key === 'ihims_succession') setSuccessionCandidates(value)
      if (key === 'ihims_accounts') setAccounts(value)
      if (key === 'ihims_registrations') setRegistrations(value)
      if (key === 'ihims_announcements') setAnnouncements(value)
      if (key === 'ihims_review_cycles') setReviewCycles(value)
      if (key === 'ihims_reviews') setReviews(value)
      if (key === 'ihims_attendance') setAttendance(value)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('ihims-data-change', onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('ihims-data-change', onCustom)
    }
  }, [])

  // Persist to localStorage + broadcast whenever data changes
useEffect(() => { emitDataChange('ihims_employees', employees) }, [employees])
  useEffect(() => { emitDataChange('ihims_training', trainingPrograms) }, [trainingPrograms])
  useEffect(() => { emitDataChange('ihims_competencies', competencies) }, [competencies])
  useEffect(() => { emitDataChange('ihims_recognition', recognitionAwards) }, [recognitionAwards])
useEffect(() => { emitDataChange('ihims_succession', successionCandidates) }, [successionCandidates])
  useEffect(() => { emitDataChange('ihims_accounts', accounts) }, [accounts])
  useEffect(() => { emitDataChange('ihims_registrations', registrations) }, [registrations])
  useEffect(() => { emitDataChange('ihims_announcements', announcements) }, [announcements])
  useEffect(() => { emitDataChange('ihims_review_cycles', reviewCycles) }, [reviewCycles])
  useEffect(() => { emitDataChange('ihims_reviews', reviews) }, [reviews])
  useEffect(() => { emitDataChange('ihims_attendance', attendance) }, [attendance])

const actor = { name: userName || role, role, email: userEmail }

  // My linked employee record (used for team scoping and My Team/My
  // Development Plan) — prefers the explicit Linked Employee, falls back to
  // matching by name for accounts created before that field existed.
  const myAccountRecord = useMemo(
    () => accounts.find(
      (a) => (a.email || '').toLowerCase() === (userEmail || '').toLowerCase() || (a.username || '').toLowerCase() === (userName || '').toLowerCase()
    ) || null,
    [accounts, userEmail, userName]
  )
  const myEmployee = useMemo(() => {
    if (myAccountRecord && myAccountRecord.employeeId != null) {
      const linked = employees.find((e) => e.id === myAccountRecord.employeeId)
      if (linked) return linked
    }
    return employees.find((e) => e.name === actor.name) || null
  }, [employees, myAccountRecord, actor.name])

  // Team = everyone who reports to me, directly or indirectly (not
  // including myself). Admins are never scoped; HR (without admin) is
  // scoped to themselves + their team everywhere employee data is shown.
  const isAdmin = roles.includes('admin')
  const isHrOnly = !isAdmin && roles.includes('hr')
  const teamIds = useMemo(
    () => (myEmployee ? getTeamIds(employees, myEmployee.id) : new Set()),
    [employees, myEmployee]
  )
  const myTeam = useMemo(
    () => employees.filter((e) => teamIds.has(e.id)),
    [employees, teamIds]
  )
  // The scoped employee list used everywhere employee data is displayed:
  // admins and staff see everyone (staff view-only, unchanged); HR-only
  // accounts see just themselves + their team.
  const visibleEmployees = useMemo(() => {
    if (!isHrOnly) return employees
    if (!myEmployee) return []
    return employees.filter((e) => e.id === myEmployee.id || teamIds.has(e.id))
  }, [employees, isHrOnly, myEmployee, teamIds])

  const nextId = (arr) => {
    return arr.length > 0 ? Math.max(...arr.map((x) => Number(x.id) || 0)) + 1 : 1
  }

  const addEmployee = (emp) => {
    requireEdit(roles, 'performance')
    const newRow = { ...emp, id: nextId(employees) }
    setEmployees((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'performance', detail: `Added employee "${newRow.name}"` })
  }

  const updateEmployee = (id, data) => {
    requireEdit(roles, 'performance')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'performance', detail: `Updated employee "${target?.name || id}"` })
  }

  const deleteEmployee = (id) => {
    requireEdit(roles, 'performance')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.filter((e) => e.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'performance', detail: `Deleted employee "${target?.name || id}"` })
  }

  const addTraining = (prog) => {
    requireEdit(roles, 'learning')
    const newRow = { ...prog, id: nextId(trainingPrograms) }
    setTrainingPrograms((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'learning', detail: `Added training program "${newRow.title}"` })
  }

  const updateTraining = (id, data) => {
    requireEdit(roles, 'learning')
    const target = trainingPrograms.find((p) => p.id === id)
    setTrainingPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'learning', detail: `Updated training program "${target?.title || id}"` })
  }

const deleteTraining = (id) => {
    requireEdit(roles, 'learning')
    const target = trainingPrograms.find((p) => p.id === id)
    setTrainingPrograms((prev) => prev.filter((p) => p.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'learning', detail: `Deleted training program "${target?.title || id}"` })
  }

  const registerTraining = (programId) => {
    // Staff (and up) can register themselves for training/certifications.
    requireEdit(roles, 'learning')
    const program = trainingPrograms.find((p) => p.id === programId)
    if (!program) throw new Error('Program not found')
    if (program.status === 'completed') throw new Error('This program has already been completed')
    // Avoid duplicate registration
    const already = registrations.some((r) => r.programId === programId && r.userId === actor.name)
    if (already) {
      throw new Error('You are already registered for this program')
    }
    // Enforce seat capacity — reject once the program is full
    if (program.seats && (program.participants || 0) >= program.seats) {
      throw new Error(`This program is at full capacity (${program.participants}/${program.seats} seats filled)`)
    }
    const newRow = { id: nextId(registrations), programId, userId: actor.name, programTitle: program.title, registeredOn: new Date().toISOString() }
    setRegistrations((prev) => [...prev, newRow])
    // Increment participant count
    setTrainingPrograms((prev) => prev.map((p) => (p.id === programId ? { ...p, participants: (p.participants || 0) + 1 } : p)))
    appendAudit({ user: actor.name, role, action: 'register', module: 'learning', detail: `Registered for "${program.title}"` })
    return newRow
  }

  const addRecognition = (rec) => {
    requireEdit(roles, 'recognition')
    const newRow = { ...rec, id: nextId(recognitionAwards), likes: 0, comments: [] }
    setRecognitionAwards((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'recognition', detail: `Added recognition for "${newRow.recipient}"` })
  }

  const deleteRecognition = (id) => {
    requireEdit(roles, 'recognition')
    const target = recognitionAwards.find((a) => a.id === id)
    setRecognitionAwards((prev) => prev.filter((a) => a.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'recognition', detail: `Deleted recognition "${target?.recipient || id}"` })
  }

  const toggleRecognitionLike = (id) => {
    // Any logged-in user (even staff) can like
    setRecognitionAwards((prev) => prev.map((a) => {
      if (a.id !== id) return a
      const likedUsers = a.likedUsers || []
      if (likedUsers.includes(actor.name)) {
        return { ...a, likedUsers: likedUsers.filter((u) => u !== actor.name), likes: Math.max(0, (a.likes || 0) - 1) }
      }
      return { ...a, likedUsers: [...likedUsers, actor.name], likes: (a.likes || 0) + 1 }
    }))
  }

  const addRecognitionComment = (id, text) => {
    const comment = text.trim()
    if (!comment) return
    setRecognitionAwards((prev) => prev.map((a) => {
      if (a.id !== id) return a
      const comments = a.comments || []
      return { ...a, comments: [...comments, { author: actor.name, text: comment, at: new Date().toLocaleString() }] }
    }))
  }

const addCompetency = (comp) => {
    requireEdit(roles, 'competency')
    const newRow = { ...comp, weight: Number(comp.weight) || 0, id: nextId(competencies) }
    setCompetencies((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'competency', detail: `Added competency "${newRow.name}"` })
  }

  const updateCompetency = (id, data) => {
    requireEdit(roles, 'competency')
    const target = competencies.find((c) => c.id === id)
    setCompetencies((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, weight: Number(data.weight) || c.weight } : c)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'competency', detail: `Updated competency "${target?.name || id}"` })
  }

  const deleteCompetency = (id) => {
    requireEdit(roles, 'competency')
    const target = competencies.find((c) => c.id === id)
    setCompetencies((prev) => prev.filter((c) => c.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'competency', detail: `Deleted competency "${target?.name || id}"` })
  }

  const addSuccession = (plan) => {
    requireEdit(roles, 'succession')
    const newRow = { ...plan, candidates: Array.isArray(plan.candidates) ? plan.candidates : [], id: nextId(successionCandidates) }
    setSuccessionCandidates((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'succession', detail: `Added succession plan for "${newRow.currentRole}"` })
  }

  const updateSuccession = (id, data) => {
    requireEdit(roles, 'succession')
    const target = successionCandidates.find((c) => c.id === id)
    setSuccessionCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, candidates: Array.isArray(data.candidates) ? data.candidates : c.candidates } : c)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'succession', detail: `Updated succession plan "${target?.currentRole || id}"` })
  }

  const deleteSuccession = (id) => {
    requireEdit(roles, 'succession')
    const target = successionCandidates.find((c) => c.id === id)
    setSuccessionCandidates((prev) => prev.filter((c) => c.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'succession', detail: `Deleted succession plan "${target?.currentRole || id}"` })
  }

const addAccount = (acc) => {
    requireEdit(roles, 'accounts')
    const email = (acc.email || '').trim().toLowerCase()
    const username = (acc.username || '').trim().toLowerCase()
    if (!email || !acc.password) {
      throw new Error('Email and password are required')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`"${email}" is not a valid email address`)
    }
    if (accounts.some((a) => (a.email || '').toLowerCase() === email)) {
      throw new Error(`An account with email "${email}" already exists`)
    }
    if (username && accounts.some((a) => a.username === username)) {
      throw new Error(`An account with username "${username}" already exists`)
    }
    const newRow = { ...acc, email, username, id: nextId(accounts) }
    setAccounts((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'accounts', detail: `Created account "${email}"` })
  }

  const updateAccount = (id, data) => {
    requireEdit(roles, 'accounts')
    const target = accounts.find((a) => a.id === id)
    const email = (data.email || '').trim().toLowerCase()
    const username = (data.username || '').trim().toLowerCase()
    if (email && accounts.some((a) => (a.email || '').toLowerCase() === email && a.id !== id)) {
      throw new Error(`An account with email "${email}" already exists`)
    }
    if (username && accounts.some((a) => a.username === username && a.id !== id)) {
      throw new Error(`An account with username "${username}" already exists`)
    }
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data, email: email || a.email, username: username || a.username } : a)))

    // If password changed, revoke device trust for that account so OTP is
    // required on next login (Requirement #6 — password change triggers re-auth)
    const targetEmail = email || (target?.email || '')
    const passwordChanged = data.password && data.password !== (target?.password || '')
    if (passwordChanged && targetEmail) {
      revokeDeviceTrust(targetEmail)
      appendAudit({ user: actor.name, role, action: 'security', module: 'accounts', detail: `Password changed for "${targetEmail}" — device trust revoked` })
    }

    appendAudit({ user: actor.name, role, action: 'update', module: 'accounts', detail: `Updated account "${target?.email || target?.username || id}"` })
  }

const deleteAccount = (id) => {
    requireEdit(roles, 'accounts')
    const target = accounts.find((a) => a.id === id)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'accounts', detail: `Deleted account "${target?.username || id}"` })
  }

  const addAnnouncement = (ann) => {
    requireEdit(roles, 'announcements')
    const newRow = { ...ann, pinned: !!ann.pinned, id: nextId(announcements) }
    setAnnouncements((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'announcements', detail: `Posted announcement "${newRow.title}"` })
  }

  const updateAnnouncement = (id, data) => {
    requireEdit(roles, 'announcements')
    const target = announcements.find((a) => a.id === id)
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'announcements', detail: `Updated announcement "${target?.title || id}"` })
  }

  const deleteAnnouncement = (id) => {
    requireEdit(roles, 'announcements')
    const target = announcements.find((a) => a.id === id)
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'announcements', detail: `Removed announcement "${target?.title || id}"` })
  }

  const bulkDeleteEmployees = (ids) => {
    requireEdit(roles, 'performance')
    const remaining = employees.filter((e) => !ids.includes(e.id))
    setEmployees(remaining)
    appendAudit({ user: actor.name, role, action: 'bulk_delete', module: 'performance', detail: `Bulk-deleted ${ids.length} employee record(s)` })
  }

// Update an employee's photo (or any settings-level field).
  const updateEmployeePhoto = (id, photo) => {
    requireEdit(roles, 'settings')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, photo } : e)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'settings', detail: `Updated profile photo for "${target?.name || id}"` })
  }

// Update the logged-in user's own profile photo. The photo is persisted per
  // user under its own localStorage key (keyed by email) so it survives logout
  // and login, and is also kept in the session for immediate UI updates.
  const updateMyPhoto = (photo) => {
    const s = getStoredSession()
    const next = { ...s, photo }
    setStoredSession(next)
    setStoredUserPhoto(actor.email, photo)
    if (typeof onUpdateMyPhoto === 'function') onUpdateMyPhoto(photo)
    appendAudit({ user: actor.name, role, action: 'update', module: 'settings', detail: 'Updated own profile photo' })
  }

  // ---- Full data backup (Admin) --------------------------------------------
  const exportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      employees, trainingPrograms, competencies, recognitionAwards,
      successionCandidates, accounts, registrations, announcements,
      reviewCycles, reviews,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ihims_backup_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    appendAudit({ user: actor.name, role, action: 'export', module: 'accounts', detail: 'Exported full data backup' })
  }

  const importBackup = (payload) => {
    requireEdit(roles, 'accounts')
    if (Array.isArray(payload.employees)) setEmployees(payload.employees)
    if (Array.isArray(payload.trainingPrograms)) setTrainingPrograms(payload.trainingPrograms)
    if (Array.isArray(payload.competencies)) setCompetencies(payload.competencies)
    if (Array.isArray(payload.recognitionAwards)) setRecognitionAwards(payload.recognitionAwards)
    if (Array.isArray(payload.successionCandidates)) setSuccessionCandidates(payload.successionCandidates)
    if (Array.isArray(payload.accounts)) setAccounts(payload.accounts)
    if (Array.isArray(payload.registrations)) setRegistrations(payload.registrations)
    if (Array.isArray(payload.announcements)) setAnnouncements(payload.announcements)
    if (Array.isArray(payload.reviewCycles)) setReviewCycles(payload.reviewCycles)
    if (Array.isArray(payload.reviews)) setReviews(payload.reviews)
    appendAudit({ user: actor.name, role, action: 'import', module: 'accounts', detail: 'Restored data from backup file' })
  }

  // ---- Performance review cycles (HR/Admin manage, everyone self-assesses) -
  const addReviewCycle = (cycle) => {
    requireEdit(roles, 'reviews')
    const newRow = { ...cycle, id: nextId(reviewCycles), status: cycle.status || 'open' }
    setReviewCycles((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'reviews', detail: `Created review cycle "${newRow.title}"` })
  }

  const updateReviewCycleStatus = (id, status) => {
    requireEdit(roles, 'reviews')
    setReviewCycles((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'reviews', detail: `Set review cycle status to "${status}"` })
  }

  const deleteReviewCycle = (id) => {
    requireEdit(roles, 'reviews')
    setReviewCycles((prev) => prev.filter((c) => c.id !== id))
    setReviews((prev) => prev.filter((r) => r.cycleId !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'reviews', detail: 'Deleted review cycle' })
  }

  const submitSelfAssessment = (cycleId, text) => {
    const existing = reviews.find((r) => r.cycleId === cycleId && r.employeeName === actor.name)
    if (existing) {
      setReviews((prev) => prev.map((r) => (r.id === existing.id ? { ...r, selfAssessment: text, status: r.status === 'reviewed' ? 'reviewed' : 'submitted' } : r)))
    } else {
      const newRow = { id: nextId(reviews), cycleId, employeeName: actor.name, selfAssessment: text, managerRating: null, managerComments: '', status: 'submitted' }
      setReviews((prev) => [...prev, newRow])
    }
    appendAudit({ user: actor.name, role, action: 'update', module: 'reviews', detail: 'Submitted self-assessment' })
  }

  const submitManagerReview = (reviewId, rating, comments) => {
    requireEdit(roles, 'reviews')
    setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, managerRating: rating, managerComments: comments, status: 'reviewed' } : r)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'reviews', detail: 'Completed manager review' })
  }

  // ---- Peer recognition (open to every logged-in user) ---------------------
  const giveShoutout = (rec) => {
    const newRow = { ...rec, id: nextId(recognitionAwards), type: 'Peer Recognition', peer: true, giver: actor.name, likes: 0, comments: [] }
    setRecognitionAwards((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'recognition', detail: `Gave a peer shout-out to "${newRow.recipient}"` })
  }

  // ---- Attendance management -----------------------------------------------
  const addAttendanceRecord = (record) => {
    requireEdit(roles, 'performance')
    const newRow = { ...record, id: nextId(attendance) }
    setAttendance((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'attendance', detail: `Logged ${record.status} for employee ID ${record.employeeId} on ${record.date}` })
  }

  const updateAttendanceRecord = (id, data) => {
    requireEdit(roles, 'performance')
    setAttendance((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'attendance', detail: `Updated attendance record ${id}` })
  }

  const deleteAttendanceRecord = (id) => {
    requireEdit(roles, 'performance')
    setAttendance((prev) => prev.filter((r) => r.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'attendance', detail: `Deleted attendance record ${id}` })
  }

  // ---- Competency qualitative notes ----------------------------------------
  const updateCompetencyNotes = (employeeId, notes) => {
    requireEdit(roles, 'competency')
    const target = employees.find((e) => e.id === employeeId)
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, competencyNotes: notes } : e)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'competency', detail: `Updated competency notes for "${target?.name || employeeId}"` })
  }

  // ---- Employee profile fields (qualifications, employment info) -----------
  const updateEmployeeProfile = (id, profileData) => {
    requireEdit(roles, 'performance')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...profileData } : e)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'performance', detail: `Updated profile for "${target?.name || id}"` })
  }

  // ---- Training completion feedback loop -----------------------------------
  // When HR marks a training as completed for an employee, offer to bump
  // the employee's training score and suggest a competency score nudge for
  // each competency linked to that program.
  const markTrainingCompletedForEmployee = (employeeId, programId, competencyScoreNudge) => {
    requireEdit(roles, 'learning')
    const program = trainingPrograms.find((p) => p.id === programId)
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp || !program) return

    // Bump training score by up to 3 points (capped at 100)
    const newTraining = Math.min(100, (emp.training || 0) + 3)
    // If caller provided a competency nudge value, apply it (capped at 100)
    const newCompetency = competencyScoreNudge != null
      ? Math.min(100, Math.max(0, competencyScoreNudge))
      : emp.competency

    setEmployees((prev) => prev.map((e) =>
      e.id === employeeId ? { ...e, training: newTraining, competency: newCompetency } : e
    ))
    appendAudit({ user: actor.name, role, action: 'update', module: 'learning', detail: `Marked "${emp.name}" as completed for "${program.title}" — training score updated to ${newTraining}%` })
  }

const renderModule = () => {
    // RBAC: verify view permission (throws 403 if denied), show a 403 page.
    try {
      requireView(roles, activeModule)
    } catch (err) {
      return (
        <div className="forbidden">
          <div className="forbidden-code">403</div>
          <h2>Forbidden</h2>
          <p>{err.message || 'You do not have permission to access this module.'}</p>
          <button className="btn-save" onClick={() => setActiveModule('dashboard')}>Go to Dashboard</button>
        </div>
      )
    }
    switch (activeModule) {
case 'dashboard':
        return (
          <Dashboard
            employees={visibleEmployees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
            successionCandidates={successionCandidates}
            announcements={announcements}
            reviewCycles={reviewCycles}
            reviews={reviews}
            role={role}
            roles={roles}
            canEdit={roles.includes('admin') || roles.includes('hr')}
            onNavigate={setActiveModule}
          />
        )
case 'performance':
        return (
          <PerformanceModule
            employees={visibleEmployees}
            attendance={attendance}
            competencies={competencies}
            canEdit={canEditModule(roles, 'performance')}
            defaultManagerId={isHrOnly && myEmployee ? myEmployee.id : null}
            addEmployee={addEmployee}
            updateEmployee={updateEmployee}
            deleteEmployee={deleteEmployee}
            bulkDeleteEmployees={bulkDeleteEmployees}
            updateEmployeeProfile={updateEmployeeProfile}
            addAttendanceRecord={addAttendanceRecord}
            updateAttendanceRecord={updateAttendanceRecord}
            deleteAttendanceRecord={deleteAttendanceRecord}
          />
        )
      case 'competency':
        return (
          <CompetencyModule
            competencies={competencies}
            canEdit={canEditModule(roles, 'competency')}
            employees={visibleEmployees}
            addCompetency={addCompetency}
            updateCompetency={updateCompetency}
            deleteCompetency={deleteCompetency}
            updateCompetencyNotes={updateCompetencyNotes}
          />
        )
      case 'aiCompetency':
        return (
          <GapAnalysisModule
            employees={visibleEmployees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
          />
        )
case 'learning':
        return (
          <LearningModule
            trainingPrograms={trainingPrograms}
            competencies={competencies}
            employees={visibleEmployees}
            registrations={registrations}
            addTraining={addTraining}
            updateTraining={updateTraining}
            deleteTraining={deleteTraining}
            registerTraining={registerTraining}
            markTrainingCompletedForEmployee={markTrainingCompletedForEmployee}
            canEdit={canEditModule(roles, 'learning')}
            role={role}
            roles={roles}
            userName={actor.name}
          />
        )
      case 'succession':
        return (
          <SuccessionModule
            successionCandidates={successionCandidates}
            employees={visibleEmployees}
            canEdit={canEditModule(roles, 'succession')}
            addSuccession={addSuccession}
            updateSuccession={updateSuccession}
            deleteSuccession={deleteSuccession}
          />
        )
case 'recognition':
        return (
          <RecognitionModule
            recognitionAwards={recognitionAwards}
            employees={employees}
            addRecognition={addRecognition}
            deleteRecognition={deleteRecognition}
            toggleLike={toggleRecognitionLike}
            addComment={addRecognitionComment}
            canEdit={canEditModule(roles, 'recognition')}
            giveShoutout={giveShoutout}
            currentUser={actor.name}
          />
        )
case 'accounts':
        return (
          <AccountsModule
            accounts={accounts}
            employees={employees}
            canEdit={canEditModule(roles, 'accounts')}
            addAccount={addAccount}
            updateAccount={updateAccount}
            deleteAccount={deleteAccount}
            roles={roles}
            exportBackup={exportBackup}
            importBackup={importBackup}
          />
        )
      case 'announcements':
        return (
          <AnnouncementsModule
            announcements={announcements}
            canEdit={canEditModule(roles, 'announcements')}
            addAnnouncement={addAnnouncement}
            updateAnnouncement={updateAnnouncement}
            deleteAnnouncement={deleteAnnouncement}
            role={role}
            userName={actor.name}
          />
        )
case 'settings':
        return (
<SettingsModule
            employees={visibleEmployees}
            accounts={accounts}
            canEdit={canEditModule(roles, 'settings')}
            updateEmployeePhoto={updateEmployeePhoto}
            updateMyPhoto={updateMyPhoto}
            myPhoto={myPhoto}
            role={role}
            roles={roles}
            userName={actor.name}
            userEmail={actor.email}
          />
        )
      case 'audit':
        return <AuditModule />
      case 'orgchart':
        return <OrgChartModule employees={visibleEmployees} />
      case 'myDevelopment':
        return <MyDevelopmentModule employees={employees} accounts={accounts} userName={actor.name} userEmail={actor.email} />
      case 'myTeam':
        return <MyTeamModule team={myTeam} />
      case 'permissions':
        return <PermissionsModule canEdit={canEditModule(roles, 'permissions')} />
      case 'reviews':
        return (
          <ReviewsModule
            reviewCycles={reviewCycles}
            reviews={reviews}
            employees={visibleEmployees}
            canManage={canEditModule(roles, 'reviews')}
            userName={actor.name}
            addReviewCycle={addReviewCycle}
            updateReviewCycleStatus={updateReviewCycleStatus}
            deleteReviewCycle={deleteReviewCycle}
            submitSelfAssessment={submitSelfAssessment}
            submitManagerReview={submitManagerReview}
          />
        )
default:
        return (
          <Dashboard
            employees={visibleEmployees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
            successionCandidates={successionCandidates}
            announcements={announcements}
            reviewCycles={reviewCycles}
            reviews={reviews}
            role={role}
            roles={roles}
            canEdit={roles.includes('admin') || roles.includes('hr')}
            onNavigate={setActiveModule}
          />
        )
    }
  }

  const [activeModule, setActiveModule] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLogoutMenu, setShowLogoutMenu] = useState(false)
  const logoutMenuRef = useRef(null)

  useEffect(() => {
    if (!showLogoutMenu) return
    const handler = (e) => {
      if (logoutMenuRef.current && !logoutMenuRef.current.contains(e.target)) {
        setShowLogoutMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLogoutMenu])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation">
            <Icon name="menu" size={20} />
          </button>
          <span className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 4v16M4 12h16" />
              <path d="M9 8l7 8M15 8l-7 8" opacity="0" />
            </svg>
          </span>
          <div className="logo-text">
            <span className="hospital-name">AI-Driven HRMS</span>
            <span className="hospital-tagline">Competency Gap Analysis</span>
          </div>
        </div>
<div className="header-info">
          <LiveClock />
          <span className="status-indicator"><span className="status-dot"></span> Online</span>
          <div className="header-actions">
            {/* Theme toggle */}
            <button
              type="button"
              className="theme-toggle-icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle light/dark theme"
            >
              {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
            {/* Trusted device indicator */}
            {trustedDevice ? (
              <span title={`This device is trusted for ${trustDaysLeft ?? 7} more day(s). OTP will not be required on next login.`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, color: '#059669',
                background: '#ecfdf5', border: '1px solid #6ee7b7',
                borderRadius: 999, padding: '3px 10px', cursor: 'default',
              }}>
                🔒 Trusted · {trustDaysLeft ?? 7}d
              </span>
            ) : null}
<NotificationBell
              announcements={announcements}
              trainingPrograms={trainingPrograms}
              employees={employees}
              userName={actor.name}
              onNavigate={(mod) => { setActiveModule(mod); setMobileMenuOpen(false) }}
            />
            <div style={{ position: 'relative', display: 'inline-block' }} ref={logoutMenuRef}>
              <button className="btn-cancel" onClick={() => setShowLogoutMenu((p) => !p)} type="button">
                <Icon name="logout" size={16} /> Logout
              </button>
              {showLogoutMenu && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 999,
                  background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 220, overflow: 'hidden',
                }}>
                  <button
                    type="button"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                    onClick={() => { setShowLogoutMenu(false); onLogout() }}
                  >
                    <Icon name="logout" size={15} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Log out</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Keeps this device trusted</div>
                    </div>
                  </button>
                  <div style={{ borderTop: '1px solid var(--border, #e5e7eb)' }} />
                  <button
                    type="button"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left', color: '#dc2626' }}
                    onClick={() => {
                      setShowLogoutMenu(false)
                      if (confirm('This will log you out and remove trust from all devices on this browser. Continue?')) {
                        onLogoutAll()
                      }
                    }}
                  >
                    <Icon name="logout" size={15} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Log out of all devices</div>
                      <div style={{ fontSize: 11, color: '#ef4444' }}>Requires OTP on next login</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
<Navbar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          userName={roleDisplayName}
          role={role}
          roles={roles}
          myPhoto={myPhoto}
        />

<main className="main-content">
          {loading ? <div style={{ padding: 12, fontWeight: 600 }}>Loading…</div> : null}
          {loadError ? <div style={{ padding: 12, color: '#dc2626', fontWeight: 600 }}>{loadError}</div> : null}
          {!loading && !loadError ? renderModule() : null}
        </main>
      </div>

      <AIGuideBot
        role={role}
        activeModule={activeModule}
        dataSummary={{ employees, trainingPrograms, recognitionAwards, successionCandidates }}
        onNavigate={(id) => { setActiveModule(id); setMobileMenuOpen(false) }}
      />
    </div>
  )
}

// Navbar Component
function Navbar({ activeModule, setActiveModule, mobileMenuOpen, setMobileMenuOpen, userName, role, roles, myPhoto }) {
  const visibleModules = visibleModulesFor(roles)
  const coreModules = visibleModules.filter((m) => m.featured)
  const adminModules = visibleModules.filter((m) => !m.featured)
  const sectionTitle =
    roles.includes('admin') ? 'Admin & Tools' :
    roles.includes('hr') ? 'HR Tools' : 'More'

  return (
    <nav className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
      <div className="nav-brand">
        <span className="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 4v16M4 12h16" />
            <path d="M9 7.5 15 12l-6 4.5" opacity="0" />
          </svg>
        </span>
        <span className="brand-text">IHIMS</span>
      </div>
      <div className="nav-links">
        {coreModules.map(mod => (
          <button
            key={mod.id}
            className={`nav-link ${activeModule === mod.id ? 'active' : ''}`}
            onClick={() => { setActiveModule(mod.id); setMobileMenuOpen(false) }}
          >
            <span className="nav-icon"><Icon name={mod.icon} size={18} /></span>
            <span className="nav-label">{mod.label}</span>
          </button>
        ))}

{adminModules.length > 0 ? (
          <>
            <div className="nav-section-label">{sectionTitle}</div>
            {adminModules.map(mod => (
              <button
                key={mod.id}
                className={`nav-link ${activeModule === mod.id ? 'active' : ''}`}
                onClick={() => { setActiveModule(mod.id); setMobileMenuOpen(false) }}
              >
                <span className="nav-icon"><Icon name={mod.icon} size={18} /></span>
                <span className="nav-label">{mod.label}</span>
              </button>
            ))}
          </>
        ) : null}
      </div>
<div className="nav-user">
        <span className="user-avatar">
          {myPhoto ? <img className="user-avatar-img" src={myPhoto} alt={userName || 'My profile'} /> : <Icon name="user" size={18} />}
        </span>
        <span className="user-name">{userName}</span>
        <span className="role-badge">{roleLabel(primaryRoleOf(roles))}</span>
      </div>
    </nav>
  )
}

// Dashboard Component
function Dashboard({ employees, trainingPrograms, recognitionAwards, successionCandidates, announcements, reviewCycles, reviews, role, roles, canEdit, onNavigate }) {
  const avgPerformance = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.performance, 0) / employees.length) : 0
  const avgCompetency = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.competency, 0) / employees.length) : 0
  const avgTraining = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.training, 0) / employees.length) : 0
  const totalRecognitions = recognitionAwards.length

  // Global search across employees, training, recognition, and succession.
  const [searchTerm, setSearchTerm] = useState('')
  const q = searchTerm.trim().toLowerCase()
  const searchResults = q ? {
    employees: employees.filter((e) => `${e.name} ${e.role} ${e.department}`.toLowerCase().includes(q)),
    training: trainingPrograms.filter((p) => `${p.title} ${p.type} ${p.status}`.toLowerCase().includes(q)),
    recognition: recognitionAwards.filter((a) => `${a.recipient} ${a.type} ${a.department}`.toLowerCase().includes(q)),
    succession: successionCandidates.filter((s) => `${s.currentRole} ${(s.candidates || []).join(' ')}`.toLowerCase().includes(q)),
  } : null
  const totalMatches = searchResults
    ? searchResults.employees.length + searchResults.training.length + searchResults.recognition.length + searchResults.succession.length
    : 0
  const sortedAnnouncements = [...(announcements || [])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  // Reminders: certifications expiring within 30 days, and open review
  // cycles whose period ends within the next 7 days with reviews still
  // pending or awaiting a manager rating.
  const daysFromNow = (dateStr) => {
    if (!dateStr) return null
    const target = new Date(dateStr)
    if (isNaN(target.getTime())) return null
    const now = new Date()
    return Math.ceil((target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
  }
  const expiringCerts = (trainingPrograms || []).filter((p) => {
    if (p.type !== 'Certification' || !p.expiresOn) return false
    const d = daysFromNow(p.expiresOn)
    return d !== null && d >= 0 && d <= 30
  })
  const reviewsDueSoon = (reviewCycles || [])
    .filter((c) => c.status === 'open')
    .flatMap((c) => {
      const d = daysFromNow(c.periodEnd)
      if (d === null || d < 0 || d > 7) return []
      const pending = (reviews || []).filter((r) => r.cycleId === c.id && r.status !== 'reviewed').length
      return pending > 0 ? [{ cycle: c, pending, daysLeft: d }] : []
    })

  return (
<div className="dashboard">
      <h1 className="page-title">AI-Driven Human Resource Management System</h1>
      <p className="page-subtitle">Competency Gap Analysis for Performance and Development</p>

      {/* What needs attention today — simple plain-language summary card */}
      {(() => {
        const items = []
        const lowPerf = employees.filter(e => e.performance < 80)
        if (lowPerf.length) items.push({ icon: 'warn', text: `${lowPerf.length} employee${lowPerf.length > 1 ? 's' : ''} ${lowPerf.length > 1 ? 'have' : 'has'} performance below 80% — e.g. ${lowPerf[0].name}.` })

        // Automated competency gap detection — runs the same rule-based gap
        // engine used in AI Competency / Succession / My Development Plan,
        // and surfaces anyone with a High-priority gap (gap >= 2 levels)
        // right here, so HR doesn't have to manually open each profile.
        const gapAnalyses = employees.map(e => ({ emp: e, analysis: analyzeEmployee(e) }))
        const criticalGapEmployees = gapAnalyses.filter(({ analysis }) => analysis.highPriority.length > 0)
        if (criticalGapEmployees.length) {
          const worst = [...criticalGapEmployees].sort((a, b) => b.analysis.highPriority.length - a.analysis.highPriority.length)[0]
          items.push({
            icon: 'search',
            text: `${criticalGapEmployees.length} employee${criticalGapEmployees.length > 1 ? 's have' : ' has'} high-priority competency gap(s) — e.g. ${worst.emp.name} (${worst.analysis.highPriority.length} area${worst.analysis.highPriority.length > 1 ? 's' : ''} below required level). See AI Competency for full analysis.`,
          })
        }

        const upcomingTraining = trainingPrograms.filter(p => p.status === 'upcoming')
        if (upcomingTraining.length) items.push({ icon: 'calendar', text: `${upcomingTraining.length} training session${upcomingTraining.length > 1 ? 's' : ''} upcoming — encourage staff to register early.` })
        const lowTraining = employees.filter(e => e.training < 85)
        if (lowTraining.length) items.push({ icon: 'learning', text: `${lowTraining.length} employee${lowTraining.length > 1 ? 's' : ''} ${lowTraining.length > 1 ? 'have' : 'has'} training completion below 85%.` })
        if (items.length === 0) return (
          <div className="account-msg success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="checkCircle" size={16} /> Everything looks good today — no immediate issues found.
          </div>
        )
        return (
          <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
            <strong style={{ fontSize: 14, color: '#92400e' }}>What needs attention today</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name={item.icon} size={14} /></span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      <div className="quick-actions" style={{ marginBottom: 16 }}>
        <button className="quick-action" onClick={() => onNavigate && onNavigate('orgchart')}><Icon name="accounts" size={16} /> Org Chart</button>
        <button className="quick-action" onClick={() => onNavigate && onNavigate('myDevelopment')}><Icon name="ai" size={16} /> My Development Plan</button>
        {(roles || []).some(r => r === 'admin' || r === 'hr') ? (
          <button className="quick-action" onClick={() => onNavigate && onNavigate('myTeam')}><Icon name="accounts" size={16} /> My Team</button>
        ) : null}
        {canEdit ? (
          <button className="quick-action" onClick={() => onNavigate && onNavigate('reviews')}><Icon name="performance" size={16} /> Performance Reviews</button>
        ) : null}
        {(roles || []).includes('admin') ? (
          <button className="quick-action" onClick={() => onNavigate && onNavigate('permissions')}><Icon name="shield" size={16} /> Manage Permissions</button>
        ) : null}
      </div>

      {/* Global search */}
      <div className="global-search">
<div className="search-with-icon">
          <Icon name="search" size={16} />
          <input
            type="text"
            className="search-input"
            placeholder="Search employees, training, recognition, succession..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

{searchResults && (
        <div className="global-search-results">
          <div className="global-search-head">
            <strong>{totalMatches}</strong> result(s) for <em>"{searchTerm}"</em>
          </div>
          {searchResults.employees.length > 0 ? (
            <div className="global-search-group">
              <span className="global-search-label">Employees</span>
              {searchResults.employees.slice(0, 5).map((e) => (
                <div key={e.id} className="global-search-employee">
                  <span className="global-search-avatar">
                    {e.photo ? <img src={e.photo} alt={e.name} /> : <Icon name="user" size={18} />}
                  </span>
                  <div className="global-search-employee-info">
                    <div className="global-search-employee-name">{e.name}</div>
                    <div className="global-search-employee-meta">{e.role} • {e.department}</div>
                    <div className="global-search-employee-scores">
                      <span>Perf <strong>{e.performance}%</strong></span>
                      <span>Comp <strong>{e.competency}%</strong></span>
                      <span>Trn <strong>{e.training}%</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {searchResults.training.length > 0 ? (
            <div className="global-search-group">
              <span className="global-search-label">Training</span>
              {searchResults.training.slice(0, 5).map((p) => (
                <div key={p.id} className="global-search-item">{p.title} — {p.type} ({p.status})</div>
              ))}
            </div>
          ) : null}
          {searchResults.recognition.length > 0 ? (
            <div className="global-search-group">
              <span className="global-search-label">Recognition</span>
              {searchResults.recognition.slice(0, 5).map((a) => (
                <div key={a.id} className="global-search-item">{a.recipient} — {a.type} ({a.department})</div>
              ))}
            </div>
          ) : null}
          {searchResults.succession.length > 0 ? (
            <div className="global-search-group">
              <span className="global-search-label">Succession</span>
              {searchResults.succession.slice(0, 5).map((s) => (
                <div key={s.id} className="global-search-item">{s.currentRole} — {s.readiness} readiness</div>
              ))}
            </div>
          ) : null}
          {totalMatches === 0 ? <div className="global-search-empty">No matches found.</div> : null}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Icon name="accounts" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={employees.length} duration={700} /></div>
            <div className="stat-label">Total Employees</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="trendUp" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={avgPerformance} suffix="%" /></div>
            <div className="stat-label">Avg Performance</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="competency" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={avgCompetency} suffix="%" /></div>
            <div className="stat-label">Avg Competency</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="learning" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={avgTraining} suffix="%" /></div>
            <div className="stat-label">Training Completion</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="medal" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={totalRecognitions} duration={700} /></div>
            <div className="stat-label">Recognitions This Month</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="succession" size={22} /></div>
          <div className="stat-content">
            <div className="stat-value"><AnimatedNumber value={successionCandidates.length} duration={700} /></div>
            <div className="stat-label">Succession Plans</div>
          </div>
        </div>
      </div>

      {/* Animated circular gauges for the three key percentages */}
      <div className="gauge-grid">
        <div className="gauge-card">
          <CircularGauge value={avgPerformance} label="Avg Performance" />
        </div>
        <div className="gauge-card">
          <CircularGauge value={avgCompetency} label="Avg Competency" />
        </div>
        <div className="gauge-card">
          <CircularGauge value={avgTraining} label="Training Completion" />
        </div>
      </div>

<div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel-title">Top Performers</h2>
          <div className="top-performers">
            {[...employees].sort((a, b) => b.performance - a.performance).slice(0, 5).map((emp, idx) => (
              <div key={emp.id} className="performer-item">
                <span className="performer-rank">#{idx + 1}</span>
                <span className="performer-name">{emp.name}</span>
                <span className="performer-score">{emp.performance}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Training Programs</h2>
          <div className="training-list">
            {trainingPrograms.slice(0, 4).map(prog => (
              <div key={prog.id} className="training-item">
                <div className="training-info">
                  <span className="training-title">{prog.title}</span>
                  <span className="training-meta">{prog.type} • {prog.duration}</span>
                </div>
                <span className={`training-status ${prog.status}`}>{prog.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Recent Recognitions</h2>
          <div className="recognition-list">
            {recognitionAwards.slice(0, 3).map(award => (
              <div key={award.id} className="recognition-item">
                <span className="recognition-icon">+</span>
                <div className="recognition-info">
                  <span className="recognition-recipient">{award.recipient}</span>
                  <span className="recognition-type">{award.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Department Distribution</h2>
          <div className="dept-distribution">
            {Object.entries(
              employees.reduce((acc, e) => {
                acc[e.department] = (acc[e.department] || 0) + 1
                return acc
              }, {})
            ).map(([dept, count]) => {
              const pct = employees.length ? Math.round((count / employees.length) * 100) : 0
              return (
                <div key={dept} className="dept-dist-row">
                  <span className="dept-dist-label">{dept}</span>
                  <div className="dept-dist-bar">
                    <div className="dept-dist-fill" style={{ width: `${pct}%` }}></div>
                  </div>
                  <span className="dept-dist-value">{count} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title"><span className="panel-title-icon"><Icon name="performance" size={18} /></span> Performance Distribution</h2>
          <DistributionChart employees={employees} />
        </div>

        <div className="panel">
          <h2 className="panel-title"><span className="panel-title-icon"><Icon name="warn" size={18} /></span> Needs Attention</h2>
          <div className="attention-list">
            {[...employees].filter(e => e.performance < 80).slice(0, 5).map(emp => (
              <div key={emp.id} className="attention-item">
                <span className="attention-name">{emp.name}</span>
                <span className="attention-value">{emp.performance}%</span>
              </div>
            ))}
            {employees.every(e => e.performance >= 80) ? (
              <div className="attention-empty">All employees are performing well.</div>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="panel">
            <h2 className="panel-title"><span className="panel-title-icon"><Icon name="warn" size={18} /></span> Reminders</h2>
            <div className="attention-list">
              {expiringCerts.map((p) => (
                <div key={`cert-${p.id}`} className="attention-item">
                  <span className="attention-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="learning" size={14} /> {p.title} expires {p.expiresOn}
                  </span>
                  <span className="attention-value">{daysFromNow(p.expiresOn)}d</span>
                </div>
              ))}
              {reviewsDueSoon.map(({ cycle, pending, daysLeft }) => (
                <div key={`cycle-${cycle.id}`} className="attention-item">
                  <span className="attention-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="performance" size={14} /> {cycle.title}: {pending} review(s) pending
                  </span>
                  <span className="attention-value">{daysLeft}d left</span>
                </div>
              ))}
              {expiringCerts.length === 0 && reviewsDueSoon.length === 0 ? (
                <div className="attention-empty" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={14} /> Nothing needs attention right now
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

{canEdit ? (
          <div className="panel">
            <h2 className="panel-title">Quick Actions</h2>
            <div className="quick-actions">
              <button className="quick-action" onClick={() => onNavigate && onNavigate('performance')}><Icon name="plus" size={16} /> Add Employee</button>
              <button className="quick-action" onClick={() => onNavigate && onNavigate('learning')}><Icon name="calendar" size={16} /> Schedule Training</button>
              <button className="quick-action" onClick={() => onNavigate && onNavigate('recognition')}><Icon name="recognition" size={16} /> Give Recognition</button>
              <button className="quick-action" onClick={() => onNavigate && onNavigate('aiCompetency')}><Icon name="ai" size={16} /> Run Gap Analysis</button>
            </div>
          </div>
        ) : null}

<div className="panel">
          <h2 className="panel-title"><span className="panel-title-icon"><Icon name="announcements" size={18} /></span> Announcements</h2>
          {sortedAnnouncements.length > 0 ? (
            <div className="dashboard-announcements">
              {sortedAnnouncements.slice(0, 4).map((ann) => (
                <div key={ann.id} className={`dashboard-announcement ${ann.pinned ? 'pinned' : ''}`}>
                  <div className="dashboard-announcement-head">
                    <span className="dashboard-announcement-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {ann.pinned ? <span className="status-badge good" style={{ fontSize: 10 }}>Pinned</span> : null}
                      {ann.title}
                    </span>
                    <span className="dashboard-announcement-date">{ann.date}</span>
                  </div>
                  <p className="dashboard-announcement-body">{ann.body}</p>
                  <span className="dashboard-announcement-meta">{ann.category} • {ann.author}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="attention-empty">No announcements yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Org Chart Module - employees grouped by department with reporting lines
function OrgChartModule({ employees }) {
  const depts = useMemo(() => {
    const map = {}
    employees.forEach((e) => {
      const d = e.department || 'Unassigned'
      if (!map[d]) map[d] = []
      map[d].push(e)
    })
    return Object.entries(map).map(([name, list]) => ({
      name,
      employees: [...list].sort((a, b) => b.performance - a.performance),
    }))
  }, [employees])

  const managerName = (emp) => {
    if (!emp.managerEmployeeId) return null
    const mgr = employees.find(e => e.id === emp.managerEmployeeId)
    return mgr ? mgr.name : null
  }

  return (
    <div className="module">
      <h1 className="page-title">Organization Chart</h1>
      <p className="page-subtitle">Department structure with reporting relationships</p>
      <div className="programs-grid">
        {depts.map((d) => (
          <div key={d.name} className="program-card">
            <h3 className="program-title">{d.name} ({d.employees.length})</h3>
            <div className="training-list">
              {d.employees.map((e) => (
                <div key={e.id} className="training-item">
                  <div className="training-info">
                    <span className="training-title">{e.name}</span>
                    <span className="training-meta">
                      {e.role}
                      {managerName(e) ? ` · Reports to: ${managerName(e)}` : ' · (No manager)'}
                    </span>
                  </div>
                  <span className="performer-score">{e.performance}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {depts.length === 0 ? <div className="attention-empty">No employees yet.</div> : null}
      </div>
    </div>
  )
}

// My Development Plan Module - self-service view of the gap engine's
// recommendations for the logged-in user, reusing the same analysis used in
// the Succession module's Development Plan modal.
function MyDevelopmentModule({ employees, accounts, userName, userEmail }) {
  const myAccount = (accounts || []).find(
    (a) => (a.email || '').toLowerCase() === (userEmail || '').toLowerCase() || (a.username || '').toLowerCase() === (userName || '').toLowerCase()
  )
  // Prefer the explicit link set in Accounts & Access; fall back to matching
  // by name for accounts created before the link field existed.
  const linkedEmp = myAccount && myAccount.employeeId != null
    ? employees.find((e) => e.id === myAccount.employeeId) || null
    : null
  const emp = linkedEmp || employees.find((e) => e.name === userName) || null
  const analysis = emp ? analyzeEmployee(emp) : null
  const gaps = analysis ? analysis.gaps.filter((g) => g.gap > 0) : []

  return (
    <div className="module">
      <h1 className="page-title">My Development Plan</h1>
      <p className="page-subtitle">Personalized growth recommendations based on your current profile</p>
      {!emp ? (
        <div className="attention-empty">
          No employee record is linked to your account yet. Ask an administrator to set a "Linked Employee" for your
          account in Accounts &amp; Access (creating one first in the Performance module, if you don't have one yet).
        </div>
      ) : (
        <>
          <div className="succession-overview">
            <div className="succession-stat">
              <span className="succession-stat-value">{analysis.overallScore}%</span>
              <span className="succession-stat-label">Overall Score</span>
            </div>
            <div className="succession-stat">
              <span className="succession-stat-value">{analysis.promotionReadiness}%</span>
              <span className="succession-stat-label">Promotion Readiness</span>
            </div>
          </div>
          <div className="training-needs-panel">
            <h2 className="panel-title">Growth Areas</h2>
            {gaps.length === 0 ? (
              <p style={{ color: 'var(--success)', fontWeight: 600 }}>No competency gaps — keep it up, and consider pursuing stretch assignments.</p>
            ) : (
              gaps.slice(0, 6).map((g) => (
                <div key={g.competencyId} className="dev-plan-item">
                  <div className="dev-plan-head">
                    <strong>{g.competencyName}</strong>
                    <span className="gap-pill high">{scoreLabel(g.currentLevel)} → {scoreLabel(g.requiredLevel)}</span>
                  </div>
                  {g.recommendation ? (
                    <>
                      <p className="dev-plan-why">{g.recommendation.why}</p>
                      <ul className="dev-plan-actions">
                        {g.recommendation.actions.slice(0, 3).map((a, i) => (
                          <li key={i}><strong>{a.kind}:</strong> {a.title}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Permissions Module (Admin) - editable view/edit matrix per module/role.
// NOTE: this persists the desired matrix to localStorage, but does not yet
// change actual enforcement — that still runs through rbac.js's hardcoded
// rules. Wiring this in for real requires editing rbac.js itself.
function PermissionsModule({ canEdit }) {
  const [overrides, setOverrides] = useState(() => {
    try {
      const raw = localStorage.getItem(PERMISSION_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [msg, setMsg] = useState('')
  const isAdmin = canEdit

  const toggle = (moduleId, kind, r) => {
    if (!isAdmin) return
    setOverrides((prev) => {
      const current = prev[moduleId] || { view: [], edit: [] }
      const list = current[kind] || []
      const nextList = list.includes(r) ? list.filter((x) => x !== r) : [...list, r]
      const nextAll = { ...prev, [moduleId]: { ...current, [kind]: nextList } }
      try { localStorage.setItem(PERMISSION_KEY, JSON.stringify(nextAll)) } catch {
        // ignore storage errors
      }
      return nextAll
    })
    setMsg('Saved.')
  }

  return (
    <div className="module">
      <h1 className="page-title">Permissions</h1>
      <p className="page-subtitle">Choose which roles can view or edit each module. Admin only.</p>
      {!isAdmin ? <p className="module-readonly-note">You have view-only access to this module.</p> : null}
      {msg ? <div className="account-msg success">{msg}</div> : null}
      <div className="performance-table-panel">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Module</th>
              {ALL_ROLES.map((r) => <th key={`v-${r}`}>{roleLabel(r)} View</th>)}
              {ALL_ROLES.map((r) => <th key={`e-${r}`}>{roleLabel(r)} Edit</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULE_IDS.map((m) => {
              const ov = overrides[m.id] || { view: [], edit: [] }
              return (
                <tr key={m.id}>
                  <td><strong>{m.label}</strong></td>
                  {ALL_ROLES.map((r) => (
                    <td key={`v-${m.id}-${r}`}>
                      <input type="checkbox" disabled={!isAdmin} checked={ov.view.includes(r)} onChange={() => toggle(m.id, 'view', r)} />
                    </td>
                  ))}
                  {ALL_ROLES.map((r) => (
                    <td key={`e-${m.id}-${r}`}>
                      <input type="checkbox" disabled={!isAdmin} checked={ov.edit.includes(r)} onChange={() => toggle(m.id, 'edit', r)} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="module-readonly-note">
        This matrix is saved locally. To make it actually enforce access instead of your current rbac.js rules, share rbac.js and it can be wired in for real.
      </p>
    </div>
  )
}

// Performance Reviews Module - HR/Admin manage review cycles and rate
// employees; every logged-in user can submit their own self-assessment.
function ReviewsModule({ reviewCycles, reviews, employees, canManage, userName, addReviewCycle, updateReviewCycleStatus, deleteReviewCycle, submitSelfAssessment, submitManagerReview }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCycle, setNewCycle] = useState({ title: '', periodStart: '', periodEnd: '' })
  const [openCycleId, setOpenCycleId] = useState(null)
  const [selfText, setSelfText] = useState('')
  const [ratingDrafts, setRatingDrafts] = useState({})
  const [msg, setMsg] = useState('')

  const handleAddCycle = (e) => {
    e.preventDefault()
    if (!canManage || !newCycle.title) return
    addReviewCycle(newCycle)
    setNewCycle({ title: '', periodStart: '', periodEnd: '' })
    setShowAddForm(false)
    setMsg('Review cycle created.')
  }

  const myReviewFor = (cycleId) => reviews.find((r) => r.cycleId === cycleId && r.employeeName === userName)

  const openCycle = reviewCycles.find((c) => c.id === openCycleId) || null
  const cycleReviews = openCycle ? reviews.filter((r) => r.cycleId === openCycle.id) : []

  return (
    <div className="module">
      <h1 className="page-title">Performance Reviews</h1>
      <p className="page-subtitle">Structured review cycles with self-assessment and manager ratings</p>

      {msg ? <div className="account-msg success">{msg}</div> : null}

      {canManage ? (
        <div className="form-section">
          <button className="btn-add" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : '+ New Review Cycle'}
          </button>
          {showAddForm && (
            <form className="data-form" onSubmit={handleAddCycle}>
              <input type="text" placeholder="Cycle title (e.g. H1 2026 Review)" value={newCycle.title} onChange={(e) => setNewCycle({ ...newCycle, title: e.target.value })} required />
              <input type="date" value={newCycle.periodStart} onChange={(e) => setNewCycle({ ...newCycle, periodStart: e.target.value })} />
              <input type="date" value={newCycle.periodEnd} onChange={(e) => setNewCycle({ ...newCycle, periodEnd: e.target.value })} />
              <button type="submit" className="btn-save">Create Cycle</button>
            </form>
          )}
        </div>
      ) : null}

      <div className="training-programs">
        <h2 className="panel-title">Review Cycles</h2>
        <div className="programs-grid">
          {reviewCycles.map((cycle) => {
            const mine = myReviewFor(cycle.id)
            const cycleAllReviews = reviews.filter((r) => r.cycleId === cycle.id)
            return (
              <div key={cycle.id} className="program-card">
                <div className="program-header">
                  <span className={`program-status ${cycle.status === 'open' ? 'upcoming' : 'completed'}`}>{cycle.status}</span>
                </div>
                <h3 className="program-title">{cycle.title}</h3>
                <div className="program-meta">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={13} /> {cycle.periodStart || '—'} → {cycle.periodEnd || '—'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="performance" size={13} /> {cycleAllReviews.length} submission(s)</span>
                </div>
                <div className="program-actions">
                  <button className="btn-view" onClick={() => { setOpenCycleId(cycle.id); setSelfText(mine ? mine.selfAssessment : '') }}>
                    {canManage ? 'Open' : mine ? 'View / Edit My Review' : 'Submit Self-Assessment'}
                  </button>
                  {canManage ? (
                    <>
                      <button className="btn-edit" onClick={() => updateReviewCycleStatus(cycle.id, cycle.status === 'open' ? 'closed' : 'open')}>
                        {cycle.status === 'open' ? 'Close Cycle' : 'Reopen'}
                      </button>
                      <button className="btn-delete" onClick={() => { if (confirm(`Delete cycle "${cycle.title}"?`)) deleteReviewCycle(cycle.id) }}>Delete</button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
          {reviewCycles.length === 0 ? <div className="attention-empty">No review cycles yet.</div> : null}
        </div>
      </div>

      {openCycle ? (
        <div className="modal-overlay" onClick={() => setOpenCycleId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{openCycle.title}</h3>
              <button className="modal-close" onClick={() => setOpenCycleId(null)} aria-label="Close">&times;</button>
            </div>
            <div className="modal-body">
              {!canManage ? (
                <>
                  <p className="profile-label">Your self-assessment</p>
                  <textarea
                    className="data-form"
                    style={{ width: '100%', minHeight: 100 }}
                    value={selfText}
                    onChange={(e) => setSelfText(e.target.value)}
                    placeholder="Summarize your accomplishments, challenges, and goals for this period..."
                  />
                  <button
                    className="btn-save"
                    style={{ marginTop: 10 }}
                    onClick={() => { submitSelfAssessment(openCycle.id, selfText); setMsg('Self-assessment submitted.'); setOpenCycleId(null) }}
                  >
                    Submit
                  </button>
                  {myReviewFor(openCycle.id)?.status === 'reviewed' ? (
                    <div className="dev-plan-item" style={{ marginTop: 14 }}>
                      <div className="dev-plan-head">
                        <strong>Manager Rating</strong>
                        <span className="gap-pill high">{myReviewFor(openCycle.id).managerRating}/5</span>
                      </div>
                      <p className="dev-plan-why">{myReviewFor(openCycle.id).managerComments}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Self-Assessment</th>
                      <th>Rating (1-5)</th>
                      <th>Comments</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleReviews.map((r) => {
                      const draft = ratingDrafts[r.id] || { rating: r.managerRating || 3, comments: r.managerComments || '' }
                      return (
                        <tr key={r.id}>
                          <td><strong>{r.employeeName}</strong></td>
                          <td style={{ maxWidth: 240 }}>{r.selfAssessment || <em>Not submitted</em>}</td>
                          <td>
                            <select
                              value={draft.rating}
                              onChange={(e) => setRatingDrafts((prev) => ({ ...prev, [r.id]: { ...draft, rating: Number(e.target.value) } }))}
                            >
                              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={draft.comments}
                              onChange={(e) => setRatingDrafts((prev) => ({ ...prev, [r.id]: { ...draft, comments: e.target.value } }))}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-save"
                              onClick={() => { submitManagerReview(r.id, draft.rating, draft.comments); setMsg(`Rated ${r.employeeName}.`) }}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {cycleReviews.length === 0 ? (
                      <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16 }}>No self-assessments submitted yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setOpenCycleId(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// My Team Module — direct + indirect reports with gap recommendations
function MyTeamModule({ team }) {
  const [openEmpId, setOpenEmpId] = useState(null)
  const openEmp = team.find(e => e.id === openEmpId) || null
  const openAnalysis = openEmp ? analyzeEmployee(openEmp) : null

  return (
    <div className="module">
      <h1 className="page-title">My Team</h1>
      <p className="page-subtitle">Employees who report to you, directly or indirectly</p>
      {team.length === 0 ? (
        <div className="attention-empty">
          No direct reports found. Make sure your employee record is linked to your account in
          Accounts &amp; Access, and that team members have your employee record set as their
          Manager in the Performance module.
        </div>
      ) : (
        <div className="programs-grid">
          {team.map((e) => {
            const analysis = analyzeEmployee(e)
            const topGap = analysis.gaps.filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap)[0] || null
            return (
              <div key={e.id} className="program-card">
                <h3 className="program-title">{e.name}</h3>
                <div className="program-meta">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="performance" size={13} /> {e.role}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="accounts" size={13} /> {e.department}</span>
                  {e.employmentStatus ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="checkCircle" size={13} /> {e.employmentStatus}</span> : null}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <div className="settings-metric">
                    <span className="settings-metric-value">{e.performance}%</span>
                    <span className="settings-metric-label">Performance</span>
                  </div>
                  <div className="settings-metric">
                    <span className="settings-metric-value">{e.competency}%</span>
                    <span className="settings-metric-label">Competency</span>
                  </div>
                  <div className="settings-metric">
                    <span className="settings-metric-value">{e.training}%</span>
                    <span className="settings-metric-label">Training</span>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`status-badge ${analysis.promotionReadiness >= 80 ? 'excellent' : analysis.promotionReadiness >= 60 ? 'good' : 'needs-improvement'}`}>
                    Promotion Readiness: {analysis.promotionReadiness}%
                  </span>
                </div>
                {topGap ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '6px 10px' }}>
                    Top gap: <strong>{topGap.competencyName}</strong> — {topGap.recommendation?.why || 'Development needed'}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#065f46', background: '#ecfdf5', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="checkCircle" size={13} /> No significant competency gaps
                  </div>
                )}
                {e.competencyNotes ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                    Note: {e.competencyNotes}
                  </div>
                ) : null}
                <button className="btn-view" style={{ marginTop: 10, width: '100%' }} onClick={() => setOpenEmpId(e.id)}>
                  View Development Plan
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Team member development plan modal */}
      {openEmp && openAnalysis && (
        <div className="modal-overlay" onClick={() => setOpenEmpId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Development Plan — {openEmp.name}</h3>
              <button className="modal-close" onClick={() => setOpenEmpId(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="profile-row"><span className="profile-label">Role</span><span className="profile-value">{openEmp.role}</span></div>
              <div className="profile-row"><span className="profile-label">Department</span><span className="profile-value">{openEmp.department}</span></div>
              {openEmp.qualifications ? <div className="profile-row"><span className="profile-label">Qualifications</span><span className="profile-value">{openEmp.qualifications}</span></div> : null}
              <div className="profile-row"><span className="profile-label">Employment Status</span><span className="profile-value">{openEmp.employmentStatus || '—'}</span></div>
              <div className="profile-row"><span className="profile-label">Date Hired</span><span className="profile-value">{openEmp.dateHired || '—'}</span></div>
              <div className="profile-row"><span className="profile-label">Overall Score</span><span className="profile-value">{openAnalysis.overallScore}%</span></div>
              <div className="profile-row"><span className="profile-label">Promotion Readiness</span><span className="profile-value">{openAnalysis.promotionReadiness}%</span></div>
              {openEmp.competencyNotes ? <div className="profile-row"><span className="profile-label">HR Notes</span><span className="profile-value" style={{ fontStyle: 'italic' }}>{openEmp.competencyNotes}</span></div> : null}
              <h4 style={{ marginTop: 14, marginBottom: 8 }}>Gap Analysis & Recommendations</h4>
              {openAnalysis.gaps.filter(g => g.gap > 0).length === 0 ? (
                <p style={{ color: 'var(--success)', fontWeight: 600 }}>No competency gaps — maintain current development &amp; pursue stretch assignments.</p>
              ) : openAnalysis.gaps.filter(g => g.gap > 0).slice(0, 5).map((g) => (
                <div key={g.competencyId} className="dev-plan-item">
                  <div className="dev-plan-head">
                    <strong>{g.competencyName}</strong>
                    <span className="gap-pill high">{scoreLabel(g.currentLevel)} → {scoreLabel(g.requiredLevel)}</span>
                  </div>
                  {g.recommendation ? (
                    <>
                      <p className="dev-plan-why">{g.recommendation.why}</p>
                      <ul className="dev-plan-actions">
                        {g.recommendation.actions.slice(0, 3).map((a, i) => (
                          <li key={i}><strong>{a.kind}:</strong> {a.title}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setOpenEmpId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Performance Module
function PerformanceModule({ employees, attendance, competencies, canEdit, defaultManagerId, addEmployee, updateEmployee, deleteEmployee, bulkDeleteEmployees, updateEmployeeProfile, addAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord }) {
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [profileEmp, setProfileEmp] = useState(null)
  const [profileDraft, setProfileDraft] = useState({})
  const [attEmpId, setAttEmpId] = useState(null)
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0])
  const [attStatus, setAttStatus] = useState('Present')
  const [attNotes, setAttNotes] = useState('')
  const [attMsg, setAttMsg] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('All')
  const [sortBy, setSortBy] = useState('performance')
  const [newEmp, setNewEmp] = useState({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80, managerEmployeeId: defaultManagerId || null, qualifications: '', employmentStatus: 'Regular', dateHired: '' })
  const [selectedIds, setSelectedIds] = useState([])

  const openProfile = (emp) => {
    setProfileEmp(emp)
    setProfileDraft({ qualifications: emp.qualifications || '', employmentStatus: emp.employmentStatus || 'Regular', dateHired: emp.dateHired || '' })
    setShowProfileModal(true)
  }

  const saveProfile = () => {
    if (!profileEmp) return
    updateEmployeeProfile(profileEmp.id, profileDraft)
    setShowProfileModal(false)
    setProfileEmp(null)
  }

  const openAttendance = (empId) => {
    setAttEmpId(empId)
    setAttDate(new Date().toISOString().split('T')[0])
    setAttStatus('Present')
    setAttNotes('')
    setAttMsg('')
    setShowAttendanceModal(true)
  }

  const submitAttendance = () => {
    if (!attEmpId || !attDate) return
    addAttendanceRecord({ employeeId: attEmpId, date: attDate, status: attStatus, notes: attNotes })
    setAttMsg('Attendance record saved.')
    setAttDate(new Date().toISOString().split('T')[0])
    setAttStatus('Present')
    setAttNotes('')
  }

  const STATUS_COLORS = { Present: '#22c55e', Absent: '#ef4444', Late: '#f59e0b', Leave: '#3b82f6' }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredEmployees.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredEmployees.map((e) => e.id))
    }
  }
  const handleBulkDelete = () => {
    if (!canEdit || selectedIds.length === 0) return
    if (confirm(`Delete ${selectedIds.length} selected employee(s)?`)) {
      bulkDeleteEmployees(selectedIds)
      setSelectedIds([])
      setSelectedEmployee(null)
    }
  }

  // Calculate department stats
  const deptStats = employees.reduce((acc, emp) => {
    if (!acc[emp.department]) {
      acc[emp.department] = { count: 0, totalPerf: 0, totalComp: 0 }
    }
    acc[emp.department].count++
    acc[emp.department].totalPerf += emp.performance
    acc[emp.department].totalComp += emp.competency
    return acc
  }, {})

  const handleAddEmployee = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newEmp.name && newEmp.role && newEmp.department) {
      addEmployee(newEmp)
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80, managerEmployeeId: defaultManagerId || null, qualifications: '', employmentStatus: 'Regular', dateHired: '' })
      setShowAddForm(false)
    }
  }


  const handleEditEmployee = () => {
    if (!canEdit) return
    if (selectedEmployee) {
      const emp = employees.find(e => e.id === selectedEmployee)
      if (emp) {
        setNewEmp({ ...emp })
        setShowEditForm(true)
      }
    }
  }


  const handleUpdateEmployee = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (selectedEmployee && newEmp.name) {
      updateEmployee(selectedEmployee, newEmp)
      setShowEditForm(false)
      setSelectedEmployee(null)
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80, managerEmployeeId: defaultManagerId || null, qualifications: '', employmentStatus: 'Regular', dateHired: '' })
    }
  }


  const handleDeleteEmployee = () => {
    if (!canEdit) return
    if (selectedEmployee && confirm('Are you sure you want to delete this employee?')) {
      deleteEmployee(selectedEmployee)
      setSelectedEmployee(null)
    }
  }


  // Filter and sort employees
  const filteredEmployees = [...employees]
    .filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     emp.department.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesDept = filterDepartment === 'All' || emp.department === filterDepartment
      return matchesSearch && matchesDept
    })
    .sort((a, b) => {
      if (sortBy === 'performance') return b.performance - a.performance
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'competency') return b.competency - a.competency
      return 0
    })

  const departments = [...new Set(employees.map(e => e.department))]

  // CSV Export
  const exportCSV = () => {
    const headers = ['Name', 'Role', 'Department', 'Performance', 'Competency', 'Training', 'Status']
    const rows = filteredEmployees.map(emp => [
      emp.name,
      emp.role,
      emp.department,
      emp.performance,
      emp.competency,
      emp.training,
      emp.performance >= 90 ? 'Excellent' : emp.performance >= 80 ? 'Good' : 'Needs Improvement',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ihims_performance_report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  // CSV Import
  const importFileRef = useRef(null)
  const [importMsg, setImportMsg] = useState('')

  const parseCSVLine = (line) => {
    const result = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
        } else {
          cur += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur)
    return result
  }

  const handleImportCSV = (file) => {
    if (!canEdit || !file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
        if (lines.length < 2) { setImportMsg('CSV has no data rows.'); return }
        const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
        const idx = {
          name: headers.indexOf('name'),
          role: headers.indexOf('role'),
          department: headers.indexOf('department'),
          performance: headers.indexOf('performance'),
          competency: headers.indexOf('competency'),
          training: headers.indexOf('training'),
        }
        if (idx.name === -1 || idx.role === -1 || idx.department === -1) {
          setImportMsg('CSV must include Name, Role, and Department columns.')
          return
        }
        let count = 0
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i])
          const name = (cols[idx.name] || '').trim()
          const role = (cols[idx.role] || '').trim()
          const department = (cols[idx.department] || '').trim()
          if (!name || !role || !department) continue
          const performance = idx.performance > -1 ? parseInt(cols[idx.performance], 10) || 80 : 80
          const competency = idx.competency > -1 ? parseInt(cols[idx.competency], 10) || 80 : 80
          const training = idx.training > -1 ? parseInt(cols[idx.training], 10) || 80 : 80
          addEmployee({ name, role, department, performance, competency, training })
          count++
        }
        setImportMsg(`Imported ${count} employee(s) from CSV.`)
      } catch {
        setImportMsg('Failed to parse CSV file. Please check the format and try again.')
      }
    }
    reader.readAsText(file)
  }

  // Training needs: employees with a competency gap or low training completion
  const trainingNeeds = filteredEmployees
    .filter(e => e.competency < e.performance || e.training < 85)
    .sort((a, b) => (a.competency - a.performance) - (b.competency - b.performance))
    .slice(0, 5)

  return (
    <div className="module" style={canEdit ? undefined : { filter: 'grayscale(0.15)' }}>
      <h1 className="page-title">Performance Management</h1>
      <p className="page-subtitle">Track and evaluate employee performance metrics</p>


      <div className="performance-content">
<div className="performance-stats">
          <div className="perf-stat">
            <div className="perf-stat-value"><AnimatedNumber value={employees.length} duration={800} /></div>
            <div className="perf-stat-label">Total Employees</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value"><AnimatedNumber value={Math.round(employees.reduce((s, e) => s + e.performance, 0) / employees.length)} suffix="%" /></div>
            <div className="perf-stat-label">Average Performance</div>
            <div className="perf-stat-bar">
              <div className="perf-stat-fill" style={{ width: `${employees.reduce((s, e) => s + e.performance, 0) / employees.length}%` }}></div>
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value"><AnimatedNumber value={employees.filter(e => e.performance >= 90).length} duration={800} /></div>
            <div className="perf-stat-label">Excellent Performers</div>
          </div>
        </div>

        {/* Department Analytics */}
        <div className="department-analytics">
          <h2 className="panel-title">Department Performance</h2>
          <div className="dept-charts">
            {Object.entries(deptStats).map(([dept, stats]) => (
              <div key={dept} className="dept-chart">
                <div className="dept-name">{dept}</div>
                <div className="dept-bar">
                  <div className="dept-fill" style={{ width: `${stats.totalPerf / stats.count}%` }}></div>
                </div>
                <div className="dept-value">{Math.round(stats.totalPerf / stats.count)}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-section">
<div className="form-section-header">
            {canEdit ? (
              <button className="btn-add" onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? 'Cancel' : '+ Add Employee'}
              </button>
            ) : (
              <p className="module-readonly-note">You have view-only access to this module.</p>
            )}
            <button className="btn-export" onClick={exportCSV}>
              <Icon name="download" size={16} /> Export CSV
            </button>
            {canEdit ? (
              <>
                <button className="btn-export" onClick={() => importFileRef.current && importFileRef.current.click()}>
                  <Icon name="download" size={16} /> Import CSV
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => { handleImportCSV(e.target.files[0]); e.target.value = '' }}
                />
              </>
            ) : null}
          </div>
          {importMsg ? <div className="account-msg success">{importMsg}</div> : null}


          {showAddForm && (
            <form className="data-form" onSubmit={handleAddEmployee}>
              <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input type="text" placeholder="Role" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} required />
              <input type="text" placeholder="Department" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})} required />
              <input type="number" placeholder="Performance" value={newEmp.performance} onChange={e => setNewEmp({...newEmp, performance: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Competency" value={newEmp.competency} onChange={e => setNewEmp({...newEmp, competency: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Training" value={newEmp.training} onChange={e => setNewEmp({...newEmp, training: parseInt(e.target.value)})} min="0" max="100" />
              <select value={newEmp.managerEmployeeId != null ? newEmp.managerEmployeeId : ''} onChange={e => setNewEmp({...newEmp, managerEmployeeId: e.target.value ? Number(e.target.value) : null})}>
                <option value="">— Manager / Supervisor (optional) —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="text" placeholder="Qualifications (e.g. MD, RN, PRC Lic. No.)" value={newEmp.qualifications || ''} onChange={e => setNewEmp({...newEmp, qualifications: e.target.value})} />
              <select value={newEmp.employmentStatus || 'Regular'} onChange={e => setNewEmp({...newEmp, employmentStatus: e.target.value})}>
                <option value="Regular">Regular</option>
                <option value="Probationary">Probationary</option>
                <option value="Contractual">Contractual</option>
                <option value="Part-time">Part-time</option>
              </select>
              <input type="date" placeholder="Date Hired" value={newEmp.dateHired || ''} onChange={e => setNewEmp({...newEmp, dateHired: e.target.value})} />
              <button type="submit" className="btn-save">Save Employee</button>
            </form>
          )}
        </div>

        {/* Search and Filter */}
        <div className="search-filter">
          <input type="text" placeholder="Search employees..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
          <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
            <option value="All">All Departments</option>
            {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="performance">Sort by Performance</option>
            <option value="name">Sort by Name</option>
            <option value="competency">Sort by Competency</option>
          </select>
        </div>

        {/* Edit Form */}
        {showEditForm && (
          <div className="edit-form">
            <h3>Edit Employee</h3>
            <form className="data-form" onSubmit={handleUpdateEmployee}>
              <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input type="text" placeholder="Role" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} required />
              <input type="text" placeholder="Department" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})} required />
              <input type="number" placeholder="Performance" value={newEmp.performance} onChange={e => setNewEmp({...newEmp, performance: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Competency" value={newEmp.competency} onChange={e => setNewEmp({...newEmp, competency: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Training" value={newEmp.training} onChange={e => setNewEmp({...newEmp, training: parseInt(e.target.value)})} min="0" max="100" />
              <select value={newEmp.managerEmployeeId != null ? newEmp.managerEmployeeId : ''} onChange={e => setNewEmp({...newEmp, managerEmployeeId: e.target.value ? Number(e.target.value) : null})}>
                <option value="">— Manager / Supervisor (optional) —</option>
                {employees.filter(e => e.id !== selectedEmployee).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="text" placeholder="Qualifications (e.g. MD, RN, PRC Lic. No.)" value={newEmp.qualifications || ''} onChange={e => setNewEmp({...newEmp, qualifications: e.target.value})} />
              <select value={newEmp.employmentStatus || 'Regular'} onChange={e => setNewEmp({...newEmp, employmentStatus: e.target.value})}>
                <option value="Regular">Regular</option>
                <option value="Probationary">Probationary</option>
                <option value="Contractual">Contractual</option>
                <option value="Part-time">Part-time</option>
              </select>
              <input type="date" placeholder="Date Hired" value={newEmp.dateHired || ''} onChange={e => setNewEmp({...newEmp, dateHired: e.target.value})} />
              <div className="form-buttons">
                <button type="submit" className="btn-save">Update</button>
                <button type="button" className="btn-cancel" onClick={() => { setShowEditForm(false); setSelectedEmployee(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

{trainingNeeds.length > 0 ? (
          <div className="training-needs-panel">
            <h2 className="panel-title"><span className="panel-title-icon"><Icon name="learning" size={18} /></span> Recommended Training Needs</h2>
            <p className="training-needs-subtitle">Employees with a competency gap or low training completion</p>
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Performance</th>
                  <th>Competency</th>
                  <th>Training</th>
                  <th>Gap</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {trainingNeeds.map(emp => {
                  const gap = emp.competency - emp.performance
                  return (
                    <tr key={emp.id}>
                      <td><strong>{emp.name}</strong></td>
                      <td>{emp.performance}%</td>
                      <td>{emp.competency}%</td>
                      <td>{emp.training}%</td>
                      <td>
                        <span className={gap < 0 ? 'gap-negative' : 'gap-positive'}>
                          {gap > 0 ? '+' : ''}{gap}%
                        </span>
                      </td>
                      <td>
                        {emp.training < 85
                          ? 'Enroll in role-specific certification'
                          : 'Focused competency development plan'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

<div className="performance-table-panel">
          <div className="table-panel-head">
            <h2 className="panel-title">Employee Performance ({filteredEmployees.length})</h2>
            {canEdit && selectedIds.length > 0 ? (
              <button className="btn-delete" onClick={handleBulkDelete}>
                <Icon name="trash" size={16} /> Delete Selected ({selectedIds.length})
              </button>
            ) : null}
          </div>

          <table className="performance-table">
            <thead>
              <tr>
                {canEdit ? (
                  <th className="checkbox-cell">
                    <input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredEmployees.length && filteredEmployees.length > 0} />
                  </th>
                ) : null}
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Performance</th>
                <th>Competency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const manager = employees.find(e => e.id === emp.managerEmployeeId)
                return (
                <tr key={emp.id} onClick={() => setSelectedEmployee(emp.id)} className={`${selectedEmployee === emp.id ? 'selected' : ''} ${selectedIds.includes(emp.id) ? 'row-selected' : ''}`}>
                  {canEdit ? (
                    <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                      />
                    </td>
                  ) : null}
                  <td>{emp.name}</td>
                  <td>{emp.role}</td>
                  <td>{emp.department}</td>
                  <td>{manager ? manager.name : <span className="readonly-cell">—</span>}</td>
                  <td>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${emp.performance}%`, backgroundColor: emp.performance >= 90 ? '#22c55e' : emp.performance >= 80 ? '#3b82f6' : '#f59e0b' }}></div>
                      <span className="score-text">{emp.performance}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${emp.competency}%`, backgroundColor: '#8b5cf6' }}></div>
                      <span className="score-text">{emp.competency}%</span>
                    </div>
                  </td>
<td><span className={`status-badge ${emp.performance >= 90 ? 'excellent' : emp.performance >= 80 ? 'good' : 'needs-improvement'}`}>{emp.performance >= 90 ? 'Excellent' : emp.performance >= 80 ? 'Good' : 'Needs Improvement'}</span></td>
                  <td>
                    {canEdit ? (
                      <div className="action-buttons">
                        <button className="btn-edit" onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleEditEmployee() }}>Edit</button>
                        <button className="btn-view" onClick={(e) => { e.stopPropagation(); openProfile(emp) }}>Profile</button>
                        <button className="btn-development" onClick={(e) => { e.stopPropagation(); openAttendance(emp.id) }}>Attendance</button>
                        <button className="btn-delete" onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleDeleteEmployee() }}>Delete</button>
                      </div>
                    ) : (
                      <span className="readonly-cell">View only</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile Modal — qualifications & employment info */}
      {showProfileModal && profileEmp && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Employee Profile — {profileEmp.name}</h3>
              <button className="modal-close" onClick={() => setShowProfileModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="profile-row"><span className="profile-label">Role</span><span className="profile-value">{profileEmp.role}</span></div>
              <div className="profile-row"><span className="profile-label">Department</span><span className="profile-value">{profileEmp.department}</span></div>
              <div className="profile-row">
                <span className="profile-label">Qualifications</span>
                <textarea
                  value={profileDraft.qualifications || ''}
                  onChange={(e) => setProfileDraft({ ...profileDraft, qualifications: e.target.value })}
                  placeholder="e.g. MD, RN, PRC Lic. No. 0012345, Board Certified"
                  rows={2}
                  style={{ width: '100%', resize: 'vertical', padding: 6, borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }}
                />
              </div>
              <div className="profile-row">
                <span className="profile-label">Employment Status</span>
                <select value={profileDraft.employmentStatus || 'Regular'} onChange={(e) => setProfileDraft({ ...profileDraft, employmentStatus: e.target.value })} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }}>
                  <option value="Regular">Regular</option>
                  <option value="Probationary">Probationary</option>
                  <option value="Contractual">Contractual</option>
                  <option value="Part-time">Part-time</option>
                </select>
              </div>
              <div className="profile-row">
                <span className="profile-label">Date Hired</span>
                <input type="date" value={profileDraft.dateHired || ''} onChange={(e) => setProfileDraft({ ...profileDraft, dateHired: e.target.value })} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowProfileModal(false)}>Cancel</button>
              <button className="btn-save" onClick={saveProfile}>Save Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {showAttendanceModal && (
        <div className="modal-overlay" onClick={() => setShowAttendanceModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Attendance — {employees.find(e => e.id === attEmpId)?.name || '—'}</h3>
              <button className="modal-close" onClick={() => setShowAttendanceModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {attMsg ? <div className="account-msg success">{attMsg}</div> : null}
              <div className="data-form" style={{ marginBottom: 16 }}>
                <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
                <select value={attStatus} onChange={(e) => setAttStatus(e.target.value)}>
                  {['Present', 'Absent', 'Late', 'Leave'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" placeholder="Notes (optional)" value={attNotes} onChange={(e) => setAttNotes(e.target.value)} />
                <button className="btn-save" onClick={submitAttendance}>Log Record</button>
              </div>
              <h4 style={{ marginBottom: 8 }}>History</h4>
              <table className="sessions-table">
                <thead><tr><th>Date</th><th>Status</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {attendance.filter(r => r.employeeId === attEmpId).sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td><span style={{ color: STATUS_COLORS[r.status] || '#333', fontWeight: 600 }}>{r.status}</span></td>
                      <td>{r.notes || '—'}</td>
                      <td><button className="btn-delete" onClick={() => deleteAttendanceRecord(r.id)}>×</button></td>
                    </tr>
                  ))}
                  {attendance.filter(r => r.employeeId === attEmpId).length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: 12 }}>No records yet.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: 14 }}>
                <strong>Summary: </strong>
                {['Present', 'Absent', 'Late', 'Leave'].map(s => {
                  const count = attendance.filter(r => r.employeeId === attEmpId && r.status === s).length
                  return <span key={s} style={{ marginRight: 12, color: STATUS_COLORS[s] }}>{s}: {count}</span>
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowAttendanceModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Competency Module
function CompetencyModule({ competencies, canEdit, employees, addCompetency, updateCompetency, deleteCompetency, updateCompetencyNotes }) {
  // Dynamic color based on percentage value
  const compColor = (val) => {
    if (val >= 85) return '#22c55e' // green
    if (val >= 70) return '#3b82f6' // blue
    if (val >= 55) return '#f59e0b' // amber
    return '#ef4444' // red
  }

  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [newComp, setNewComp] = useState({ name: '', description: '', category: 'Technical Skills', weight: 20 })

  const resetForm = () => {
    setNewComp({ name: '', description: '', category: 'Technical Skills', weight: 20 })
    setShowAddForm(false)
    setShowEditForm(false)
    setEditId(null)
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (!newComp.name || !newComp.description) {
      setErr('Name and description are required.')
      return
    }
    try {
      addCompetency(newComp)
      setMsg(`Competency "${newComp.name}" added.`)
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to add competency')
    }
  }

  const startEdit = (comp) => {
    setEditId(comp.id)
    setNewComp({ name: comp.name, description: comp.description, category: comp.category, weight: comp.weight })
    setShowEditForm(true)
    setShowAddForm(false)
    setMsg('')
    setErr('')
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!canEdit) return
    try {
      updateCompetency(editId, newComp)
      setMsg('Competency updated.')
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to update competency')
    }
  }

  const handleDelete = (comp) => {
    if (!canEdit) return
    if (confirm(`Delete competency "${comp.name}"?`)) {
      try {
        deleteCompetency(comp.id)
        setMsg(`Competency "${comp.name}" deleted.`)
      } catch (ex) {
        setErr(ex.message || 'Failed to delete competency')
      }
    }
  }

  // Form categories for user-defined competencies (kept for the add/edit form).
  const categoryNames = ['Technical Skills', 'Soft Skills', 'Leadership', 'Regulatory Compliance']

  // Real per-category competency averages derived from the framework's 15
  // competencies. Each employee's levels (1-5) are estimated from their live
  // performance / competency / training scores, then averaged per category.
  const categoryStats = useMemo(() => {
    const map = {}
    COMPETENCIES.forEach((c) => {
      if (!map[c.category]) map[c.category] = { total: 0, count: 0 }
    })
    employees.forEach((emp) => {
      const levels = estimateEmployeeCompetencies(emp)
      COMPETENCIES.forEach((c) => {
        map[c.category].total += levels[c.id] || 0
        map[c.category].count += 1
      })
    })
    return Object.entries(map).map(([name, v]) => ({
      name,
      value: v.count ? Math.round((v.total / v.count / 5) * 100) : 0,
    }))
  }, [employees])

  // Gap visualization: employees whose competency is below their performance
  const gaps = employees
    .filter((e) => e.competency < e.performance)
    .map((e) => ({ name: e.name, gap: e.performance - e.competency, performance: e.performance, competency: e.competency }))
    .sort((a, b) => b.gap - a.gap)

  // Live per-department competency averages derived from each employee's
  // estimated levels, so the assessment table reflects real data.
  const deptAssessment = useMemo(() => {
    const depts = {}
    employees.forEach((emp) => {
      const d = emp.department || 'Unknown'
      if (!depts[d]) depts[d] = []
      depts[d].push(estimateEmployeeCompetencies(emp))
    })
    return Object.entries(depts).map(([name, levelsArr]) => {
      const avg = (compId) => {
        const sum = levelsArr.reduce((s, l) => s + (l[compId] || 0), 0)
        return Math.round((sum / levelsArr.length / 5) * 100)
      }
      const keys = Object.keys(levelsArr[0])
      const overallSum = levelsArr.reduce(
        (s, l) => s + keys.reduce((a, b) => a + (l[b] || 0), 0) / keys.length,
        0
      )
      return {
        name,
        clinical: avg('clinicalSkills'),
        communication: avg('communication'),
        leadership: avg('leadership'),
        technical: avg('technicalSkills'),
        compliance: avg('compliance'),
        overall: Math.round((overallSum / levelsArr.length / 5) * 100),
      }
    })
  }, [employees])

  return (
    <div className="module">
      <h1 className="page-title">Competency Management</h1>
      <p className="page-subtitle">Define and assess core competencies for all roles</p>

      {msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      <div className="competency-content">
        <div className="competency-categories">
          {categoryStats.map((cat) => {
            const color = compColor(cat.value)
            return (
              <div key={cat.name} className="comp-category">
                <h3>{cat.name}</h3>
                <div className="comp-progress">
                  <div className="comp-progress-bar">
                    <div className="comp-progress-fill" style={{ width: `${cat.value}%`, background: color }}></div>
                  </div>
                  <span className="comp-progress-text" style={{ color }}>{cat.value}%</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="form-section">
          <div className="form-section-header">
            {canEdit ? (
              <button className="btn-add" onClick={() => { setShowAddForm(!showAddForm); setShowEditForm(false); setMsg(''); setErr('') }}>
                {showAddForm ? 'Cancel' : '+ Add Competency'}
              </button>
            ) : (
              <p className="module-readonly-note">You have view-only access to this module.</p>
            )}
          </div>
          {showAddForm && (
            <form className="data-form" onSubmit={handleAdd}>
              <input type="text" placeholder="Competency name" value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} required />
              <input type="text" placeholder="Description" value={newComp.description} onChange={(e) => setNewComp({ ...newComp, description: e.target.value })} required />
              <select value={newComp.category} onChange={(e) => setNewComp({ ...newComp, category: e.target.value })}>
                {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Weight (%)" value={newComp.weight} onChange={(e) => setNewComp({ ...newComp, weight: parseInt(e.target.value) || 0 })} min="0" max="100" />
              <button type="submit" className="btn-save">Save Competency</button>
            </form>
          )}
        </div>

        {showEditForm && (
          <div className="edit-form">
            <h3>Edit Competency</h3>
            <form className="data-form" onSubmit={handleUpdate}>
              <input type="text" placeholder="Competency name" value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} required />
              <input type="text" placeholder="Description" value={newComp.description} onChange={(e) => setNewComp({ ...newComp, description: e.target.value })} required />
              <select value={newComp.category} onChange={(e) => setNewComp({ ...newComp, category: e.target.value })}>
                {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Weight (%)" value={newComp.weight} onChange={(e) => setNewComp({ ...newComp, weight: parseInt(e.target.value) || 0 })} min="0" max="100" />
              <div className="form-buttons">
                <button type="submit" className="btn-save">Update</button>
                <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="competency-framework">
          <h2 className="panel-title">Competency Framework</h2>
          <div className="competency-grid">
            {competencies.map(comp => (
              <div key={comp.id} className="competency-card">
                <h3 className="competency-name">{comp.name}</h3>
                <p className="competency-desc">{comp.description}</p>
                <div className="competency-meta">
                  <span className="comp-category-tag">{comp.category}</span>
                  <span className="comp-weight">Weight: {comp.weight}%</span>
                </div>
                {canEdit ? (
                  <div className="action-buttons" style={{ marginTop: 10 }}>
                    <button className="btn-edit" onClick={() => startEdit(comp)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(comp)}>Delete</button>
                  </div>
                ) : null}
              </div>
            ))}
            {competencies.length === 0 ? <div className="attention-empty">No competencies defined yet.</div> : null}
          </div>
        </div>

        {gaps.length > 0 ? (
          <div className="training-needs-panel">
            <h2 className="panel-title"><span className="panel-title-icon"><Icon name="warn" size={18} /></span> Competency Gaps</h2>
            <p className="training-needs-subtitle">Employees whose competency score is below their performance score</p>
            <div className="gap-visual">
              {gaps.slice(0, 6).map((g) => (
                <div key={g.name} className="gap-row">
                  <span className="gap-name">{g.name}</span>
                  <div className="gap-bars">
                    <div className="gap-bar perf">
                      <span className="gap-bar-label">Perf {g.performance}%</span>
                      <div className="gap-bar-fill" style={{ width: `${g.performance}%`, background: '#3b82f6' }}></div>
                    </div>
                    <div className="gap-bar comp">
                      <span className="gap-bar-label">Comp {g.competency}%</span>
                      <div className="gap-bar-fill" style={{ width: `${g.competency}%`, background: '#f59e0b' }}></div>
                    </div>
                  </div>
                  <span className="gap-delta">-{g.gap}pts</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="competency-assessment">
          <h2 className="panel-title">Competency Heatmap by Department</h2>
          <p className="training-needs-subtitle">Darker green means stronger; amber/red flag departments that need attention</p>
          <table className="assessment-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Clinical Skills</th>
                <th>Communication</th>
                <th>Leadership</th>
                <th>Technical</th>
                <th>Compliance</th>
                <th>Overall</th>
              </tr>
            </thead>
            <tbody>
              {deptAssessment.map((d) => {
                const heatCell = (val) => ({
                  background: compColor(val),
                  color: '#fff',
                  fontWeight: 600,
                  textAlign: 'center',
                })
                return (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td style={heatCell(d.clinical)}>{d.clinical}%</td>
                    <td style={heatCell(d.communication)}>{d.communication}%</td>
                    <td style={heatCell(d.leadership)}>{d.leadership}%</td>
                    <td style={heatCell(d.technical)}>{d.technical}%</td>
                    <td style={heatCell(d.compliance)}>{d.compliance}%</td>
                    <td style={heatCell(d.overall)}><strong>{d.overall}%</strong></td>
                  </tr>
                )
              })}
              {deptAssessment.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 16 }}>No employee data available.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Qualitative Competency Notes per employee */}
        <div className="training-needs-panel">
          <h2 className="panel-title"><span className="panel-title-icon"><Icon name="competency" size={18} /></span> Qualitative Competency Notes</h2>
          <p className="training-needs-subtitle">HR observations alongside numeric scores — required by RA 10173 for balanced assessment</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {employees.map((emp) => (
              <div key={emp.id} style={{ background: 'var(--surface, #f9fafb)', borderRadius: 8, padding: 12, border: '1px solid var(--border, #e5e7eb)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{emp.name}</strong>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{emp.role} · {emp.department} · Competency: {emp.competency}%</span>
                </div>
                <textarea
                  disabled={!canEdit}
                  rows={2}
                  placeholder="Add qualitative observations, behavioural notes, or context for this employee's competency scores…"
                  value={emp.competencyNotes || ''}
                  onChange={(e) => updateCompetencyNotes(emp.id, e.target.value)}
                  style={{ width: '100%', resize: 'vertical', padding: 8, borderRadius: 6, border: '1px solid var(--border, #e5e7eb)', fontSize: 13, opacity: canEdit ? 1 : 0.7 }}
                />
              </div>
            ))}
            {employees.length === 0 && <div className="attention-empty">No employees yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
function LearningModule({ trainingPrograms, competencies, employees, registrations, addTraining, updateTraining, deleteTraining, registerTraining, markTrainingCompletedForEmployee, canEdit, role, roles, userName }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProg, setNewProg] = useState({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming', instructor: '', cost: 0, seats: 0, date: '', time: '', location: '', expiresOn: '', competencyIds: [] })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [feedbackModal, setFeedbackModal] = useState(null) // { programId, employeeId, emp, program }
  const [feedbackScore, setFeedbackScore] = useState(null)
  const [editingProg, setEditingProg] = useState(null) // program object being edited, or null
  const [editErr, setEditErr] = useState('')

  const openEdit = (prog) => {
    setEditingProg({ ...prog, competencyIds: prog.competencyIds || [] })
    setEditErr('')
  }

  const saveEdit = () => {
    if (!editingProg.title.trim()) { setEditErr('Program title is required.'); return }
    if (!editingProg.date) { setEditErr('Session date is required — without it, countdown and calendar export cannot work.'); return }
    if (!editingProg.seats || editingProg.seats < 1) { setEditErr('Seat capacity is required.'); return }
    if (editingProg.seats < (editingProg.participants || 0)) { setEditErr(`Seat capacity can't be less than current registrations (${editingProg.participants}).`); return }
    updateTraining(editingProg.id, editingProg)
    setMsg(`"${editingProg.title}" updated.`)
    setEditingProg(null)
  }

  const handleAddTraining = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (!newProg.title.trim()) {
      setErr('Program title is required.')
      return
    }
    if (!newProg.date) {
      setErr('Session date is required — without it, countdown and calendar export cannot work.')
      return
    }
    if (!newProg.seats || newProg.seats < 1) {
      setErr('Seat capacity is required — enter how many people the session can hold.')
      return
    }
    setErr('')
    addTraining({ ...newProg, competencyIds: newProg.competencyIds || [] })
    setMsg(`Training program "${newProg.title}" created.`)
    setNewProg({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming', instructor: '', cost: 0, seats: 0, date: '', time: '', location: '', expiresOn: '', competencyIds: [] })
    setShowAddForm(false)
  }

  const toggleCompetencyLink = (compId) => {
    setNewProg((prev) => {
      const ids = prev.competencyIds || []
      return { ...prev, competencyIds: ids.includes(compId) ? ids.filter(x => x !== compId) : [...ids, compId] }
    })
  }

  const openFeedback = (prog, emp) => {
    setFeedbackModal({ programId: prog.id, employeeId: emp.id, emp, program: prog })
    setFeedbackScore(emp.competency)
  }

  const submitFeedback = () => {
    if (!feedbackModal) return
    markTrainingCompletedForEmployee(feedbackModal.employeeId, feedbackModal.programId, feedbackScore)
    setMsg(`${feedbackModal.emp.name}'s training score updated. Competency score set to ${feedbackScore}%.`)
    setFeedbackModal(null)
  }

  // Simple client-side .ics generator for "Add to calendar" on a registration.
  const buildICS = (prog) => {
    const dt = (prog.date || '').replace(/-/g, '')
    const uid = `${prog.id}-${Date.now()}@ihims.local`
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${prog.title}`,
      dt ? `DTSTART:${dt}T090000` : '', dt ? `DTEND:${dt}T170000` : '',
      prog.location ? `LOCATION:${prog.location}` : '', 'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean)
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${prog.title.replace(/\s+/g, '_')}.ics`
    link.click()
    URL.revokeObjectURL(url)
  }

  const daysUntil = (dateStr) => {
    if (!dateStr) return null
    const target = new Date(dateStr)
    if (isNaN(target.getTime())) return null
    const now = new Date()
    return Math.ceil((target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
  }

  const handleRegister = (programId) => {
    if (!canEdit) return
    try {
      registerTraining(programId)
      setMsg('You have been registered for this program.')
      setErr('')
    } catch (e) {
      setErr(e.message || 'Registration failed')
      setMsg('')
    }
  }

  const handleDelete = (programId) => {
    if (!canEdit) return
    if (confirm('Delete this training program?')) {
      deleteTraining(programId)
      setMsg('Training program deleted.')
      setErr('')
    }
  }

  const myRegistrations = registrations.filter((r) => r.userId === userName || r.userId === role)
  const registeredIds = new Set(registrations.filter((r) => r.userId === userName || r.userId === role).map((r) => r.programId))

  // Only admin / HR can create or delete programs. Staff can only register.
  const canManage = (roles || []).includes('admin') || (roles || []).includes('hr')

  // Real upcoming sessions, drawn from the same trainingPrograms data as the
  // grid above (sorted soonest-first) — replaces the old hardcoded rows so
  // the Register button here works just like the one on the program cards.
  const upcomingSessions = [...trainingPrograms]
    .filter((p) => p.status === 'upcoming')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  return (
    <div className="module">
      <h1 className="page-title">Learning & Training</h1>
      <p className="page-subtitle">Manage training programs and professional development</p>

      {canManage ? (
        <div className="form-section">
          {canManage ? (
            <button className="btn-add" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : '+ Add Training Program'}
            </button>
          ) : (
            <p className="module-readonly-note">You have view-only access to this module.</p>
          )}
          {err ? <div className="account-msg error" style={{ marginTop: 12 }}>{err}</div> : null}

{showAddForm && (
          <form className="data-form" onSubmit={handleAddTraining}>
            <input type="text" placeholder="Program Title" value={newProg.title} onChange={e => setNewProg({...newProg, title: e.target.value})} required />
            <select value={newProg.type} onChange={e => setNewProg({...newProg, type: e.target.value})}>
              <option value="Workshop">Workshop</option>
              <option value="Certification">Certification</option>
              <option value="Seminar">Seminar</option>
              <option value="Course">Course</option>
            </select>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #475569)' }}>Session Date *</span>
              <input type="date" value={newProg.date} onChange={e => setNewProg({...newProg, date: e.target.value})} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #475569)' }}>Seat Capacity *</span>
              <input type="number" placeholder="e.g. 20" min="1" value={newProg.seats || ''} onChange={e => setNewProg({...newProg, seats: parseInt(e.target.value) || 0})} required />
            </label>
            <input type="text" placeholder="Duration" value={newProg.duration} onChange={e => setNewProg({...newProg, duration: e.target.value})} />
            <input type="text" placeholder="Instructor" value={newProg.instructor} onChange={e => setNewProg({...newProg, instructor: e.target.value})} />
            <input type="number" placeholder="Cost ($)" value={newProg.cost} onChange={e => setNewProg({...newProg, cost: parseInt(e.target.value) || 0})} />
            <input type="text" placeholder="Time" value={newProg.time} onChange={e => setNewProg({...newProg, time: e.target.value})} />
            <input type="text" placeholder="Location" value={newProg.location} onChange={e => setNewProg({...newProg, location: e.target.value})} />
            {newProg.type === 'Certification' ? (
              <label className="login-field" style={{ display: 'block' }}>
                <span>Certification expires on (optional)</span>
                <input type="date" value={newProg.expiresOn} onChange={e => setNewProg({...newProg, expiresOn: e.target.value})} />
              </label>
            ) : null}
            <select value={newProg.status} onChange={e => setNewProg({...newProg, status: e.target.value})}>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 13 }}>Linked Competency Areas (addresses which gaps?)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {competencies.map((c) => (
                  <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={(newProg.competencyIds || []).includes(c.id)} onChange={() => toggleCompetencyLink(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-save">Save Program</button>
          </form>
        )}
        </div>
      ) : (
        <p className="module-readonly-note">You have view-only access to this module. You can still register for training programs.</p>
      )}

<div className="learning-stats">
        <div className="learning-stat">
          <span className="learning-stat-icon"><Icon name="learning" size={26} /></span>
          <div className="learning-stat-content">
            <span className="learning-stat-value"><AnimatedNumber value={trainingPrograms.length} duration={800} /></span>
            <span className="learning-stat-label">Active Programs</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon"><Icon name="accounts" size={26} /></span>
          <div className="learning-stat-content">
            <span className="learning-stat-value"><AnimatedNumber value={398} duration={900} /></span>
            <span className="learning-stat-label">Total Participants</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon"><Icon name="medal" size={26} /></span>
          <div className="learning-stat-content">
            <span className="learning-stat-value"><AnimatedNumber value={156} duration={900} /></span>
            <span className="learning-stat-label">Certifications Earned</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon"><Icon name="audit" size={26} /></span>
          <div className="learning-stat-content">
            <span className="learning-stat-value"><AnimatedNumber value={1240} duration={900} /></span>
            <span className="learning-stat-label">Training Hours</span>
          </div>
        </div>
      </div>


{msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      <div className="training-programs">
        <h2 className="panel-title">Training Programs</h2>
        <div className="programs-grid">
          {trainingPrograms.map(prog => (
            <div key={prog.id} className="program-card">
              <div className="program-header">
                <span className={`program-status ${prog.status}`}>{prog.status}</span>
                <span className="program-type">{prog.type}</span>
              </div>
              <h3 className="program-title">{prog.title}</h3>
              <div className="program-meta">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={13} /> {prog.date || prog.duration}</span>
                {prog.instructor ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={13} /> {prog.instructor}</span> : null}
                {prog.location ? <span>Venue: {prog.location}</span> : null}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="accounts" size={13} /> {prog.participants}{prog.seats ? ` / ${prog.seats}` : ''}</span>
                {prog.cost ? <span>${prog.cost}</span> : null}
              </div>
              {(prog.competencyIds || []).length > 0 ? (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(prog.competencyIds || []).map((cid) => {
                    const comp = competencies.find(c => c.id === cid)
                    return comp ? <span key={cid} className="comp-category-tag" style={{ fontSize: 11 }}>🎯 {comp.name}</span> : null
                  })}
                </div>
              ) : null}
              <div className="program-progress">
                <div className="program-progress-bar">
                  <div className="program-progress-fill" style={{ width: prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%' }}></div>
                </div>
                <span className="program-progress-text">{prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%'}</span>
              </div>
              <div className="program-actions">
                {(() => {
                  const isFull = prog.seats > 0 && (prog.participants || 0) >= prog.seats
                  if (canEdit && prog.status !== 'completed' && !registeredIds.has(prog.id)) {
                    return isFull
                      ? <span className="status-badge needs-improvement">Full — 0 seats left</span>
                      : <button className="btn-register" onClick={() => handleRegister(prog.id)}>Register</button>
                  }
                  return null
                })()}
                {registeredIds.has(prog.id) ? <span className="registered-badge">✓ Registered</span> : null}
                {canManage && (prog.status === 'ongoing' || prog.status === 'completed') ? (
                  <button className="btn-development" onClick={() => {
                    const emp = employees[0]
                    if (emp) openFeedback(prog, emp)
                  }} title="Mark complete for an employee and update their scores">
                    ✓ Complete for Employee
                  </button>
                ) : null}
                {canEdit && canManage ? (
                  <>
                    <button className="btn-edit" onClick={() => openEdit(prog)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(prog.id)}>Delete</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {myRegistrations.length > 0 ? (
        <div className="my-registrations">
          <h2 className="panel-title">My Registrations ({myRegistrations.length})</h2>
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Registered On</th>
                <th>Session Date</th>
                <th>Countdown</th>
                <th>Calendar</th>
              </tr>
            </thead>
            <tbody>
              {myRegistrations.map(r => {
                const prog = trainingPrograms.find((p) => p.id === r.programId)
                const d = prog ? daysUntil(prog.date) : null
                return (
                  <tr key={r.id}>
                    <td>{r.programTitle}</td>
                    <td>{new Date(r.registeredOn).toLocaleString()}</td>
                    <td>{prog?.date || '—'}</td>
                    <td>{d === null ? '—' : d < 0 ? 'Past' : d === 0 ? 'Today' : `${d}d`}</td>
                    <td>
                      {prog && prog.date ? (
                        <button className="btn-export" onClick={() => buildICS(prog)}>
                          <Icon name="download" size={14} /> .ics
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="upcoming-training">
        <h2 className="panel-title">Upcoming Sessions</h2>
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Program</th>
              <th>Date</th>
              <th>Time</th>
              <th>Location</th>
              <th>Seats Available</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {upcomingSessions.map((prog) => {
              const isFull = prog.seats > 0 && (prog.participants || 0) >= prog.seats
              const seatsAvailable = prog.seats ? `${prog.participants} / ${prog.seats}` : `${prog.participants}`
              const isRegistered = registeredIds.has(prog.id)
              return (
                <tr key={prog.id}>
                  <td>{prog.title}</td>
                  <td>{prog.date || '—'}</td>
                  <td>{prog.time || '—'}</td>
                  <td>{prog.location || '—'}</td>
                  <td>
                    {seatsAvailable}
                    {isFull ? <span className="status-badge needs-improvement" style={{ marginLeft: 8 }}>Full</span> : null}
                  </td>
                  <td>
                    {isRegistered ? (
                      <span className="registered-badge">✓ Registered</span>
                    ) : (
                      <button
                        className="btn-register"
                        onClick={() => handleRegister(prog.id)}
                        disabled={!canEdit || isFull}
                        title={isFull ? 'This program is at full capacity' : undefined}
                      >
                        {isFull ? 'Full' : 'Register'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {upcomingSessions.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 16 }}>No upcoming sessions scheduled.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Edit Training Program Modal */}
      {editingProg && (
        <div className="modal-overlay" onClick={() => setEditingProg(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Training Program</h3>
              <button className="modal-close" onClick={() => setEditingProg(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {editErr ? <div className="account-msg error">{editErr}</div> : null}
              <div className="data-form" style={{ margin: 0, padding: 0, background: 'none', border: 'none' }}>
                <input type="text" placeholder="Program Title" value={editingProg.title} onChange={e => setEditingProg({ ...editingProg, title: e.target.value })} required />
                <select value={editingProg.type} onChange={e => setEditingProg({ ...editingProg, type: e.target.value })}>
                  <option value="Workshop">Workshop</option>
                  <option value="Certification">Certification</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Course">Course</option>
                </select>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #475569)' }}>Session Date *</span>
                  <input type="date" value={editingProg.date || ''} onChange={e => setEditingProg({ ...editingProg, date: e.target.value })} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #475569)' }}>Seat Capacity * (currently {editingProg.participants || 0} registered)</span>
                  <input type="number" min={editingProg.participants || 1} value={editingProg.seats || ''} onChange={e => setEditingProg({ ...editingProg, seats: parseInt(e.target.value) || 0 })} required />
                </label>
                <input type="text" placeholder="Duration" value={editingProg.duration || ''} onChange={e => setEditingProg({ ...editingProg, duration: e.target.value })} />
                <input type="text" placeholder="Instructor" value={editingProg.instructor || ''} onChange={e => setEditingProg({ ...editingProg, instructor: e.target.value })} />
                <input type="number" placeholder="Cost ($)" value={editingProg.cost || 0} onChange={e => setEditingProg({ ...editingProg, cost: parseInt(e.target.value) || 0 })} />
                <input type="text" placeholder="Time" value={editingProg.time || ''} onChange={e => setEditingProg({ ...editingProg, time: e.target.value })} />
                <input type="text" placeholder="Location" value={editingProg.location || ''} onChange={e => setEditingProg({ ...editingProg, location: e.target.value })} />
                <select value={editingProg.status} onChange={e => setEditingProg({ ...editingProg, status: e.target.value })}>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setEditingProg(null)}>Cancel</button>
              <button className="btn-save" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Loop Modal — mark training complete for an employee */}
      {feedbackModal && (
        <div className="modal-overlay" onClick={() => setFeedbackModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mark Training Complete</h3>
              <button className="modal-close" onClick={() => setFeedbackModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}><strong>Program:</strong> {feedbackModal.program.title}</p>
              <p style={{ marginBottom: 16 }}>Select the employee who completed this program and update their competency score to reflect the learning:</p>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Employee</label>
              <select
                value={feedbackModal.employeeId}
                onChange={(e) => {
                  const emp = employees.find(x => x.id === Number(e.target.value))
                  if (emp) { setFeedbackModal({ ...feedbackModal, employeeId: emp.id, emp }); setFeedbackScore(emp.competency) }
                }}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)', marginBottom: 16 }}
              >
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                Updated Competency Score: {feedbackScore}%
              </label>
              <input
                type="range" min="0" max="100"
                value={feedbackScore}
                onChange={(e) => setFeedbackScore(Number(e.target.value))}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <p style={{ fontSize: 12, color: '#6b7280' }}>
                Training score will also be bumped by +3 points (capped at 100%).
                {(feedbackModal.program.competencyIds || []).length > 0 ? (
                  <> This program is linked to: <strong>{(feedbackModal.program.competencyIds || []).map(id => competencies.find(c => c.id === id)?.name).filter(Boolean).join(', ')}</strong>.</>
                ) : null}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setFeedbackModal(null)}>Cancel</button>
              <button className="btn-save" onClick={submitFeedback}>Confirm Completion</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Succession Module
function SuccessionModule({ successionCandidates, employees, canEdit, addSuccession, updateSuccession, deleteSuccession }) {
  const [profileName, setProfileName] = useState(null)
  const [devPlanName, setDevPlanName] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [newPlan, setNewPlan] = useState({ currentRole: '', readiness: 'Medium', timeline: '', candidates: '' })

  const openProfile = (name) => setProfileName(name)
  const closeProfile = () => { setProfileName(null); setDevPlanName(null) }

  const resetForm = () => {
    setNewPlan({ currentRole: '', readiness: 'Medium', timeline: '', candidates: '' })
    setShowAddForm(false)
    setShowEditForm(false)
    setEditId(null)
  }

  const parseCandidates = (str) => str.split(',').map((s) => s.trim()).filter(Boolean)

  const handleAdd = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (!newPlan.currentRole) { setErr('Role is required.'); return }
    try {
      addSuccession({ currentRole: newPlan.currentRole, readiness: newPlan.readiness, timeline: newPlan.timeline || '1 year', candidates: parseCandidates(newPlan.candidates) })
      setMsg(`Succession plan for "${newPlan.currentRole}" added.`)
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to add succession plan')
    }
  }

  const startEdit = (plan) => {
    setEditId(plan.id)
    setNewPlan({ currentRole: plan.currentRole, readiness: plan.readiness, timeline: plan.timeline, candidates: (plan.candidates || []).join(', ') })
    setShowEditForm(true)
    setShowAddForm(false)
    setMsg('')
    setErr('')
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!canEdit) return
    try {
      updateSuccession(editId, { currentRole: newPlan.currentRole, readiness: newPlan.readiness, timeline: newPlan.timeline, candidates: parseCandidates(newPlan.candidates) })
      setMsg('Succession plan updated.')
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to update succession plan')
    }
  }

  const handleDelete = (plan) => {
    if (!canEdit) return
    if (confirm(`Delete succession plan for "${plan.currentRole}"?`)) {
      try {
        deleteSuccession(plan.id)
        setMsg('Succession plan deleted.')
      } catch (ex) {
        setErr(ex.message || 'Failed to delete succession plan')
      }
    }
  }

  // Readiness risk summary
  const riskCount = successionCandidates.filter((p) => p.readiness === 'Low').length
  const medCount = successionCandidates.filter((p) => p.readiness === 'Medium').length

  // Look up full employee record for the candidate
  const profileEmployee = profileName
    ? employees.find((e) => e.name === profileName) || null
    : null

  // Live talent pool: compute each person's succession readiness, their real
  // potential roles (from succession plans), and their actual development
  // needs (weakest competencies from the live gap engine).
  const talentPool = useMemo(() => {
    return employees
      .map((emp) => {
        const a = analyzeEmployee(emp)
        const readiness = a.promotionReadiness >= 80 ? 'High' : a.promotionReadiness >= 60 ? 'Medium' : 'Low'
        const potentialRoles = successionCandidates
          .filter((p) => (p.candidates || []).includes(emp.name))
          .map((p) => p.currentRole)
        const devNeeds = a.gaps
          .filter((g) => g.gap > 0)
          .slice()
          .sort((x, y) => y.gap - x.gap)
          .slice(0, 2)
          .map((g) => g.competencyName)
        return {
          emp,
          a,
          readiness,
          potentialRoles,
          isCandidates: potentialRoles.length > 0,
          devNeeds,
        }
      })
      .sort((p1, p2) => p2.a.promotionReadiness - p1.a.promotionReadiness)
  }, [employees, successionCandidates])

  // The employee + analysis behind the currently open Development Plan.
  const devEmployee = devPlanName ? employees.find((e) => e.name === devPlanName) || null : null
  const devAnalysis = devEmployee ? analyzeEmployee(devEmployee) : null

  return (
    <div className="module" style={canEdit ? undefined : { opacity: 0.95 }}>
      <h1 className="page-title">Succession Planning</h1>
      <p className="page-subtitle">Identify and develop future leaders for key positions</p>

      {msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      <div className="succession-overview">
        <div className="succession-stat">
          <span className="succession-stat-value"><AnimatedNumber value={successionCandidates.length} duration={800} /></span>
          <span className="succession-stat-label">Key Positions Covered</span>
        </div>
        <div className="succession-stat">
          <span className="succession-stat-value"><AnimatedNumber value={successionCandidates.filter(p => p.readiness === 'High').length} duration={800} /></span>
          <span className="succession-stat-label">High Readiness</span>
        </div>
        <div className="succession-stat">
          <span className="succession-stat-value"><AnimatedNumber value={medCount} duration={800} /></span>
          <span className="succession-stat-label">Medium Readiness</span>
        </div>
        <div className="succession-stat">
          <span className="succession-stat-value" style={{ color: riskCount > 0 ? '#dc2626' : '#059669' }}>
            <AnimatedNumber value={riskCount} duration={800} />
          </span>
          <span className="succession-stat-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            <Icon name="warn" size={12} /> At Risk (Low)
          </span>
        </div>
      </div>

      {canEdit ? (
        <div className="form-section">
          <div className="form-section-header">
            <button className="btn-add" onClick={() => { setShowAddForm(!showAddForm); setShowEditForm(false); setMsg(''); setErr('') }}>
              {showAddForm ? 'Cancel' : '+ Add Succession Plan'}
            </button>
          </div>
          {showAddForm && (
            <form className="data-form" onSubmit={handleAdd}>
              <input type="text" placeholder="Role (e.g. Chief Medical Officer)" value={newPlan.currentRole} onChange={(e) => setNewPlan({ ...newPlan, currentRole: e.target.value })} required />
              <select value={newPlan.readiness} onChange={(e) => setNewPlan({ ...newPlan, readiness: e.target.value })}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <input type="text" placeholder="Timeline (e.g. 2 years)" value={newPlan.timeline} onChange={(e) => setNewPlan({ ...newPlan, timeline: e.target.value })} />
              <input type="text" placeholder="Candidates (comma separated)" value={newPlan.candidates} onChange={(e) => setNewPlan({ ...newPlan, candidates: e.target.value })} />
              <button type="submit" className="btn-save">Save Plan</button>
            </form>
          )}
        </div>
      ) : null}

      {showEditForm && (
        <div className="edit-form">
          <h3>Edit Succession Plan</h3>
          <form className="data-form" onSubmit={handleUpdate}>
            <input type="text" placeholder="Role" value={newPlan.currentRole} onChange={(e) => setNewPlan({ ...newPlan, currentRole: e.target.value })} required />
            <select value={newPlan.readiness} onChange={(e) => setNewPlan({ ...newPlan, readiness: e.target.value })}>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <input type="text" placeholder="Timeline" value={newPlan.timeline} onChange={(e) => setNewPlan({ ...newPlan, timeline: e.target.value })} />
            <input type="text" placeholder="Candidates (comma separated)" value={newPlan.candidates} onChange={(e) => setNewPlan({ ...newPlan, candidates: e.target.value })} />
            <div className="form-buttons">
              <button type="submit" className="btn-save">Update</button>
              <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="succession-plans">
        <h2 className="panel-title">Succession Plans</h2>
        <div className="plans-grid">
          {successionCandidates.map(plan => (
            <div key={plan.id} className="succession-card">
              <div className="succession-role">
                <h3>{plan.currentRole}</h3>
                <span className="timeline">Timeline: {plan.timeline}</span>
              </div>
              <div className="succession-candidates">
                <h4>Potential Successors</h4>
                {plan.candidates.map((candidate, idx) => (
                  <div key={idx} className="candidate-item">
                    <span className="candidate-avatar"><Icon name="user" size={18} /></span>
                    <span className="candidate-name">{candidate}</span>
                    <span className={`readiness ${plan.readiness.toLowerCase()}`}>{plan.readiness}</span>
                  </div>
                ))}
              </div>
<div className="succession-actions">
                <button className="btn-view" onClick={() => openProfile(plan.candidates[0])}>View Profile</button>
                <button className="btn-development" onClick={() => setDevPlanName(plan.candidates[0])}>Development Plan</button>
                {canEdit ? (
                  <>
                    <button className="btn-edit" onClick={() => startEdit(plan)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(plan)}>Delete</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Development Plan Modal */}
      {devPlanName && devEmployee && devAnalysis && (
        <div className="modal-overlay" onClick={closeProfile}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Development Plan — {devEmployee.name}</h3>
              <button className="modal-close" onClick={closeProfile} aria-label="Close">&times;</button>
            </div>
            <div className="modal-body">
              <div className="profile-row"><span className="profile-label">Role</span><span className="profile-value">{devEmployee.role}</span></div>
              <div className="profile-row"><span className="profile-label">Overall</span><span className="profile-value">{devAnalysis.overallScore}%</span></div>
              <div className="profile-row"><span className="profile-label">Promotion</span><span className="profile-value">{devAnalysis.promotionReadiness}%</span></div>
              {devAnalysis.gaps.filter((g) => g.gap > 0).slice(0, 4).map((g) => (
                <div key={g.competencyId} className="dev-plan-item">
                  <div className="dev-plan-head">
                    <strong>{g.competencyName}</strong>
                    <span className="gap-pill high">{scoreLabel(g.currentLevel)} → {scoreLabel(g.requiredLevel)}</span>
                  </div>
                  {g.recommendation ? (
                    <>
                      <p className="dev-plan-why">{g.recommendation.why}</p>
                      <ul className="dev-plan-actions">
                        {g.recommendation.actions.slice(0, 3).map((a, i) => (
                          <li key={i}><strong>{a.kind}:</strong> {a.title}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
              {devAnalysis.gaps.filter((g) => g.gap > 0).length === 0 ? (
                <p style={{ color: 'var(--success)', fontWeight: 600 }}>No competency gaps — maintain current development &amp; pursue stretch assignments.</p>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeProfile}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {profileName && (
        <div className="modal-overlay" onClick={closeProfile}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{profileEmployee ? profileEmployee.name : profileName}</h3>
              <button className="modal-close" onClick={closeProfile} aria-label="Close">&times;</button>
            </div>
            {profileEmployee ? (
              <div className="modal-body">
                <div className="profile-row"><span className="profile-label">Role</span><span className="profile-value">{profileEmployee.role}</span></div>
                <div className="profile-row"><span className="profile-label">Department</span><span className="profile-value">{profileEmployee.department}</span></div>
                <div className="profile-row"><span className="profile-label">Performance</span>
                  <span className="profile-value">
                    <span className="score-bar">
                      <span className="score-fill" style={{ width: `${profileEmployee.performance}%`, backgroundColor: '#22c55e' }}></span>
                      <span className="score-text">{profileEmployee.performance}%</span>
                    </span>
                  </span>
                </div>
                <div className="profile-row"><span className="profile-label">Competency</span>
                  <span className="profile-value">
                    <span className="score-bar">
                      <span className="score-fill" style={{ width: `${profileEmployee.competency}%`, backgroundColor: '#8b5cf6' }}></span>
                      <span className="score-text">{profileEmployee.competency}%</span>
                    </span>
                  </span>
                </div>
                <div className="profile-row"><span className="profile-label">Training</span>
                  <span className="profile-value">
                    <span className="score-bar">
                      <span className="score-fill" style={{ width: `${profileEmployee.training}%`, backgroundColor: '#3b82f6' }}></span>
                      <span className="score-text">{profileEmployee.training}%</span>
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <p>Full profile details are not available in the employee registry for <strong>{profileName}</strong>.</p>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeProfile}>Close</button>
            </div>
          </div>
        </div>
      )}

<div className="talent-pool">
        <h2 className="panel-title">Talent Pool ({talentPool.length})</h2>
        <table className="talent-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Current Role</th>
              <th>Department</th>
              <th>Readiness Level</th>
              <th>Promotion Readiness</th>
              <th>Potential Roles</th>
              <th>Development Needs</th>
            </tr>
          </thead>
          <tbody>
            {talentPool.map((t) => (
              <tr key={t.emp.id}>
                <td><strong>{t.emp.name}</strong></td>
                <td>{t.emp.role}</td>
                <td>{t.emp.department}</td>
                <td><span className={`readiness-${t.readiness.toLowerCase()}`}>{t.readiness}</span></td>
                <td>{t.a.promotionReadiness}%</td>
                <td>{t.potentialRoles.length ? t.potentialRoles.join(', ') : '—'}</td>
                <td>{t.devNeeds.length ? t.devNeeds.join(', ') : '—'}</td>
              </tr>
            ))}
            {talentPool.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 16 }}>No employees in the talent pool yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Social Recognition Module
function RecognitionModule({ recognitionAwards, _employees, addRecognition, deleteRecognition, toggleLike, addComment, canEdit, giveShoutout, currentUser }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAward, setNewAward] = useState({ recipient: '', type: 'Employee of Month', department: '', date: new Date().toISOString().split('T')[0], reason: '' })
  const [shoutout, setShoutout] = useState({ recipient: '', department: '', reason: '' })
  const [commentInputs, setCommentInputs] = useState({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('All')

  const peerShoutouts = [...recognitionAwards].filter((a) => a.peer).sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const handleShoutoutSubmit = (e) => {
    e.preventDefault()
    if (!shoutout.recipient || !shoutout.reason) return
    giveShoutout({ ...shoutout, date: new Date().toISOString().split('T')[0] })
    setMsg(`Shout-out posted for "${shoutout.recipient}".`)
    setShoutout({ recipient: '', department: '', reason: '' })
  }

  const filteredAwards = recognitionAwards.filter((a) => {
    const matchesSearch = `${a.recipient} ${a.department} ${a.reason}`.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'All' || a.type === filterType
    return matchesSearch && matchesType
  })

  const awardTypes = [...new Set(recognitionAwards.map((a) => a.type).filter(Boolean))]

  const handleAddRecognition = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newAward.recipient && newAward.reason) {
      addRecognition(newAward)
      setMsg(`Recognition added for "${newAward.recipient}".`)
      setErr('')
      setNewAward({ recipient: '', type: 'Employee of Month', department: '', date: new Date().toISOString().split('T')[0], reason: '' })
      setShowAddForm(false)
    }
  }

  const handleDelete = (award) => {
    if (!canEdit) return
    if (confirm(`Delete recognition for "${award.recipient}"?`)) {
      deleteRecognition(award.id)
      setMsg('Recognition deleted.')
      setErr('')
    }
  }

  const handleCommentSubmit = (e, id) => {
    e.preventDefault()
    const text = (commentInputs[id] || '').trim()
    if (!text) return
    addComment(id, text)
    setCommentInputs((prev) => ({ ...prev, [id]: '' }))
  }


  return (
    <div className="module">
      <h1 className="page-title">Social Recognition</h1>
      <p className="page-subtitle">Acknowledge and celebrate employee achievements</p>

      {msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      <div className="form-section">
        <h2 className="panel-title">Give a Shout-Out</h2>
        <p className="training-needs-subtitle">Open to everyone — recognize a colleague right now</p>
        <form className="data-form" onSubmit={handleShoutoutSubmit}>
          <input type="text" placeholder="Colleague's name" value={shoutout.recipient} onChange={(e) => setShoutout({ ...shoutout, recipient: e.target.value })} required />
          <input type="text" placeholder="Department (optional)" value={shoutout.department} onChange={(e) => setShoutout({ ...shoutout, department: e.target.value })} />
          <input type="text" placeholder="What did they do?" value={shoutout.reason} onChange={(e) => setShoutout({ ...shoutout, reason: e.target.value })} required />
          <button type="submit" className="btn-save">Post Shout-Out</button>
        </form>
      </div>

<div className="form-section">
        {canEdit ? (
          <button className="btn-add" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : '+ Add Recognition'}
          </button>
        ) : (
          <p className="module-readonly-note">You have view-only access to this module.</p>
        )}

        {showAddForm && (
          <form className="data-form" onSubmit={handleAddRecognition}>
            <input type="text" placeholder="Recipient Name" value={newAward.recipient} onChange={e => setNewAward({...newAward, recipient: e.target.value})} required />
            <select value={newAward.type} onChange={e => setNewAward({...newAward, type: e.target.value})}>
              <option value="Employee of Month">Employee of Month</option>
              <option value="Excellence in Care">Excellence in Care</option>
              <option value="Innovation Award">Innovation Award</option>
              <option value="Research Excellence">Research Excellence</option>
            </select>
            <input type="text" placeholder="Department" value={newAward.department} onChange={e => setNewAward({...newAward, department: e.target.value})} />
            <input type="date" value={newAward.date} onChange={e => setNewAward({...newAward, date: e.target.value})} />
            <input type="text" placeholder="Reason for recognition" value={newAward.reason} onChange={e => setNewAward({...newAward, reason: e.target.value})} required />
            <button type="submit" className="btn-save">Save Recognition</button>
          </form>
        )}
      </div>

<div className="recognition-stats">
        <div className="rec-stat">
          <span className="rec-stat-icon"><Icon name="medal" size={26} /></span>
          <span className="rec-stat-value"><AnimatedNumber value={recognitionAwards.length} duration={800} /></span>
          <span className="rec-stat-label">Awards This Month</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon"><Icon name="recognition" size={26} /></span>
          <span className="rec-stat-value"><AnimatedNumber value={234} duration={900} /></span>
          <span className="rec-stat-label">Peer Recognitions</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon"><Icon name="spark" size={26} /></span>
          <span className="rec-stat-value"><AnimatedNumber value={89} duration={900} /></span>
          <span className="rec-stat-label">Active recognitions</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon"><Icon name="chat" size={26} /></span>
          <span className="rec-stat-value"><AnimatedNumber value={567} duration={900} /></span>
          <span className="rec-stat-label">Total Comments</span>
        </div>
      </div>

<div className="search-filter">
        <div className="search-with-icon">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search recognition..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="All">All Award Types</option>
          {awardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="recognition-wall">
        <h2 className="panel-title">Recognition Wall</h2>
        <div className="recognition-cards">
          {filteredAwards.map(award => {
            const comments = award.comments || []
            return (
<div key={award.id} className="recognition-card">
                <div className="recognition-card-header">
                  <span className="recognition-badge">
                    <Icon name={award.type.includes('Employee') ? 'medal' : award.type.includes('Excellence') ? 'shield' : award.type.includes('Innovation') ? 'spark' : 'recognition'} size={26} />
                  </span>
                  <span className="recognition-date">{award.date}</span>
                </div>
                <div className="recognition-card-body">
                  <h3 className="recipient-name">{award.recipient}</h3>
                  <p className="recognition-reason">"{award.reason}"</p>
                  <span className="recognition-dept">{award.department}</span>
                </div>
<div className="recognition-card-footer">
                  <button className="recognition-reaction btn-like" onClick={() => toggleLike(award.id)}>
                    <Icon name="recognition" size={14} /> {award.likes || 0}
                  </button>
                  <span className="recognition-comment"><Icon name="chat" size={14} /> {comments.length}</span>
                  {canEdit ? (
                    <button className="btn-delete" onClick={() => handleDelete(award)}>Delete</button>
                  ) : null}
                </div>
                {comments.length > 0 ? (
                  <div className="recognition-comments">
                    {comments.slice(-3).map((c, i) => (
                      <div key={i} className="recognition-comment-item">
                        <strong>{c.author}:</strong> {c.text}
                      </div>
                    ))}
                  </div>
                ) : null}
                <form className="comment-form" onSubmit={(e) => handleCommentSubmit(e, award.id)}>
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={commentInputs[award.id] || ''}
                    onChange={(e) => setCommentInputs((prev) => ({ ...prev, [award.id]: e.target.value }))}
                  />
                  <button type="submit" className="btn-comment">Post</button>
                </form>
              </div>
            )
})}
          {filteredAwards.length === 0 ? <div className="attention-empty">No recognitions found. Try adjusting the filters or add one!</div> : null}
        </div>
      </div>

<div className="award-categories">
        <h2 className="panel-title">Award Categories</h2>
        <div className="award-grid">
          <div className="award-category">
            <span className="award-icon"><Icon name="medal" size={30} /></span>
            <h3>Employee of the Month</h3>
            <p>Outstanding overall performance and commitment</p>
            <span className="award-count">12 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon"><Icon name="shield" size={30} /></span>
            <h3>Excellence in Care</h3>
            <p>Exceptional patient care and compassion</p>
            <span className="award-count">8 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon"><Icon name="spark" size={30} /></span>
            <h3>Innovation Award</h3>
            <p>Creative solutions and process improvements</p>
            <span className="award-count">5 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon"><Icon name="brain" size={30} /></span>
            <h3>Research Excellence</h3>
            <p>Medical research and clinical discoveries</p>
            <span className="award-count">3 awarded this year</span>
          </div>
        </div>
      </div>

      <div className="peer-recognition">
        <h2 className="panel-title">Peer Recognitions</h2>
        <div className="peer-recognition-feed">
          {peerShoutouts.slice(0, 10).map((a) => (
            <div key={a.id} className="peer-recognition-item">
              <span className="peer-avatar"><Icon name="user" size={30} /></span>
              <div className="peer-content">
                <span className="peer-from">{a.giver || 'Someone'} recognized {a.recipient}</span>
                <p className="peer-message">"{a.reason}"</p>
                <span className="peer-time">{a.date}</span>
              </div>
            </div>
          ))}
          {peerShoutouts.length === 0 ? <div className="attention-empty">No peer shout-outs yet — be the first!</div> : null}
        </div>
      </div>
    </div>
  )
}

// AI Guidance Bot - context-aware assistant that helps users navigate the system
function AIGuideBot({ role, activeModule, dataSummary, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')

const pushBot = (text) => {
    setMessages((prev) => [...prev, { from: 'bot', text }])
  }

  const pushUser = (text) => {
    setMessages((prev) => [...prev, { from: 'user', text }])
  }

const openBot = () => {
    setOpen(true)
    if (messages.length === 0) {
      pushBot(buildGreeting({ role, activeModule, dataSummary }))
    }
  }

  const handleSend = (e) => {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    pushUser(q)
    setInput('')
    const reply = generateAIReply(q, { role, activeModule, dataSummary })
    setTimeout(() => pushBot(reply.text), 400)
    if (reply.navigate) {
      setTimeout(() => onNavigate(reply.navigate), 900)
    }
  }

const _generateReply = (q, ctx) => {
    const text = q.toLowerCase()
    if (/(help|what can you do|options)/.test(text)) {
      return { text: 'I can help you:\n• Navigate modules (e.g. "go to performance")\n• Explain what each module does ("what is success planning?")\n• Check your permissions ("what can I edit?")\n• Give tips based on current data ("give me tips")\n• Summarize the dashboard ("summary")' }
    }
    if (/(go to|navigate|open|show me|move to) (\w+)/.test(text)) {
      const m = text.match(/(go to|navigate|open|show me|move to) (\w+)/)
      const target = m[2].toLowerCase()
      const map = { dashboard: 'dashboard', performance: 'performance', competency: 'competency', ai: 'aiCompetency', aiCompetency: 'aiCompetency', learning: 'learning', succession: 'succession', recognition: 'recognition', accounts: 'accounts', announcements: 'announcements', audit: 'audit' }
      const dest = map[target]
      if (dest) return { text: `Taking you to the **${dest}** module now.`, navigate: dest }
      return { text: `I'm not sure which module "${target}" refers to. Try: dashboard, performance, competency, AI Competency, learning, succession, recognition, or accounts.` }
    }
    if (/(what is|what does|explain|tell me about|how do i use|guide)/.test(text)) {
      return { text: `Here's a guide for the current module (${ctx.currentModule}):\n${ctx.moduleGuide}` }
    }
    if (/(permission|access|can i edit|what can i (do|edit|view)|role)/.test(text)) {
      return { text: `As **${ctx.roleLabel}**, you have: ${ctx.rolePerms}` }
    }
    if (/(tip|suggest|recommend|advice|improve)/.test(text)) {
      return { text: buildTip(ctx) }
    }
    if (/(summary|overview|stats|numbers|dashboard)/.test(text)) {
      return { text: buildSummary(ctx) }
    }
    if (/(register|training|enroll|certification)/.test(text)) {
      return { text: 'You can register for training/certifications in the **Learning** module. Open the module, find a program, and click "Register". Your registrations appear under "My Registrations".' }
    }
    if (/(login|otp|password|credential)/.test(text)) {
      return { text: 'Log in with your username and password, then enter the 6-digit OTP shown in the browser console. If you forget credentials, ask an admin (Accounts module).' }
    }
    if (/(thank|thanks)/.test(text)) {
      return { text: 'You\'re welcome! I\'m here anytime you need help navigating IHIMS.' }
    }
    if (/(hello|hi|hey)/.test(text)) {
      return { text: `Hello! I'm your IHIMS assistant. You're in **${ctx.currentModule}**. Type "help" to see what I can do.` }
    }
    return { text: "I'm not sure I understood that. Try asking:\n• \"Go to performance\"\n• \"What can I edit?\"\n• \"Give me tips\"\n• \"Summary\"\n• \"How do I register for training?\"" }
  }

  const buildTip = (ctx) => {
    const d = ctx.dataSummary || {}
    const tips = []
    if (d.employees && d.employees.length > 0) {
      const lowPerf = d.employees.filter((e) => e.performance < 80)
      if (lowPerf.length > 0) tips.push(`⚠️ ${lowPerf.length} employee(s) have performance below 80% (e.g. ${lowPerf[0].name}). Consider a focused development plan.`)
      const gapEmployees = d.employees.filter((e) => e.competency < e.performance)
      if (gapEmployees.length > 0) tips.push(`🔍 ${gapEmployees.length} employee(s) have a competency gap vs. their performance (e.g. ${gapEmployees[0].name}). Check the AI Competency module for training suggestions.`)
    }
    if (d.training && d.training.filter((p) => p.status === 'upcoming').length > 0) tips.push(`📅 You have ${d.training.filter((p) => p.status === 'upcoming').length} upcoming training program(s). Encourage staff to register early.`)
    if (d.employees && d.employees.some((e) => e.training < 85)) tips.push('🎓 Some staff have low training completion. Add more certification opportunities in Learning & Training.')
    return tips.length > 0 ? 'Here are some actionable tips:\n\n' + tips.join('\n\n') : 'Your data looks healthy! No immediate action needed. Keep monitoring performance and training.'
  }

  const buildSummary = (ctx) => {
    const d = ctx.dataSummary || {}
    const avg = (arr, key) => arr.length ? Math.round(arr.reduce((s, x) => s + x[key], 0) / arr.length) : 0
    return `📊 **Dashboard Summary**\n• Employees: ${d.employees?.length || 0}\n• Avg Performance: ${avg(d.employees || [], 'performance')}%\n• Avg Competency: ${avg(d.employees || [], 'competency')}%\n• Training Completion: ${avg(d.employees || [], 'training')}%\n• Recognitions: ${d.recognitionAwards?.length || 0}\n• Succession Plans: ${d.successionCandidates?.length || 0}`
  }

  return (
    <>
      {open && (
        <div className="ai-bot-panel">
          <div className="ai-bot-header">
            <span className="ai-bot-avatar"><Icon name="chat" size={28} /></span>
            <div>
              <div className="ai-bot-title">IHIMS Assistant</div>
              <div className="ai-bot-status">AI Guide • Online</div>
            </div>
            <button className="ai-bot-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <div className="ai-bot-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-bot-msg ${m.from}`}>
                <span className="ai-bot-bubble">{m.text}</span>
              </div>
            ))}
          </div>
          <form className="ai-bot-input" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              aria-label="Ask the AI assistant"
            />
            <button type="submit" className="ai-bot-send">Send</button>
          </form>
        </div>
      )}
<button className="ai-bot-fab" onClick={openBot} aria-label="Open AI assistant">
        {open ? null : <Icon name="robotAssistant" size={30} />}
      </button>
    </>
  )
}

// Accounts Module (admin-only)
function AccountsModule({ accounts, employees, canEdit, addAccount, updateAccount, deleteAccount, roles, exportBackup, importBackup }) {
const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [formMsg, setFormMsg] = useState('')
  const [formError, setFormError] = useState('')
  const [newAcc, setNewAcc] = useState({ username: '', password: '', role: 'staff', roles: ['staff'], status: 'active', name: '', email: '', employeeId: null })

  const ROLE_OPTIONS = ['admin', 'hr', 'staff']

  const toggleNewAccRole = (r) => {
    setNewAcc((prev) => {
      const cur = prev.roles || [prev.role || 'staff']
      const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]
      const primary = primaryRoleOf(next)
      return { ...prev, roles: next, role: primary }
    })
  }

  const resetForm = () => {
    setNewAcc({ username: '', password: '', role: 'staff', roles: ['staff'], status: 'active', name: '', email: '', employeeId: null })
    setFormMsg('')
    setFormError('')
    setShowAddForm(false)
    setShowEditForm(false)
    setEditId(null)
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!canEdit) return
    try {
      addAccount(newAcc)
      setFormMsg(`Account "${newAcc.username || newAcc.email}" created successfully.`)
      resetForm()
    } catch (err) {
      setFormError(err.message || 'Failed to create account')
    }
  }

  const handleEditSave = (e) => {
    e.preventDefault()
    if (!canEdit) return
    try {
      updateAccount(editId, newAcc)
      setFormMsg('Account updated successfully.')
      resetForm()
    } catch (err) {
      setFormError(err.message || 'Failed to update account')
    }
  }

  const startEdit = (acc) => {
    setEditId(acc.id)
    setNewAcc({ username: acc.username, password: acc.password, role: acc.role, roles: getAccountRoles(acc), status: acc.status, name: acc.name || '', email: acc.email || '', employeeId: acc.employeeId != null ? acc.employeeId : null })
    setShowEditForm(true)
    setShowAddForm(false)
    setFormMsg('')
    setFormError('')
  }

  const handleDelete = (acc) => {
    if (!canEdit) return
    if (getAccountRoles(acc).includes('admin') && accounts.filter((a) => getAccountRoles(a).includes('admin')).length <= 1) {
      setFormError('Cannot delete the last admin account.')
      return
    }
const accLabel = acc.email || acc.username || acc.id
    if (confirm(`Delete account "${accLabel}"?`)) {
      try {
        deleteAccount(acc.id)
        setFormMsg(`Account "${accLabel}" deleted.`)
      } catch (err) {
        setFormError(err.message || 'Failed to delete account')
      }
    }
  }

  return (
    <div className="module">
      <h1 className="page-title">Accounts & Access</h1>
      <p className="page-subtitle">Manage login accounts, roles, and status. Admin only.</p>

      {formMsg ? <div className="account-msg success">{formMsg}</div> : null}
      {formError ? <div className="account-msg error">{formError}</div> : null}

      {(roles || []).includes('admin') ? (
        <div className="form-section">
          <h2 className="panel-title">Data Backup</h2>
          <p className="module-readonly-note">Exports every module's data as one JSON file. Importing replaces all current data.</p>
          <div className="form-section-header">
            <button className="btn-export" onClick={exportBackup}>
              <Icon name="download" size={16} /> Export Full Backup
            </button>
            <label className="btn-add" style={{ cursor: 'pointer' }}>
              Import Backup
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0]
                  e.target.value = ''
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    try {
                      const payload = JSON.parse(String(reader.result))
                      if (confirm('This will replace all current data with the backup file. Continue?')) {
                        importBackup(payload)
                        setFormMsg('Backup restored successfully.')
                      }
                    } catch {
                      setFormError('Invalid backup file.')
                    }
                  }
                  reader.readAsText(file)
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="form-section">
        <button className="btn-add" onClick={() => { if (canEdit) { setShowAddForm(!showAddForm); setShowEditForm(false); setFormMsg(''); setFormError('') } }} disabled={!canEdit}>
          {showAddForm ? 'Cancel' : '+ Add Account'}
        </button>

{showAddForm && (
          <form className="data-form" onSubmit={handleAdd}>
            <input type="email" placeholder="Email (login email)" value={newAcc.email} onChange={(e) => setNewAcc({ ...newAcc, email: e.target.value })} required />
            <input type="text" placeholder="Username" value={newAcc.username} onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })} />
            <input type="text" placeholder="Display name" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} />
            <input type="text" placeholder="Password" value={newAcc.password} onChange={(e) => setNewAcc({ ...newAcc, password: e.target.value })} required />
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13 }}>Roles (select all that apply)</p>
              {ROLE_OPTIONS.map((r) => (
                <label key={r} style={{ marginRight: 14, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={(newAcc.roles || []).includes(r)} onChange={() => toggleNewAccRole(r)} />{roleLabel(r)}
                </label>
              ))}
            </div>
            <select value={newAcc.status} onChange={(e) => setNewAcc({ ...newAcc, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <select value={newAcc.employeeId != null ? newAcc.employeeId : ''} onChange={(e) => setNewAcc({ ...newAcc, employeeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Linked employee (for Development Plan) —</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <button type="submit" className="btn-save">Create Account</button>
          </form>
        )}
      </div>

{showEditForm && (
        <div className="edit-form">
          <h3>Edit Account</h3>
          <form className="data-form" onSubmit={handleEditSave}>
            <input type="email" placeholder="Email (login email)" value={newAcc.email} onChange={(e) => setNewAcc({ ...newAcc, email: e.target.value })} required />
            <input type="text" placeholder="Username" value={newAcc.username} onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })} />
            <input type="text" placeholder="Display name" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} />
            <input type="text" placeholder="Password" value={newAcc.password} onChange={(e) => setNewAcc({ ...newAcc, password: e.target.value })} required />
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13 }}>Roles (select all that apply)</p>
              {ROLE_OPTIONS.map((r) => (
                <label key={r} style={{ marginRight: 14, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={(newAcc.roles || []).includes(r)} onChange={() => toggleNewAccRole(r)} />{roleLabel(r)}
                </label>
              ))}
            </div>
            <select value={newAcc.status} onChange={(e) => setNewAcc({ ...newAcc, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <select value={newAcc.employeeId != null ? newAcc.employeeId : ''} onChange={(e) => setNewAcc({ ...newAcc, employeeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Linked employee (for Development Plan) —</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <div className="form-buttons">
              <button type="submit" className="btn-save">Update</button>
              <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="performance-table-panel">
        <h2 className="panel-title">Login Accounts ({accounts.length})</h2>
<table className="performance-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Linked Employee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => {
              const linked = employees.find((e) => e.id === acc.employeeId)
              return (
              <tr key={acc.id}>
                <td><strong>{acc.email || '—'}</strong></td>
                <td>{acc.username || '—'}</td>
                <td>{acc.name || '—'}</td>
                <td><span className={`status-badge ${getAccountRoles(acc).includes('admin') ? 'excellent' : getAccountRoles(acc).includes('hr') ? 'good' : 'needs-improvement'}`}>{rolesLabel(getAccountRoles(acc))}</span></td>
                <td><span className={`status-badge ${acc.status === 'active' ? 'excellent' : 'needs-improvement'}`}>{acc.status}</span></td>
                <td>{linked ? linked.name : <span className="readonly-cell">Not linked</span>}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-edit" onClick={() => startEdit(acc)} disabled={!canEdit}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(acc)} disabled={!canEdit}>Delete</button>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Announcements Module - portal notice board (admin/HR manage, all view)
function AnnouncementsModule({ announcements, canEdit, addAnnouncement, updateAnnouncement, deleteAnnouncement, role, userName }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [newAnn, setNewAnn] = useState({ title: '', body: '', category: 'General', pinned: false })

  const resetForm = () => {
    setNewAnn({ title: '', body: '', category: 'General', pinned: false })
    setShowAddForm(false)
    setShowEditForm(false)
    setEditId(null)
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (!newAnn.title || !newAnn.body) {
      setErr('Title and body are required.')
      return
    }
    try {
      addAnnouncement({ ...newAnn, author: userName || role, date: new Date().toISOString().split('T')[0] })
      setMsg(`Announcement "${newAnn.title}" published.`)
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to post announcement')
    }
  }

  const startEdit = (ann) => {
    setEditId(ann.id)
    setNewAnn({ title: ann.title, body: ann.body, category: ann.category || 'General', pinned: !!ann.pinned })
    setShowEditForm(true)
    setShowAddForm(false)
    setMsg('')
    setErr('')
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    if (!canEdit) return
    try {
      updateAnnouncement(editId, newAnn)
      setMsg('Announcement updated.')
      resetForm()
    } catch (ex) {
      setErr(ex.message || 'Failed to update announcement')
    }
  }

  const handleDelete = (ann) => {
    if (!canEdit) return
    if (confirm(`Delete announcement "${ann.title}"?`)) {
      try {
        deleteAnnouncement(ann.id)
        setMsg('Announcement deleted.')
      } catch (ex) {
        setErr(ex.message || 'Failed to delete announcement')
      }
    }
  }

  const categories = [...new Set(announcements.map((a) => a.category).filter(Boolean))]
  const filtered = [...announcements]
    .filter((a) => filterCategory === 'All' || a.category === filterCategory)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  return (
    <div className="module">
      <h1 className="page-title">Announcements</h1>
      <p className="page-subtitle">Official notices and updates for the team</p>

      {msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      {canEdit ? (
        <div className="form-section">
          <div className="form-section-header">
            <button className="btn-add" onClick={() => { setShowAddForm(!showAddForm); setShowEditForm(false); setMsg(''); setErr('') }}>
              {showAddForm ? 'Cancel' : '+ Post Announcement'}
            </button>
          </div>
          {showAddForm && (
            <form className="data-form" onSubmit={handleAdd}>
              <input type="text" placeholder="Title" value={newAnn.title} onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })} required />
              <select value={newAnn.category} onChange={(e) => setNewAnn({ ...newAnn, category: e.target.value })}>
                <option value="General">General</option>
                <option value="Safety">Safety</option>
                <option value="Training">Training</option>
                <option value="Events">Events</option>
                <option value="Policy">Policy</option>
              </select>
              <textarea placeholder="Message body" value={newAnn.body} onChange={(e) => setNewAnn({ ...newAnn, body: e.target.value })} required rows={3} />
              <label className="checkbox-label">
                <input type="checkbox" checked={newAnn.pinned} onChange={(e) => setNewAnn({ ...newAnn, pinned: e.target.checked })} />
                Pin to top
              </label>
              <button type="submit" className="btn-save">Publish</button>
            </form>
          )}
        </div>
      ) : (
        <p className="module-readonly-note">You have view-only access to announcements.</p>
      )}

      {showEditForm && (
        <div className="edit-form">
          <h3>Edit Announcement</h3>
          <form className="data-form" onSubmit={handleUpdate}>
            <input type="text" placeholder="Title" value={newAnn.title} onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })} required />
            <select value={newAnn.category} onChange={(e) => setNewAnn({ ...newAnn, category: e.target.value })}>
              {['General', 'Safety', 'Training', 'Events', 'Policy'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea placeholder="Message body" value={newAnn.body} onChange={(e) => setNewAnn({ ...newAnn, body: e.target.value })} required rows={3} />
            <label className="checkbox-label">
              <input type="checkbox" checked={newAnn.pinned} onChange={(e) => setNewAnn({ ...newAnn, pinned: e.target.checked })} />
              Pin to top
            </label>
            <div className="form-buttons">
              <button type="submit" className="btn-save">Update</button>
              <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="search-filter">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="All">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="announcements-list">
        {filtered.map((ann) => (
          <div key={ann.id} className={`announcement-item ${ann.pinned ? 'pinned' : ''}`}>
            <div className="announcement-head">
              <h3 className="announcement-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {ann.pinned ? <span className="status-badge good" style={{ fontSize: 10 }}>Pinned</span> : null}
                {ann.title}
              </h3>
              <span className={`announcement-category ${ann.category ? `cat-${ann.category.toLowerCase()}` : ''}`}>{ann.category}</span>
            </div>
            <p className="announcement-body">{ann.body}</p>
            <div className="announcement-meta">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={12} /> {ann.author}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={12} /> {ann.date}</span>
              {canEdit ? (
                <div className="action-buttons">
                  <button className="btn-edit" onClick={() => startEdit(ann)}>Edit</button>
                  <button className="btn-delete" onClick={() => handleDelete(ann)}>Delete</button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? <div className="attention-empty">No announcements found.</div> : null}
      </div>
    </div>
  )
}

// Audit Log Module - read-only, admin-only view of recorded actions
function AuditModule() {
  const [log, setLog] = useState(() => getAuditLog())
  const [filter, setFilter] = useState('All')
  const [moduleFilter, setModuleFilter] = useState('All')

  const refresh = () => setLog(getAuditLog())

  const actions = [...new Set(log.map((r) => r.action).filter(Boolean))]
  const modules = [...new Set(log.map((r) => r.module).filter(Boolean))]

  const filtered = log
    .filter((r) => filter === 'All' || r.action === filter)
    .filter((r) => moduleFilter === 'All' || r.module === moduleFilter)
    .slice()
    .reverse()

  return (
    <div className="module">
      <h1 className="page-title">Audit Log</h1>
      <p className="page-subtitle">Record of critical actions across the system (admin only)</p>

      <div className="search-filter">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="All">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="All">All Modules</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn-export" onClick={refresh}>↻ Refresh</button>
      </div>

      <div className="performance-table-panel">
        <h2 className="panel-title">Events ({filtered.length})</h2>
        <table className="performance-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Module</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
{filtered.slice(0, 200).map((r) => {
              const d = new Date(r.timestamp)
              const tsDate = isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
              const tsTime = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
              return (
              <tr key={r.id}>
                <td>
                  <span className="audit-ts-date">{tsDate}</span>
                  <span className="audit-ts-time">{tsTime}</span>
                </td>
                <td><strong>{r.user}</strong></td>
                <td><span className={`status-badge ${r.role === 'admin' ? 'excellent' : r.role === 'hr' ? 'good' : 'needs-improvement'}`}>{r.role}</span></td>
<td>{r.action}</td>
                <td>{r.module}</td>
                <td>{r.detail}</td>
              </tr>
              )
            })}
            {filtered.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24 }}>No audit events recorded yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Settings Module — System Settings with a "My Profile" section (own photo)
// and an employee directory with photos (admin/HR can manage).
function SettingsModule({ employees, accounts, canEdit, updateEmployeePhoto, updateMyPhoto, myPhoto, role, roles, userName, userEmail }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDept, setFilterDept] = useState('All')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))]
  const myEmail = userEmail
  const myAccount = (accounts || []).find(
    (a) => (a.email || '').toLowerCase() === (myEmail || '').toLowerCase() || (a.username || '').toLowerCase() === (userName || '').toLowerCase()
  )

  // Self-service bio/skills, stored per-user (separate from HR-managed
  // performance/competency/training on the employee record).
  const [myBio, setMyBio] = useState('')
  const [mySkills, setMySkills] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    const p = getStoredUserProfile(userEmail)
    setMyBio(p.bio || '')
    setMySkills((p.skills || []).join(', '))
  }, [userEmail])

  const saveMyProfile = () => {
    const profile = { bio: myBio.trim(), skills: mySkills.split(',').map((s) => s.trim()).filter(Boolean) }
    setStoredUserProfile(userEmail, profile)
    appendAudit({ user: userName, role: primaryRoleOf(roles || [role]), action: 'update', module: 'settings', detail: 'Updated bio/skills' })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  const filtered = employees.filter((e) => {
    const matchesSearch = `${e.name} ${e.role} ${e.department}`.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDept = filterDept === 'All' || e.department === filterDept
    return matchesSearch && matchesDept
  })

  // Read an image file and call the provided callback with a base64 data URL.
  const readImageFile = (file, onOk) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr('Please select a valid image file.')
      setMsg('')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('Image too large. Please choose an image under 2MB.')
      setMsg('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        onOk(reader.result)
        setErr('')
      } catch (ex) {
        setErr(ex.message || 'Failed to update photo')
        setMsg('')
      }
    }
    reader.onerror = () => {
      setErr('Could not read the selected image.')
      setMsg('')
    }
    reader.readAsDataURL(file)
  }

  // Update the logged-in user's own profile photo.
  const handleMyPhotoUpload = (file) => {
    readImageFile(file, (dataUrl) => {
      updateMyPhoto(dataUrl)
      setMsg('Your profile picture has been updated.')
    })
  }

  const handleMyPhotoRemove = () => {
    try {
      updateMyPhoto(null)
      setMsg('Your profile picture has been removed.')
      setErr('')
    } catch (ex) {
      setErr(ex.message || 'Failed to remove photo')
      setMsg('')
    }
  }

  // Convert an uploaded image file to a base64 data URL so it persists in
  // localStorage alongside the employee record.
  const handlePhotoUpload = (emp, file) => {
    if (!canEdit) return
    readImageFile(file, (dataUrl) => {
      updateEmployeePhoto(emp.id, dataUrl)
      setMsg(`Profile photo updated for ${emp.name}.`)
    })
  }

  const removePhoto = (emp) => {
    if (!canEdit) return
    try {
      updateEmployeePhoto(emp.id, null)
      setMsg(`Profile photo removed for ${emp.name}.`)
      setErr('')
    } catch (ex) {
      setErr(ex.message || 'Failed to remove photo')
      setMsg('')
    }
  }

  return (
    <div className="module">
      <h1 className="page-title">System Settings</h1>
      <p className="page-subtitle">
        Manage your profile, organization preferences, and the staff directory.
      </p>

      {msg ? <div className="account-msg success">{msg}</div> : null}
      {err ? <div className="account-msg error">{err}</div> : null}

      {/* My Profile card */}
      <div className="settings-profile-card">
        <div className="settings-profile-avatar-wrap">
          {myPhoto ? (
            <img className="settings-profile-avatar" src={myPhoto} alt={userName || 'My profile'} />
          ) : (
            <div className="settings-profile-avatar settings-profile-avatar--placeholder">
              <Icon name="user" size={40} />
            </div>
          )}
          <div className="settings-profile-actions">
            <label className="settings-photo-btn" title="Upload profile picture">
              <Icon name="camera" size={16} />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => { handleMyPhotoUpload(e.target.files[0]); e.target.value = '' }}
              />
            </label>
            {myPhoto ? (
              <button className="settings-photo-btn settings-photo-btn--remove" title="Remove profile picture" onClick={handleMyPhotoRemove}>
                <Icon name="trash" size={16} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="settings-profile-info">
          <h2>{userName || 'My Profile'}</h2>
          <div className="settings-profile-meta">
            <span className="role-badge">{roleLabel(primaryRoleOf(roles || [role]))}</span>
            {myEmail ? <span className="settings-profile-email">{myEmail}</span> : null}
            {myAccount ? <span className="settings-profile-email">{myAccount.username}</span> : null}
          </div>
          <p className="settings-profile-desc">
            This is your personal profile. Upload a profile picture so colleagues can recognize you across the system.
          </p>
          <div className="data-form" style={{ marginTop: 12 }}>
            <textarea
              placeholder="A short bio (visible to colleagues)"
              value={myBio}
              onChange={(e) => setMyBio(e.target.value)}
              rows={2}
              style={{ gridColumn: '1 / -1' }}
            />
            <input
              type="text"
              placeholder="Skills (comma separated, e.g. Excel, First Aid, Python)"
              value={mySkills}
              onChange={(e) => setMySkills(e.target.value)}
              style={{ gridColumn: '1 / -1' }}
            />
            <button className="btn-save" onClick={saveMyProfile}>{profileSaved ? 'Saved ✓' : 'Save Profile'}</button>
          </div>
        </div>
      </div>

      {/* Data Privacy Notice — RA 10173 */}
      <div className="training-needs-panel" style={{ marginBottom: 24 }}>
        <h2 className="panel-title"><span className="panel-title-icon"><Icon name="shield" size={18} /></span> Data Privacy Notice</h2>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary, #6b7280)' }}>
          <p><strong style={{ color: 'var(--text, #111827)' }}>Republic Act No. 10173 — Data Privacy Act of 2012</strong></p>
          <p>
            All employee records stored in this system — including personal information, performance evaluations,
            competency assessments, training histories, attendance records, and development plans — are considered
            <strong> personal data</strong> under the Data Privacy Act of 2012 (RA 10173) of the Republic of the Philippines.
          </p>
          <ul style={{ paddingLeft: 18, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Access to employee records is restricted to authorised personnel based on their assigned system role.</li>
            <li>Data must not be disclosed, copied, or transmitted to unauthorised parties inside or outside the institution.</li>
            <li>All data processing activities are logged in the Audit Log and subject to institutional data governance policies.</li>
            <li>Employees have the right to access, correct, and request deletion of their own personal data in accordance with RA 10173.</li>
            <li>AI-generated competency gap analysis outputs are for decision-support only and must not be the sole basis for any employment action.</li>
          </ul>
          <p>
            For data privacy concerns, please contact your institution's designated Data Privacy Officer (DPO)
            or the National Privacy Commission at{' '}
            <a href="https://www.privacy.gov.ph" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary, #3b82f6)' }}>www.privacy.gov.ph</a>.
          </p>
        </div>
      </div>

      {/* Staff directory */}
      <div className="settings-directory-section">
        <h2 className="panel-title"><span className="panel-title-icon"><Icon name="accounts" size={18} /></span> Staff Directory</h2>
        <div className="search-filter">
          <input
            type="text"
            className="search-input"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="All">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

      <div className="settings-directory">
        {filtered.map((emp) => (
          <div key={emp.id} className="settings-card">
            <div className="settings-avatar-wrap">
              {emp.photo ? (
                <img className="settings-avatar" src={emp.photo} alt={emp.name} />
              ) : (
                <div className="settings-avatar settings-avatar--placeholder">
                  <Icon name="user" size={32} />
                </div>
              )}
              {canEdit ? (
                <div className="settings-photo-actions">
                  <label className="settings-photo-btn" title="Upload photo">
                    <Icon name="camera" size={16} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => { handlePhotoUpload(emp, e.target.files[0]); e.target.value = '' }}
                    />
                  </label>
                  {emp.photo ? (
                    <button className="settings-photo-btn settings-photo-btn--remove" title="Remove photo" onClick={() => removePhoto(emp)}>
                      <Icon name="trash" size={16} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="settings-card-info">
              <h3>{emp.name}</h3>
              <span className="settings-role">{emp.role}</span>
              <span className="settings-dept">{emp.department}</span>
            </div>
            <div className="settings-card-metrics">
              <div className="settings-metric">
                <span className="settings-metric-value">{emp.performance}%</span>
                <span className="settings-metric-label">Performance</span>
              </div>
              <div className="settings-metric">
                <span className="settings-metric-value">{emp.competency}%</span>
                <span className="settings-metric-label">Competency</span>
              </div>
              <div className="settings-metric">
                <span className="settings-metric-value">{emp.training}%</span>
                <span className="settings-metric-label">Training</span>
              </div>
            </div>
            {canEdit && !emp.photo ? (
              <p className="settings-hint"><Icon name="image" size={14} /> No photo yet — hover the avatar to upload one.</p>
            ) : null}
          </div>
        ))}
{filtered.length === 0 ? <div className="attention-empty">No employees match your search.</div> : null}
        </div>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [termsTab, setTermsTab] = useState('toa')

const [stage, setStage] = useState('email') // 'email' | 'password' | 'otp' | 'register'
  const [pendingEmail, setPendingEmail] = useState(null)
  const [pendingAccount, setPendingAccount] = useState(null)

  const [otp, setOtp] = useState('')
  const [demoOtp, setDemoOtp] = useState('')
  const [demoMode, setDemoMode] = useState(false)

// First-run admin registration fields
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regName, setRegName] = useState('')

  // Only offer to "Set up your admin account" when no admin has been created
  // yet (brand-new browser / first run). If an admin already exists in the
  // stored registry, hide the registration path — use the demo admin or ask an
  // existing admin to add you instead.
  const hasExistingAdmin = useMemo(() => {
    const stored = getStoredData(ACCOUNTS_KEY, [])
    return Array.isArray(stored) && stored.some((a) => a && getAccountRoles(a).includes('admin'))
  }, [])

// Real Supabase email OTP is used by default.
  // Set VITE_OTP_DEMO=true only to fall back to a locally-shown demo code.
  const demoOtpEnabled = () => {
  const v = import.meta.env.VITE_OTP_DEMO
  return v === 'true' || v === '1'
  } 

  const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000))

  const startDemoOtp = (targetEmail) => {
    const code = generateOtp()
    setDemoOtp(code)
    setDemoMode(true)
    setPendingEmail(targetEmail)
    setOtp('')
    setStage('otp')
    setInfo(`Demo mode: your verification code is ${code}. (No email is sent.)`)
  }

// Send a real 6-digit OTP to the user's email via Supabase Auth.
  // shouldCreateUser:true lets Supabase send OTP to any address (and create
  // an Auth user for it), so no manual user provisioning is required.
  // We call the Auth REST endpoint directly so that the real GoTrue error
  // body (e.g. "Error sending confirmation email") is surfaced instead of a
  // generic "Failed to fetch".
  const sendOtp = async (targetEmail) => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL and a Supabase key are not configured.')
    }
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        email: targetEmail,
        options: { shouldCreateUser: true },
      }),
    })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = await res.json()
        if (body?.msg) detail = `${detail} — ${body.msg}`
        if (body?.error_code) detail = `${detail} (${body.error_code})`
      } catch {
        // ignore parse errors
      }
      throw new Error(detail)
    }
  }

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em) { setError('Enter your email address'); return }

    setError('')
    setInfo('')

    const accounts = getAccountsWithSeeds()
    const account = accounts.find(
      (a) => (a.email || '').toLowerCase() === em || (a.username || '').toLowerCase() === em
    )

    if (!account) {
      appendAudit({ user: em, role: 'unknown', action: 'login_failed', module: 'auth', detail: 'No account registered for this email' })
      setError('No account is registered with this email. Ask an administrator to create your account first.')
      return
    }

    if (account.status !== 'active') {
      appendAudit({ user: em, role: account.role, action: 'login_failed', module: 'auth', detail: 'Account disabled' })
      setError('This account is disabled. Contact an administrator.')
      return
    }

    // Email verified — move to password stage
    setPendingEmail(em)
    setPendingAccount(account)
    setPassword('')
    setError('')
    setStage('password')
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (!pendingAccount) { setStage('email'); return }

    setError('')
    setInfo('')
    setBusy(true)

    // Check password
    const storedPw = pendingAccount.password || ''
    if (storedPw && password !== storedPw) {
      setBusy(false)
      appendAudit({ user: pendingEmail, role: pendingAccount.role, action: 'login_failed', module: 'auth', detail: 'Incorrect password' })
      setError('Incorrect password. Please try again.')
      return
    }

    // Password correct — check if this device is trusted and not revoked
    const revoked = checkRevocation(pendingEmail)
    const trust = revoked ? { trusted: false, reason: 'revoked' } : checkDeviceTrust(pendingEmail)

    if (trust.trusted) {
      // Trusted device within 7 days — skip OTP, log in directly
      const accountRoles = getAccountRoles(pendingAccount)
      const name = pendingAccount.name || roleLabel(pendingAccount.role)
      appendAudit({ user: pendingEmail, role: pendingAccount.role, action: 'login', module: 'auth', detail: `Trusted-device login — ${trust.daysLeft}d remaining (no OTP required)` })
      setBusy(false)
      onLogin({ role: pendingAccount.role, roles: accountRoles, name, email: pendingEmail, trustedDevice: true, trustDaysLeft: trust.daysLeft })
      return
    }

    // Untrusted / expired device — send OTP
    const trustReason = {
      no_token: 'New device — OTP required.',
      expired: 'Trusted-device period expired — OTP required.',
      revoked: 'Sessions were revoked — OTP required.',
      device_mismatch: 'Different device — OTP required.',
      tampered: 'Security check failed — OTP required.',
    }[trust.reason] || 'OTP verification required.'

    try {
      if (demoOtpEnabled()) {
        startDemoOtp(pendingEmail)
        appendAudit({ user: pendingEmail, role: pendingAccount.role, action: 'login_attempt', module: 'auth', detail: `Demo OTP sent — reason: ${trust.reason}` })
      } else {
        await sendOtp(pendingEmail)
        setDemoMode(false)
        setOtp('')
        setStage('otp')
        setInfo(`${trustReason} A 6-digit code has been sent to ${pendingEmail}.`)
        appendAudit({ user: pendingEmail, role: pendingAccount.role, action: 'login_attempt', module: 'auth', detail: `Email OTP sent — reason: ${trust.reason}` })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[IHIMS] Supabase OTP failed, using demo fallback:', err)
      startDemoOtp(pendingEmail)
      appendAudit({ user: pendingEmail, role: pendingAccount.role, action: 'login_attempt', module: 'auth', detail: 'Supabase OTP failed, used demo fallback' })
    } finally {
      setBusy(false)
    }
  }

  const resendOtp = async () => {
    if (!pendingEmail) return
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (demoMode || demoOtpEnabled()) {
        startDemoOtp(pendingEmail)
} else {
        await sendOtp(pendingEmail)
        setInfo(`A new verification code has been sent to ${pendingEmail}.`)
      }
} catch (err) {
      // Always fall back to a locally-generated code so login stays usable.
      // eslint-disable-next-line no-console
      console.error('[IHIMS] Resend supabase OTP failed, using demo fallback:', err)
      startDemoOtp(pendingEmail)
    } finally {
      setBusy(false)
    }
  }

  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!pendingEmail) {
      setError('Session expired. Please enter your email again.')
      setStage('email')
      return
    }

const normalized = otp.trim()
    // Accept a 6-8 digit numeric code. Supabase projects can be configured to
    // send either a 6 or 8 character OTP, so we accept either length.
    if (!normalized || normalized.length !== 6) {
    setError('Enter the 6-digit verification code')
    return
    }

    setBusy(true)
    try {
      // In demo mode, verify the locally-generated code.
      if (demoMode && demoOtp && normalized === demoOtp) {
        // success — skip Supabase
      } else if (demoMode) {
        setError('Incorrect code. Please check the code shown on screen.')
        setBusy(false)
        return
      } else {
// Verify the OTP with Supabase. On success this creates a session.
        const { error } = await supabase.auth.verifyOtp({
          email: pendingEmail,
          token: normalized,
          type: 'email',
        })
        if (error) throw error
      }

// Map role from the account registry using the verified email (falling
      // back to username). The account must already exist (created by an
      // admin) — this is enforced during the email stage, and re-checked here.
      const accounts = getAccountsWithSeeds()
      const account = accounts.find(
        (a) => (a.email || '').toLowerCase() === pendingEmail || (a.username || '').toLowerCase() === pendingEmail
      )
      if (!account || account.status !== 'active') {
        setError('Your account was not found or is disabled. Contact an administrator.')
        setStage('email')
        setPendingEmail(null)
        setOtp('')
        setBusy(false)
        return
      }
      const role = account.role
      const accountRoles = getAccountRoles(account)
      const name = account.name || roleLabel(role)

      // Grant device trust for 7 days after successful OTP
      const trustToken = grantDeviceTrust(pendingEmail)

      appendAudit({ user: pendingEmail, role, action: 'login', module: 'auth', detail: `Successful OTP login — device trusted for 7 days` })
      onLogin({ role, roles: accountRoles, name, email: pendingEmail, trustedDevice: true, trustDaysLeft: trustToken ? 7 : 0 })
} catch (err) {
      setError(err?.message || 'Incorrect or expired code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // First-run admin registration: create a brand-new admin account directly in
  // the registry, then immediately log in as that admin (no OTP needed).
  const handleRegisterSubmit = (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    const em = regEmail.trim().toLowerCase()
    if (!em || !regPassword) {
      setError('Enter your email and a password to set up your admin account.')
      return
    }
    try {
      const created = createBootstrapAccount({
        email: em,
        password: regPassword,
        name: regName.trim() || 'Administrator',
        role: 'admin',
      })
      appendAudit({ user: em, role: 'admin', action: 'create', module: 'accounts', detail: 'First-run admin account created' })
      setInfo('')
      setError('')
      onLogin({ role: 'admin', roles: ['admin'], name: created.name || 'Administrator', email: em })
    } catch (err) {
      setError(err.message || 'Failed to create admin account.')
    }
  }


  const landingModules = [
    { icon: 'performance', label: 'Performance',    color: '#22c55e' },
    { icon: 'ai',          label: 'AI Gap Analysis', color: '#16a34a' },
    { icon: 'learning',    label: 'Learning',        color: '#34d399' },
    { icon: 'recognition', label: 'Recognition',     color: '#4ade80' },
    { icon: 'succession',  label: 'Succession',      color: '#15803d' },
    { icon: 'shield',      label: 'RBAC Security',   color: '#22c55e' },
    { icon: 'accounts',    label: 'Org Chart',       color: '#34d399' },
    { icon: 'competency',  label: 'Competency',      color: '#16a34a' },
  ]

  // Shared input style for the dark login card
  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
  }
  const btnPrimary = {
    background: 'linear-gradient(135deg,#22c55e,#4ade80)',
    border: 'none', borderRadius: 10, padding: '12px',
    color: '#fff', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', width: '100%', fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(34,197,94,0.35)',
    transition: 'opacity 0.15s',
  }
  const btnSecondary = {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '10px',
    color: '#94a3b8', fontSize: 13, cursor: 'pointer',
    width: '100%', fontFamily: 'inherit',
  }
  const alertErr = {
    background: 'rgba(220,38,38,0.12)',
    border: '1px solid rgba(220,38,38,0.3)',
    borderRadius: 8, padding: '8px 12px',
    color: '#fca5a5', fontSize: 13,
  }
  const alertInfo = {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 8, padding: '8px 12px',
    color: '#86efac', fontSize: 13,
  }

  // Step indicator data
  const stepSets = {
    otp: [{k:'email',l:'Email'},{k:'password',l:'Password'},{k:'otp',l:'Verify'}],
    default: [{k:'email',l:'Email'},{k:'password',l:'Password'}],
  }
  const steps = stage === 'otp' ? stepSets.otp : stepSets.default
  const stageOrder = {email:0,password:1,otp:2}

  return (
    <div style={{ fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", background:'#f6faf7', minHeight:'100vh' }}>

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav style={{
        position:'sticky', top:0, zIndex:100,
        background:'#052e16',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 48px', height:64,
        boxShadow:'0 2px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:38, height:38, borderRadius:10,
            background:'linear-gradient(135deg,#22c55e,#4ade80)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 10px rgba(34,197,94,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4v16M4 12h16"/>
            </svg>
          </div>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:16, letterSpacing:'-0.01em', lineHeight:1 }}>IHIMS</div>
            <div style={{ color:'#4ade80', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600 }}>Hospital HR System</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:28 }}>
          {['Features','About'].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              style={{ color:'#86efac', fontSize:13, textDecoration:'none', fontWeight:500 }}
              onMouseEnter={e=>e.target.style.color='#fff'}
              onMouseLeave={e=>e.target.style.color='#86efac'}
            >{l}</a>
          ))}
          <a href="mailto:admin@ihims.local" style={{ color:'#86efac', fontSize:13, textDecoration:'none', fontWeight:500 }}
            onMouseEnter={e=>e.target.style.color='#fff'} onMouseLeave={e=>e.target.style.color='#86efac'}>Contact</a>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section style={{
        background:'linear-gradient(160deg,#052e16 0%,#14532d 55%,#052e16 100%)',
        padding:'80px 48px 100px',
      }}>
        <div style={{ maxWidth:1200, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 420px', gap:64, alignItems:'center' }}>

          {/* Left — copy */}
          <div>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:8,
              background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)',
              borderRadius:999, padding:'5px 14px', marginBottom:28,
            }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e' }}/>
              <span style={{ color:'#4ade80', fontSize:12, fontWeight:600, letterSpacing:'0.04em' }}>AI-Driven · Philippine Healthcare</span>
            </div>

            <h1 style={{ color:'#fff', fontSize:52, fontWeight:800, lineHeight:1.08, letterSpacing:'-0.03em', margin:'0 0 20px' }}>
              Close the{' '}
              <span style={{ background:'linear-gradient(90deg,#22c55e,#4ade80)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                competency gap
              </span>
              <br/>in your hospital.
            </h1>

            <p style={{ color:'#86efac', fontSize:17, lineHeight:1.75, margin:'0 0 40px', maxWidth:480, opacity:0.85 }}>
              IHIMS gives HR teams, department heads, and staff a unified platform to track performance,
              identify skill gaps using AI, manage training, and develop the next generation of healthcare leaders.
            </p>

            {/* Stats row */}
            <div style={{ display:'flex', gap:40, marginBottom:44 }}>
              {[{num:'6',label:'Core Modules'},{num:'3',label:'Role Levels'},{num:'AI',label:'Gap Analysis'},{num:'RA 10173',label:'Compliant'}].map((s) => (
                <div key={s.label}>
                  <div style={{ color:'#fff', fontSize:26, fontWeight:800, letterSpacing:'-0.03em', lineHeight:1 }}>{s.num}</div>
                  <div style={{ color:'#4ade80', fontSize:12, marginTop:4, opacity:0.7 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Module pills */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {landingModules.map((m) => (
                <div key={m.label} style={{
                  display:'inline-flex', alignItems:'center', gap:6,
                  background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.18)',
                  borderRadius:999, padding:'5px 12px',
                }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:m.color }}/>
                  <span style={{ color:'#86efac', fontSize:12 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Login card */}
          <div style={{
            background:'rgba(5,46,22,0.7)', border:'1px solid rgba(34,197,94,0.2)',
            borderRadius:20, padding:32,
            backdropFilter:'blur(20px)',
            boxShadow:'0 25px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(34,197,94,0.08)',
          }}>
            {/* Card header */}
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg,#22c55e,#4ade80)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 10px rgba(34,197,94,0.35)' }}>
                  <Icon name="shield" size={18}/>
                </div>
                <div>
                  <div style={{ color:'#fff', fontWeight:700, fontSize:16, lineHeight:1.2 }}>
                    {stage==='otp' ? 'Verify your identity' : stage==='password' ? 'Welcome back' : 'Sign in to IHIMS'}
                  </div>
                  <div style={{ color:'#4ade80', fontSize:12, opacity:0.75, marginTop:2 }}>
                    {stage==='otp' ? `Code sent to ${pendingEmail}` : stage==='password' ? (pendingAccount?.name||pendingEmail) : 'Authorised personnel only'}
                  </div>
                </div>
              </div>

              {/* Step indicator */}
              {stage !== 'register' && (
                <div style={{ display:'flex', alignItems:'center', marginTop:16 }}>
                  {steps.map((step, i) => {
                    const cur = stageOrder[stage]??0
                    const done = stageOrder[step.k] < cur
                    const active = step.k === stage
                    return (
                      <div key={step.k} style={{ display:'flex', alignItems:'center', flex: i<steps.length-1 ? 1 : 'none' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{
                            width:22, height:22, borderRadius:'50%', flexShrink:0,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:10, fontWeight:700,
                            background: done?'#22c55e' : active?'linear-gradient(135deg,#22c55e,#4ade80)' : 'rgba(255,255,255,0.08)',
                            color: done||active ? '#fff' : '#4ade80',
                            boxShadow: active ? '0 0 0 3px rgba(34,197,94,0.25)' : 'none',
                          }}>{done?'✓':i+1}</div>
                          <span style={{ fontSize:11, color:active?'#4ade80':done?'#22c55e':'#4ade8066', fontWeight:active?700:400 }}>{step.l}</span>
                        </div>
                        {i<steps.length-1 && <div style={{ flex:1, height:1, background:done?'#22c55e':'rgba(255,255,255,0.08)', margin:'0 8px' }}/>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── FORMS ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Register */}
              {stage==='register' && !hasExistingAdmin ? (
                <form onSubmit={handleRegisterSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[{label:'Your email',type:'email',val:regEmail,set:setRegEmail,ph:'you@gmail.com',req:true},
                    {label:'Display name',type:'text',val:regName,set:setRegName,ph:'e.g. Jane Smith',req:false},
                    {label:'Password',type:'password',val:regPassword,set:setRegPassword,ph:'At least 6 characters',req:true}
                  ].map((f) => (
                    <label key={f.label} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      <span style={{ color:'#86efac', fontSize:12, fontWeight:500 }}>{f.label}</span>
                      <input type={f.type} placeholder={f.ph} value={f.val} onChange={(e)=>f.set(e.target.value)} required={f.req} style={inputStyle}/>
                    </label>
                  ))}
                  {error ? <div style={alertErr}>{error}</div> : null}
                  {info  ? <div style={alertInfo}>{info}</div>  : null}
                  <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity:busy?0.7:1 }}>{busy?'Creating…':'Set up Admin Account'}</button>
                  <button type="button" onClick={()=>{setStage('email');setError('');setInfo('')}} style={btnSecondary}>← Back to Sign In</button>
                </form>

              /* Email stage */
              ) : stage==='email' ? (
                <form onSubmit={handleEmailSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <span style={{ color:'#86efac', fontSize:12, fontWeight:500 }}>Email or Username</span>
                    <input type="text" placeholder="you@hospital.com.ph" value={email} onChange={(e)=>setEmail(e.target.value)} required autoFocus style={inputStyle}/>
                  </label>
                  {error ? <div style={alertErr}>{error}</div> : null}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
                    <input type="checkbox" checked={acceptedTerms} onChange={(e)=>setAcceptedTerms(e.target.checked)} style={{ marginTop:2, flexShrink:0, accentColor:'#22c55e' }}/>
                    <span style={{ color:'#4ade80', fontSize:12, lineHeight:1.5, opacity:0.8 }}>
                      I agree to the{' '}
                      <button type="button" onClick={()=>{setTermsTab('toa');setShowTerms(true)}} style={{ background:'none', border:'none', color:'#22c55e', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline', fontFamily:'inherit' }}>Terms of Access</button>
                      {' '}and{' '}
                      <button type="button" onClick={()=>{setTermsTab('eula');setShowTerms(true)}} style={{ background:'none', border:'none', color:'#22c55e', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline', fontFamily:'inherit' }}>EULA</button>
                    </span>
                  </label>
                  <button type="submit" disabled={busy||!acceptedTerms} style={{ ...btnPrimary, opacity:(!acceptedTerms||busy)?0.45:1, cursor:(!acceptedTerms||busy)?'not-allowed':'pointer' }}>{busy?'Checking…':'Continue →'}</button>
                  {!hasExistingAdmin && (
                    <button type="button" onClick={()=>setStage('register')} style={btnSecondary}>First time? Set up admin account →</button>
                  )}
                </form>

              /* Password stage */
              ) : stage==='password' ? (
                <form onSubmit={handlePasswordSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <span style={{ color:'#86efac', fontSize:12, fontWeight:500 }}>Password</span>
                    <input type="password" placeholder="Enter your password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoFocus style={inputStyle}/>
                  </label>
                  {error ? <div style={alertErr}>{error}</div> : null}
                  {info  ? <div style={alertInfo}>{info}</div>  : null}
                  <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity:busy?0.7:1 }}>{busy?'Verifying…':'Verify Password →'}</button>
                  <button type="button" onClick={()=>{setStage('email');setPassword('');setPendingEmail(null);setPendingAccount(null);setError('');setInfo('')}} style={btnSecondary}>← Back</button>
                </form>

              /* OTP stage */
              ) : (
                <form onSubmit={handleOtpSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {demoMode && demoOtp ? (
                    <div style={{ background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ color:'#4ade80', fontSize:11, marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase' }}>Demo verification code</div>
                      <div style={{ color:'#22c55e', fontSize:30, fontWeight:800, letterSpacing:'0.18em', fontVariantNumeric:'tabular-nums' }}>{demoOtp}</div>
                    </div>
                  ) : null}
                  <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <span style={{ color:'#86efac', fontSize:12, fontWeight:500 }}>6-digit verification code</span>
                    <input type="text" placeholder="••••••" value={otp}
                      onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,8))}
                      inputMode="numeric" pattern="[0-9]{6,8}" maxLength="8" required autoFocus
                      style={{ ...inputStyle, fontSize:24, letterSpacing:'0.22em', fontVariantNumeric:'tabular-nums', textAlign:'center' }}/>
                  </label>
                  {info  ? <div style={alertInfo}>{info}</div>  : null}
                  {error ? <div style={alertErr}>{error}</div> : null}
                  <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity:busy?0.7:1 }}>{busy?'Verifying…':'Confirm Code'}</button>
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="button" onClick={resendOtp} disabled={busy} style={{ ...btnSecondary, flex:1 }}>Resend Code</button>
                    <button type="button" onClick={()=>{setStage('password');setError('');setInfo('');setOtp('')}} style={{ ...btnSecondary, flex:1 }}>← Back</button>
                  </div>
                </form>
              )}
            </div>

            {/* Trust notice */}
            <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:15 }}>🔒</span>
              <span style={{ color:'#4ade80', fontSize:11, lineHeight:1.5, opacity:0.8 }}>
                After OTP verification, this device is trusted for 7 days — password only on next login.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────── */}
      <section id="features" style={{ background:'#fff', padding:'96px 48px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ display:'inline-block', background:'#ecfdf5', borderRadius:999, padding:'4px 14px', color:'#16a34a', fontSize:12, fontWeight:700, marginBottom:14, letterSpacing:'0.05em', textTransform:'uppercase' }}>Capabilities</div>
            <h2 style={{ fontSize:36, fontWeight:800, color:'#0f172a', letterSpacing:'-0.02em', margin:'0 0 14px' }}>Everything your HR team needs</h2>
            <p style={{ color:'#475569', fontSize:16, maxWidth:520, margin:'0 auto' }}>One integrated platform for workforce development, competency management, and employee engagement.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24 }}>
            {[
              {icon:'performance',title:'Performance Analytics',desc:'Real-time dashboards tracking performance, competency, and training scores across all departments.',bg:'#f0fdf4',accent:'#22c55e'},
              {icon:'ai',title:'AI Competency Engine',desc:'Evidence-based gap analysis generates personalized development roadmaps per employee and role.',bg:'#ecfdf5',accent:'#16a34a'},
              {icon:'learning',title:'Learning & Training',desc:'Manage programs, track enrollments, and link certifications directly to identified competency gaps.',bg:'#f0fdf4',accent:'#34d399'},
              {icon:'recognition',title:'Social Recognition',desc:'Award excellence and enable peer shout-outs to build a culture of appreciation across teams.',bg:'#ecfdf5',accent:'#22c55e'},
              {icon:'succession',title:'Succession Planning',desc:'Identify and develop future leaders with AI-scored promotion readiness and talent pool tracking.',bg:'#f0fdf4',accent:'#15803d'},
              {icon:'shield',title:'Secure by Design',desc:'Password + OTP, 7-day device trust, role-based access, audit logging — RA 10173 compliant.',bg:'#ecfdf5',accent:'#16a34a'},
            ].map((f) => (
              <div key={f.title}
                style={{ background:'#f8fafc', border:'1px solid #dcefe2', borderRadius:16, padding:28, transition:'all 0.2s', cursor:'default' }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 24px rgba(34,197,94,0.12)';e.currentTarget.style.borderColor='#4ade80'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor='#dcefe2'}}
              >
                <div style={{ width:46, height:46, borderRadius:12, background:f.bg, border:`1px solid ${f.accent}33`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, color:f.accent }}>
                  <Icon name={f.icon} size={22}/>
                </div>
                <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 8px', letterSpacing:'-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize:13, color:'#64748b', lineHeight:1.65, margin:0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE STRIP ─────────────────────────────── */}
      <section style={{ background:'#052e16', padding:'40px 48px', display:'flex', justifyContent:'center', gap:60, flexWrap:'wrap', borderTop:'1px solid rgba(34,197,94,0.15)' }}>
        {[
          {label:'RA 10173 Compliant',sub:'Data Privacy Act'},
          {label:'DOH-Aligned',sub:'Healthcare Standards'},
          {label:'PRC-Ready',sub:'License Record Fields'},
          {label:'Audit Logged',sub:'Every Action Tracked'},
          {label:'7-Day Device Trust',sub:'Secure Auth Flow'},
        ].map((t) => (
          <div key={t.label} style={{ textAlign:'center' }}>
            <div style={{ color:'#4ade80', fontWeight:700, fontSize:14 }}>{t.label}</div>
            <div style={{ color:'#166534', fontSize:12, marginTop:3 }}>{t.sub}</div>
          </div>
        ))}
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer id="about" style={{ background:'#021a0c', padding:'36px 48px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ color:'#4ade80', fontWeight:700, fontSize:15 }}>IHIMS</div>
          <div style={{ color:'#166534', fontSize:12, marginTop:3 }}>Integrated Hospital Information Management System</div>
          <div style={{ color:'#14532d', fontSize:11, marginTop:2 }}>Bestlink College of the Philippines · Capstone Project · {new Date().getFullYear()}</div>
        </div>
        <div style={{ display:'flex', gap:20, alignItems:'center' }}>
          <button type="button" onClick={()=>{setTermsTab('toa');setShowTerms(true)}} style={{ background:'none', border:'none', color:'#166534', fontSize:12, cursor:'pointer', padding:0, fontFamily:'inherit' }}>Terms of Access</button>
          <button type="button" onClick={()=>{setTermsTab('eula');setShowTerms(true)}} style={{ background:'none', border:'none', color:'#166534', fontSize:12, cursor:'pointer', padding:0, fontFamily:'inherit' }}>EULA</button>
        </div>
      </footer>

      {/* ── TERMS MODAL ──────────────────────────────────── */}
      {showTerms && (
        <div style={{ position:'fixed', inset:0, background:'rgba(2,26,12,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={()=>setShowTerms(false)}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 25px 60px rgba(0,0,0,0.4)' }}
            onClick={(e)=>e.stopPropagation()}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #dcefe2', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong style={{ fontSize:16, color:'#0f172a' }}>Legal Agreements</strong>
              <button onClick={()=>setShowTerms(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#64748b', lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:'flex', borderBottom:'1px solid #dcefe2', padding:'0 24px' }}>
              {[{id:'toa',label:'Terms of Access'},{id:'eula',label:'EULA'}].map((t) => (
                <button key={t.id} onClick={()=>setTermsTab(t.id)} style={{ padding:'10px 16px', border:'none', background:'none', cursor:'pointer', fontWeight:termsTab===t.id?700:400, borderBottom:termsTab===t.id?'2px solid #22c55e':'2px solid transparent', color:termsTab===t.id?'#16a34a':'#64748b', fontSize:13, fontFamily:'inherit', transition:'all 0.15s' }}>{t.label}</button>
              ))}
            </div>
            <div style={{ overflowY:'auto', flex:1, padding:24, fontSize:13, lineHeight:1.75, color:'#374151' }}>
              {termsTab==='toa' ? (
                <div>
                  <h2 style={{ fontSize:16, marginBottom:4, color:'#0f172a' }}>Terms of Access</h2>
                  <p style={{ color:'#6b7280', marginBottom:16 }}>Effective: {new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} · IHIMS</p>
                  {[
                    ['1. System Overview','IHIMS is a web-based platform for authorised personnel of small to medium-sized healthcare institutions in the Philippines. It supports workforce management, performance monitoring, competency gap analysis, and learning management. Developed as an academic capstone project by students of Bestlink College of the Philippines.'],
                    ['2. Authorised Users','Access is strictly limited to individuals whose accounts have been created by a system administrator. Roles include Hospital Administrator, HR Personnel, and Staff. Unauthorised access or credential sharing is strictly prohibited.'],
                    ['3. Acceptable Use','Users must not access records outside their authorised scope, circumvent RBAC controls, violate RA 10173, share employee data without authorisation, or use AI outputs as the sole basis for employment decisions.'],
                    ['4. Data Privacy — RA 10173','All employee records are personal data under the Data Privacy Act of 2012. Users must handle data per applicable Philippine privacy regulations. Data must not be disclosed to unauthorised parties.'],
                    ['5. AI Limitation','The AI Competency Gap Analysis is a decision-support tool only. All employment decisions must involve qualified HR professionals and comply with Philippine labour law.'],
                    ['6. Security','Each user is responsible for the confidentiality of their credentials. OTP codes must not be shared. Report suspected unauthorised access to your administrator immediately.'],
                    ['7. Governing Law','Governed by Philippine law including RA 10173, the Labor Code, and applicable DOH and PRC regulations.'],
                  ].map(([h,p])=>(
                    <div key={h} style={{ marginBottom:16 }}>
                      <h4 style={{ color:'#16a34a', marginBottom:4 }}>{h}</h4>
                      <p style={{ margin:0 }}>{p}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize:16, marginBottom:4, color:'#0f172a' }}>End-User License Agreement</h2>
                  <p style={{ color:'#6b7280', marginBottom:16 }}>Effective: {new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} · IHIMS</p>
                  {[
                    ['1. Grant of License','A limited, non-exclusive, non-transferable license is granted to the subscribing healthcare institution for internal HR management purposes only. This does not convey ownership of the software.'],
                    ['2. Intellectual Property','IHIMS and all its components are the intellectual property of the development team and Bestlink College of the Philippines. Copying, modifying, distributing, or reverse-engineering without written consent is prohibited.'],
                    ['3. Data Ownership','All institutional data entered into IHIMS remains the sole property of the subscribing institution. The development team claims no ownership over institutional data.'],
                    ['4. AI Disclaimer','AI-generated outputs are for decision-support only. The development team makes no warranty regarding accuracy or fitness for a particular purpose of any AI-generated insight.'],
                    ['5. No Warranty','IHIMS is provided "as is." The development team does not warrant uninterrupted or error-free operation. The institution is responsible for data backup and security measures.'],
                    ['6. Limitation of Liability','To the fullest extent permitted by Philippine law, the development team shall not be liable for indirect, incidental, or consequential damages arising from use of IHIMS.'],
                    ['7. Governing Law','Governed by the laws of the Republic of the Philippines. Contact the IHIMS development team through Bestlink College of the Philippines for any Agreement questions.'],
                  ].map(([h,p])=>(
                    <div key={h} style={{ marginBottom:16 }}>
                      <h4 style={{ color:'#16a34a', marginBottom:4 }}>{h}</h4>
                      <p style={{ margin:0 }}>{p}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding:'16px 24px', borderTop:'1px solid #dcefe2', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', color:'#374151' }}>
                <input type="checkbox" checked={acceptedTerms} onChange={(e)=>setAcceptedTerms(e.target.checked)} style={{ accentColor:'#22c55e' }}/>
                I have read and accept these terms
              </label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setShowTerms(false)} style={{ padding:'8px 16px', border:'1px solid #dcefe2', borderRadius:8, background:'none', cursor:'pointer', fontSize:13, color:'#64748b', fontFamily:'inherit' }}>Close</button>
                <button onClick={()=>setShowTerms(false)} disabled={!acceptedTerms}
                  style={{ padding:'8px 20px', border:'none', borderRadius:8, background:acceptedTerms?'linear-gradient(135deg,#22c55e,#4ade80)':'#e2e8f0', color:acceptedTerms?'#fff':'#94a3b8', cursor:acceptedTerms?'pointer':'not-allowed', fontSize:13, fontWeight:700, fontFamily:'inherit', boxShadow:acceptedTerms?'0 4px 10px rgba(34,197,94,0.3)':'none' }}>
                  Accept & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}





// Main App Component
function App() {
  const [session, setSession] = useState(() => getStoredSession())

  const handleLogin = (s) => {
    const savedPhoto = getStoredUserPhoto(s.email)
    const next = savedPhoto ? { ...s, photo: savedPhoto } : { ...s }
    setStoredSession(next)
    setSession(next)
  }

  // Normal logout: clears session but KEEPS device trust token so the
  // user only needs Password (not OTP) when logging back in within 7 days.
  const handleLogout = () => {
    clearStoredSession()
    setSession(null)
  }

  // "Log out of all devices": clears session AND revokes trust on this
  // device + broadcasts revocation to same-browser tabs. Other physical
  // devices require server-side revocation (Supabase sessions table).
  const handleLogoutAll = () => {
    if (session?.email) {
      revokeAllDevices(session.email)
      appendAudit({ user: session.name || session.email, role: session.role || 'staff', action: 'logout_all', module: 'auth', detail: 'Logged out of all devices — trust revoked' })
    }
    clearStoredSession()
    setSession(null)
  }

  const handleUpdateMyPhoto = (photo) => {
    setSession((prev) => (prev ? { ...prev, photo } : prev))
  }

  const role = session?.role || 'staff'
  const roles = session?.roles && session.roles.length ? session.roles : [role]

  return (
    <div>
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <AppContent
          role={role}
          roles={roles}
          userName={session?.name}
          userEmail={session?.email}
          myPhoto={session?.photo}
          trustedDevice={session?.trustedDevice}
          trustDaysLeft={session?.trustDaysLeft}
          onUpdateMyPhoto={handleUpdateMyPhoto}
          onLogout={handleLogout}
          onLogoutAll={handleLogoutAll}
        />
      )}
    </div>
  )
}

export default App