
// ---------------------------------------------------------------------------
// gapEngine.js
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
// Constants
// ---------------------------------------------------------------------------

const MIN_LEVEL = 1
const MAX_LEVEL = 5
const DEFAULT_LEVEL = 1

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const safeNumber = (value, fallback = 0) => {
  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

const clamp = (
  value,
  min = MIN_LEVEL,
  max = MAX_LEVEL
) =>
  Math.max(
    min,
    Math.min(
      max,
      safeNumber(value, min)
    )
  )

const average = (values = []) => {
  if (!values.length) return 0

  return Math.round(
    (
      values.reduce(
        (sum, value) =>
          sum + safeNumber(value),
        0
      ) / values.length
    ) * 10
  ) / 10
}

// ---------------------------------------------------------------------------
// Competency weights
// ---------------------------------------------------------------------------

const DEFAULT_COMPETENCY_WEIGHTS = {
  compliance: 1.5,
  clinicalSkills: 1.5,
  leadership: 1.2,
  communication: 1.1,
  customerService: 1,
  aiLiteracy: 1.3,
  dataLiteracy: 1.1,
  digitalLiteracy: 1,
  criticalThinking: 1.2,
  problemSolving: 1.1,
  technicalSkills: 1.1,
  teamwork: 1,
  jobKnowledge: 1.2,
  innovation: 0.9,
  continuousLearning: 1,
}

export const getCompetencyWeight = (
  competency
) => {
  if (
    Number.isFinite(
      Number(competency?.weight)
    )
  ) {
    return Number(
      competency.weight
    )
  }

  return (
    DEFAULT_COMPETENCY_WEIGHTS[
      competency?.id
    ] || 1
  )
}

// ---------------------------------------------------------------------------
// Competency criticality
// ---------------------------------------------------------------------------

const DEFAULT_CRITICAL_COMPETENCIES = [
  'compliance',
  'clinicalSkills',
  'criticalThinking',
]

const DEFAULT_HIGH_COMPETENCIES = [
  'leadership',
  'aiLiteracy',
  'jobKnowledge',
  'problemSolving',
]

export const getCompetencyCriticality = (
  competency
) => {
  if (competency?.criticality) {
    return competency.criticality
  }

  if (
    DEFAULT_CRITICAL_COMPETENCIES.includes(
      competency?.id
    )
  ) {
    return 'critical'
  }

  if (
    DEFAULT_HIGH_COMPETENCIES.includes(
      competency?.id
    )
  ) {
    return 'high'
  }

  return 'standard'
}

const criticalityWeight = (
  competency
) => {
  const weights = {
    critical: 1.5,
    high: 1.25,
    standard: 1,
  }

  return (
    weights[
      getCompetencyCriticality(
        competency
      )
    ] || 1
  )
}

// ---------------------------------------------------------------------------
// Priority rules
// ---------------------------------------------------------------------------

export const priorityForGap = (
  gap,
  {
    weight = 1,
    criticality = 1,
  } = {}
) => {
  const normalizedGap = Math.max(
    0,
    safeNumber(gap)
  )

  const score =
    normalizedGap *
    safeNumber(weight, 1) *
    safeNumber(criticality, 1)

  if (score >= 6) {
    return {
      label: 'Critical',
      level: 4,
      score: Math.round(
        score * 10
      ) / 10,
    }
  }

  if (score >= 4) {
    return {
      label: 'High',
      level: 3,
      score: Math.round(
        score * 10
      ) / 10,
    }
  }

  if (score >= 2) {
    return {
      label: 'Medium',
      level: 2,
      score: Math.round(
        score * 10
      ) / 10,
    }
  }

  if (normalizedGap > 0) {
    return {
      label: 'Low',
      level: 1,
      score: Math.round(
        score * 10
      ) / 10,
    }
  }

  return {
    label: 'None',
    level: 0,
    score: 0,
  }
}

// ---------------------------------------------------------------------------
// Risk rules
// ---------------------------------------------------------------------------

export const riskForGap = (
  gap,
  {
    criticality = 'standard',
  } = {}
) => {
  const normalizedGap = Math.max(
    0,
    safeNumber(gap)
  )

  if (
    normalizedGap >= 3 ||
    (
      normalizedGap >= 2 &&
      criticality === 'critical'
    )
  ) {
    return {
      label: 'Critical',
      level: 3,
    }
  }

  if (
    normalizedGap >= 2 ||
    (
      normalizedGap >= 1 &&
      criticality === 'critical'
    )
  ) {
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
// Business impact
// ---------------------------------------------------------------------------

const businessImpact = (
  competencyId
) => {
  const map = {
    compliance:
      'Regulatory, safety, and legal exposure.',

    clinicalSkills:
      'Direct impact on patient safety and care quality.',

    leadership:
      'Reduced team effectiveness and succession readiness.',

    communication:
      'Affects patient/clinician coordination and satisfaction.',

    customerService:
      'Affects patient experience and satisfaction scores.',

    aiLiteracy:
      'Limits ability to adopt AI-assisted workflows.',

    dataLiteracy:
      'Limits evidence-based decision-making.',

    digitalLiteracy:
      'Slows adoption of digital tools and systems.',

    criticalThinking:
      'May lead to suboptimal clinical/operational decisions.',

    problemSolving:
      'Delays resolution of operational issues.',

    technicalSkills:
      'May reduce productivity and output quality.',

    teamwork:
      'Reduces cross-functional collaboration.',

    jobKnowledge:
      'Foundation for all role-specific performance.',

    innovation:
      'Limits process and care improvement potential.',

    continuousLearning:
      'Stagnates skill development over time.',
  }

  return (
    map[competencyId] ||
    'Contributes to overall role effectiveness.'
  )
}

// ---------------------------------------------------------------------------
// Normalize competency values
// ---------------------------------------------------------------------------

const normalizeCompetencyValue = (
  value
) => {
  // Rich competency object
  if (
    value &&
    typeof value === 'object'
  ) {
    return {
      level: clamp(
        value.level ??
          value.score ??
          DEFAULT_LEVEL
      ),

      confidence: Math.max(
        0,
        Math.min(
          1,
          safeNumber(
            value.confidence,
            0.5
          )
        )
      ),

      evidence: Array.isArray(
        value.evidence
      )
        ? value.evidence
        : [],
    }
  }

  // Existing numeric format
  return {
    level: clamp(
      value ?? DEFAULT_LEVEL
    ),

    confidence: 0.5,

    evidence: [],
  }
}

const normalizeCompetencies = (
  current = {}
) => {
  const result = {}

  COMPETENCIES.forEach(
    (competency) => {
      result[competency.id] =
        normalizeCompetencyValue(
          current[
            competency.id
          ]
        )
    }
  )

  return result
}

const extractLevels = (
  current = {}
) => {
  const result = {}

  COMPETENCIES.forEach(
    (competency) => {
      result[competency.id] =
        clamp(
          current[
            competency.id
          ]?.level ??
            current[
              competency.id
            ] ??
            DEFAULT_LEVEL
        )
    }
  )

  return result
}

// ---------------------------------------------------------------------------
// Weighted competency score
// ---------------------------------------------------------------------------

export const calculateWeightedCompetency = (
  current
) => {
  let weightedTotal = 0
  let totalWeight = 0

  COMPETENCIES.forEach(
    (competency) => {
      const value =
        normalizeCompetencyValue(
          current?.[
            competency.id
          ]
        )

      const weight =
        getCompetencyWeight(
          competency
        )

      weightedTotal +=
        value.level *
        weight

      totalWeight +=
        weight
    }
  )

  if (!totalWeight) {
    return 0
  }

  return Math.round(
    weightedTotal /
      totalWeight
  )
}

// ---------------------------------------------------------------------------
// Critical competency score
// ---------------------------------------------------------------------------

export const calculateCriticalCompetencyScore =
  (current) => {
    const critical =
      COMPETENCIES.filter(
        (competency) =>
          getCompetencyCriticality(
            competency
          ) === 'critical'
      )

    if (!critical.length) {
      return 0
    }

    const total =
      critical.reduce(
        (sum, competency) => {
          const value =
            normalizeCompetencyValue(
              current?.[
                competency.id
              ]
            )

          return (
            sum + value.level
          )
        },
        0
      )

    return Math.round(
      (total /
        critical.length /
        MAX_LEVEL) *
        100
    )
  }

// ---------------------------------------------------------------------------
// Roadmap templates
// ---------------------------------------------------------------------------

const roadmapStep = {
  immediate: [
    {
      title:
        'Foundational E-Learning Module',
      kind: 'Course',
      durationDays: 14,
      effortHours: 4,
    },
    {
      title:
        'Focused Coaching Session',
      kind: 'Coaching',
      durationDays: 7,
      effortHours: 2,
    },
    {
      title:
        'Guided Reading & Best Practices',
      kind: 'Reading',
      durationDays: 14,
      effortHours: 3,
    },
    {
      title:
        'Structured Practice Activity',
      kind: 'Practice',
      durationDays: 21,
      effortHours: 5,
    },
  ],

  short: [
    {
      title:
        'Professional Certification Track',
      kind: 'Certification',
      durationDays: 60,
      effortHours: 20,
    },
    {
      title:
        'Hands-On Workshop',
      kind: 'Workshop',
      durationDays: 45,
      effortHours: 12,
    },
    {
      title:
        'Job Shadowing Opportunity',
      kind: 'Shadowing',
      durationDays: 30,
      effortHours: 8,
    },
    {
      title:
        'Mentoring Program',
      kind: 'Mentoring',
      durationDays: 90,
      effortHours: 12,
    },
  ],

  medium: [
    {
      title:
        'Advanced Technical Training',
      kind: 'Training',
      durationDays: 120,
      effortHours: 30,
    },
    {
      title:
        'Leadership Development Program',
      kind: 'Leadership',
      durationDays: 150,
      effortHours: 40,
    },
    {
      title:
        'Cross-Functional Project',
      kind: 'Project',
      durationDays: 120,
      effortHours: 25,
    },
  ],

  long: [
    {
      title:
        'Promotion Preparation Path',
      kind: 'Career',
      durationDays: 240,
      effortHours: 50,
    },
    {
      title:
        'Career Development Plan',
      kind: 'Career',
      durationDays: 300,
      effortHours: 30,
    },
    {
      title:
        'Succession Readiness Activities',
      kind: 'Succession',
      durationDays: 365,
      effortHours: 40,
    },
  ],
}

// ---------------------------------------------------------------------------
// Roadmap item
// ---------------------------------------------------------------------------

const createRoadmapItem = (
  template,
  focus,
  period
) => {
  const currentLevel =
    safeNumber(
      focus?.currentLevel,
      0
    )

  const requiredLevel =
    safeNumber(
      focus?.requiredLevel,
      0
    )

  const targetLevel =
    requiredLevel > 0
      ? Math.min(
          requiredLevel,
          currentLevel + 1
        )
      : currentLevel

  const remainingGap =
    Math.max(
      0,
      requiredLevel -
        currentLevel
    )

  return {
    title: template.title,

    kind: template.kind,

    period,

    competencyId:
      focus?.competencyId ||
      null,

    target:
      focus?.competencyName ||
      'Advanced professional development',

    currentLevel,

    targetLevel,

    requiredLevel,

    remainingGap,

    durationDays:
      template.durationDays,

    effortHours:
      template.effortHours,

    successMetric:
      requiredLevel > 0
        ? targetLevel >=
          requiredLevel
          ? `Demonstrate competency at level ${requiredLevel}.`
          : `Progress from level ${currentLevel} to at least level ${targetLevel}.`
        : 'Complete the development activity and demonstrate applied learning.',

    priority:
      focus?.priority ||
      'Low',

    status: 'Not Started',
  }
}

// ---------------------------------------------------------------------------
// Build personalized roadmap
// ---------------------------------------------------------------------------

export function buildRoadmap(
  gaps = []
) {
  const high = gaps
    .filter(
      (gap) =>
        gap.gap >= 2
    )
    .sort(
      (a, b) =>
        b.priorityScore -
          a.priorityScore ||
        b.gap - a.gap
    )
    .slice(0, 3)

  const medium = gaps
    .filter(
      (gap) =>
        gap.gap === 1
    )
    .sort(
      (a, b) =>
        b.priorityScore -
          a.priorityScore ||
        b.gap - a.gap
    )
    .slice(0, 3)

  const focus =
    high.length
      ? high
      : medium

  const defaultFocus = {
    competencyId: null,
    competencyName:
      'Advanced professional development',
    currentLevel: 0,
    requiredLevel: 0,
    priority: 'Low',
  }

  const createItems = (
    templates,
    period
  ) =>
    templates.map(
      (template, index) => {
        const selected =
          focus[index] ||
          focus[0] ||
          defaultFocus

        return createRoadmapItem(
          template,
          selected,
          period
        )
      }
    )

  return [
    {
      period:
        'Immediate (0–30 Days)',

      items: createItems(
        roadmapStep.immediate,
        'Immediate'
      ),
    },

    {
      period:
        'Short Term (1–3 Months)',

      items: createItems(
        roadmapStep.short,
        'Short Term'
      ),
    },

    {
      period:
        'Medium Term (3–6 Months)',

      items: createItems(
        roadmapStep.medium,
        'Medium Term'
      ),
    },

    {
      period:
        'Long Term (6–12 Months)',

      items: createItems(
        roadmapStep.long,
        'Long Term'
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Role readiness
// ---------------------------------------------------------------------------

export function calculateRoleReadiness(
  current,
  role,
  department
) {
  if (!role) {
    return {
      score: 0,
      blockers: [],
      gaps: [],
    }
  }

  const required =
    requiredLevelsForRole(
      role,
      department
    ) || {}

  const gaps =
    COMPETENCIES.map(
      (competency) => {
        const currentLevel =
          clamp(
            current?.[
              competency.id
            ]?.level ??
              current?.[
                competency.id
              ] ??
              DEFAULT_LEVEL
          )

        const requiredLevel =
          clamp(
            required?.[
              competency.id
            ] ??
              DEFAULT_LEVEL
          )

        return {
          competencyId:
            competency.id,

          competencyName:
            competency.name,

          currentLevel,

          requiredLevel,

          gap: Math.max(
            0,
            requiredLevel -
              currentLevel
          ),
        }
      }
    )

  const totalWeight =
    COMPETENCIES.reduce(
      (sum, competency) =>
        sum +
        getCompetencyWeight(
          competency
        ),
      0
    )

  const weightedGap =
    gaps.reduce(
      (sum, gap) => {
        const competency =
          COMPETENCIES.find(
            (item) =>
              item.id ===
              gap.competencyId
          )

        return (
          sum +
          gap.gap *
            getCompetencyWeight(
              competency
            )
        )
      },
      0
    )

  const maximumGap =
    MAX_LEVEL *
    totalWeight

  const score =
    maximumGap > 0
      ? Math.round(
          Math.max(
            0,
            Math.min(
              100,
              100 -
                (weightedGap /
                  maximumGap) *
                  100
            )
          )
        )
      : 0

  const blockers =
    gaps
      .filter(
        (gap) =>
          gap.gap >= 2
      )
      .sort(
        (a, b) =>
          b.gap - a.gap
      )

  return {
    score,
    blockers,
    gaps,
  }
}

// ---------------------------------------------------------------------------
// Intervention impact
// ---------------------------------------------------------------------------

export function calculateInterventionImpact(
  beforeLevel,
  afterLevel,
  requiredLevel
) {
  const before =
    clamp(beforeLevel)

  const after =
    clamp(afterLevel)

  const required =
    clamp(requiredLevel)

  const improvement =
    after - before

  const gapBefore =
    Math.max(
      0,
      required - before
    )

  const gapAfter =
    Math.max(
      0,
      required - after
    )

  const gapClosed =
    gapBefore - gapAfter

  const closurePercentage =
    gapBefore > 0
      ? Math.round(
          (gapClosed /
            gapBefore) *
            100
        )
      : 100

  return {
    beforeLevel: before,
    afterLevel: after,
    requiredLevel: required,

    improvement,

    gapBefore,
    gapAfter,
    gapClosed,

    closurePercentage,

    reachedRequiredLevel:
      after >= required,
  }
}

// ---------------------------------------------------------------------------
// Intervention effectiveness
// ---------------------------------------------------------------------------

export function analyzeInterventionEffectiveness(
  interventions = []
) {
  if (
    !Array.isArray(
      interventions
    )
  ) {
    return {
      count: 0,
      averageImprovement: 0,
      averageGapClosure: 0,
      successfulCount: 0,
      successRate: 0,
      results: [],
    }
  }

  const results =
    interventions.map(
      (intervention) =>
        calculateInterventionImpact(
          intervention.beforeLevel,
          intervention.afterLevel,
          intervention.requiredLevel
        )
    )

  const successfulCount =
    results.filter(
      (result) =>
        result.reachedRequiredLevel
    ).length

  return {
    count: results.length,

    averageImprovement:
      average(
        results.map(
          (result) =>
            result.improvement
        )
      ),

    averageGapClosure:
      average(
        results.map(
          (result) =>
            result.closurePercentage
        )
      ),

    successfulCount,

    successRate:
      results.length
        ? Math.round(
            (successfulCount /
              results.length) *
              100
          )
        : 0,

    results,
  }
}

// ---------------------------------------------------------------------------
// Employee analysis
// ---------------------------------------------------------------------------

export function analyzeEmployee(
  employee = {},
  {
    recognitionCount = 0,
    nextRole = null,
    previousAnalysis = null,
  } = {}
) {
  const currentRaw =
    estimateEmployeeCompetencies(
      employee,
      {
        recognitionCount,
      }
    ) || {}

  const current =
    normalizeCompetencies(
      currentRaw
    )

  const currentLevels =
    extractLevels(current)

  const required =
    requiredLevelsForRole(
      employee.role,
      employee.department
    ) || {}

  const ai =
    computeAIReadiness(
      currentLevels
    )

  const gaps =
    COMPETENCIES.map(
      (competency) => {
        const normalized =
          normalizeCompetencyValue(
            current[
              competency.id
            ]
          )

        const currentLevel =
          normalized.level

        const requiredLevel =
          clamp(
            required?.[
              competency.id
            ] ??
              DEFAULT_LEVEL
          )

        // Positive = employee is above requirement.
        // Negative = employee is below requirement.
        const delta =
          currentLevel -
          requiredLevel

        const gap =
          Math.max(
            0,
            -delta
          )

        const surplus =
          Math.max(
            0,
            delta
          )

        const weight =
          getCompetencyWeight(
            competency
          )

        const criticality =
          getCompetencyCriticality(
            competency
          )

        const priority =
          priorityForGap(
            gap,
            {
              weight,
              criticality:
                criticalityWeight(
                  competency
                ),
            }
          )

        const risk =
          riskForGap(
            gap,
            {
              criticality,
            }
          )

        const recommendation =
          recommendationForCompetency(
            competency.id,
            employee.role
          )

        return {
          competencyId:
            competency.id,

          competencyName:
            competency.name,

          category:
            competency.category,

          currentLevel,

          requiredLevel,

          delta,

          gap,

          surplus,

          weight,

          criticality,

          confidence:
            Math.round(
              normalized.confidence *
                100
            ),

          evidence:
            normalized.evidence,

          priority:
            priority.label,

          priorityLevel:
            priority.level,

          priorityScore:
            priority.score,

          risk:
            risk.label,

          riskLevel:
            risk.level,

          businessImpact:
            gap > 0
              ? businessImpact(
                  competency.id
                )
              : 'No gap identified.',

          recommendation:
            recommendation
              ? {
                  why:
                    recommendation.why,

                  actions:
                    recommendation.actions,

                  certification:
                    recommendation.certification,
                }
              : null,
        }
      }
    )

  const highPriority =
    gaps
      .filter(
        (gap) =>
          gap.gap >= 2
      )
      .sort(
        (a, b) =>
          b.priorityScore -
          a.priorityScore
      )

  const mediumPriority =
    gaps
      .filter(
        (gap) =>
          gap.gap === 1
      )
      .sort(
        (a, b) =>
          b.priorityScore -
          a.priorityScore
      )

  const criticalGaps =
    gaps.filter(
      (gap) =>
        gap.gap >= 2 &&
        gap.criticality ===
          'critical'
    )

  // -------------------------------------------------------------------------
  // Basic competency score
  // -------------------------------------------------------------------------

  const levelValues =
    Object.values(
      currentLevels
    )

  const overallCompetency =
    levelValues.length
      ? Math.round(
          levelValues.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
            levelValues.length
        )
      : 0

  const overallScore =
    Math.round(
      (overallCompetency /
        MAX_LEVEL) *
        100
    )

  // -------------------------------------------------------------------------
  // Weighted score
  // -------------------------------------------------------------------------

  const weightedCompetency =
    calculateWeightedCompetency(
      current
    )

  // -------------------------------------------------------------------------
  // Critical capability score
  // -------------------------------------------------------------------------

  const criticalCompetencyScore =
    calculateCriticalCompetencyScore(
      current
    )

  // -------------------------------------------------------------------------
  // Current-role readiness
  // -------------------------------------------------------------------------

  const currentRoleReadiness =
    calculateRoleReadiness(
      current,
      employee.role,
      employee.department
    )

  // -------------------------------------------------------------------------
  // Next-role readiness
  // -------------------------------------------------------------------------

  const nextRoleReadiness =
    nextRole
      ? calculateRoleReadiness(
          current,
          nextRole,
          employee.department
        )
      : null

  // -------------------------------------------------------------------------
  // Promotion readiness
  // -------------------------------------------------------------------------

  const promotionReadiness =
    nextRoleReadiness
      ? nextRoleReadiness.score
      : Math.round(
          Math.max(
            0,
            Math.min(
              100,
              weightedCompetency -
                highPriority.length *
                  8
            )
          )
        )

  // -------------------------------------------------------------------------
  // Risk
  // -------------------------------------------------------------------------

  const competencyRisk =
    criticalGaps.length >= 2
      ? 'High'
      : highPriority.length >= 3
      ? 'Medium'
      : highPriority.length >= 1
      ? 'Low'
      : 'Low'

  const performanceRisk =
    weightedCompetency < 50
      ? 'High'
      : weightedCompetency < 70
      ? 'Medium'
      : 'Low'

  const successionRisk =
    promotionReadiness < 50
      ? 'High'
      : promotionReadiness < 75
      ? 'Medium'
      : 'Low'

  // This is intentionally called developmentRisk.
  // Competency gaps alone should not be interpreted as actual employee
  // flight/retention probability.
  const developmentRisk =
    highPriority.length >= 4
      ? 'High'
      : highPriority.length >= 2
      ? 'Medium'
      : 'Low'

  // Backward-compatible property.
  const retentionRisk =
    developmentRisk

  // -------------------------------------------------------------------------
  // Learning completion
  // -------------------------------------------------------------------------

  const training =
    Math.max(
      0,
      Math.min(
        100,
        safeNumber(
          employee.training,
          0
        )
      )
    )

  const learningCompletion =
    Math.min(
      100,
      Math.round(
        training * 0.7 +
          (overallCompetency /
            MAX_LEVEL) *
            30
      )
    )

  // -------------------------------------------------------------------------
  // Strengths
  // -------------------------------------------------------------------------

  const strengths =
    gaps
      .filter(
        (gap) =>
          gap.gap === 0
      )
      .sort(
        (a, b) =>
          b.surplus -
          a.surplus
      )
      .map(
        (gap) =>
          gap.competencyName
      )

  // -------------------------------------------------------------------------
  // Development areas
  // -------------------------------------------------------------------------

  const developmentAreas =
    [
      ...highPriority,
      ...mediumPriority,
    ].map(
      (gap) =>
        gap.competencyName
    )

  // -------------------------------------------------------------------------
  // Total gap
  // -------------------------------------------------------------------------

  const totalGap =
    gaps.reduce(
      (sum, gap) =>
        sum + gap.gap,
      0
    )

  // Rough planning estimate.
  // This should eventually be replaced with intervention-specific estimates.
  const estimatedDaysToClose =
    totalGap === 0
      ? 0
      : totalGap * 45

  // -------------------------------------------------------------------------
  // Trend
  // -------------------------------------------------------------------------

  const previousScore =
    previousAnalysis &&
    Number.isFinite(
      Number(
        previousAnalysis.overallScore
      )
    )
      ? Number(
          previousAnalysis.overallScore
        )
      : null

  const scoreChange =
    previousScore !== null
      ? overallScore -
        previousScore
      : null

  let trend = 'Stable'

  if (scoreChange !== null) {
    if (scoreChange >= 3) {
      trend = 'Improving'
    } else if (
      scoreChange <= -3
    ) {
      trend = 'Declining'
    }
  }

  // -------------------------------------------------------------------------
  // Roadmap
  // -------------------------------------------------------------------------

  const roadmap =
    buildRoadmap(gaps)

  // -------------------------------------------------------------------------
  // Evidence
  // -------------------------------------------------------------------------

  const currentEvidence =
    Object.fromEntries(
      COMPETENCIES.map(
        (competency) => {
          const normalized =
            normalizeCompetencyValue(
              current[
                competency.id
              ]
            )

          return [
            competency.id,
            {
              confidence:
                Math.round(
                  normalized.confidence *
                    100
                ),

              evidence:
                normalized.evidence,
            },
          ]
        }
      )
    )

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    employee,

    current:
      currentLevels,

    currentEvidence,

    required,

    ai,

    aiClass:
      aiReadinessClass(
        ai.overall
      ),

    gaps,

    highPriority,

    mediumPriority,

    criticalGaps,

    overallCompetency,

    overallScore,

    weightedCompetency,

    criticalCompetencyScore,

    currentRoleReadiness,

    nextRole:
      nextRole || null,

    nextRoleReadiness,

    promotionReadiness,

    risks: {
      competencyRisk,
      performanceRisk,
      successionRisk,
      developmentRisk,
    },

    // Backward compatibility.
    retentionRisk,

    learningCompletion,

    roadmap,

    strengths,

    developmentAreas,

    totalGap,

    estimatedDaysToClose,

    trend,

    scoreChange,
  }
}

// ---------------------------------------------------------------------------
// Organizational gap severity
// ---------------------------------------------------------------------------

const calculateGapSeverity = (
  gap,
  employeeCount,
  workforceSize,
  competency
) => {
  const affectedPercentage =
    workforceSize > 0
      ? employeeCount /
        workforceSize
      : 0

  return (
    affectedPercentage *
    gap.avgGap *
    getCompetencyWeight(
      competency
    ) *
    criticalityWeight(
      competency
    )
  )
}

// ---------------------------------------------------------------------------
// Workforce analysis
// ---------------------------------------------------------------------------

export function analyzeWorkforce(
  employees = [],
  recognitionByEmployee = {},
  options = {}
) {
  if (!Array.isArray(employees)) {
    throw new TypeError(
      'employees must be an array'
    )
  }

  const {
    previousAnalyses = {},
  } = options

  const analyses =
    employees.map(
      (employee) =>
        analyzeEmployee(
          employee,
          {
            recognitionCount:
              recognitionByEmployee[
                employee.name
              ] || 0,

            nextRole:
              employee.nextRole ||
              null,

            previousAnalysis:
              previousAnalyses[
                employee.name
              ] || null,
          }
        )
    )

  // -------------------------------------------------------------------------
  // Organization-level scores
  // -------------------------------------------------------------------------

  const orgCompetencyIndex =
    analyses.length
      ? Math.round(
          analyses.reduce(
            (sum, analysis) =>
              sum +
              analysis.overallScore,
            0
          ) /
            analyses.length
        )
      : 0

  const orgWeightedCompetency =
    analyses.length
      ? Math.round(
          analyses.reduce(
            (sum, analysis) =>
              sum +
              analysis.weightedCompetency,
            0
          ) /
            analyses.length
        )
      : 0

  const orgAIReadiness =
    analyses.length
      ? Math.round(
          analyses.reduce(
            (sum, analysis) =>
              sum +
              safeNumber(
                analysis.ai?.overall
              ),
            0
          ) /
            analyses.length
        )
      : 0

  const orgCriticalCompetencyScore =
    analyses.length
      ? Math.round(
          analyses.reduce(
            (sum, analysis) =>
              sum +
              analysis.criticalCompetencyScore,
            0
          ) /
            analyses.length
        )
      : 0

  // -------------------------------------------------------------------------
  // Department analytics
  // -------------------------------------------------------------------------

  const departmentMap = {}

  analyses.forEach(
    (analysis) => {
      const department =
        analysis.employee
          ?.department ||
        'Unknown'

      if (
        !departmentMap[
          department
        ]
      ) {
        departmentMap[
          department
        ] = {
          competency: [],
          weightedCompetency: [],
          ai: [],
          critical: [],
          readiness: [],
          count: 0,
        }
      }

      const item =
        departmentMap[
          department
        ]

      item.competency.push(
        analysis.overallScore
      )

      item.weightedCompetency.push(
        analysis.weightedCompetency
      )

      item.ai.push(
        safeNumber(
          analysis.ai?.overall
        )
      )

      item.critical.push(
        analysis.criticalCompetencyScore
      )

      item.readiness.push(
        analysis.promotionReadiness
      )

      item.count += 1
    }
  )

  const departments =
    Object.entries(
      departmentMap
    ).map(
      ([name, data]) => ({
        name,

        competency:
          average(
            data.competency
          ),

        weightedCompetency:
          average(
            data.weightedCompetency
          ),

        ai:
          average(
            data.ai
          ),

        criticalCompetency:
          average(
            data.critical
          ),

        promotionReadiness:
          average(
            data.readiness
          ),

        count:
          data.count,
      })
    )

  // -------------------------------------------------------------------------
  // Role analytics
  // -------------------------------------------------------------------------

  const roleMap = {}

  analyses.forEach(
    (analysis) => {
      const role =
        analysis.employee
          ?.role ||
        'Unknown'

      if (!roleMap[role]) {
        roleMap[role] = {
          competency: [],
          ai: [],
          readiness: [],
          count: 0,
        }
      }

      roleMap[
        role
      ].competency.push(
        analysis.weightedCompetency
      )

      roleMap[
        role
      ].ai.push(
        safeNumber(
          analysis.ai?.overall
        )
      )

      roleMap[
        role
      ].readiness.push(
        analysis.promotionReadiness
      )

      roleMap[
        role
      ].count += 1
    }
  )

  const roles =
    Object.entries(
      roleMap
    ).map(
      ([name, data]) => ({
        name,

        competency:
          average(
            data.competency
          ),

        ai:
          average(
            data.ai
          ),

        promotionReadiness:
          average(
            data.readiness
          ),

        count:
          data.count,
      })
    )

  // -------------------------------------------------------------------------
  // Organization-wide gap summary
  // -------------------------------------------------------------------------

  const gapSummary = {}

  analyses.forEach(
    (analysis) => {
      analysis.gaps.forEach(
        (gap) => {
          if (gap.gap <= 0) {
            return
          }

          if (
            !gapSummary[
              gap.competencyId
            ]
          ) {
            gapSummary[
              gap.competencyId
            ] = {
              competencyId:
                gap.competencyId,

              name:
                gap.competencyName,

              count: 0,

              totalGap: 0,

              avgGap: 0,

              criticalCount: 0,

              highPriorityCount: 0,

              totalConfidence: 0,
            }
          }

          const item =
            gapSummary[
              gap.competencyId
            ]

          item.count += 1

          item.totalGap +=
            gap.gap

          item.totalConfidence +=
            safeNumber(
              gap.confidence
            )

          if (
            gap.riskLevel >= 3
          ) {
            item.criticalCount +=
              1
          }

          if (
            gap.priorityLevel >= 3
          ) {
            item.highPriorityCount +=
              1
          }
        }
      )
    }
  )

  const criticalGaps =
    Object.values(
      gapSummary
    )
      .map(
        (item) => {
          const competency =
            COMPETENCIES.find(
              (value) =>
                value.id ===
                item.competencyId
            )

          const avgGap =
            item.count > 0
              ? Math.round(
                  (
                    item.totalGap /
                    item.count
                  ) * 10
                ) / 10
              : 0

          const affectedPercentage =
            analyses.length
              ? Math.round(
                  (
                    item.count /
                    analyses.length
                  ) * 100
                )
              : 0

          const confidence =
            item.count > 0
              ? Math.round(
                  item.totalConfidence /
                    item.count
                )
              : 0

          const severityScore =
            calculateGapSeverity(
              {
                avgGap,
              },
              item.count,
              analyses.length,
              competency
            )

          return {
            ...item,

            avgGap,

            affectedPercentage,

            confidence,

            severityScore:
              Math.round(
                severityScore *
                  100
              ) / 100,

            weight:
              getCompetencyWeight(
                competency
              ),

            criticality:
              getCompetencyCriticality(
                competency
              ),
          }
        }
      )
      .sort(
        (a, b) =>
          b.severityScore -
          a.severityScore
      )

  // -------------------------------------------------------------------------
  // AI distribution
  // -------------------------------------------------------------------------

  const aiDistribution = {
    leader: analyses.filter(
      (analysis) =>
        safeNumber(
          analysis.ai?.overall
        ) >= 90
    ).length,

    ready: analyses.filter(
      (analysis) => {
        const score =
          safeNumber(
            analysis.ai?.overall
          )

        return (
          score >= 75 &&
          score < 90
        )
      }
    ).length,

    capable: analyses.filter(
      (analysis) => {
        const score =
          safeNumber(
            analysis.ai?.overall
          )

        return (
          score >= 60 &&
          score < 75
        )
      }
    ).length,

    developing:
      analyses.filter(
        (analysis) => {
          const score =
            safeNumber(
              analysis.ai?.overall
            )

          return (
            score >= 40 &&
            score < 60
          )
        }
      ).length,

    beginner:
      analyses.filter(
        (analysis) =>
          safeNumber(
            analysis.ai?.overall
          ) < 40
      ).length,
  }

  // -------------------------------------------------------------------------
  // Workforce readiness
  // -------------------------------------------------------------------------

  const successionReady =
    analyses.filter(
      (analysis) =>
        analysis.promotionReadiness >=
        80
    ).length

  const leadershipPipeline =
    analyses.filter(
      (analysis) =>
        safeNumber(
          analysis.current
            ?.leadership
        ) >= 4
    ).length

  const highRiskEmployees =
    analyses.filter(
      (analysis) =>
        analysis.risks
          ?.competencyRisk ===
        'High'
    ).length

  const lowReadinessEmployees =
    analyses.filter(
      (analysis) =>
        analysis.promotionReadiness <
        50
    ).length

  // -------------------------------------------------------------------------
  // Trends
  // -------------------------------------------------------------------------

  const improvingEmployees =
    analyses.filter(
      (analysis) =>
        analysis.trend ===
        'Improving'
    ).length

  const decliningEmployees =
    analyses.filter(
      (analysis) =>
        analysis.trend ===
        'Declining'
    ).length

  const stableEmployees =
    analyses.filter(
      (analysis) =>
        analysis.trend ===
        'Stable'
    ).length

  const scoreChanges =
    analyses
      .map(
        (analysis) =>
          analysis.scoreChange
      )
      .filter(
        (value) =>
          value !== null &&
          Number.isFinite(value)
      )

  const averageScoreChange =
    average(
      scoreChanges
    )

  const organizationTrend =
    averageScoreChange >= 3
      ? 'Improving'
      : averageScoreChange <=
        -3
      ? 'Declining'
      : 'Stable'

  // -------------------------------------------------------------------------
  // Top strengths
  // -------------------------------------------------------------------------

  const strengthSummary = {}

  analyses.forEach(
    (analysis) => {
      analysis.strengths.forEach(
        (strength) => {
          strengthSummary[
            strength
          ] =
            (
              strengthSummary[
                strength
              ] || 0
            ) + 1
        }
      )
    }
  )

  const topStrengths =
    Object.entries(
      strengthSummary
    )
      .map(
        ([name, count]) => ({
          name,
          count,

          percentage:
            analyses.length
              ? Math.round(
                  (
                    count /
                    analyses.length
                  ) * 100
                )
              : 0,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      )

  // -------------------------------------------------------------------------
  // Development demand
  // -------------------------------------------------------------------------

  const developmentDemand =
    criticalGaps.reduce(
      (sum, gap) =>
        sum + gap.totalGap,
      0
    )

  return {
    analyses,

    employeeCount:
      analyses.length,

    orgCompetencyIndex,

    orgWeightedCompetency,

    orgAIReadiness,

    orgCriticalCompetencyScore,

    departments,

    roles,

    criticalGaps,

    topStrengths,

    aiDistribution,

    successionReady,

    leadershipPipeline,

    highRiskEmployees,

    lowReadinessEmployees,

    developmentDemand,

    trends: {
      improvingEmployees,
      decliningEmployees,
      stableEmployees,
      averageScoreChange,
      organizationTrend,
    },
  }
}

// ---------------------------------------------------------------------------
// Find highest-priority employees
// ---------------------------------------------------------------------------

export function findPriorityEmployees(
  analyses = [],
  limit = 10
) {
  return [...analyses]
    .sort(
      (a, b) => {
        const aScore =
          (a.criticalGaps
            ?.length || 0) *
            4 +
          (a.highPriority
            ?.length || 0) *
            3 +
          (100 -
            safeNumber(
              a.promotionReadiness
            )) *
            0.05

        const bScore =
          (b.criticalGaps
            ?.length || 0) *
            4 +
          (b.highPriority
            ?.length || 0) *
            3 +
          (100 -
            safeNumber(
              b.promotionReadiness
            )) *
            0.05

        return (
          bScore - aScore
        )
      }
    )
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Find highest-priority organizational competencies
// ---------------------------------------------------------------------------

export function findPriorityCompetencies(
  workforceAnalysis,
  limit = 10
) {
  return (
    workforceAnalysis
      ?.criticalGaps || []
  ).slice(0, limit)
}

// ---------------------------------------------------------------------------
// What-if competency simulation
// ---------------------------------------------------------------------------

export function simulateCompetencyImprovement(
  employee,
  competencyId,
  improvement,
  {
    recognitionCount = 0,
  } = {}
) {
  const currentRaw =
    estimateEmployeeCompetencies(
      employee,
      {
        recognitionCount,
      }
    ) || {}

  const current =
    normalizeCompetencies(
      currentRaw
    )

  if (
    !current[
      competencyId
    ]
  ) {
    return null
  }

  const currentLevel =
    current[
      competencyId
    ].level

  const simulatedLevel =
    clamp(
      currentLevel +
        safeNumber(
          improvement
        )
    )

  const simulated = {
    ...current,

    [competencyId]: {
      ...current[
        competencyId
      ],

      level:
        simulatedLevel,
    },
  }

  const required =
    requiredLevelsForRole(
      employee.role,
      employee.department
    ) || {}

  const requiredLevel =
    safeNumber(
      required[
        competencyId
      ],
      DEFAULT_LEVEL
    )

  const beforeGap =
    Math.max(
      0,
      requiredLevel -
        currentLevel
    )

  const afterGap =
    Math.max(
      0,
      requiredLevel -
        simulatedLevel
    )

  const beforeScore =
    calculateWeightedCompetency(
      current
    )

  const afterScore =
    calculateWeightedCompetency(
      simulated
    )

  return {
    competencyId,

    currentLevel,

    simulatedLevel,

    improvement:
      simulatedLevel -
      currentLevel,

    requiredLevel,

    beforeGap,

    afterGap,

    gapClosed:
      beforeGap -
      afterGap,

    beforeScore,

    afterScore,

    scoreImprovement:
      afterScore -
      beforeScore,

    simulatedCompetencies:
      extractLevels(
        simulated
      ),
  }
}

