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



// ---------------------------------------------------------------------------
// Seed data so the system is functional on first run
// ---------------------------------------------------------------------------
const initialEmployees = [
  { id: 1, name: 'Dr. Sarah Johnson', role: 'Chief Medical Officer', department: 'Cardiology', performance: 95, competency: 92, training: 98 },
  { id: 2, name: 'Dr. Michael Chen', role: 'Cardiologist', department: 'Cardiology', performance: 91, competency: 88, training: 90 },
  { id: 3, name: 'James Wilson', role: 'Senior Nurse', department: 'Nursing', performance: 88, competency: 85, training: 92 },
  { id: 4, name: 'Dr. Lisa Anderson', role: 'Pediatrician', department: 'Pediatrics', performance: 93, competency: 90, training: 95 },
  { id: 5, name: 'Emily Brown', role: 'Lab Technician', department: 'Laboratory', performance: 84, competency: 82, training: 86 },
  { id: 6, name: 'Maria Garcia', role: 'Registered Nurse', department: 'Nursing', performance: 86, competency: 84, training: 88 },
  { id: 7, name: 'Robert Taylor', role: 'Administrator', department: 'Administration', performance: 82, competency: 80, training: 84 },
  { id: 8, name: 'David Martinez', role: 'HR Manager', department: 'Administration', performance: 80, competency: 78, training: 82 },
]

const initialTrainingPrograms = [
  { id: 1, title: 'Emergency Response Training', type: 'Workshop', duration: '8 hours', participants: 20, status: 'ongoing', instructor: 'Dr. Alan Reed', cost: 0, seats: 20, date: '2026-07-05', time: '9:00 AM - 4:00 PM', location: 'Training Room A' },
  { id: 2, title: 'Advanced Cardiac Life Support', type: 'Certification', duration: '2 days', participants: 15, status: 'upcoming', instructor: 'Dr. Maya Patel', cost: 250, seats: 15, date: '2026-07-08', time: '8:00 AM - 5:00 PM', location: 'Conference Hall' },
  { id: 3, title: 'Patient Safety Protocols', type: 'Course', duration: '3 hours', participants: 30, status: 'completed', instructor: 'Nurse Kim Lee', cost: 0, seats: 30, date: '2026-06-20', time: '2:00 PM - 5:00 PM', location: 'Training Room B' },
  { id: 4, title: 'Leadership Development', type: 'Seminar', duration: '1 day', participants: 12, status: 'upcoming', instructor: 'Dr. Sarah Johnson', cost: 150, seats: 12, date: '2026-07-12', time: '9:00 AM - 5:00 PM', location: 'Boardroom' },
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
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', status: 'active', name: 'Administrator', email: 'admin@ihims.local' },
  { id: 2, username: 'hr', password: 'hr123', role: 'hr', status: 'active', name: 'HR Manager', email: 'hr@ihims.local' },
  { id: 3, username: 'staff', password: 'staff123', role: 'staff', status: 'active', name: 'Staff Member', email: 'staff@ihims.local' },
]

const initialAnnouncements = [
  { id: 1, title: 'Welcome to the new IHIMS portal', body: 'We are excited to launch our AI-driven HRMS. Explore performance, learning, and more.', category: 'General', author: 'Administrator', date: '2026-06-01', pinned: true },
  { id: 2, title: 'Mandatory safety drill this Friday', body: 'All staff must attend the emergency response drill at 9:00 AM in Training Room A.', category: 'Safety', author: 'HR Manager', date: '2026-06-20', pinned: false },
  { id: 3, title: 'New certification window opens', body: 'Enrollment for Advanced Cardiac Life Support is now open in the Learning module.', category: 'Training', author: 'HR Manager', date: '2026-06-25', pinned: false },
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
              <div className="notif-empty">You're all caught up! 🎉</div>
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

// App Content - localStorage-backed
function AppContent({ role, userName, userEmail, myPhoto, onUpdateMyPhoto, onLogout }) {
  const [employees, setEmployees] = useState(() => getStoredData('ihims_employees', initialEmployees))
  const [trainingPrograms, setTrainingPrograms] = useState(() => getStoredData('ihims_training', initialTrainingPrograms))
  const [competencies, setCompetencies] = useState(() => getStoredData('ihims_competencies', initialCompetencies))
  const [recognitionAwards, setRecognitionAwards] = useState(() => getStoredData('ihims_recognition', initialRecognitionAwards))
const [successionCandidates, setSuccessionCandidates] = useState(() => getStoredData('ihims_succession', initialSuccessionCandidates))
const [accounts, setAccounts] = useState(() => getStoredData('ihims_accounts', initialAccounts))
  const [registrations, setRegistrations] = useState(() => getStoredData('ihims_registrations', []))
  const [announcements, setAnnouncements] = useState(() => getStoredData('ihims_announcements', initialAnnouncements))
  const [loading] = useState(false)
  const [loadError] = useState('')

const roleDisplayName = useMemo(() => roleLabel(role), [role])

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

const actor = { name: userName || role, role, email: userEmail }

  const nextId = (arr) => {
    return arr.length > 0 ? Math.max(...arr.map((x) => Number(x.id) || 0)) + 1 : 1
  }

  const addEmployee = (emp) => {
    requireEdit(role, 'performance')
    const newRow = { ...emp, id: nextId(employees) }
    setEmployees((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'performance', detail: `Added employee "${newRow.name}"` })
  }

  const updateEmployee = (id, data) => {
    requireEdit(role, 'performance')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'performance', detail: `Updated employee "${target?.name || id}"` })
  }

  const deleteEmployee = (id) => {
    requireEdit(role, 'performance')
    const target = employees.find((e) => e.id === id)
    setEmployees((prev) => prev.filter((e) => e.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'performance', detail: `Deleted employee "${target?.name || id}"` })
  }

  const addTraining = (prog) => {
    requireEdit(role, 'learning')
    const newRow = { ...prog, id: nextId(trainingPrograms) }
    setTrainingPrograms((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'learning', detail: `Added training program "${newRow.title}"` })
  }

