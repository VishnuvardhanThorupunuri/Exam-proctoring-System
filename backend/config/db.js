const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Exam = require('../models/Exam');

async function seedDatabase() {
  try {
    const passwordHash = await bcrypt.hash('password123', 10);

    const defaultUsers = [
      { email: 'student@gmail.com', firstName: 'Alex', lastName: 'Mercer', role: 'STUDENT' },
      { email: 'proctor@gmail.com', firstName: 'Sarah', lastName: 'Connor', role: 'PROCTOR' },
      { email: 'admin@gmail.com', firstName: 'Bruce', lastName: 'Wayne', role: 'ADMIN' },
    ];

    for (const u of defaultUsers) {
      const exists = await User.findOne({ email: u.email });
      if (!exists) {
        await User.create({
          email: u.email,
          passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
        });
        console.log(`👤 Created default demo account: ${u.email} (${u.role})`);
      }
    }

    // Ensure at least one active exam exists
    const examCount = await Exam.countDocuments();
    if (examCount === 0) {
      const adminUser = await User.findOne({ role: 'ADMIN' });
      const examDateStart = new Date();
      examDateStart.setHours(examDateStart.getHours() - 1);
      const examDateEnd = new Date();
      examDateEnd.setHours(examDateEnd.getHours() + 24);

      await Exam.create({
        title: 'Advanced Algorithms & Security Midterm',
        description: 'Welcome to your midterm examination. Web camera, audio diagnostics, and sandboxing are enforced.',
        durationMinutes: 45,
        startTime: examDateStart,
        endTime: examDateEnd,
        maxWarningsAllowed: 3,
        creatorId: adminUser ? adminUser._id : 'system-admin',
        questions: [
          {
            _id: require('crypto').randomUUID(),
            questionText: 'Which of the following sorting algorithms has a worst-case time complexity of O(N log N)?',
            questionType: 'MCQ',
            options: JSON.stringify(['Bubble Sort', 'Insertion Sort', 'Merge Sort', 'Selection Sort']),
            correctAnswer: 'Merge Sort',
            points: 1,
          },
          {
            _id: require('crypto').randomUUID(),
            questionText: 'Explain the distinct difference between Symmetric and Asymmetric encryption schemes, including key distribution properties.',
            questionType: 'TEXT',
            correctAnswer: 'Symmetric encryption uses a single shared secret key for encryption and decryption. Asymmetric uses a public key to encrypt and a private key to decrypt.',
            points: 2,
          },
          {
            _id: require('crypto').randomUUID(),
            questionText: 'Write a JavaScript function `fibonacci(n)` that calculates the N-th Fibonacci sequence value in linear O(N) time complexity and O(1) space complexity.',
            questionType: 'CODE',
            correctAnswer: 'function fibonacci(n) { if (n <= 1) return n; let prev = 0, curr = 1; for (let i = 2; i <= n; i++) { let temp = prev + curr; prev = curr; curr = temp; } return curr; }',
            points: 3,
          },
        ],
      });
      console.log('🏆 Created default sample exam paper');
    }
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

let isConnecting = false;

const connectDB = async (retryCount = 0) => {
  if (mongoose.connection.readyState === 1 || isConnecting) {
    return;
  }

  isConnecting = true;
  const primaryURI = process.env.MONGO_URI || process.env.MONGODB_URI;
  const localURI = 'mongodb://127.0.0.1:27017/exam_proctor';
  const uriToTry = primaryURI || localURI;

  console.log(`Connecting to MongoDB (attempt ${retryCount + 1})...`);

  try {
    await mongoose.connect(uriToTry, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    isConnecting = false;
    console.log('MongoDB connected successfully to:', mongoose.connection.host);
    await seedDatabase();
  } catch (err) {
    isConnecting = false;
    console.error('MongoDB connection error:', err.message);

    // If remote connection failed, try local fallback if local is running
    if (primaryURI && !primaryURI.includes('127.0.0.1') && !primaryURI.includes('localhost')) {
      console.log('🔄 Attempting fallback to local MongoDB (mongodb://127.0.0.1:27017/exam_proctor)...');
      try {
        isConnecting = true;
        await mongoose.connect(localURI, {
          serverSelectionTimeoutMS: 3000,
          connectTimeoutMS: 5000,
        });
        isConnecting = false;
        console.log('MongoDB connected successfully to local MongoDB');
        await seedDatabase();
        return;
      } catch (localErr) {
        isConnecting = false;
        console.error('Local MongoDB fallback also failed:', localErr.message);
      }
    }

    console.log('⏳ Retrying MongoDB connection in 5 seconds...');
    setTimeout(() => connectDB(retryCount + 1), 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected! Attempting reconnection...');
  setTimeout(() => connectDB(0), 3000);
});

mongoose.connection.on('error', (err) => {
  console.error('⚠️ MongoDB connection error event:', err.message);
});

module.exports = connectDB;

