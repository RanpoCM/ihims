// =============================================================================
// IHIMS — Supabase data access layer: remaining tables
// (training_programs, competencies, recognition_awards, succession_candidates,
//  registrations, announcements, review_cycles, reviews, attendance)
//
// Same pattern as supabaseEmployees.js:
//   - fromRow / toRow handle camelCase ↔ snake_case conversion
//   - Every function mirrors the existing localStorage function name in App.jsx
//   - All functions throw on error so the caller can roll back optimistic UI
// =============================================================================

import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const omitUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ---------------------------------------------------------------------------
// TRAINING PROGRAMS
// ---------------------------------------------------------------------------
const fromTrainingRow = (r) => r ? {
  id:            r.id,
  title:         r.title,
  type:          r.type,
  duration:      r.duration,
  participants:  r.participants,
  seats:         r.seats,
  status:        r.status,
  instructor:    r.instructor    ?? '',
  cost:          r.cost          ?? 0,
  date:          r.date          ?? '',
  time:          r.time          ?? '',
  location:      r.location      ?? '',
  expiresOn:     r.expires_on    ?? '',
  competencyIds: Array.isArray(r.competency_ids) ? r.competency_ids : (r.competency_ids ? JSON.parse(r.competency_ids) : []),
} : null

const toTrainingRow = (p) => omitUndefined({
  title:          p.title,
  type:           p.type,
  duration:       p.duration,
  participants:   p.participants   ?? 0,
  seats:          p.seats          ?? 0,
  status:         p.status,
  instructor:     p.instructor     ?? null,
  cost:           p.cost           ?? 0,
  date:           p.date           || null,
  time:           p.time           ?? null,
  location:       p.location       ?? null,
  expires_on:     p.expiresOn      || null,
  competency_ids: JSON.stringify(p.competencyIds || []),
})

export async function fetchTrainingPrograms() {
  const { data, error } = await supabase.from('training_programs').select('*').order('id')
  if (error) throw error
  return (data || []).map(fromTrainingRow)
}

export async function createTrainingProgram(prog) {
  const { data, error } = await supabase.from('training_programs').insert([toTrainingRow(prog)]).select().single()
  if (error) throw error
  return fromTrainingRow(data)
}