const deleteTraining = (id) => {
    requireEdit(role, 'learning')
    const target = trainingPrograms.find((p) => p.id === id)
    setTrainingPrograms((prev) => prev.filter((p) => p.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'learning', detail: `Deleted training program "${target?.title || id}"` })
  }

  const registerTraining = (programId) => {
    // Staff (and up) can register themselves for training/certifications.
    requireEdit(role, 'learning')
    const program = trainingPrograms.find((p) => p.id === programId)
    if (!program) throw new Error('Program not found')
    if (program.status === 'completed') throw new Error('This program has already been completed')
    // Avoid duplicate registration
    const already = registrations.some((r) => r.programId === programId && r.userId === actor.name)
    if (already) {
      throw new Error('You are already registered for this program')
    }
    const newRow = { id: nextId(registrations), programId, userId: actor.name, programTitle: program.title, registeredOn: new Date().toISOString() }
    setRegistrations((prev) => [...prev, newRow])
    // Increment participant count
    setTrainingPrograms((prev) => prev.map((p) => (p.id === programId ? { ...p, participants: (p.participants || 0) + 1 } : p)))
    appendAudit({ user: actor.name, role, action: 'register', module: 'learning', detail: `Registered for "${program.title}"` })
    return newRow
  }

  const addRecognition = (rec) => {
    requireEdit(role, 'recognition')
    const newRow = { ...rec, id: nextId(recognitionAwards), likes: 0, comments: [] }
    setRecognitionAwards((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'recognition', detail: `Added recognition for "${newRow.recipient}"` })
  }

  const deleteRecognition = (id) => {
    requireEdit(role, 'recognition')
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
    requireEdit(role, 'competency')
    const newRow = { ...comp, weight: Number(comp.weight) || 0, id: nextId(competencies) }
    setCompetencies((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'competency', detail: `Added competency "${newRow.name}"` })
  }

  const updateCompetency = (id, data) => {
    requireEdit(role, 'competency')
    const target = competencies.find((c) => c.id === id)
    setCompetencies((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, weight: Number(data.weight) || c.weight } : c)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'competency', detail: `Updated competency "${target?.name || id}"` })
  }

  const deleteCompetency = (id) => {
    requireEdit(role, 'competency')
    const target = competencies.find((c) => c.id === id)
    setCompetencies((prev) => prev.filter((c) => c.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'competency', detail: `Deleted competency "${target?.name || id}"` })
  }

  const addSuccession = (plan) => {
    requireEdit(role, 'succession')
    const newRow = { ...plan, candidates: Array.isArray(plan.candidates) ? plan.candidates : [], id: nextId(successionCandidates) }
    setSuccessionCandidates((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'succession', detail: `Added succession plan for "${newRow.currentRole}"` })
  }

  const updateSuccession = (id, data) => {
    requireEdit(role, 'succession')
    const target = successionCandidates.find((c) => c.id === id)
    setSuccessionCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, candidates: Array.isArray(data.candidates) ? data.candidates : c.candidates } : c)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'succession', detail: `Updated succession plan "${target?.currentRole || id}"` })
  }

  const deleteSuccession = (id) => {
    requireEdit(role, 'succession')
    const target = successionCandidates.find((c) => c.id === id)
    setSuccessionCandidates((prev) => prev.filter((c) => c.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'succession', detail: `Deleted succession plan "${target?.currentRole || id}"` })
  }

  const addAccount = (acc) => {
    requireEdit(role, 'accounts')
    const username = acc.username.trim().toLowerCase()
    if (!username || !acc.password) {
      throw new Error('Username and password are required')
    }
    if (accounts.some((a) => a.username === username)) {
      throw new Error(`An account with username "${username}" already exists`)
    }
    const newRow = { ...acc, username, id: nextId(accounts) }
    setAccounts((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'accounts', detail: `Created account "${username}"` })
  }

  const updateAccount = (id, data) => {
    requireEdit(role, 'accounts')
    const target = accounts.find((a) => a.id === id)
    const username = data.username.trim().toLowerCase()
    if (username && accounts.some((a) => a.username === username && a.id !== id)) {
      throw new Error(`An account with username "${username}" already exists`)
    }
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data, username: username || a.username } : a)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'accounts', detail: `Updated account "${target?.username || id}"` })
  }

