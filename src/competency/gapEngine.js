// ---------------------------------------------------------------------------
// Competency Gap Analysis Engine
// ---------------------------------------------------------------------------
import {
  COMPETENCIES,
  requiredLevelsForRole,
  estimateEmployeeCompetencies,
  computeAIReadiness,
  aiReadinessClass,
  recommendationForCompetency,
} from './framework'

// Priority rules from spec
export const priorityForGap = (gap) => {
  if (gap >= 2) return { label: 'High', level: 3 }
  if (gap === 1) return { label: 'Medium', level: 2 }
  return { label: 'None', level: 1 }
}

export const riskForGap = (gap) => {
  if (gap >= 3) return { label: 'Critical', level: 3 }
  if (gap >= 2) return { label: 'High', level: 2 }
  if (gap === 1) return { label: 'Moderate', level: 1 }
  return { label: 'Low', level: 0 }
}

// Map a competency id to a business message
const businessImpact = (compId) => {
  const map = {
    compliance: 'Regulatory, safety, and legal exposure.',
    clinicalSkills: 'Direct impact on patient safety and care quality.',
    leadership: 'Reduced team effectiveness and succession readiness.',
    communication: 'Affects patient/clinician coordination and satisfaction.',
    customerService: 'Affects patient experience and satisfaction scores.',
    aiLiteracy: 'Limits ability to adopt AI-assisted workflows.',
    dataLiteracy: 'Limits evidence-based decision-making.',
    digitalLiteracy: 'Slows adoption of digital tools and systems.',
    criticalThinking: 'May lead to suboptimal clinical/operational decisions.',
    problemSolving: 'Delays resolution of operational issues.',
    technicalSkills: 'May reduce productivity and output quality.',
    teamwork: 'Reduces cross-functional collaboration.',
    jobKnowledge: 'Foundation for all role-specific performance.',
    innovation: 'Limits process and care improvement potential.',
    continuousLearning: 'Stagnates skill development over time.',
  }
  return map[compId] || 'Contributes to overall role effectiveness.'
}

// Personalized roadmap segment builder
const roadmapStep = {
  immediate: [
    { title: 'Foundational E-Learning Module', kind: 'Course' },
    { title: 'Focused Coaching Session', kind: 'Coaching' },
    { title: 'Guided Reading & Best Practices', kind: 'Reading' },
    { title: 'Structured Practice Activity', kind: 'Practice' },
  ],
  short: [
    { title: 'Professional Certification Track', kind: 'Certification' },
    { title: 'Hands-On Workshop', kind: 'Workshop' },
    { title: 'Job Shadowing Opportunity', kind: 'Shadowing' },
    { title: 'Mentoring Program', kind: 'Mentoring' },
  ],
  medium: [
    { title: 'Advanced Technical Training', kind: 'Training' },
    { title: 'Leadership Development Program', kind: 'Leadership' },
    { title: 'Cross-Functional Project', kind: 'Project' },
  ],
  long: [
    { title: 'Promotion Preparation Path', kind: 'Career' },
    { title: 'Career Development Plan', kind: 'Career' },
    { title: 'Succession Readiness Activities', kind: 'Succession' },
  ],
}

// Build a personalized learning roadmap tied to the top gaps
export function buildRoadmap(gaps) {
  const high = gaps.filter((g) => g.gap >= 2).slice(0, 3)
  const med = gaps.filter((g) => g.gap === 1).slice(0, 3)
  const focus = high.length ? high : med
  const names = focus.length ? focus.map((g) => g.competencyName).join(', ') : 'advanced professional development'

  const roadmap = [
    {
      period: 'Immediate (0–30 Days)',
      items: roadmapStep.immediate.map((s, i) => ({
        ...s,
        target: focus[i] ? focus[i].competencyName : names,
      })),
    },
    {
      period: 'Short Term (1–3 Months)',
      items: roadmapStep.short.map((s, i) => ({
        ...s,
        target: focus[i] ? focus[i].competencyName : names,
      })),
    },
    {
      period: 'Medium Term (3–6 Months)',
      items: roadmapStep.medium.map((s) => ({ ...s, target: names })),
    },
    {
      period: 'Long Term (6–12 Months)',
      items: roadmapStep.long.map((s) => ({ ...s, target: names })),
    },
  ]
  return roadmap
}

