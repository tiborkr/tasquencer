export type ExerciseKey =
  | 'quick_fix'
  | 'malware_infection'
  | 'unplanned_attack'
  | 'cloud_compromise'
  | 'financial_break_in'
  | 'flood_zone'

export type PlayerRole = {
  key: string
  title: string
}

export const DEFAULT_PLAYER_ROLES: PlayerRole[] = [
  { key: 'it_lead', title: 'IT Lead' },
  { key: 'comms', title: 'Communications' },
  { key: 'legal', title: 'Legal' },
  { key: 'finance', title: 'Finance' },
  { key: 'exec', title: 'Executive' },
]

export type CardSeed = {
  order: number
  kind: 'scenario' | 'inject' | 'prompt' | 'discussion'
  assignedPlayerRoleKey?: string
  title: string
  body: string
  prompt?: string
  questions?: string[]
  isOptional?: boolean
}

export type ExerciseMetadata = {
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  durationMinutes: number
  threatActor: string
  impactedAssets: string[]
  cisControls: string[]
}

export type ExerciseDefinition = {
  key: ExerciseKey
  title: string
  summary: string
  metadata: ExerciseMetadata
  playerRoles: PlayerRole[]
  cards: CardSeed[]
}

export const EXERCISES: ExerciseDefinition[] = [
  {
    key: 'quick_fix',
    title: 'The Quick Fix',
    summary:
      'A critical patch is deployed without testing, causing widespread login failures.',
    metadata: {
      difficulty: 'beginner',
      durationMinutes: 30,
      threatActor: 'Insider (unintentional)',
      impactedAssets: ['Internal network', 'Authentication systems'],
      cisControls: ['CIS 4: Secure Configuration', 'CIS 7: Continuous Vulnerability Management'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          'Joe, your network administrator, is overworked and underpaid. His bags are packed and ready for a family vacation when he is tasked with deploying a critical patch.\n\nIn order to make his flight, Joe quickly builds an installation file for the patch and deploys it before leaving. Next, Sue, the on-call service desk technician, begins receiving calls that nobody can log in.\n\nIt turns out that no testing was done for the recently-installed critical patch.',
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'it_lead',
        title: 'What is your response?',
        body: 'Discuss immediate response steps and stabilization.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'prompt',
        assignedPlayerRoleKey: 'comms',
        title: 'What do you tell stakeholders?',
        body: 'Draft a short message for users and customer-facing teams.',
        prompt:
          'What do you tell stakeholders (internal + external) while the team investigates and mitigates?',
      },
      {
        order: 4,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture decisions, gaps, and follow-ups.',
        questions: [
          'What is Sue’s response in this scenario?',
          'Does your on-call technician have the expertise to handle this incident? If not, are there defined escalation processes?',
          'Does your organization have a formal change control policy?',
          'Are your employees trained on proper change control?',
          'Does your organization have disciplinary procedures in place for when an employee fails to follow established policies?',
          'Does your organization have the ability to roll back patches in the event of unanticipated negative impacts?',
        ],
      },
    ],
  },
  {
    key: 'malware_infection',
    title: 'A Malware Infection',
    summary:
      'A company device is infected via an SD card used on a personal computer.',
    metadata: {
      difficulty: 'beginner',
      durationMinutes: 30,
      threatActor: 'External (malware)',
      impactedAssets: ['Workstations', 'Removable media'],
      cisControls: ['CIS 8: Malware Defenses', 'CIS 10: Data Recovery'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          "An employee used the company’s digital camera for business purposes. They loaded photos onto a personal computer by inserting the SD card.\n\nThe SD card was infected with malware while connected to the employee’s personal computer. When re-inserted into a company machine, it infected the organization’s system with the same malware.",
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'it_lead',
        title: 'What is your response?',
        body: 'Discuss containment, eradication, and recovery.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture key decisions and follow-ups.',
        questions: [
          'Who within the organization would you need to notify?',
          'How would your organization identify and respond to malware infecting your system through this vector?',
          'What is the process for identifying the infection vector?',
          'What other devices could present similar threats?',
          'What should management do?',
          'How can you prevent this from occurring again?',
          'Does your organization have training and policies in place to prevent this?',
          'Do policies apply to all storage devices?',
        ],
      },
    ],
  },
  {
    key: 'unplanned_attack',
    title: 'The Unplanned Attack',
    summary:
      'A hacktivist group threatens an unknown attack; the team must improve posture quickly.',
    metadata: {
      difficulty: 'intermediate',
      durationMinutes: 45,
      threatActor: 'Hacktivist',
      impactedAssets: ['Public-facing systems', 'Network infrastructure'],
      cisControls: ['CIS 7: Continuous Vulnerability Management', 'CIS 17: Incident Response'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          'A hacktivist group threatens to target your organization following an incident involving an allegation of use of excessive force by law enforcement.\n\nYou do not know the nature of the attack they are planning. How can you improve your posture to best protect your organization?',
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'exec',
        title: 'What is your response?',
        body: 'Discuss near-term actions to raise defenses and readiness.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture key decisions and readiness gaps.',
        questions: [
          'What are the potential threat vectors?',
          'Which attack vectors have been most common recently, and how do you prioritize threats?',
          'Have you checked your patch management status?',
          'Can you increase monitoring of your IDS and IPS? If not, who could assist?',
          'What organizations or companies could assist you with analyzing any malware that is identified?',
          'How do you alert your help desk?',
          'Do you have a way of notifying the entire organization of the current threat (bulletin board, etc.)?',
          'Does your Incident Response Plan account for these types of situations?',
        ],
      },
    ],
  },
  {
    key: 'cloud_compromise',
    title: 'The Cloud Compromise',
    summary:
      'A third-party cloud provider is publicly compromised, exposing credentials and stored data.',
    metadata: {
      difficulty: 'intermediate',
      durationMinutes: 45,
      threatActor: 'External (third-party breach)',
      impactedAssets: ['Cloud storage', 'Credentials', 'Sensitive data'],
      cisControls: ['CIS 15: Service Provider Management', 'CIS 3: Data Protection'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          'One of your organization’s internal departments frequently uses outside cloud storage to store large amounts of data, some of which may be considered sensitive.\n\nYou have recently learned that the cloud storage provider being used has been publicly compromised and large amounts of data have been exposed. All user passwords and data stored in the cloud provider’s infrastructure may have been compromised.',
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'it_lead',
        title: 'What is your response?',
        body: 'Discuss incident response across third-party and internal systems.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture communications, obligations, and remediation.',
        questions: [
          'Does your organization have current policies that consider 3rd party cloud storage?',
          'Should your organization still be held accountable for the data breach?',
          'What actions and procedures would be different if this was a data breach on your own local area network?',
          'What should management do?',
          'What, if anything, do you tell your constituents? How/when would you notify them?',
        ],
      },
    ],
  },
  {
    key: 'financial_break_in',
    title: 'Financial Break-in',
    summary:
      'A payroll compromise is discovered; later injects reveal physical intrusion and potential wage siphoning.',
    metadata: {
      difficulty: 'advanced',
      durationMinutes: 60,
      threatActor: 'External (financial crime)',
      impactedAssets: ['HR systems', 'Financial data', 'Physical security'],
      cisControls: ['CIS 5: Account Management', 'CIS 6: Access Control Management'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          'A routine financial audit reveals that several people receiving paychecks are not, and have never been, on payroll.\n\nA system review indicates they were added to the payroll approximately one month prior, at the same time, via a computer in the finance department.',
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'finance',
        title: 'What is your response?',
        body: 'Discuss initial investigation and containment.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'inject',
        title: 'Inject',
        body:
          'You confirm the computer in the payroll department was used to make the additions.\n\nApproximately two weeks prior to the addition of the new personnel, there was a physical break-in to the finance department in which several laptops without sensitive data were taken.',
      },
      {
        order: 4,
        kind: 'inject',
        title: 'Optional Inject',
        body:
          'Further review indicates that all employees are paying a new fee each paycheck and that money is being siphoned to an off-shore bank account.',
        isOptional: true,
      },
      {
        order: 5,
        kind: 'prompt',
        assignedPlayerRoleKey: 'exec',
        title: 'How do you proceed?',
        body:
          'Having this additional information, discuss containment, comms, and compensation.',
        prompt: 'Having this additional information, how do you proceed?',
      },
      {
        order: 6,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture decisions, gaps, and follow-ups.',
        questions: [
          'What actions could you take after the initial break in?',
          'Do you have the capability to audit your physical security system?',
          'Who would/should be notified?',
          'Would you be able to assess the damages associated from the break in?',
          'Would you be able to find out what credentials may have been stored on the laptop?',
          'How would you notify your employees of the incident?',
          'How do you contain the incident?',
          'Optional inject: How do you compensate the employees?',
        ],
      },
    ],
  },
  {
    key: 'flood_zone',
    title: 'The Flood Zone',
    summary:
      'A ransomware attack occurs while the organization is managing a flood emergency.',
    metadata: {
      difficulty: 'advanced',
      durationMinutes: 60,
      threatActor: 'External (ransomware)',
      impactedAssets: ['All systems', 'Business continuity', 'Emergency operations'],
      cisControls: ['CIS 11: Data Recovery', 'CIS 17: Incident Response'],
    },
    playerRoles: DEFAULT_PLAYER_ROLES,
    cards: [
      {
        order: 1,
        kind: 'scenario',
        title: 'Scenario',
        body:
          'Your organization is located within a flood zone. Winter weather combined with warming temperatures has caused flooding throughout the area.\n\nLocal authorities have declared a state of emergency. In the midst of managing the flooding, a ransomware attack occurs on your facility, making computer systems inoperable.',
      },
      {
        order: 2,
        kind: 'prompt',
        assignedPlayerRoleKey: 'exec',
        title: 'What is your response?',
        body:
          'Discuss continuity of operations, incident response, and emergency communications.',
        prompt: 'What is your response?',
      },
      {
        order: 3,
        kind: 'discussion',
        title: 'Discussion Questions',
        body: 'Capture decisions, gaps, and follow-ups.',
        questions: [
          'Do you have a COOP (Continuity of Operations Plan) or DRP (Disaster Recovery Plan)? If so, do you carry out an annual simulation to ensure it is sufficient?',
          'Do you have an Incident Response Plan (IRP) that specifically details ransomware steps?',
          'What steps will you take if restoring from backup is not an option?',
          'Does your IRP consider operational severity in addition to financial implications?',
          'Do you have a plan in place for how to acquire bitcoin?',
          'Have you considered that a targeted ransomware attack may require more bitcoin than is easily accessible on the market?',
          'Do you have a backup for completing Emergency Operations Center (EOC) processes without a computer system? Can you route emergency communications/processes through a neighboring entity?',
          'Who do you need to notify, and how will you do so (consider congested lines)?',
        ],
      },
    ],
  },
]

export function getExerciseDefinition(key: ExerciseKey): ExerciseDefinition {
  const def = EXERCISES.find((e) => e.key === key)
  if (!def) {
    throw new Error(`Unknown exerciseKey: ${key}`)
  }
  return def
}