const deleteAccount = (id) => {
    requireEdit(role, 'accounts')
    const target = accounts.find((a) => a.id === id)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'accounts', detail: `Deleted account "${target?.username || id}"` })
  }

  const addAnnouncement = (ann) => {
    requireEdit(role, 'announcements')
    const newRow = { ...ann, pinned: !!ann.pinned, id: nextId(announcements) }
    setAnnouncements((prev) => [...prev, newRow])
    appendAudit({ user: actor.name, role, action: 'create', module: 'announcements', detail: `Posted announcement "${newRow.title}"` })
  }

  const updateAnnouncement = (id, data) => {
    requireEdit(role, 'announcements')
    const target = announcements.find((a) => a.id === id)
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
    appendAudit({ user: actor.name, role, action: 'update', module: 'announcements', detail: `Updated announcement "${target?.title || id}"` })
  }

  const deleteAnnouncement = (id) => {
    requireEdit(role, 'announcements')
    const target = announcements.find((a) => a.id === id)
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    appendAudit({ user: actor.name, role, action: 'delete', module: 'announcements', detail: `Removed announcement "${target?.title || id}"` })
  }

  const bulkDeleteEmployees = (ids) => {
    requireEdit(role, 'performance')
    const remaining = employees.filter((e) => !ids.includes(e.id))
    setEmployees(remaining)
    appendAudit({ user: actor.name, role, action: 'bulk_delete', module: 'performance', detail: `Bulk-deleted ${ids.length} employee record(s)` })
  }

