const express = require('express');
const router = express.Router();
const { getAllExams, createExam, getExamById, getExamAttempts, updateExam, deleteExam } = require('../controllers/examController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');

router.get('/', authenticateToken, getAllExams);
router.post('/', authenticateToken, authorizeRoles('PROCTOR', 'ADMIN'), createExam);
router.get('/:id', authenticateToken, getExamById);
router.put('/:id', authenticateToken, authorizeRoles('PROCTOR', 'ADMIN'), updateExam);
router.delete('/:id', authenticateToken, authorizeRoles('PROCTOR', 'ADMIN'), deleteExam);
router.get('/:examId/attempts', authenticateToken, getExamAttempts);

module.exports = router;

