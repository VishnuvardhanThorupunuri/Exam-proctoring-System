const express = require('express');
const router = express.Router();
const { register, login, getProfile, getRoles, getUsersWithAttempts } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/profile', authenticateToken, getProfile);
router.get('/roles', authenticateToken, getRoles);
router.get('/users', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), getUsersWithAttempts);

module.exports = router;
