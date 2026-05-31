const express = require('express');
const router = express.Router();
const { getAttemptById, createAttempt, submitAttempt, getAttemptViolations, terminateAttempt, cancelTermination } = require('../controllers/attemptController');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/', authenticateToken, createAttempt);
router.get('/:id', authenticateToken, getAttemptById);
router.put('/:id', authenticateToken, submitAttempt);
router.post('/:id/submit', authenticateToken, submitAttempt);
router.post('/:id/terminate', authenticateToken, terminateAttempt);
router.post('/:id/cancel-termination', authenticateToken, cancelTermination);
router.get('/:id/violations', authenticateToken, getAttemptViolations);

module.exports = router;