// Full gap analysis for a single employee
export function analyzeEmployee(employee, { recognitionCount = 0 } = {}) {
  const current = estimateEmployeeCompetencies(employee, { recognitionCount })
  const required = requiredLevelsForRole(employee.role, employee.department)
  const ai = computeAIReadiness(current)

  const gaps = COMPETENCIES.map((comp) => {
    const currentLevel = current[comp.id]
    const requiredLevel = required[comp.id]
    const gap = Math.max(0, requiredLevel - currentLevel)
    const priority = priorityForGap(gap)
    const risk = riskForGap(gap)
    // Tailored, competency- and role-specific development plan.
    const dev = recommendationForCompetency(comp.id, employee.role)
    return {
      competencyId: comp.id,
      competencyName: comp.name,
      category: comp.category,
      currentLevel,
      requiredLevel,
      gap,
      priority: priority.label,
      priorityLevel: priority.level,
      risk: risk.label,
      riskLevel: risk.level,
      businessImpact: gap > 0 ? businessImpact(comp.id) : 'No gap identified.',
      recommendation: dev
        ? {
            why: dev.why,
            actions: dev.actions,
            certification: dev.certification,
          }
        : null,
    }
  })

  const highPriority = gaps.filter((g) => g.gap >= 2)
  const mediumPriority = gaps.filter((g) => g.gap === 1)
  const overallCompetency = Math.round(
    Object.values(current).reduce((s, v) => s + v, 0) / Object.keys(current).length
  )
  const overallScore = Math.round((overallCompetency / 5) * 100)

  const promotionReadiness = Math.round(
    Math.max(0, Math.min(100, (overallCompetency / 5) * 100 - highPriority.length * 8))
  )
  const retentionRisk = highPriority.length >= 4 ? 'High' : highPriority.length >= 2 ? 'Medium' : 'Low'
  const learningCompletion = Math.min(100, Math.round((employee.training || 0) * 0.7 + (overallCompetency / 5) * 30))

  const roadmap = buildRoadmap(gaps)

  return {
    employee,
    current,
    required,
    ai,
    aiClass: aiReadinessClass(ai.overall),
    gaps,
    highPriority,
    mediumPriority,
    overallCompetency,
    overallScore,
    promotionReadiness,
    retentionRisk,
    learningCompletion,
    roadmap,
    strengths: gaps.filter((g) => g.gap === 0).map((g) => g.competencyName),
    developmentAreas: [...highPriority, ...mediumPriority].map((g) => g.competencyName),
  }
}

