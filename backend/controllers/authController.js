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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
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
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id).select('-passwordHash');
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

module.exports = {
  register,
  login,
  getProfile,
  getRoles,
  getUsersWithAttempts,
};
