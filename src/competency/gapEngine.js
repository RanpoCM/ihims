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

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export const GAP_ENGINE_VERSION = '2.0.0'

const SNAPSHOT_KEY = 'ihims_gap_snapshots'
const MAX_SNAPSHOTS = 180

const MIN_COMPETENCY_LEVEL = 1
const MAX_COMPETENCY_LEVEL = 5

// ---------------------------------------------------------------------------
// Competency weights
//
// These weights allow particularly important hospital competencies to have
// greater influence when calculating risk/readiness.
//
// Keep the default at 1 so the engine remains easy to explain.
// ---------------------------------------------------------------------------

export const COMPETENCY_WEIGHTS = {
  compliance: 1.5,
  clinicalSkills: 1.5,
  leadership: 1.3,
  communication: 1.2,
  customerService: 1.0,
  aiLiteracy: 1.0,
  dataLiteracy: 1.0,
  digitalLiteracy: 1.0,
  criticalThinking: 1.2,
  problemSolving: 1.1,
  technicalSkills: 1.0,
  teamwork: 1.0,
  jobKnowledge: 1.3,
  innovation: 0.8,
  continuousLearning: 0.9,
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function normalizeLevel(value, fallback = 1) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(
    MIN_COMPETENCY_LEVEL,
    Math.min(MAX_COMPETENCY_LEVEL, Math.round(number))
  )
}

function validateEmployee(employee) {
  if (!employee || typeof employee !== 'object') {
    throw new Error('Invalid employee record.')
  }

  if (!employee.name && !employee.id) {
    throw new Error('Employee must have a name or ID.')
  }

  if (!employee.role) {
    throw new Error(`Employee ${employee.name || employee.id} is missing a role.`)
  }

  if (!employee.department) {
    throw new Error(
      `Employee ${employee.name || employee.id} is missing a department.`
    )
  }
}

function employeeKey(employee) {
  return employee?.id || employee?.employeeId || employee?.name
}

// ---------------------------------------------------------------------------
// Priority rules
// ---------------------------------------------------------------------------

export const priorityForGap = (gap) => {
  const normalizedGap = Number(gap) || 0

  if (normalizedGap >= 2) {
    return {
      label: 'High',
      level: 3,
    }
  }

  if (normalizedGap === 1) {
    return {
      label: 'Medium',
      level: 2,
    }
  }

  return {
    label: 'None',
    level: 1,
  }
}

// ---------------------------------------------------------------------------
// Risk rules
// ---------------------------------------------------------------------------

export const riskForGap = (gap) => {
  const normalizedGap = Number(gap) || 0

  if (normalizedGap >= 3) {
    return {
      label: 'Critical',
      level: 3,
    }
  }

  if (normalizedGap >= 2) {
    return {
      label: 'High',
      level: 2,
    }
  }

  if (normalizedGap === 1) {
    return {
      label: 'Moderate',
      level: 1,
    }
  }

  return {
    label: 'Low',
    level: 0,
  }
}

// ---------------------------------------------------------------------------
// Competency-specific business impact
// ---------------------------------------------------------------------------

const businessImpact = (compId) => {
  const map = {
    compliance: 'Regulatory, safety, and legal exposure.',
    clinicalSkills: 'Direct impact on patient safety and care quality.',
    leadership: 'Reduced team effectiveness and succession readiness.',
    communication:
      'Affects patient/clinician coordination and satisfaction.',
    customerService: 'Affects patient experience and satisfaction scores.',
    aiLiteracy: 'Limits ability to adopt AI-assisted workflows.',
    dataLiteracy: 'Limits evidence-based decision-making.',
    digitalLiteracy: 'Slows adoption of digital tools and systems.',
    criticalThinking:
      'May lead to suboptimal clinical/operational decisions.',
    problemSolving: 'Delays resolution of operational issues.',
    technicalSkills: 'May reduce productivity and output quality.',
    teamwork: 'Reduces cross-functional collaboration.',
    jobKnowledge: 'Foundation for all role-specific performance.',
    innovation: 'Limits process and care improvement potential.',
    continuousLearning: 'Stagnates skill development over time.',
  }

  return (
    map[compId] ||
    'Contributes to overall role effectiveness.'
  )
}

// ---------------------------------------------------------------------------
// Risk weighting
// ---------------------------------------------------------------------------

export function competencyRiskWeight(compId) {
  return COMPETENCY_WEIGHTS[compId] || 1
}

export function calculateRiskScore(gap, competencyId) {
  const normalizedGap = Math.max(0, Number(gap) || 0)
  const weight = competencyRiskWeight(competencyId)

  return Math.round(normalizedGap * weight * 10) / 10
}

