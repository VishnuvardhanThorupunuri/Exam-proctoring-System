const express = require('express');
const router = express.Router();
const { register, login, getProfile, getRoles, getUsersWithAttempts, deleteUser, restoreUser } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/profile', authenticateToken, getProfile);
router.get('/roles', authenticateToken, getRoles);
router.get('/users', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), getUsersWithAttempts);
router.post('/users/:id/delete', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), deleteUser);
router.delete('/users/:id', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), deleteUser);
router.post('/users/:id/restore', authenticateToken, authorizeRoles('ADMIN', 'PROCTOR'), restoreUser);

module.exports = router;
