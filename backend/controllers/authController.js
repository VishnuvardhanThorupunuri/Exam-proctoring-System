const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');

const JWT_SECRET = process.env.JWT_SECRET || 'exam-proctoring-super-secret-key-12345!';

// Auth: Register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required registration details' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Only @gmail.com email addresses are allowed for registration (e.g., user@gmail.com)' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role: role || 'STUDENT',
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Auth: Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Only @gmail.com email addresses are allowed (e.g., user@gmail.com)' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    if (user.isDeleted) {
      return res.status(403).json({ error: 'Account deactivated. Please contact an administrator or proctor to restore your access.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Auth: Profile
const mongoose = require('mongoose');

const getProfile = async (req, res) => {
  try {
    if (!req.user?.id || !mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(401).json({ error: 'Invalid or missing user token' });
    }
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const obj = user.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// System Roles Listing
const getRoles = async (req, res) => {
  try {
    const roles = ['STUDENT', 'PROCTOR', 'ADMIN'];
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Users: Get all users with their attempted exams, proctor violations, and termination status
const getUsersWithAttempts = async (req, res) => {
  try {
    // Restrict access to Admins and Proctors
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    const users = await User.find({}).select('-passwordHash').sort({ createdAt: -1 });
    const formattedUsers = [];

    for (const user of users) {
      const userObj = user.toObject();
      userObj.id = userObj._id;

      // Find attempts
      const attempts = await ExamAttempt.find({ studentId: user._id }).sort({ startedAt: -1 });
      const attemptsWithDetails = [];

      for (const attempt of attempts) {
        const attemptObj = attempt.toObject();
        attemptObj.id = attemptObj._id;

        // Fetch Exam
        const exam = await Exam.findById(attempt.examId);
        attemptObj.examName = exam ? exam.title : 'Unknown Exam';

        // Fetch Violations
        const violations = await ProctorViolation.find({ attemptId: attempt._id }).sort({ timestamp: -1 });
        attemptObj.violations = violations.map(v => {
          const vObj = v.toObject();
          vObj.id = vObj._id;
          return vObj;
        });

        // Add termination flag for direct reading
        attemptObj.isTerminated = attempt.status === 'TERMINATED';

        attemptsWithDetails.push(attemptObj);
      }

      userObj.attempts = attemptsWithDetails;
      formattedUsers.push(userObj);
    }

    res.json(formattedUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Users: Delete / Deactivate user (Supports soft-delete by default & hard-delete if requested)
const deleteUser = async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PROCTOR') {
      return res.status(403).json({ error: 'Only admins or proctors can delete users' });
    }
    const { id } = req.params;
    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot delete your own active session account' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.query.permanent === 'true' || req.body?.permanent === true) {
      await User.findByIdAndDelete(id);
      await ExamAttempt.deleteMany({ studentId: id });
      await ProctorViolation.deleteMany({ studentId: id });
      return res.json({ message: 'User permanently deleted from system', userId: id });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = req.user.id;
    await user.save();

    res.json({ message: 'User account deactivated successfully', userId: user._id, isDeleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Users: Restore soft-deleted / deactivated user
const restoreUser = async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PROCTOR') {
      return res.status(403).json({ error: 'Only admins or proctors can restore users' });
    }
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isDeleted = false;
    user.deletedAt = null;
    user.deletedBy = null;
    await user.save();

    res.json({ message: 'User account restored successfully', userId: user._id, isDeleted: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  getRoles,
  getUsersWithAttempts,
  deleteUser,
  restoreUser,
};