// ---------------------------------------------------------------------------
// Gap classification
// ---------------------------------------------------------------------------

export function classifyGap(gap, competencyId) {
  const priority = priorityForGap(gap)
  const risk = riskForGap(gap)

  return {
    priority: priority.label,
    priorityLevel: priority.level,
    risk: risk.label,
    riskLevel: risk.level,
    riskScore: calculateRiskScore(gap, competencyId),
  }
}

// ---------------------------------------------------------------------------
// Roadmap templates
// ---------------------------------------------------------------------------

const roadmapStep = {
  immediate: [
    {
      title: 'Foundational E-Learning Module',
      kind: 'Course',
    },
    {
      title: 'Focused Coaching Session',
      kind: 'Coaching',
    },
    {
      title: 'Guided Reading & Best Practices',
      kind: 'Reading',
    },
    {
      title: 'Structured Practice Activity',
      kind: 'Practice',
    },
  ],

  short: [
    {
      title: 'Professional Certification Track',
      kind: 'Certification',
    },
    {
      title: 'Hands-On Workshop',
      kind: 'Workshop',
    },
    {
      title: 'Job Shadowing Opportunity',
      kind: 'Shadowing',
    },
    {
      title: 'Mentoring Program',
      kind: 'Mentoring',
    },
  ],

  medium: [
    {
      title: 'Advanced Technical Training',
      kind: 'Training',
    },
    {
      title: 'Leadership Development Program',
      kind: 'Leadership',
    },
    {
      title: 'Cross-Functional Project',
      kind: 'Project',
    },
  ],

  long: [
    {
      title: 'Promotion Preparation Path',
      kind: 'Career',
    },
    {
      title: 'Career Development Plan',
      kind: 'Career',
    },
    {
      title: 'Succession Readiness Activities',
      kind: 'Succession',
    },
  ],
}

// ---------------------------------------------------------------------------
// Sort gaps by actual importance.
//
// Previously the roadmap depended on COMPETENCIES array order.
// This makes prioritization explicit.
// ---------------------------------------------------------------------------

export function sortGapsByImportance(gaps = []) {
  return [...gaps].sort((a, b) => {
    if (b.riskScore !== a.riskScore) {
      return b.riskScore - a.riskScore
    }

    if (b.gap !== a.gap) {
      return b.gap - a.gap
    }

    if (b.requiredLevel !== a.requiredLevel) {
      return b.requiredLevel - a.requiredLevel
    }

    return String(a.competencyName).localeCompare(
      String(b.competencyName)
    )
  })
}

// ---------------------------------------------------------------------------
// Build a personalized learning roadmap
// ---------------------------------------------------------------------------