export async function updateTrainingProgram(id, changes) {
  const { data, error } = await supabase.from('training_programs').update(toTrainingRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromTrainingRow(data)
}

export async function deleteTrainingProgram(id) {
  const { error } = await supabase.from('training_programs').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// COMPETENCIES
// ---------------------------------------------------------------------------
const fromCompRow = (r) => r ? {
  id:          r.id,
  name:        r.name,
  description: r.description ?? '',
  category:    r.category,
  weight:      r.weight,
} : null

const toCompRow = (c) => omitUndefined({
  name:        c.name,
  description: c.description ?? '',
  category:    c.category,
  weight:      c.weight      ?? 10,
})

export async function fetchCompetencies() {
  const { data, error } = await supabase.from('competencies').select('*').order('id')
  if (error) throw error
  return (data || []).map(fromCompRow)
}

export async function createCompetency(comp) {
  const { data, error } = await supabase.from('competencies').insert([toCompRow(comp)]).select().single()
  if (error) throw error
  return fromCompRow(data)
}

export async function updateCompetency(id, changes) {
  const { data, error } = await supabase.from('competencies').update(toCompRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromCompRow(data)
}

export async function deleteCompetency(id) {
  const { error } = await supabase.from('competencies').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// RECOGNITION AWARDS
// ---------------------------------------------------------------------------
const fromRecRow = (r) => r ? {
  id:         r.id,
  recipient:  r.recipient,
  type:       r.type,
  department: r.department,
  date:       r.date,
  reason:     r.reason     ?? '',
  giver:      r.giver      ?? '',
  peer:       r.peer       ?? false,
  likes:      r.likes      ?? 0,
  comments:   Array.isArray(r.comments) ? r.comments : (r.comments ? JSON.parse(r.comments) : []),
} : null

const toRecRow = (r) => omitUndefined({
  recipient:  r.recipient,
  type:       r.type,
  department: r.department,
  date:       r.date       || new Date().toISOString().split('T')[0],
  reason:     r.reason     ?? '',
  giver:      r.giver      ?? null,
  peer:       r.peer       ?? false,
  likes:      r.likes      ?? 0,
  comments:   JSON.stringify(r.comments || []),
})

export async function fetchRecognitionAwards() {
  const { data, error } = await supabase.from('recognition_awards').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(fromRecRow)
}

export async function createRecognitionAward(award) {
  const { data, error } = await supabase.from('recognition_awards').insert([toRecRow(award)]).select().single()
  if (error) throw error
  return fromRecRow(data)
}

export async function updateRecognitionAward(id, changes) {
  const { data, error } = await supabase.from('recognition_awards').update(toRecRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromRecRow(data)
}

export async function deleteRecognitionAward(id) {
  const { error } = await supabase.from('recognition_awards').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// SUCCESSION CANDIDATES
// ---------------------------------------------------------------------------
const fromSuccRow = (r) => r ? {
  id:          r.id,
  currentRole: r.current_role,
  readiness:   r.readiness,
  timeline:    r.timeline,
  candidates:  Array.isArray(r.candidates) ? r.candidates : (r.candidates ? JSON.parse(r.candidates) : []),
  devPlan:     r.dev_plan ?? '',
} : null

const toSuccRow = (s) => omitUndefined({
  current_role: s.currentRole,
  readiness:    s.readiness,
  timeline:     s.timeline,
  candidates:   JSON.stringify(s.candidates || []),
  dev_plan:     s.devPlan ?? null,
})

export async function fetchSuccessionCandidates() {
  const { data, error } = await supabase.from('succession_candidates').select('*').order('id')
  if (error) throw error
  return (data || []).map(fromSuccRow)
}

export async function createSuccessionCandidate(plan) {
  const { data, error } = await supabase.from('succession_candidates').insert([toSuccRow(plan)]).select().single()
  if (error) throw error
  return fromSuccRow(data)
}

export async function updateSuccessionCandidate(id, changes) {
  const { data, error } = await supabase.from('succession_candidates').update(toSuccRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromSuccRow(data)
}

export async function deleteSuccessionCandidate(id) {
  const { error } = await supabase.from('succession_candidates').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// REGISTRATIONS
// ---------------------------------------------------------------------------
const fromRegRow = (r) => r ? {
  id:           r.id,
  programId:    r.program_id,
  userId:       r.user_id,
  programTitle: r.program_title,
  registeredOn: r.registered_on,
} : null

export async function fetchRegistrations() {
  const { data, error } = await supabase.from('registrations').select('*').order('registered_on', { ascending: false })
  if (error) throw error
  return (data || []).map(fromRegRow)
}

export async function createRegistration(reg) {
  const { data, error } = await supabase.from('registrations').insert([{
    program_id:    reg.programId,
    user_id:       reg.userId,
    program_title: reg.programTitle,
    registered_on: reg.registeredOn || new Date().toISOString(),
  }]).select().single()
  if (error) throw error
  return fromRegRow(data)
}

export async function deleteRegistration(id) {
  const { error } = await supabase.from('registrations').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------------
const fromAnnRow = (r) => r ? {
  id:       r.id,
  title:    r.title,
  body:     r.body    ?? '',
  category: r.category,
  author:   r.author,
  date:     r.date,
  pinned:   r.pinned  ?? false,
} : null

const toAnnRow = (a) => omitUndefined({
  title:    a.title,
  body:     a.body     ?? '',
  category: a.category ?? 'General',
  author:   a.author   ?? 'Administrator',
  date:     a.date     || new Date().toISOString().split('T')[0],
  pinned:   a.pinned   ?? false,
})

export async function fetchAnnouncements() {
  const { data, error } = await supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(fromAnnRow)
}

export async function createAnnouncement(ann) {
  const { data, error } = await supabase.from('announcements').insert([toAnnRow(ann)]).select().single()
  if (error) throw error
  return fromAnnRow(data)
}

export async function updateAnnouncement(id, changes) {
  const { data, error } = await supabase.from('announcements').update(toAnnRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromAnnRow(data)
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// REVIEW CYCLES
// ---------------------------------------------------------------------------
const fromCycleRow = (r) => r ? {
  id:          r.id,
  title:       r.title,
  status:      r.status,
  periodStart: r.period_start ?? '',
  periodEnd:   r.period_end   ?? '',
} : null

const toCycleRow = (c) => omitUndefined({
  title:        c.title,
  status:       c.status       ?? 'open',
  period_start: c.periodStart  || null,
  period_end:   c.periodEnd    || null,
})

export async function fetchReviewCycles() {
  const { data, error } = await supabase.from('review_cycles').select('*').order('id', { ascending: false })
  if (error) throw error
  return (data || []).map(fromCycleRow)
}

export async function createReviewCycle(cycle) {
  const { data, error } = await supabase.from('review_cycles').insert([toCycleRow(cycle)]).select().single()
  if (error) throw error
  return fromCycleRow(data)
}

export async function updateReviewCycle(id, changes) {
  const { data, error } = await supabase.from('review_cycles').update(toCycleRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromCycleRow(data)
}

export async function deleteReviewCycle(id) {
  const { error } = await supabase.from('review_cycles').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// REVIEWS
// ---------------------------------------------------------------------------
const fromReviewRow = (r) => r ? {
  id:              r.id,
  cycleId:         r.cycle_id,
  employeeName:    r.employee_name,
  reviewerName:    r.reviewer_name   ?? '',
  status:          r.status,
  selfAssessment:  r.self_assessment ?? '',
  selfRating:      r.self_rating     ?? null,
  managerFeedback: r.manager_feedback ?? '',
  managerRating:   r.manager_rating  ?? null,
  submittedAt:     r.submitted_at    ?? null,
  reviewedAt:      r.reviewed_at     ?? null,
} : null

const toReviewRow = (r) => omitUndefined({
  cycle_id:         r.cycleId,
  employee_name:    r.employeeName,
  reviewer_name:    r.reviewerName    ?? null,
  status:           r.status          ?? 'pending',
  self_assessment:  r.selfAssessment  ?? null,
  self_rating:      r.selfRating      ?? null,
  manager_feedback: r.managerFeedback ?? null,
  manager_rating:   r.managerRating   ?? null,
  submitted_at:     r.submittedAt     ?? null,
  reviewed_at:      r.reviewedAt      ?? null,
})

export async function fetchReviews() {
  const { data, error } = await supabase.from('reviews').select('*').order('id')
  if (error) throw error
  return (data || []).map(fromReviewRow)
}

export async function createReview(review) {
  const { data, error } = await supabase.from('reviews').insert([toReviewRow(review)]).select().single()
  if (error) throw error
  return fromReviewRow(data)
}

export async function updateReview(id, changes) {
  const { data, error } = await supabase.from('reviews').update(toReviewRow(changes)).eq('id', id).select().single()
  if (error) throw error
  return fromReviewRow(data)
}

export async function deleteReview(id) {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// ATTENDANCE
// ---------------------------------------------------------------------------
const fromAttRow = (r) => r ? {
  id:         r.id,
  employeeId: r.employee_id,
  date:       r.date,
  status:     r.status,
  notes:      r.notes ?? '',
} : null

export async function fetchAttendance() {
  const { data, error } = await supabase.from('attendance').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(fromAttRow)
}

export async function createAttendanceRecord(rec) {
  const { data, error } = await supabase.from('attendance').upsert([{
    employee_id: rec.employeeId,
    date:        rec.date,
    status:      rec.status,
    notes:       rec.notes ?? null,
  }], { onConflict: 'employee_id,date' }).select().single()
  if (error) throw error
  return fromAttRow(data)
}

export async function updateAttendanceRecord(id, changes) {
  const { data, error } = await supabase.from('attendance').update({
    status: changes.status,
    notes:  changes.notes ?? null,
  }).eq('id', id).select().single()
  if (error) throw error
  return fromAttRow(data)
}

export async function deleteAttendanceRecord(id) {
  const { error } = await supabase.from('attendance').delete().eq('id', id)
  if (error) throw error
}