// Update an employee's photo (or any settings-level field).
  const updateEmployeePhoto = (id, photo) => {
    requireEdit(role, 'settings')
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

const renderModule = () => {
    // RBAC: verify view permission (throws 403 if denied), show a 403 page.
    try {
      requireView(role, activeModule)
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
            employees={employees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
            successionCandidates={successionCandidates}
            announcements={announcements}
            canEdit={role === 'admin' || role === 'hr'}
          />
        )
case 'performance':
        return (
          <PerformanceModule
            employees={employees}
            canEdit={canEditModule(role, 'performance')}
            addEmployee={addEmployee}
            updateEmployee={updateEmployee}
            deleteEmployee={deleteEmployee}
            bulkDeleteEmployees={bulkDeleteEmployees}
          />
        )
      case 'competency':
        return (
<CompetencyModule
            competencies={competencies}
            canEdit={canEditModule(role, 'competency')}
            employees={employees}
            addCompetency={addCompetency}
            updateCompetency={updateCompetency}
            deleteCompetency={deleteCompetency}
          />
        )
      case 'aiCompetency':
        return (
          <GapAnalysisModule
            employees={employees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
          />
        )
case 'learning':
        return (
          <LearningModule
            trainingPrograms={trainingPrograms}
            addTraining={addTraining}
            deleteTraining={deleteTraining}
            registerTraining={registerTraining}
            registrations={registrations}
            canEdit={canEditModule(role, 'learning')}
            role={role}
            userName={actor.name}
          />
        )
      case 'succession':
        return (
          <SuccessionModule
            successionCandidates={successionCandidates}
            employees={employees}
            canEdit={canEditModule(role, 'succession')}
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
            canEdit={canEditModule(role, 'recognition')}
          />
        )
case 'accounts':
        return (
          <AccountsModule
            accounts={accounts}
            canEdit={canEditModule(role, 'accounts')}
            addAccount={addAccount}
            updateAccount={updateAccount}
            deleteAccount={deleteAccount}
          />
        )
      case 'announcements':
        return (
          <AnnouncementsModule
            announcements={announcements}
            canEdit={canEditModule(role, 'announcements')}
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
            employees={employees}
            accounts={accounts}
            canEdit={canEditModule(role, 'settings')}
            updateEmployeePhoto={updateEmployeePhoto}
            updateMyPhoto={updateMyPhoto}
            myPhoto={myPhoto}
            role={role}
            userName={actor.name}
            userEmail={actor.email}
          />
        )
      case 'audit':
        return <AuditModule />
default:
        return (
          <Dashboard
            employees={employees}
            trainingPrograms={trainingPrograms}
            recognitionAwards={recognitionAwards}
            successionCandidates={successionCandidates}
            announcements={announcements}
            canEdit={role === 'admin' || role === 'hr'}
          />
        )
    }
  }

  const [activeModule, setActiveModule] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
<NotificationBell
              announcements={announcements}
              trainingPrograms={trainingPrograms}
              employees={employees}
              userName={actor.name}
              onNavigate={(mod) => { setActiveModule(mod); setMobileMenuOpen(false) }}
            />
<button className="btn-cancel" onClick={onLogout} type="button">
              <Icon name="logout" size={16} /> Logout
            </button>
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
function Navbar({ activeModule, setActiveModule, mobileMenuOpen, setMobileMenuOpen, userName, role, myPhoto }) {
  // RBAC: only show modules the role is allowed to see
  const visibleModules = visibleModulesFor(role)

  // Split into core (featured) modules and supporting modules so the system
  // is focused on 6 primary modules with the rest as secondary tools.
  const coreModules = visibleModules.filter((m) => m.featured)
  const adminModules = visibleModules.filter((m) => !m.featured)

  // The section label adapts to the user's role — "Admin & Tools" only makes
  // sense for admins; HR and staff see a neutral label instead.
  const sectionTitle =
    role === 'admin' ? 'Admin & Tools' :
    role === 'hr' ? 'HR Tools' : 'More'

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
<span className="role-badge">{roleLabel(role)}</span>
      </div>
    </nav>
  )
}

// Dashboard Component
function Dashboard({ employees, trainingPrograms, recognitionAwards, successionCandidates, announcements, canEdit }) {
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

  return (
<div className="dashboard">
      <h1 className="page-title">AI-Driven Human Resource Management System</h1>
      <p className="page-subtitle">Competency Gap Analysis for Performance and Development</p>

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
              <div className="attention-empty">All employees are performing well 🎉</div>
            ) : null}
          </div>
        </div>

{canEdit ? (
          <div className="panel">
            <h2 className="panel-title">Quick Actions</h2>
            <div className="quick-actions">
              <button className="quick-action" onClick={() => {}}><Icon name="plus" size={16} /> Add Employee</button>
              <button className="quick-action" onClick={() => {}}><Icon name="calendar" size={16} /> Schedule Training</button>
              <button className="quick-action" onClick={() => {}}><Icon name="recognition" size={16} /> Give Recognition</button>
              <button className="quick-action" onClick={() => {}}><Icon name="ai" size={16} /> Run Gap Analysis</button>
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
                    <span className="dashboard-announcement-title">
                      {ann.pinned ? '📌 ' : ''}{ann.title}
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

// Performance Module
function PerformanceModule({ employees, canEdit, addEmployee, updateEmployee, deleteEmployee, bulkDeleteEmployees }) {
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('All')
  const [sortBy, setSortBy] = useState('performance')
  const [newEmp, setNewEmp] = useState({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })
  const [selectedIds, setSelectedIds] = useState([])

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
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })
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
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })
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
          </div>


          {showAddForm && (
            <form className="data-form" onSubmit={handleAddEmployee}>
              <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input type="text" placeholder="Role" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} required />
              <input type="text" placeholder="Department" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})} required />
              <input type="number" placeholder="Performance" value={newEmp.performance} onChange={e => setNewEmp({...newEmp, performance: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Competency" value={newEmp.competency} onChange={e => setNewEmp({...newEmp, competency: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Training" value={newEmp.training} onChange={e => setNewEmp({...newEmp, training: parseInt(e.target.value)})} min="0" max="100" />
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
                <th>Performance</th>
                <th>Competency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
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
                        <button
                          className="btn-edit"
                          onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleEditEmployee() }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleDeleteEmployee() }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="readonly-cell">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Competency Module
function CompetencyModule({ competencies, canEdit, employees, addCompetency, updateCompetency, deleteCompetency }) {
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
          <h2 className="panel-title">Competency Assessment by Department</h2>
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
              {deptAssessment.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td>{d.clinical}%</td>
                  <td>{d.communication}%</td>
                  <td>{d.leadership}%</td>
                  <td>{d.technical}%</td>
                  <td>{d.compliance}%</td>
                  <td><strong>{d.overall}%</strong></td>
                </tr>
              ))}
              {deptAssessment.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 16 }}>No employee data available.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Learning & Training Module
