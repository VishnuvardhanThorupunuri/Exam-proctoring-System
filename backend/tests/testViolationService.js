/**
 * Integration Test for ViolationService
 * Tests validation, server-authoritative classification, risk weight calculation,
 * debouncing/cooldown, and auto-termination.
 */

const assert = require('assert');
const violationService = require('../services/violationService');
const { VIOLATION_CONFIG } = require('../config/violationConfig');

// Mock dependencies
const mockAttemptId = 'attempt-12345';
const mockExamId = 'exam-67890';
const mockStudentId = 'student-abc';

const mockSocketUser = {
  id: mockStudentId,
  role: 'STUDENT',
  email: 'student@example.com',
};

// Mock ExamAttempt in-memory storage
let mockAttemptStore = {
  _id: mockAttemptId,
  examId: mockExamId,
  studentId: mockStudentId,
  status: 'IN_PROGRESS',
  integrityScore: 100,
  submittedAt: null,
  proctorNotes: '',
  save: async function () { return this; },
};

// Mock ProctorViolation storage
const mockViolationRecords = [];

// Override Mongoose model methods for unit test execution
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');
const User = require('../models/User');

ExamAttempt.findById = async (id) => {
  if (id === mockAttemptId) return mockAttemptStore;
  return null;
};

ProctorViolation.create = async (data) => {
  const record = { _id: `violation-${Date.now()}-${Math.random()}`, ...data };
  mockViolationRecords.push(record);
  return record;
};

User.findById = async () => ({ firstName: 'Test', lastName: 'Candidate' });

// Mock IO socket emitter
const mockEmittedEvents = [];
const mockIo = {
  to: (room) => ({
    emit: (event, payload) => {
      mockEmittedEvents.push({ room, event, payload });
    },
  }),
};

async function runTests() {
  console.log('🧪 Starting ViolationService Unit & Integration Test Suite...\n');

  // Test 1: Payload Validation Failures
  console.log('Test 1: Reject invalid payload structure');
  const invalidResult = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: { attemptId: mockAttemptId, type: 'UNKNOWN_TYPE' },
    io: mockIo,
  });
  assert.strictEqual(invalidResult.success, false);
  assert.strictEqual(invalidResult.status, 'INVALID_PAYLOAD');
  console.log('✅ Passed: Invalid violation type rejected.\n');

  // Test 2: Server-Authoritative Classification & Risk Calculation
  console.log('Test 2: Server-authoritative classification & score penalty');
  // Client attempts to send forged severity 'LOW' and riskWeight '0'
  const payload1 = {
    attemptId: mockAttemptId,
    examId: mockExamId,
    type: 'MULTIPLE_FACES', // High severity: base riskWeight 30
    severity: 'LOW',        // Should be IGNORED by server
    riskWeight: 0,          // Should be IGNORED by server
    confidence: 1.0,
    metadata: { frame: 1 },
  };

  const res1 = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: payload1,
    io: mockIo,
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.status, 'PROCESSED');
  assert.strictEqual(res1.penalty, 30); // Risk weight from VIOLATION_CONFIG (30 * 1.0)
  assert.strictEqual(mockAttemptStore.integrityScore, 70); // 100 - 30 = 70
  assert.strictEqual(mockViolationRecords.length, 1);
  assert.strictEqual(mockViolationRecords[0].severity, 'HIGH'); // Server overridden to HIGH
  console.log('✅ Passed: Server overrode forged client parameters and calculated correct score (70).\n');

  // Test 3: Cooldown / Debouncing
  console.log('Test 3: Cooldown / Debouncing rapid duplicate violations');
  // Send identical MULTIPLE_FACES immediately (within 5s cooldown)
  const res2 = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: payload1,
    io: mockIo,
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.status, 'DEBOUNCED');
  assert.strictEqual(mockAttemptStore.integrityScore, 70); // Score remains unchanged
  assert.strictEqual(mockViolationRecords.length, 1); // DB records count remains 1
  console.log('✅ Passed: Duplicate violation within cooldown window debounced.\n');

  // Test 4: Confidence scaling & Score accumulation
  console.log('Test 4: Confidence-scaled penalty (PHONE_DETECTED)');
  // PHONE_DETECTED has riskWeight 35. Confidence = 0.80 -> Penalty = Math.round(35 * 0.8) = 28
  const payload2 = {
    attemptId: mockAttemptId,
    examId: mockExamId,
    type: 'PHONE_DETECTED',
    confidence: 0.80,
  };

  const res3 = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: payload2,
    io: mockIo,
  });

  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.penalty, 28);
  assert.strictEqual(mockAttemptStore.integrityScore, 42); // 70 - 28 = 42
  console.log('✅ Passed: Confidence-scaled penalty calculated correctly (score=42).\n');

  // Test 5: Auto-Termination Threshold
  console.log('Test 5: Auto-termination trigger when score <= 20');
  // CAMERA_DISCONNECTED has riskWeight 40. Current score = 42 -> 42 - 40 = 2
  const payload3 = {
    attemptId: mockAttemptId,
    examId: mockExamId,
    type: 'CAMERA_DISCONNECTED',
    confidence: 1.0,
  };

  const res4 = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: payload3,
    io: mockIo,
  });

  assert.strictEqual(res4.success, true);
  assert.strictEqual(res4.autoTerminated, true);
  assert.strictEqual(mockAttemptStore.integrityScore, 2);
  assert.strictEqual(mockAttemptStore.status, 'TERMINATED');

  // Check if force termination event was broadcasted to candidate
  const termEvent = mockEmittedEvents.find(e => e.event === 'exam_force_terminated');
  assert.notStrictEqual(termEvent, undefined);
  console.log('✅ Passed: Auto-terminated session when score fell below threshold (score=2).\n');

  // Test 6: Snapshot Evidence Image Persistence
  console.log('Test 6: Snapshot Evidence Image Persistence');
  const mockBase64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
  const payload4 = {
    attemptId: mockAttemptId,
    examId: mockExamId,
    type: 'NO_FACE',
    confidence: 0.95,
    snapshotData: mockBase64Image,
  };

  // Reset attempt status for test
  mockAttemptStore.status = 'IN_PROGRESS';

  const res5 = await violationService.processViolation({
    socketUser: mockSocketUser,
    rawPayload: payload4,
    io: mockIo,
  });

  assert.strictEqual(res5.success, true);
  const latestViolation = mockViolationRecords[mockViolationRecords.length - 1];
  assert.strictEqual(latestViolation.snapshotUrl, mockBase64Image);
  const lastAlertPayload = mockEmittedEvents.find(e => e.event === 'proctoring:violation_alert' && e.payload.type === 'NO_FACE');
  assert.notStrictEqual(lastAlertPayload, undefined);
  assert.strictEqual(lastAlertPayload.payload.snapshotUrl, mockBase64Image);
  console.log('✅ Passed: Evidence JPEG snapshot persisted in MongoDB record and transmitted in real-time alert payload.\n');

  console.log('🎉 ALL VIOLATION SERVICE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