export function buildRoadmap(gaps = []) {
  const prioritized = sortGapsByImportance(
    gaps.filter((g) => g.gap > 0)
  )

  const high = prioritized
    .filter((g) => g.gap >= 2)
    .slice(0, 3)

  const medium = prioritized
    .filter((g) => g.gap === 1)
    .slice(0, 3)

  const focus = high.length ? high : medium

  const names = focus.length
    ? focus.map((g) => g.competencyName).join(', ')
    : 'advanced professional development'

  const createItem = (step, targetGap) => ({
    ...step,

    target: targetGap
      ? targetGap.competencyName
      : names,

    competencyId: targetGap?.competencyId || null,

    currentLevel: targetGap?.currentLevel ?? null,

    targetLevel: targetGap?.requiredLevel ?? null,

    gap: targetGap?.gap ?? 0,

    priority: targetGap?.priority || 'None',

    risk: targetGap?.risk || 'Low',

    successMetric: targetGap
      ? `Progress from level ${targetGap.currentLevel}/5 toward required level ${targetGap.requiredLevel}/5 in ${targetGap.competencyName}.`
      : 'Maintain and extend current competency performance.',
  })

  return [
    {
      period: 'Immediate (0–30 Days)',

      objective: high.length
        ? 'Address the highest-risk competency gaps.'
        : 'Begin targeted professional development.',

      items: roadmapStep.immediate.map((step, i) =>
        createItem(step, focus[i] || focus[0])
      ),
    },

    {
      period: 'Short Term (1–3 Months)',

      objective: high.length
        ? 'Build demonstrated competency through applied learning.'
        : 'Strengthen developing competencies.',

      items: roadmapStep.short.map((step, i) =>
        createItem(step, focus[i] || focus[0])
      ),
    },

    {
      period: 'Medium Term (3–6 Months)',

      objective:
        'Apply competency development through workplace experience.',

      items: roadmapStep.medium.map((step) =>
        createItem(step, focus[0])
      ),
    },

    {
      period: 'Long Term (6–12 Months)',

      objective:
        'Sustain competency growth and prepare for future responsibilities.',

      items: roadmapStep.long.map((step) =>
        createItem(step, focus[0])
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Calculate competency gaps
// ---------------------------------------------------------------------------

export function calculateCompetencyGaps(
  current,
  required,
  employee
) {
  return COMPETENCIES.map((comp) => {
    const currentLevel = normalizeLevel(
      current?.[comp.id],
      MIN_COMPETENCY_LEVEL
    )

    const requiredLevel = normalizeLevel(
      required?.[comp.id],
      currentLevel
    )

    const gap = Math.max(
      0,
      requiredLevel - currentLevel
    )

    const classification = classifyGap(
      gap,
      comp.id
    )

    const dev = recommendationForCompetency(
      comp.id,
      employee.role
    )

    return {
      competencyId: comp.id,

      competencyName: comp.name,

      category: comp.category,

      currentLevel,

      requiredLevel,

      gap,

      gapPercentage: requiredLevel
        ? Math.round((gap / requiredLevel) * 100)
        : 0,

      priority: classification.priority,

      priorityLevel: classification.priorityLevel,

      risk: classification.risk,

      riskLevel: classification.riskLevel,

      riskScore: classification.riskScore,

      businessImpact:
        gap > 0
          ? businessImpact(comp.id)
          : 'No gap identified.',

      recommendation: dev
        ? {
            why: dev.why,
            actions: dev.actions,
            certification: dev.certification,
          }
        : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Overall competency calculation
// ---------------------------------------------------------------------------

export function calculateOverallCompetency(current = {}) {
  const values = Object.values(current)
    .map(Number)
    .filter(Number.isFinite)

  if (!values.length) {
    return 0
  }

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) /
      values.length
  )
}

export function calculateOverallScore(overallCompetency) {
  return clamp(
    Math.round(
      (overallCompetency / MAX_COMPETENCY_LEVEL) * 100
    )
  )
}

// ---------------------------------------------------------------------------
// Promotion readiness
//
// Uses weighted competency achievement rather than simply subtracting
// an arbitrary number of points for each high gap.
// ---------------------------------------------------------------------------

export function calculatePromotionReadiness(
  current = {},
  required = {},
  gaps = []
) {
  if (!gaps.length) {
    return 100
  }

  let weightedScore = 0
  let totalWeight = 0

  gaps.forEach((gap) => {
    const weight = competencyRiskWeight(
      gap.competencyId
    )

    const currentLevel = normalizeLevel(
      current[gap.competencyId],
      1
    )

    const requiredLevel = normalizeLevel(
      required[gap.competencyId],
      currentLevel
    )

    const achievement = requiredLevel
      ? Math.min(1, currentLevel / requiredLevel)
      : 1

    weightedScore += achievement * weight
    totalWeight += weight
  })

  if (!totalWeight) {
    return 0
  }

  const baseScore =
    (weightedScore / totalWeight) * 100

  // Additional penalty for critical gaps.
  const criticalCount = gaps.filter(
    (gap) => gap.gap >= 3
  ).length

  const highCount = gaps.filter(
    (gap) => gap.gap === 2
  ).length

  const penalty =
    criticalCount * 8 +
    highCount * 3

  return clamp(
    Math.round(baseScore - penalty)
  )
}

// ---------------------------------------------------------------------------
// Explain promotion readiness
// ---------------------------------------------------------------------------

export function explainPromotionReadiness(
  current,
  required,
  gaps
) {
  return sortGapsByImportance(gaps)
    .filter((gap) => gap.gap > 0)
    .slice(0, 5)
    .map((gap) => {
      const currentLevel = normalizeLevel(
        current[gap.competencyId]
      )

      const requiredLevel = normalizeLevel(
        required[gap.competencyId]
      )

      return {
        competencyId: gap.competencyId,

        competency: gap.competencyName,

        contribution: -Math.round(
          gap.riskScore * 2
        ),

        reason: `${gap.competencyName} is at level ${currentLevel}/5 versus the required ${requiredLevel}/5.`,
      }
    })
}

// ---------------------------------------------------------------------------
// Retention risk
// ---------------------------------------------------------------------------

export function calculateRetentionRisk(gaps = []) {
  const critical = gaps.filter(
    (g) => g.gap >= 3
  ).length

  const high = gaps.filter(
    (g) => g.gap >= 2
  ).length

  if (critical >= 2 || high >= 5) {
    return 'High'
  }

  if (critical >= 1 || high >= 2) {
    return 'Medium'
  }

  return 'Low'
}

// ---------------------------------------------------------------------------
// Training metrics
// ---------------------------------------------------------------------------

export function calculateTrainingCompletion(employee) {
  const training = Number(employee?.training)

  if (!Number.isFinite(training)) {
    return 0
  }

  return clamp(Math.round(training))
}

export function calculateCompetencyAchievement(
  current = {},
  required = {}
) {
  const competencies = Object.keys(required)

  if (!competencies.length) {
    return 0
  }

  let total = 0

  competencies.forEach((id) => {
    const currentLevel = normalizeLevel(
      current[id],
      1
    )

    const requiredLevel = normalizeLevel(
      required[id],
      currentLevel
    )

    const achievement =
      requiredLevel > 0
        ? Math.min(
            100,
            (currentLevel / requiredLevel) * 100
          )
        : 100

    total += achievement
  })

  return Math.round(
    total / competencies.length
  )
}

// ---------------------------------------------------------------------------
// Learning effectiveness
//
// This intentionally keeps training completion separate from competency
// achievement.
// ---------------------------------------------------------------------------

export function calculateLearningEffectiveness(
  trainingCompletion,
  competencyAchievement
) {
  return Math.round(
    trainingCompletion * 0.4 +
      competencyAchievement * 0.6
  )
}

// ---------------------------------------------------------------------------
// Build assessment provenance
// ---------------------------------------------------------------------------

export function buildAssessmentMetadata(
  employee,
  current
) {
  return {
    source:
      employee?.competencyAssessmentSource ||
      'estimated',

    assessedAt:
      employee?.competencyAssessedAt ||
      null,

    confidence:
      employee?.competencyConfidence != null
        ? clamp(
            Number(employee.competencyConfidence),
            0,
            100
          )
        : null,

    competencyCount:
      Object.keys(current || {}).length,
  }
}

// ---------------------------------------------------------------------------
// Full gap analysis for a single employee
// ---------------------------------------------------------------------------

export function analyzeEmployee(
  employee,
  { recognitionCount = 0 } = {}
) {
  validateEmployee(employee)

  const current =
    estimateEmployeeCompetencies(employee, {
      recognitionCount,
    }) || {}

  const required =
    requiredLevelsForRole(
      employee.role,
      employee.department
    ) || {}

  const ai =
    computeAIReadiness(current) || {
      overall: 0,
    }

  const gaps = calculateCompetencyGaps(
    current,
    required,
    employee
  )

  const highPriority = sortGapsByImportance(
    gaps.filter((g) => g.gap >= 2)
  )

  const mediumPriority = sortGapsByImportance(
    gaps.filter((g) => g.gap === 1)
  )

  const criticalGaps = gaps.filter(
    (g) => g.gap >= 3
  )

  const highGaps = gaps.filter(
    (g) => g.gap === 2
  )

  const moderateGaps = gaps.filter(
    (g) => g.gap === 1
  )

  const overallCompetency =
    calculateOverallCompetency(current)

  const overallScore =
    calculateOverallScore(
      overallCompetency
    )

  const promotionReadiness =
    calculatePromotionReadiness(
      current,
      required,
      gaps
    )

  const promotionExplanation =
    explainPromotionReadiness(
      current,
      required,
      gaps
    )

  const retentionRisk =
    calculateRetentionRisk(gaps)

  const trainingCompletion =
    calculateTrainingCompletion(employee)

  const competencyAchievement =
    calculateCompetencyAchievement(
      current,
      required
    )

  const learningEffectiveness =
    calculateLearningEffectiveness(
      trainingCompletion,
      competencyAchievement
    )

  const roadmap =
    buildRoadmap(gaps)

  const strengths = gaps
    .filter((g) => g.gap === 0)
    .sort(
      (a, b) =>
        b.currentLevel - a.currentLevel
    )
    .map((g) => g.competencyName)

  const developmentAreas =
    sortGapsByImportance(
      [...highPriority, ...mediumPriority]
    ).map(
      (g) => g.competencyName
    )

  return {
    engineVersion:
      GAP_ENGINE_VERSION,

    employee,

    employeeId:
      employeeKey(employee),

    current,

    required,

    assessment:
      buildAssessmentMetadata(
        employee,
        current
      ),

    ai,

    aiClass:
      aiReadinessClass(ai.overall),

    gaps,

    highPriority,

    mediumPriority,

    criticalGaps,

    highGaps,

    moderateGaps,

    gapCounts: {
      total: gaps.filter(
        (g) => g.gap > 0
      ).length,

      critical: criticalGaps.length,

      high: highGaps.length,

      moderate: moderateGaps.length,

      closed: gaps.filter(
        (g) => g.gap === 0
      ).length,
    },

    overallCompetency,

    overallScore,

    promotionReadiness,

    promotionExplanation,

    retentionRisk,

    trainingCompletion,

    competencyAchievement,

    learningEffectiveness,

    // Kept for backward compatibility.
    learningCompletion:
      learningEffectiveness,

    roadmap,

    strengths,

    developmentAreas,
  }
}

// ---------------------------------------------------------------------------
// Organization-wide gap summary
// ---------------------------------------------------------------------------

export function buildOrganizationGapSummary(
  analyses
) {
  const gapSummary = {}

  analyses.forEach((analysis) => {
    analysis.gaps.forEach((gap) => {
      if (gap.gap <= 0) {
        return
      }

      if (!gapSummary[gap.competencyName]) {
        gapSummary[gap.competencyName] = {
          competencyId: gap.competencyId,
          count: 0,
          totalGap: 0,
          totalRiskScore: 0,
          avgGap: 0,
          avgRiskScore: 0,
        }
      }

      gapSummary[gap.competencyName].count += 1

      gapSummary[gap.competencyName].totalGap +=
        gap.gap

      gapSummary[gap.competencyName]
        .totalRiskScore += gap.riskScore
    })
  })

  return Object.entries(gapSummary)
    .map(([name, value]) => ({
      name,

      ...value,

      avgGap:
        Math.round(
          (value.totalGap / value.count) * 10
        ) / 10,

      avgRiskScore:
        Math.round(
          (value.totalRiskScore / value.count) * 10
        ) / 10,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.avgRiskScore - a.avgRiskScore ||
        b.avgGap - a.avgGap
    )
}

// ---------------------------------------------------------------------------
// Department analytics
// ---------------------------------------------------------------------------

export function buildDepartmentAnalytics(
  analyses
) {
  const deptMap = {}

  analyses.forEach((analysis) => {
    const department =
      analysis.employee.department ||
      'Unknown'

    if (!deptMap[department]) {
      deptMap[department] = {
        competency: [],
        ai: [],
        promotion: [],
        learning: [],
        count: 0,
      }
    }

    deptMap[department].competency.push(
      analysis.overallScore
    )

    deptMap[department].ai.push(
      analysis.ai.overall
    )

    deptMap[department].promotion.push(
      analysis.promotionReadiness
    )

    deptMap[department].learning.push(
      analysis.learningEffectiveness
    )

    deptMap[department].count += 1
  })

  return Object.entries(deptMap).map(
    ([name, data]) => ({
      name,

      competency: Math.round(
        data.competency.reduce(
          (sum, value) => sum + value,
          0
        ) / data.competency.length
      ),

      ai: Math.round(
        data.ai.reduce(
          (sum, value) => sum + value,
          0
        ) / data.ai.length
      ),

      promotionReadiness: Math.round(
        data.promotion.reduce(
          (sum, value) => sum + value,
          0
        ) / data.promotion.length
      ),

      learningEffectiveness: Math.round(
        data.learning.reduce(
          (sum, value) => sum + value,
          0
        ) / data.learning.length
      ),

      count: data.count,
    })
  )
}

// ---------------------------------------------------------------------------
// Workforce analysis
// ---------------------------------------------------------------------------

export function analyzeWorkforce(
  employees = [],
  recognitionByEmployee = {}
) {
  if (!Array.isArray(employees)) {
    throw new Error(
      'employees must be an array.'
    )
  }

  if (!employees.length) {
    return {
      analyses: [],

      orgCompetencyIndex: 0,

      orgAIReadiness: 0,

      departments: [],

      criticalGaps: [],

      organizationGapSummary: [],

      aiDistribution: {
        leader: 0,
        ready: 0,
        capable: 0,
        developing: 0,
        beginner: 0,
      },

      successionReady: 0,

      leadershipPipeline: 0,

      highRiskEmployees: 0,

      workforceSize: 0,

      averageTrainingCompletion: 0,

      averageCompetencyAchievement: 0,

      averageLearningEffectiveness: 0,
    }
  }

  const analyses = employees.map(
    (employee) =>
      analyzeEmployee(employee, {
        recognitionCount:
          recognitionByEmployee[
            employeeKey(employee)
          ] ||
          recognitionByEmployee[
            employee.name
          ] ||
          0,
      })
  )

  const average = (values) =>
    values.length
      ? Math.round(
          values.reduce(
            (sum, value) =>
              sum + Number(value || 0),
            0
          ) / values.length
        )
      : 0

  const orgCompetencyIndex = average(
    analyses.map(
      (analysis) =>
        analysis.overallScore
    )
  )

  const orgAIReadiness = average(
    analyses.map(
      (analysis) =>
        analysis.ai.overall
    )
  )

  const departments =
    buildDepartmentAnalytics(
      analyses
    )

  const organizationGapSummary =
    buildOrganizationGapSummary(
      analyses
    )

  // Backward-compatible property.
  const criticalGaps =
    organizationGapSummary

  const aiDistribution = {
    leader: analyses.filter(
      (a) => a.ai.overall >= 90
    ).length,

    ready: analyses.filter(
      (a) =>
        a.ai.overall >= 75 &&
        a.ai.overall < 90
    ).length,

    capable: analyses.filter(
      (a) =>
        a.ai.overall >= 60 &&
        a.ai.overall < 75
    ).length,

    developing: analyses.filter(
      (a) =>
        a.ai.overall >= 40 &&
        a.ai.overall < 60
    ).length,

    beginner: analyses.filter(
      (a) => a.ai.overall < 40
    ).length,
  }

  const successionReady =
    analyses.filter(
      (analysis) =>
        analysis.promotionReadiness >= 80
    ).length

  const leadershipPipeline =
    analyses.filter(
      (analysis) =>
        normalizeLevel(
          analysis.current.leadership,
          1
        ) >= 4
    ).length

  const highRiskEmployees =
    analyses.filter(
      (analysis) =>
        analysis.retentionRisk === 'High'
    ).length

  return {
    analyses,

    workforceSize:
      employees.length,

    orgCompetencyIndex,

    orgAIReadiness,

    departments,

    criticalGaps,

    organizationGapSummary,

    aiDistribution,

    successionReady,

    leadershipPipeline,

    highRiskEmployees,

    averageTrainingCompletion:
      average(
        analyses.map(
          (a) =>
            a.trainingCompletion
        )
      ),

    averageCompetencyAchievement:
      average(
        analyses.map(
          (a) =>
            a.competencyAchievement
        )
      ),

    averageLearningEffectiveness:
      average(
        analyses.map(
          (a) =>
            a.learningEffectiveness
        )
      ),
  }
}

// ---------------------------------------------------------------------------
// Gap closure calculations
// ---------------------------------------------------------------------------

export function calculateGapClosure(
  previousAnalysis,
  currentAnalysis
) {
  if (
    !previousAnalysis ||
    !currentAnalysis
  ) {
    return {
      previousGapCount: 0,
      currentGapCount: 0,
      closedGaps: 0,
      improvedGaps: 0,
      worsenedGaps: 0,
      unchangedGaps: 0,
      gapClosureRate: 0,
    }
  }

  const previous = {}
  const current = {}

  previousAnalysis.gaps.forEach(
    (gap) => {
      previous[gap.competencyId] =
        gap.gap
    }
  )

  currentAnalysis.gaps.forEach(
    (gap) => {
      current[gap.competencyId] =
        gap.gap
    }
  )

  let closedGaps = 0
  let improvedGaps = 0
  let worsenedGaps = 0
  let unchangedGaps = 0

  const competencyIds = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ])

  competencyIds.forEach((id) => {
    const before = previous[id] ?? 0
    const after = current[id] ?? 0

    if (before > 0 && after === 0) {
      closedGaps += 1
    } else if (after < before) {
      improvedGaps += 1
    } else if (after > before) {
      worsenedGaps += 1
    } else {
      unchangedGaps += 1
    }
  })

  const previousGapCount =
    Object.values(previous).filter(
      (gap) => gap > 0
    ).length

  const currentGapCount =
    Object.values(current).filter(
      (gap) => gap > 0
    ).length

  const gapClosureRate =
    previousGapCount > 0
      ? clamp(
          Math.round(
            (closedGaps /
              previousGapCount) *
              100
          )
        )
      : 0

  return {
    previousGapCount,

    currentGapCount,

    closedGaps,

    improvedGaps,

    worsenedGaps,

    unchangedGaps,

    gapClosureRate,
  }
}

// ---------------------------------------------------------------------------
// Local calendar date.
//
// Avoids UTC date shifting around midnight in Philippine deployments.
// ---------------------------------------------------------------------------

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0')

  const day = String(
    date.getDate()
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// Snapshot storage
// ---------------------------------------------------------------------------

export function getGapSnapshots() {
  try {
    if (
      typeof localStorage ===
      'undefined'
    ) {
      return []
    }

    const raw =
      localStorage.getItem(
        SNAPSHOT_KEY
      )

    const parsed = raw
      ? JSON.parse(raw)
      : []

    return Array.isArray(parsed)
      ? parsed
      : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Record/update today's organization snapshot
// ---------------------------------------------------------------------------

export function recordGapSnapshot(
  employees,
  recognitionByEmployee = {}
) {
  const workforce =
    analyzeWorkforce(
      employees,
      recognitionByEmployee
    )

  const today =
    getLocalDateString()

  const snapshot = {
    engineVersion:
      GAP_ENGINE_VERSION,

    date: today,

    timestamp: Date.now(),

    orgCompetencyIndex:
      workforce.orgCompetencyIndex,

    orgAIReadiness:
      workforce.orgAIReadiness,

    criticalGapCount:
      workforce.organizationGapSummary.filter(
        (gap) =>
          gap.avgGap >= 3
      ).length,

    highGapCount:
      workforce.organizationGapSummary.filter(
        (gap) =>
          gap.avgGap >= 2
      ).length,

    totalGapCompetencies:
      workforce.organizationGapSummary.length,

    highRiskEmployees:
      workforce.highRiskEmployees,

    successionReady:
      workforce.successionReady,

    leadershipPipeline:
      workforce.leadershipPipeline,

    employeeCount:
      employees.length,

    averageTrainingCompletion:
      workforce.averageTrainingCompletion,

    averageCompetencyAchievement:
      workforce.averageCompetencyAchievement,

    averageLearningEffectiveness:
      workforce.averageLearningEffectiveness,
  }

  try {
    const existing =
      getGapSnapshots().filter(
        (snapshot) =>
          snapshot.date !== today
      )

    const next = [
      ...existing,
      snapshot,
    ]
      .sort((a, b) =>
        String(a.date).localeCompare(
          String(b.date)
        )
      )
      .slice(-MAX_SNAPSHOTS)

    if (
      typeof localStorage !==
      'undefined'
    ) {
      localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify(next)
      )
    }
  } catch {
    // Storage errors should never break the analysis.
  }

  return snapshot
}

// ---------------------------------------------------------------------------
// Clear snapshots
// ---------------------------------------------------------------------------

export function clearGapSnapshots() {
  try {
    if (
      typeof localStorage !==
      'undefined'
    ) {
      localStorage.removeItem(
        SNAPSHOT_KEY
      )
    }
  } catch {
    // Ignore storage errors.
  }
}

// ---------------------------------------------------------------------------
// Trend analysis
// ---------------------------------------------------------------------------

export function analyzeGapTrend(
  snapshots = []
) {
  if (!Array.isArray(snapshots)) {
    return {
      direction: 'stable',
      competencyChange: 0,
      aiReadinessChange: 0,
      latest: null,
      previous: null,
    }
  }

  const sorted = [...snapshots].sort(
    (a, b) =>
      String(a.date).localeCompare(
        String(b.date)
      )
  )

  if (sorted.length < 2) {
    return {
      direction: 'stable',
      competencyChange: 0,
      aiReadinessChange: 0,
      latest:
        sorted[sorted.length - 1] ||
        null,
      previous: null,
    }
  }

  const latest =
    sorted[sorted.length - 1]

  const previous =
    sorted[sorted.length - 2]

  const competencyChange =
    Number(
      latest.orgCompetencyIndex || 0
    ) -
    Number(
      previous.orgCompetencyIndex || 0
    )

  const aiReadinessChange =
    Number(
      latest.orgAIReadiness || 0
    ) -
    Number(
      previous.orgAIReadiness || 0
    )

  let direction = 'stable'

  if (
    competencyChange > 0 ||
    aiReadinessChange > 0
  ) {
    direction = 'improving'
  }

  if (
    competencyChange < 0 ||
    aiReadinessChange < 0
  ) {
    direction = 'declining'
  }

  return {
    direction,

    competencyChange,

    aiReadinessChange,

    latest,

    previous,
  }
}

// ---------------------------------------------------------------------------
// AI-enhanced recommendation
//
// IMPORTANT:
// This function is intended for demo/capstone use only when the API key is
// supplied by the application. Production deployments should call a backend
// or Supabase Edge Function so the API key never reaches the browser.
// ---------------------------------------------------------------------------

export async function generateAIEnhancedRecommendation(
  employee,
  gap,
  apiKey
) {
  if (!apiKey) {
    throw new Error(
      'No API key configured.'
    )
  }

  if (!employee) {
    throw new Error(
      'Employee information is required.'
    )
  }

  if (!gap) {
    throw new Error(
      'Competency gap information is required.'
    )
  }

  const prompt = `
You are an HR development advisor for a Philippine hospital.

Write a short, specific, encouraging development recommendation for the employee's competency gap.

Maximum 120 words.

Be concrete and practical. Reference the employee's actual role and department.

Do not make medical diagnoses.
Do not invent performance problems.
Do not change the supplied competency level, required level, gap, priority, or risk.
Do not claim that a certification is mandatory unless it is explicitly provided.

Employee role: ${employee.role}
Department: ${employee.department}

Competency: ${gap.competencyName}
Category: ${gap.category}

Current level: ${gap.currentLevel}/5
Required level: ${gap.requiredLevel}/5
Gap size: ${gap.gap} level(s)

Priority: ${gap.priority}
Risk: ${gap.risk}

Business impact:
${gap.businessImpact}

Respond with plain text only.
`.trim()

  let response

  try {
    response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'x-api-key': apiKey,

          'anthropic-version':
            '2023-06-01',

          'anthropic-dangerous-direct-browser-access':
            'true',
        },

        body: JSON.stringify({
          model:
            'claude-sonnet-5',

          max_tokens: 300,

          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      }
    )
  } catch (error) {
    throw new Error(
      `AI request failed: ${
        error?.message ||
        'Network error'
      }`
    )
  }

  if (!response.ok) {
    let detail =
      `HTTP ${response.status}`

    try {
      const body =
        await response.json()

      if (
        body?.error?.message
      ) {
        detail =
          body.error.message
      }
    } catch {
      // Ignore JSON parsing errors.
    }

    throw new Error(detail)
  }

  let data

  try {
    data =
      await response.json()
  } catch {
    throw new Error(
      'Invalid JSON response from AI.'
    )
  }

  const text =
    (data?.content || [])
      .filter(
        (block) =>
          block?.type === 'text'
      )
      .map(
        (block) =>
          block.text
      )
      .join('\n')
      .trim()

  if (!text) {
    throw new Error(
      'Empty response from AI.'
    )
  }

  return text.slice(0, 2000)
}

// ---------------------------------------------------------------------------
// Safe AI wrapper
//
// Callers can use this instead of allowing an AI failure to break the page.
// ---------------------------------------------------------------------------

export async function getEnhancedRecommendation(
  employee,
  gap,
  apiKey
) {
  const deterministic =
    gap?.recommendation || null

  if (!apiKey) {
    return {
      source: 'deterministic',
      recommendation:
        deterministic,
      aiAvailable: false,
    }
  }

  try {
    const recommendation =
      await generateAIEnhancedRecommendation(
        employee,
        gap,
        apiKey
      )

    return {
      source: 'ai',
      recommendation,
      aiAvailable: true,
    }
  } catch (error) {
    return {
      source: 'deterministic',
      recommendation:
        deterministic,
      aiAvailable: false,
      error:
        error?.message ||
        'AI recommendation unavailable.',
    }
  }
}

// ---------------------------------------------------------------------------
// Find the most urgent competency gaps
// ---------------------------------------------------------------------------

export function getTopGaps(
  analysis,
  limit = 5
) {
  if (!analysis?.gaps) {
    return []
  }

  return sortGapsByImportance(
    analysis.gaps.filter(
      (gap) => gap.gap > 0
    )
  ).slice(0, limit)
}

// ---------------------------------------------------------------------------
// Get strengths
// ---------------------------------------------------------------------------

export function getTopStrengths(
  analysis,
  limit = 5
) {
  if (!analysis?.gaps) {
    return []
  }

  return [...analysis.gaps]
    .filter(
      (gap) => gap.gap === 0
    )
    .sort(
      (a, b) =>
        b.currentLevel -
        a.currentLevel
    )
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Generate a compact dashboard summary
// ---------------------------------------------------------------------------

export function buildEmployeeDashboardSummary(
  analysis
) {
  if (!analysis) {
    return null
  }

  return {
    employeeId:
      analysis.employeeId,

    employeeName:
      analysis.employee?.name ||
      analysis.employeeId,

    overallScore:
      analysis.overallScore,

    overallCompetency:
      analysis.overallCompetency,

    aiReadiness:
      analysis.ai?.overall || 0,

    aiClass:
      analysis.aiClass,

    promotionReadiness:
      analysis.promotionReadiness,

    retentionRisk:
      analysis.retentionRisk,

    trainingCompletion:
      analysis.trainingCompletion,

    competencyAchievement:
      analysis.competencyAchievement,

    learningEffectiveness:
      analysis.learningEffectiveness,

    gapCount:
      analysis.gapCounts.total,

    criticalGaps:
      analysis.gapCounts.critical,

    highGaps:
      analysis.gapCounts.high,

    moderateGaps:
      analysis.gapCounts.moderate,

    topGaps:
      getTopGaps(analysis, 3),

    topStrengths:
      getTopStrengths(analysis, 3),
  }
}