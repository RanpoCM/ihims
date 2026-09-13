// =============================================================================
// IHIMS — Supabase data access layer: employees
//
// Drop-in replacement for the localStorage employee functions in App.jsx.
// Every function has the same name and return shape as the localStorage
// version, so the swap in App.jsx is a straightforward find-and-replace.
//
// Column mapping (localStorage camelCase → Supabase snake_case):
//   managerEmployeeId  → manager_employee_id
//   employmentStatus   → employment_status
//   dateHired          → date_hired
//   competencyNotes    → competency_notes
//
// The helper functions toRow/fromRow handle the conversion both ways so
// the rest of the app never has to think about it.
// =============================================================================

import { supabase } from './supabaseClient'

const TABLE = 'employees'

// Convert a Supabase row (snake_case) → app object (camelCase)
function fromRow(row) {
  if (!row) return null
  return {
    id:                 row.id,
    name:               row.name,
    role:               row.role,
    department:         row.department,
    performance:        row.performance,
    competency:         row.competency,
    training:           row.training,
    managerEmployeeId:  row.manager_employee_id ?? null,
    qualifications:     row.qualifications      ?? '',
    employmentStatus:   row.employment_status   ?? 'Regular',
    dateHired:          row.date_hired          ?? '',
    competencyNotes:    row.competency_notes    ?? '',
    photo:              row.photo               ?? null,
  }
}

// Convert an app object (camelCase) → Supabase row (snake_case)
// Omits `id`, `created_at`, `updated_at` — let Supabase manage those.
function toRow(emp) {
  const row = {
    name:                 emp.name,
    role:                 emp.role,
    department:           emp.department,
    performance:          emp.performance   ?? 80,
    competency:           emp.competency    ?? 80,
    training:             emp.training      ?? 80,
    manager_employee_id:  emp.managerEmployeeId ?? null,
    qualifications:       emp.qualifications    ?? null,
    employment_status:    emp.employmentStatus  ?? 'Regular',
    date_hired:           emp.dateHired         || null,
    competency_notes:     emp.competencyNotes   ?? '',
    photo:                emp.photo             ?? null,
  }
  // Remove undefined values so Supabase doesn't complain
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k] })
  return row
}

// ---------------------------------------------------------------------------
// READ — fetch all employees visible to the current user (RLS handles scope)
// ---------------------------------------------------------------------------
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map(fromRow)
}

// ---------------------------------------------------------------------------
// CREATE — add a single employee, return the created record with its new id
// ---------------------------------------------------------------------------
export async function createEmployee(emp) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert([toRow(emp)])
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// ---------------------------------------------------------------------------
// UPDATE — patch any subset of fields on an existing employee by id
// ---------------------------------------------------------------------------
export async function updateEmployee(id, changes) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(toRow({ ...changes }))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// ---------------------------------------------------------------------------
// DELETE — remove a single employee by id
// ---------------------------------------------------------------------------
export async function deleteEmployee(id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// BULK DELETE — remove multiple employees in one round-trip
// ---------------------------------------------------------------------------
export async function bulkDeleteEmployees(ids) {
  if (!ids || ids.length === 0) return
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .in('id', ids)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// UPDATE PHOTO — convenience wrapper so photo updates are explicit in logs
// ---------------------------------------------------------------------------
export async function updateEmployeePhoto(id, photo) {
  return updateEmployee(id, { photo })
}

// ---------------------------------------------------------------------------
// UPDATE COMPETENCY NOTES — convenience wrapper
// ---------------------------------------------------------------------------
export async function updateCompetencyNotes(id, competencyNotes) {
  return updateEmployee(id, { competencyNotes })
}

// ---------------------------------------------------------------------------
// UPDATE PROFILE — qualifications, employment status, date hired
// ---------------------------------------------------------------------------
export async function updateEmployeeProfile(id, profileData) {
  return updateEmployee(id, profileData)
}

// ---------------------------------------------------------------------------
// MARK TRAINING COMPLETED — bump training score, optionally update competency
// ---------------------------------------------------------------------------
export async function markTrainingCompletedForEmployee(id, competencyScoreNudge) {
  // Fetch current record first so we can compute new training score
  const { data: current, error: fetchErr } = await supabase
    .from(TABLE)
    .select('training, competency')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr

  const newTraining = Math.min(100, (current.training || 0) + 3)
  const newCompetency = competencyScoreNudge != null
    ? Math.min(100, Math.max(0, competencyScoreNudge))
    : current.competency

  return updateEmployee(id, { training: newTraining, competency: newCompetency })
}