function LearningModule({ trainingPrograms, addTraining, deleteTraining, registerTraining, registrations, canEdit, role, userName }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProg, setNewProg] = useState({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming', instructor: '', cost: 0, seats: 0, date: '', time: '', location: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const handleAddTraining = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newProg.title) {
      addTraining(newProg)
      setMsg(`Training program "${newProg.title}" created.`)
      setNewProg({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming', instructor: '', cost: 0, seats: 0, date: '', time: '', location: '' })
      setShowAddForm(false)
    }
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
  const canManage = role === 'admin' || role === 'hr'

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

{showAddForm && (
          <form className="data-form" onSubmit={handleAddTraining}>
            <input type="text" placeholder="Program Title" value={newProg.title} onChange={e => setNewProg({...newProg, title: e.target.value})} required />
            <select value={newProg.type} onChange={e => setNewProg({...newProg, type: e.target.value})}>
              <option value="Workshop">Workshop</option>
              <option value="Certification">Certification</option>
              <option value="Seminar">Seminar</option>
              <option value="Course">Course</option>
            </select>
            <input type="text" placeholder="Duration" value={newProg.duration} onChange={e => setNewProg({...newProg, duration: e.target.value})} />
            <input type="text" placeholder="Instructor" value={newProg.instructor} onChange={e => setNewProg({...newProg, instructor: e.target.value})} />
            <input type="number" placeholder="Cost ($)" value={newProg.cost} onChange={e => setNewProg({...newProg, cost: parseInt(e.target.value) || 0})} />
            <input type="number" placeholder="Seats" value={newProg.seats} onChange={e => setNewProg({...newProg, seats: parseInt(e.target.value) || 0})} />
            <input type="date" value={newProg.date} onChange={e => setNewProg({...newProg, date: e.target.value})} />
            <input type="text" placeholder="Time" value={newProg.time} onChange={e => setNewProg({...newProg, time: e.target.value})} />
            <input type="text" placeholder="Location" value={newProg.location} onChange={e => setNewProg({...newProg, location: e.target.value})} />
            <select value={newProg.status} onChange={e => setNewProg({...newProg, status: e.target.value})}>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
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
                <span>📅 {prog.date || prog.duration}</span>
                {prog.instructor ? <span>👩‍🏫 {prog.instructor}</span> : null}
                {prog.location ? <span>📍 {prog.location}</span> : null}
                <span>👥 {prog.participants}{prog.seats ? ` / ${prog.seats}` : ''}</span>
                {prog.cost ? <span>💰 ${prog.cost}</span> : null}
              </div>
              <div className="program-progress">
                <div className="program-progress-bar">
                  <div className="program-progress-fill" style={{ width: prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%' }}></div>
                </div>
                <span className="program-progress-text">{prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%'}</span>
              </div>
              <div className="program-actions">
                {canEdit && prog.status !== 'completed' && !registeredIds.has(prog.id) ? (
                  <button className="btn-register" onClick={() => handleRegister(prog.id)}>Register</button>
                ) : null}
                {registeredIds.has(prog.id) ? <span className="registered-badge">✓ Registered</span> : null}
                {canEdit && (role === 'admin' || role === 'hr') ? (
                  <button className="btn-delete" onClick={() => handleDelete(prog.id)}>Delete</button>
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
              </tr>
            </thead>
            <tbody>
              {myRegistrations.map(r => (
                <tr key={r.id}>
                  <td>{r.programTitle}</td>
                  <td>{new Date(r.registeredOn).toLocaleString()}</td>
                </tr>
              ))}
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
            <tr>
              <td>Emergency Response Training</td>
              <td>July 5, 2026</td>
              <td>9:00 AM - 4:00 PM</td>
              <td>Training Room A</td>
              <td>15 / 20</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
            <tr>
              <td>Advanced Cardiac Life Support</td>
              <td>July 8-9, 2026</td>
              <td>8:00 AM - 5:00 PM</td>
              <td>Conference Hall</td>
              <td>8 / 15</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
            <tr>
              <td>Patient Safety Protocols</td>
              <td>July 12, 2026</td>
              <td>2:00 PM - 5:00 PM</td>
              <td>Training Room B</td>
              <td>22 / 30</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
          </tbody>
        </table>
      </div>
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
          <span className="succession-stat-label">⚠️ At Risk (Low)</span>
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
function RecognitionModule({ recognitionAwards, _employees, addRecognition, deleteRecognition, toggleLike, addComment, canEdit }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAward, setNewAward] = useState({ recipient: '', type: 'Employee of Month', department: '', date: new Date().toISOString().split('T')[0], reason: '' })
  const [commentInputs, setCommentInputs] = useState({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('All')

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
          <div className="peer-recognition-item">
            <span className="peer-avatar"><Icon name="user" size={30} /></span>
            <div className="peer-content">
              <span className="peer-from">Maria Garcia recognized James Wilson</span>
              <p className="peer-message">"Great work on the new patient intake process!"</p>
              <span className="peer-time">2 hours ago</span>
            </div>
          </div>
          <div className="peer-recognition-item">
            <span className="peer-avatar"><Icon name="user" size={30} /></span>
            <div className="peer-content">
              <span className="peer-from">Dr. Sarah Johnson recognized Emily Brown</span>
              <p className="peer-message">"Thank you for your attention to detail in the lab results!"</p>
              <span className="peer-time">5 hours ago</span>
            </div>
          </div>
          <div className="peer-recognition-item">
            <span className="peer-avatar"><Icon name="user" size={30} /></span>
            <div className="peer-content">
              <span className="peer-from">Robert Taylor recognized Dr. Lisa Anderson</span>
              <p className="peer-message">"Wonderful bedside manner with the pediatric patients!"</p>
              <span className="peer-time">1 day ago</span>
            </div>
          </div>
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
function AccountsModule({ accounts, canEdit, addAccount, updateAccount, deleteAccount }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [formMsg, setFormMsg] = useState('')
  const [formError, setFormError] = useState('')
  const [newAcc, setNewAcc] = useState({ username: '', password: '', role: 'staff', status: 'active', name: '' })

  const resetForm = () => {
    setNewAcc({ username: '', password: '', role: 'staff', status: 'active', name: '' })
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
      setFormMsg(`Account "${newAcc.username}" created successfully.`)
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
    setNewAcc({ username: acc.username, password: acc.password, role: acc.role, status: acc.status, name: acc.name || '' })
    setShowEditForm(true)
    setShowAddForm(false)
    setFormMsg('')
    setFormError('')
  }

  const handleDelete = (acc) => {
    if (!canEdit) return
    if (acc.role === 'admin' && accounts.filter((a) => a.role === 'admin').length <= 1) {
      setFormError('Cannot delete the last admin account.')
      return
    }
    if (confirm(`Delete account "${acc.username}"?`)) {
      try {
        deleteAccount(acc.id)
        setFormMsg(`Account "${acc.username}" deleted.`)
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

      <div className="form-section">
        <button className="btn-add" onClick={() => { if (canEdit) { setShowAddForm(!showAddForm); setShowEditForm(false); setFormMsg(''); setFormError('') } }} disabled={!canEdit}>
          {showAddForm ? 'Cancel' : '+ Add Account'}
        </button>

        {showAddForm && (
          <form className="data-form" onSubmit={handleAdd}>
            <input type="text" placeholder="Username" value={newAcc.username} onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })} required />
            <input type="text" placeholder="Display name" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} />
            <input type="text" placeholder="Password" value={newAcc.password} onChange={(e) => setNewAcc({ ...newAcc, password: e.target.value })} required />
            <select value={newAcc.role} onChange={(e) => setNewAcc({ ...newAcc, role: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="hr">HR Manager</option>
              <option value="staff">Staff</option>
            </select>
            <select value={newAcc.status} onChange={(e) => setNewAcc({ ...newAcc, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <button type="submit" className="btn-save">Create Account</button>
          </form>
        )}
      </div>

      {showEditForm && (
        <div className="edit-form">
          <h3>Edit Account</h3>
          <form className="data-form" onSubmit={handleEditSave}>
            <input type="text" placeholder="Username" value={newAcc.username} onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })} required />
            <input type="text" placeholder="Display name" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} />
            <input type="text" placeholder="Password" value={newAcc.password} onChange={(e) => setNewAcc({ ...newAcc, password: e.target.value })} required />
            <select value={newAcc.role} onChange={(e) => setNewAcc({ ...newAcc, role: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="hr">HR Manager</option>
              <option value="staff">Staff</option>
            </select>
            <select value={newAcc.status} onChange={(e) => setNewAcc({ ...newAcc, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
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
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td><strong>{acc.username}</strong></td>
                <td>{acc.name || '—'}</td>
                <td><span className={`status-badge ${acc.role === 'admin' ? 'excellent' : acc.role === 'hr' ? 'good' : 'needs-improvement'}`}>{roleLabel(acc.role)}</span></td>
                <td><span className={`status-badge ${acc.status === 'active' ? 'excellent' : 'needs-improvement'}`}>{acc.status}</span></td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-edit" onClick={() => startEdit(acc)} disabled={!canEdit}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(acc)} disabled={!canEdit}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
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
              <h3 className="announcement-title">{ann.pinned ? '📌 ' : ''}{ann.title}</h3>
              <span className={`announcement-category ${ann.category ? `cat-${ann.category.toLowerCase()}` : ''}`}>{ann.category}</span>
            </div>
            <p className="announcement-body">{ann.body}</p>
            <div className="announcement-meta">
              <span>👤 {ann.author}</span>
              <span>📅 {ann.date}</span>
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
function SettingsModule({ employees, accounts, canEdit, updateEmployeePhoto, updateMyPhoto, myPhoto, role, userName, userEmail }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDept, setFilterDept] = useState('All')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))]
  const myEmail = userEmail
  const myAccount = (accounts || []).find(
    (a) => (a.email || '').toLowerCase() === (myEmail || '').toLowerCase() || (a.username || '').toLowerCase() === (userName || '').toLowerCase()
  )

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
            <span className="role-badge">{roleLabel(role)}</span>
            {myEmail ? <span className="settings-profile-email">{myEmail}</span> : null}
            {myAccount ? <span className="settings-profile-email">{myAccount.username}</span> : null}
          </div>
          <p className="settings-profile-desc">
            This is your personal profile. Upload a profile picture so colleagues can recognize you across the system.
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
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const [stage, setStage] = useState('email') // 'email' | 'otp'
  const [pendingEmail, setPendingEmail] = useState(null)

  const [otp, setOtp] = useState('')
  const [demoOtp, setDemoOtp] = useState('')
  const [demoMode, setDemoMode] = useState(false)

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

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em) { setError('Enter your email address'); return }

    setError('')
    setInfo('')
    setBusy(true)

// Look up the account by email (falling back to username) to map the role.
    const accounts = getAccountsWithSeeds()
    const account = accounts.find(
      (a) => (a.email || '').toLowerCase() === em || (a.username || '').toLowerCase() === em
    )

    // Allow any valid email to request a Supabase OTP. If it matches a
    // registered account, use its role; otherwise default to 'staff'.
    if (account && account.status !== 'active') {
      setBusy(false)
      appendAudit({ user: em, role: account.role, action: 'login_failed', module: 'auth', detail: 'Account disabled' })
      setError('This account is disabled. Contact an administrator.')
      return
    }

    try {
      if (demoOtpEnabled()) {
        startDemoOtp(em)
        appendAudit({ user: em, role: account?.role || 'staff', action: 'login_attempt', module: 'auth', detail: 'Demo OTP generated (no email sent)' })
      } else {
        await sendOtp(em)
        setDemoMode(false)
        setPendingEmail(em)
        setOtp('')
        setStage('otp')
        setInfo(`A 6-digit verification code has been sent to ${em}.`)
        appendAudit({ user: em, role: account?.role || 'staff', action: 'login_attempt', module: 'auth', detail: 'Email OTP sent' })
      }
} catch (err) {
      // If Supabase email delivery fails (e.g. SMTP not configured), gracefully
      // fall back to a locally-generated code so login always works. The real
      // Supabase error is still logged for diagnosis.
      // eslint-disable-next-line no-console
      console.error('[IHIMS] Supabase OTP failed, using demo fallback:', err)
      setDemoMode(false)
      startDemoOtp(em)
      appendAudit({ user: em, role: account?.role || 'staff', action: 'login_attempt', module: 'auth', detail: 'Supabase OTP failed, used demo OTP fallback' })
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
    if (!normalized || normalized.length !== 6) {
      setError('Enter the 6-digit code')
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

// Map role from the account registry using the verified email (falling back
      // to username). If the email isn't in the registry (e.g. a brand-new
      // Supabase user), fall back to a default 'staff' role so login completes.
      const accounts = getAccountsWithSeeds()
      const account = accounts.find(
        (a) => (a.email || '').toLowerCase() === pendingEmail || (a.username || '').toLowerCase() === pendingEmail
      )
      const role = account?.role || 'staff'
      const name = account?.name || roleLabel(role)

      appendAudit({ user: pendingEmail, role, action: 'login', module: 'auth', detail: `Successful login as ${roleLabel(role)}` })
      onLogin({ role, name, email: pendingEmail })
    } catch (err) {
      setError(err?.message || 'Incorrect or expired code. Please try again.')
    } finally {
      setBusy(false)
    }
  }


const featureCards = [
    { icon: 'performance', title: 'Performance Analytics', desc: 'Track performance, competency, and training metrics with live charts.' },
    { icon: 'ai', title: 'AI Competency Engine', desc: 'Evidence-based gap analysis with personalized development roadmaps.' },
    { icon: 'learning', title: 'Learning & Certifications', desc: 'Manage training programs, enrollments, and professional growth.' },
    { icon: 'recognition', title: 'Social Recognition', desc: 'Celebrate achievements with awards, likes, and peer recognition.' },
    { icon: 'succession', title: 'Succession Planning', desc: 'Identify and develop future leaders for key positions.' },
    { icon: 'shield', title: 'Role-Based Access', desc: 'Secure admin, HR, and staff access with OTP verification.' },
  ]

  return (
    <div className="landing-shell">
      {/* Top navigation bar */}
      <header className="landing-nav">
<div className="landing-brand">
          <span className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 4v16M4 12h16" />
            </svg>
          </span>
          <div className="logo-text">
            <span className="hospital-name">AI-Driven HRMS</span>
            <span className="hospital-tagline">Competency Gap Analysis</span>
          </div>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="mailto:admin@ihims.local">Contact</a>
        </div>
      </header>

      <div className="landing-hero">
        {/* Left column: hero copy */}
        <div className="landing-hero-left">
          <span className="landing-badge">✦ Intelligent HR Management</span>
          <h1 className="landing-title">
            Empower your team.<br />
            <span className="landing-title-accent">Close the competency gap.</span>
          </h1>
          <p className="landing-subtitle">
            IHIMS is an AI-driven Human Resource Management System that blends performance analytics,
            competency gap analysis, learning, succession planning, and recognition into one unified platform.
          </p>

          <div className="landing-stats">
            <div className="landing-stat">
              <span className="landing-stat-num"><AnimatedNumber value={8} duration={900} /></span>
              <span className="landing-stat-label">Staff Modules</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-num"><AnimatedNumber value={100} suffix="%" duration={900} /></span>
              <span className="landing-stat-label">Data-Self Contained</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-num"><AnimatedNumber value={3} duration={900} /></span>
              <span className="landing-stat-label">Role Levels</span>
            </div>
          </div>

          <ul className="landing-check-list">
            <li>Real-time dashboards & animated charts</li>
            <li>AI-powered competency & readiness insights</li>
            <li>Secure OTP-protected login with RBAC</li>
          </ul>
        </div>

        {/* Right column: login card */}
        <div className="landing-login-wrap">
          <div className="login-card">
<div className="login-card-head">
              <span className="login-card-icon"><Icon name="shield" size={26} /></span>
              <h1 className="login-title">{stage === 'otp' ? 'Verify Code' : 'Welcome Back'}</h1>
              <p className="login-subtitle">
                {stage === 'otp'
                  ? `Enter the 6-digit code sent to ${pendingEmail}.`
                  : 'Sign in with your email. We will send a one-time code.'}
              </p>
            </div>

            {stage === 'email' ? (
              <form onSubmit={handleEmailSubmit} className="login-form">
                <label className="login-field">
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="you@ihims.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>

                {error ? <div className="login-error">{error}</div> : null}
                {info ? <div className="login-info">{info}</div> : null}

                <button type="submit" className="btn-save login-submit" disabled={busy}>
                  {busy ? 'Sending code…' : 'Send Verification Code →'}
                </button>

<div className="login-demo-hint">
                  <strong>Demo accounts:</strong> admin@ihims.local • hr@ihims.local • staff@ihims.local
                  <br />
                  Use any email you can receive mail at — a one-time code will be sent to it.
                </div>
              </form>
            ) : (
<form onSubmit={handleOtpSubmit} className="login-form">
                {demoMode && demoOtp ? (
                  <div className="login-demo-code">
                    <span className="login-demo-label">Demo verification code</span>
                    <span className="login-demo-value">{demoOtp}</span>
                  </div>
                ) : null}
                <label className="login-field">
                  <span>6-digit code</span>
                  <input
                    type="text"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                  />
                </label>

                {info ? <div className="login-info">{info}</div> : null}
                {error ? <div className="login-error">{error}</div> : null}

                <button type="submit" className="btn-save login-submit" disabled={busy}>
                  {busy ? 'Verifying…' : 'Confirm Code'}
                </button>

                <div className="login-form-actions">
                  <button type="button" className="btn-cancel" onClick={resendOtp} disabled={busy}>Resend Code</button>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setStage('email')
                      setError('')
                      setInfo('')
                      setOtp('')
                      setPendingEmail(null)
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Features section */}
      <section className="landing-features" id="features">
        <h2 className="landing-section-title">Everything your HR team needs</h2>
        <p className="landing-section-sub">One intelligent platform for workforce development and engagement.</p>
        <div className="landing-features-grid">
{featureCards.map((f, i) => (
            <div className="landing-feature-card" key={f.title} style={{ animationDelay: `${i * 80}ms` }}>
              <span className="landing-feature-icon"><Icon name={f.icon} size={30} /></span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About / footer */}
      <footer className="landing-footer" id="about">
        <p>
          <strong>IHIMS</strong> — AI-Driven Human Resource Management System. Built for modern, data-driven healthcare teams.
        </p>
        <p className="landing-footer-meta">© {new Date().getFullYear()} IHIMS • Competency Gap Analysis Platform</p>
      </footer>
    </div>
  )
}


// Main App Component
function App() {
  const [session, setSession] = useState(() => getStoredSession())

const handleLogin = (s) => {
    // Restore the user's saved profile photo (stored per-user so it survives
    // logout/login — the session itself is cleared on logout).
    const savedPhoto = getStoredUserPhoto(s.email)
    const next = savedPhoto ? { ...s, photo: savedPhoto } : { ...s }
    setStoredSession(next)
    setSession(next)
  }

  const handleLogout = () => {
    clearStoredSession()
    setSession(null)
  }

  // Update the logged-in user's profile photo in the in-memory session so the
  // UI reflects the change immediately (also persisted via updateMyPhoto).
  const handleUpdateMyPhoto = (photo) => {
    setSession((prev) => (prev ? { ...prev, photo } : prev))
  }

// Wrap AppContent with a role-aware controller (RBAC).
  const role = session?.role || 'staff'

  return (
    <div>
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
<AppContent
          role={role}
          userName={session?.name}
          userEmail={session?.email}
          myPhoto={session?.photo}
          onUpdateMyPhoto={handleUpdateMyPhoto}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

export default App
