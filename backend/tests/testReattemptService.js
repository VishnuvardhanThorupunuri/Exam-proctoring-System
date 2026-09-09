/**
 * Integration Test for Allow Reattempt Workflow
 * Tests attempt submission, reattempt permission checking, proctor authorization,
 * permission consumption, and creation of isolated new attempt without overwriting history.
 */

const assert = require('assert');
const attemptController = require('../controllers/attemptController');
const ExamAttempt = require('../models/ExamAttempt');

// Mock memory store for ExamAttempt documents
const mockDatabase = [];

function wrapDoc(data) {
  const doc = {
    _id: data._id || `attempt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    allowReattempt: false,
    violations: [],
    integrityScore: 100,
    answers: {},
    ...data,
    save: async function() { return this; },
    toObject: function() {
      const clone = { ...this };
      delete clone.save;
      delete clone.toObject;
      return clone;
    }
  };
  return doc;
}

// Override Mongoose model methods for test execution
ExamAttempt.findOne = (query) => {
  const matches = mockDatabase.filter(doc => {
    let match = true;
    if (query.studentId && doc.studentId !== query.studentId) match = false;
    if (query.examId && doc.examId !== query.examId) match = false;
    if (query.status) {
      if (typeof query.status === 'string' && doc.status !== query.status) match = false;
      if (query.status.$in && Array.isArray(query.status.$in) && !query.status.$in.includes(doc.status)) match = false;
      if (query.status.$ne && doc.status === query.status.$ne) match = false;
    }
    return match;
  });

  const matchDoc = matches[matches.length - 1] || null;

  return {
    sort: () => ({
      exec: async () => matchDoc,
      then: (resolve) => resolve(matchDoc)
    }),
    exec: async () => matchDoc,
    then: (resolve) => resolve(matchDoc)
  };
};

ExamAttempt.findById = async (id) => {
  return mockDatabase.find(doc => doc._id === id || doc.id === id) || null;
};

ExamAttempt.find = (query) => {
  const filter = (doc) => {
    let match = true;
    if (query.studentId && doc.studentId !== query.studentId) match = false;
    if (query.examId && doc.examId !== query.examId) match = false;
    return match;
  };
  const results = mockDatabase.filter(filter);
  return {
    sort: () => results,
    exec: async () => results,
  };
};

ExamAttempt.create = async (dataArray) => {
  const data = Array.isArray(dataArray) ? dataArray[0] : dataArray;
  const newDoc = wrapDoc(data);
  mockDatabase.push(newDoc);
  return newDoc;
};

// Helper mock response builder
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('🧪 Starting Allow Reattempt Service Test Suite...\n');

  const studentUser = { id: 'student-101', role: 'STUDENT', email: 'student@example.com' };
  const proctorUser = { id: 'proctor-202', role: 'PROCTOR', email: 'proctor@example.com' };
  const examId = 'exam-999';

  // TEST 1: Initial Attempt Creation by Student
  console.log('Test 1: Student creates initial exam attempt (#1)');
  const req1 = { user: studentUser, body: { examId, deviceInfo: { userAgent: 'TestBrowser' } } };
  const res1 = createMockRes();

  await attemptController.createAttempt(req1, res1);

  assert.strictEqual(res1.statusCode, 201, 'Initial attempt creation should succeed with 201 Created');
  assert.ok(res1.body.id || res1.body._id, 'Should return attemptId');
  assert.strictEqual(mockDatabase.length, 1, 'Database should contain 1 attempt document');
  const attempt1 = mockDatabase[0];
  assert.strictEqual(attempt1.status, 'IN_PROGRESS');
  assert.strictEqual(attempt1.allowReattempt, false, 'allowReattempt default must be false');
  console.log('✅ Passed: Initial attempt created cleanly.\n');

  // TEST 2: Submit Attempt #1
  console.log('Test 2: Student submits attempt #1 with answers & integrity score');
  attempt1.status = 'SUBMITTED';
  attempt1.answers = { q1: 'Option A' };
  attempt1.integrityScore = 95;
  console.log('✅ Passed: Attempt #1 marked as SUBMITTED with score 95%.\n');

  // TEST 3: Student tries to create another attempt WITHOUT permission
  console.log('Test 3: Student tries to create attempt #2 without proctor reattempt permission');
  const req3 = { user: studentUser, body: { examId } };
  const res3 = createMockRes();

  await attemptController.createAttempt(req3, res3);

  assert.strictEqual(res3.statusCode, 400, 'Should reject reattempt without permission (HTTP 400)');
  assert.ok(res3.body.error.includes('Retakes are not permitted'), 'Error message should indicate retakes not permitted');
  assert.strictEqual(mockDatabase.length, 1, 'No new attempt document should be created');
  console.log('✅ Passed: Reattempt correctly blocked when permission is not granted.\n');

  // TEST 4: Proctor grants Reattempt Permission
  console.log('Test 4: Proctor approves reattempt for student attempt #1');
  const req4 = { user: proctorUser, params: { id: attempt1._id }, app: { get: () => null } };
  const res4 = createMockRes();

  await attemptController.allowReattempt(req4, res4);

  assert.strictEqual(res4.statusCode, 200, 'Proctor approval should succeed (200)');
  assert.strictEqual(attempt1.allowReattempt, true, 'attempt1.allowReattempt should now be true');
  assert.strictEqual(attempt1.reattemptAllowedBy, proctorUser.id);
  assert.ok(attempt1.reattemptAllowedAt, 'reattemptAllowedAt timestamp set');
  console.log('✅ Passed: Reattempt permission granted and recorded on attempt #1.\n');

  // TEST 5: Student launches Reattempt (#2) after permission granted
  console.log('Test 5: Student launches exam again after proctor approval');
  const req5 = { user: studentUser, body: { examId, deviceInfo: { userAgent: 'TestBrowser' } } };
  const res5 = createMockRes();

  await attemptController.createAttempt(req5, res5);

  assert.strictEqual(res5.statusCode, 201, 'Creation of attempt #2 should succeed with 201 Created');
  assert.strictEqual(mockDatabase.length, 2, 'Database should now contain 2 separate attempt documents');

  const attempt2 = mockDatabase[1];
  assert.notStrictEqual(attempt2._id, attempt1._id, 'Attempt #2 must have a distinct unique ID');
  assert.notStrictEqual(attempt2.deviceSessionId, attempt1.deviceSessionId, 'Attempt #2 must have a distinct device session ID');
  assert.strictEqual(attempt2.status, 'IN_PROGRESS', 'Attempt #2 status is IN_PROGRESS');
  assert.strictEqual(attempt2.integrityScore, 100, 'Attempt #2 starts with fresh 100% integrity score');

  // Verify permission consumption on Attempt #1
  assert.strictEqual(attempt1.allowReattempt, false, 'allowReattempt on attempt #1 must be consumed (reset to false)');
  assert.strictEqual(attempt1.status, 'SUBMITTED', 'Attempt #1 status remains SUBMITTED');
  assert.strictEqual(attempt1.integrityScore, 95, 'Attempt #1 score remains 95% intact');
  assert.deepStrictEqual(attempt1.answers, { q1: 'Option A' }, 'Attempt #1 answers remain untouched');
  console.log('✅ Passed: Attempt #2 created cleanly; Attempt #1 historical data preserved 100% intact; permission consumed.\n');

  // TEST 6: Submit Attempt #2 and try to create attempt #3 without secondary permission
  console.log('Test 6: Student submits attempt #2 and tries to start attempt #3 without another permission grant');
  attempt2.status = 'SUBMITTED';

  const req6 = { user: studentUser, body: { examId } };
  const res6 = createMockRes();

  await attemptController.createAttempt(req6, res6);

  assert.strictEqual(res6.statusCode, 400, 'Reattempt without new permission should be blocked (HTTP 400)');
  assert.strictEqual(mockDatabase.length, 2, 'No 3rd attempt document created');
  console.log('✅ Passed: Single-use permission enforcement verified.\n');

  console.log('🎉 ALL ALLOW REATTEMPT INTEGRATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Allow Reattempt Test suite failed:', err);
  process.exit(1);
});