// Aggregate organization-wide analytics
export function analyzeWorkforce(employees, recognitionByEmployee = {}) {
  const analyses = employees.map((emp) =>
    analyzeEmployee(emp, { recognitionCount: recognitionByEmployee[emp.name] || 0 })
  )

  const orgCompetencyIndex = analyses.length
    ? Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length)
    : 0
  const orgAIReadiness = analyses.length
    ? Math.round(analyses.reduce((s, a) => s + a.ai.overall, 0) / analyses.length)
    : 0

  // Department comparison
  const deptMap = {}
  analyses.forEach((a) => {
    const dept = a.employee.department || 'Unknown'
    if (!deptMap[dept]) deptMap[dept] = { competency: [], ai: [], count: 0 }
    deptMap[dept].competency.push(a.overallScore)
    deptMap[dept].ai.push(a.ai.overall)
    deptMap[dept].count += 1
  })
  const departments = Object.entries(deptMap).map(([name, d]) => ({
    name,
    competency: Math.round(d.competency.reduce((s, v) => s + v, 0) / d.competency.length),
    ai: Math.round(d.ai.reduce((s, v) => s + v, 0) / d.ai.length),
    count: d.count,
  }))

  // Critical skill gaps across org
  const gapSummary = {}
  analyses.forEach((a) => {
    a.gaps.forEach((g) => {
      if (g.gap > 0) {
        if (!gapSummary[g.competencyName]) gapSummary[g.competencyName] = { count: 0, totalGap: 0, avgGap: 0 }
        gapSummary[g.competencyName].count += 1
        gapSummary[g.competencyName].totalGap += g.gap
      }
    })
  })
  const criticalGaps = Object.entries(gapSummary)
    .map(([name, v]) => ({ name, ...v, avgGap: Math.round((v.totalGap / v.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.avgGap - a.avgGap)

  const aiDistribution = {
    leader: analyses.filter((a) => a.ai.overall >= 90).length,
    ready: analyses.filter((a) => a.ai.overall >= 75 && a.ai.overall < 90).length,
    capable: analyses.filter((a) => a.ai.overall >= 60 && a.ai.overall < 75).length,
    developing: analyses.filter((a) => a.ai.overall >= 40 && a.ai.overall < 60).length,
    beginner: analyses.filter((a) => a.ai.overall < 40).length,
  }

  const successionReady = analyses.filter((a) => a.promotionReadiness >= 80).length
  const leadershipPipeline = analyses.filter((a) => a.current.leadership >= 4).length
  const highRiskEmployees = analyses.filter((a) => a.retentionRisk === 'High').length

  return {
    analyses,
    orgCompetencyIndex,
    orgAIReadiness,
    departments,
    criticalGaps,
    aiDistribution,
    successionReady,
    leadershipPipeline,
    highRiskEmployees,
  }
}

// ---------------------------------------------------------------------------
// Trend tracking — point-in-time snapshots of org-wide gap analysis.
//
// A single gap analysis is a snapshot; on its own it can't show whether the
// organization is actually improving. This closes that loop by recording a
// small set of headline metrics over time, so training outcomes and
// competency development can be tracked as a trend rather than viewed as a
// series of disconnected one-off reports — directly supporting the
// evaluation -> training -> re-evaluation cycle competency-based HR theory
// calls for. Persisted client-side for now (same caveat as role overrides
// above — a real deployment should move this to a Supabase table so history
// survives a cleared browser and can be queried/reported on properly).
// ---------------------------------------------------------------------------

const SNAPSHOT_KEY = 'ihims_gap_snapshots'
const MAX_SNAPSHOTS = 180 // ~6 months of daily snapshots

export function getGapSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Record (or update) today's snapshot. Safe to call multiple times a day —
// it overwrites the same calendar day's entry rather than accumulating
// duplicates, so a "Record Snapshot" button can't spam the history.
export function recordGapSnapshot(employees, recognitionByEmployee = {}) {
  const workforce = analyzeWorkforce(employees, recognitionByEmployee)
  const today = new Date().toISOString().split('T')[0]
  const snapshot = {
    date: today,
    timestamp: Date.now(),
    orgCompetencyIndex: workforce.orgCompetencyIndex,
    orgAIReadiness: workforce.orgAIReadiness,
    criticalGapCount: workforce.criticalGaps.length,
    highRiskEmployees: workforce.highRiskEmployees,
    successionReady: workforce.successionReady,
    employeeCount: employees.length,
  }
  try {
    const existing = getGapSnapshots().filter((s) => s.date !== today)
    const next = [...existing, snapshot].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS)
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
  return snapshot
}

export function clearGapSnapshots() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// AI-enhanced recommendation (real LLM call, optional layer on top of the
// deterministic engine above).
//
// The rule-based `recommendationForCompetency` output remains the reliable,
// explainable core of this system and is ALWAYS what drives gap scoring,
// priority, and risk — nothing here changes that. This function is an
// optional enhancement: given a gap the deterministic engine already
// identified, it asks an LLM to write a more specific, context-aware
// narrative on top of it. If no API key is configured or the call fails for
// any reason, callers should fall back to the deterministic recommendation
// untouched — this must never be a hard dependency.
//
// SECURITY NOTE: this calls the Anthropic API directly from the browser
// using an admin-supplied key stored in localStorage. That is acceptable
// for a capstone/demo deployment but exposes the key to anyone with access
// to the browser's storage. A production deployment should instead route
// this call through a backend/serverless function (e.g. a Supabase Edge
// Function) that holds the key server-side.
// ---------------------------------------------------------------------------

export async function generateAIEnhancedRecommendation(employee, gap, apiKey) {
  if (!apiKey) throw new Error('No API key configured.')

  const prompt = `You are an HR development advisor for a Philippine hospital. Write a short, specific, encouraging development recommendation (max 120 words) for this employee's competency gap. Be concrete and practical, referencing their actual role.

Employee role: ${employee.role}
Department: ${employee.department}
Competency: ${gap.competencyName} (category: ${gap.category})
Current level: ${gap.currentLevel}/5
Required level: ${gap.requiredLevel}/5
Gap size: ${gap.gap} level(s)
Priority: ${gap.priority}

Respond with plain text only, no headers or markdown formatting.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error?.message) detail = body.error.message
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }

  const data = await res.json()
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  if (!text) throw new Error('Empty response from AI.')
  return text
}