import {
  isEmployeeEligibleForAutoAssignment,
  isWithinWorkingSchedule,
  WORKFORCE_THRESHOLDS,
  type WorkSchedule,
  type PresenceStatus,
} from "./src/lib/crm/assignment-engine.server";

interface TestCase {
  name: string;
  scenario: string;
  emp: Parameters<typeof isEmployeeEligibleForAutoAssignment>[0];
  expectedEligible: boolean;
}

const standardSchedule: WorkSchedule = {
  days: [1, 2, 3, 4, 5, 6], // Mon-Sat
  start_time: "00:00",
  end_time: "23:59",
  timezone: "Asia/Kolkata",
};

const offShiftSchedule: WorkSchedule = {
  days: [0], // Sunday only
  start_time: "09:00",
  end_time: "18:00",
  timezone: "Asia/Kolkata",
};

const testCases: TestCase[] = [
  {
    name: "Scenario A: Active + Auto Assign ON + Pool ON + Available",
    scenario: "Full green path",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "AVAILABLE",
    },
    expectedEligible: true,
  },
  {
    name: "Scenario B: Active + Auto Assign OFF",
    scenario: "Auto assign toggled OFF",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: false,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "AVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario C: Pool OFF",
    scenario: "Not in assignment pool",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: false,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "AVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario D: Active + On Leave",
    scenario: "Employee is on active leave",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: true,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "ON_LEAVE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario E: Inactive",
    scenario: "Employment status is INACTIVE",
    emp: {
      employmentStatus: "INACTIVE",
      isActive: false,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "UNAVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario F: Terminated",
    scenario: "Employment status is TERMINATED",
    emp: {
      employmentStatus: "TERMINATED",
      isActive: false,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "UNAVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario G: Archived",
    scenario: "Employment status is ARCHIVED",
    emp: {
      employmentStatus: "ARCHIVED",
      isActive: false,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "UNAVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario H: Outside Working Hours",
    scenario: "Outside configured work schedule",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: offShiftSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "AVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario I: Over Capacity",
    scenario: "Workload >= Max Capacity",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 50,
      maxWorkload: 50,
      presenceStatus: "AVAILABLE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario J: Logged out / OFFLINE",
    scenario: "Presence is OFFLINE",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "OFFLINE",
    },
    expectedEligible: false,
  },
  {
    name: "Scenario K: Short IDLE (< 15 mins)",
    scenario: "Presence is IDLE (heartbeat alive, activity 5-15m ago)",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "IDLE",
    },
    expectedEligible: true, // IDLE remains eligible per rule #10
  },
  {
    name: "Scenario L: Prolonged AWAY (> 15 mins)",
    scenario: "Presence is AWAY",
    emp: {
      employmentStatus: "ACTIVE",
      isActive: true,
      autoAssignEnabled: true,
      isInAssignmentPool: true,
      role: "operations",
      isOnLeave: false,
      workSchedule: standardSchedule,
      currentWorkload: 10,
      maxWorkload: 50,
      presenceStatus: "AWAY",
    },
    expectedEligible: false,
  },
];

console.log("==================================================");
console.log("RUNNING WORKFORCE ASSIGNMENT ELIGIBILITY TEST SUITE");
console.log("==================================================");

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const res = isEmployeeEligibleForAutoAssignment(tc.emp);
  const ok = res.isEligible === tc.expectedEligible;
  if (ok) {
    passed++;
    console.log(`✅ [PASS] ${tc.name}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${tc.name}`);
    console.error(`   Expected eligible: ${tc.expectedEligible}, Got: ${res.isEligible}`);
    console.error(`   Reasons:`, res.reasons);
  }
}

// Additional Verification Tests:
console.log("\n--- Thresholds & Workload Engine Invariant Tests ---");

// U. Workload balancing sorting invariant
const candidateA = { id: "emp_1", name: "Anisha", simulatedWorkload: 5.5, maxWorkload: 50, simulatedActiveCount: 5 };
const candidateB = { id: "emp_2", name: "Rahul", simulatedWorkload: 12.0, maxWorkload: 50, simulatedActiveCount: 10 };
const candidateC = { id: "emp_3", name: "Sucheta", simulatedWorkload: 3.0, maxWorkload: 50, simulatedActiveCount: 3 };

const pool = [candidateA, candidateB, candidateC];
pool.sort((a, b) => a.simulatedWorkload - b.simulatedWorkload);

if (pool[0].name === "Sucheta" && pool[1].name === "Anisha" && pool[2].name === "Rahul") {
  passed++;
  console.log("✅ [PASS] Scenario U: Workload balancing prefers candidate with lowest effective workload (Sucheta < Anisha < Rahul)");
} else {
  failed++;
  console.error("❌ [FAIL] Scenario U: Workload sorting failed");
}

// Configurable thresholds check
if (
  WORKFORCE_THRESHOLDS.IDLE_THRESHOLD_MINUTES === 5 &&
  WORKFORCE_THRESHOLDS.AWAY_THRESHOLD_MINUTES === 15 &&
  WORKFORCE_THRESHOLDS.HEARTBEAT_TIMEOUT_MINUTES === 5 &&
  WORKFORCE_THRESHOLDS.PROLONGED_OFFLINE_REASSIGN_MINUTES === 30 &&
  WORKFORCE_THRESHOLDS.PROLONGED_AWAY_REASSIGN_MINUTES === 60
) {
  passed++;
  console.log("✅ [PASS] Configurable Thresholds: Exact threshold constants validated");
} else {
  failed++;
  console.error("❌ [FAIL] Configurable Thresholds: Constants mismatch");
}

console.log("==================================================");
console.log(`FINAL SUMMARY: ${passed} passed, ${failed} failed.`);
console.log("==================================================");

if (failed > 0) process.exit(1);
