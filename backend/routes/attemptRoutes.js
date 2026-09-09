const express = require('express');
const router = express.Router();
const {
  getAttemptById,
  createAttempt,
  submitAttempt,
  getAttemptViolations,
  terminateAttempt,
  cancelTermination,
  resetIntegrityScore,
  getAdminViolations,
  getStudentViolations,
  allowReattempt,
  recordViolationHttp,
} = require('../controllers/attemptController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');

router.post('/', authenticateToken, createAttempt);
router.get('/admin/violations', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), getAdminViolations);
router.get('/students/:studentId/violations', authenticateToken, getStudentViolations);
router.get('/:id', authenticateToken, getAttemptById);
router.put('/:id', authenticateToken, submitAttempt);
router.post('/:id/submit', authenticateToken, submitAttempt);
router.post('/:id/terminate', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), terminateAttempt);
router.post('/:id/cancel-termination', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), cancelTermination);
router.post('/:id/reset-integrity', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), resetIntegrityScore);
router.post('/:id/allow-reattempt', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), allowReattempt);
router.get('/:id/violations', authenticateToken, getAttemptViolations);
router.post('/:id/violations', authenticateToken, recordViolationHttp);

module.exports = router;

