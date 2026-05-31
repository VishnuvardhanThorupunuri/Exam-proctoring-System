const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Exam = require('../models/Exam');

async function seedDatabase() {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }
    console.log('🌱 Empty database detected. Seeding default testing data...');

    const passwordHash = await bcrypt.hash('password123', 10);

    // Create testing profiles
    const student = await User.create({
      email: 'student@aegis.com',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Mercer',
      role: 'STUDENT',
    });

    const proctor = await User.create({
      email: 'proctor@aegis.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Connor',
      role: 'PROCTOR',
    });

    const admin = await User.create({
      email: 'admin@aegis.com',
      passwordHash,
      firstName: 'Bruce',
      lastName: 'Wayne',
      role: 'ADMIN',
    });

    console.log('👤 Created accounts:');
    console.log(`   - Student: ${student.email}`);
    console.log(`   - Proctor: ${proctor.email}`);
    console.log(`   - Admin:   ${admin.email}`);

    // Create scheduled exam
    const examDateStart = new Date();
    examDateStart.setHours(examDateStart.getHours() - 1); // Started 1hr ago

    const examDateEnd = new Date();
    examDateEnd.setHours(examDateEnd.getHours() + 24); // Expires in 24hrs

    const exam = await Exam.create({
      title: 'Advanced Algorithms & Security Midterm',
      description: 'Welcome to your midterm examination. Access web camera and audio diagnostics are enforced. Fullscreen sandboxing is locked.',
      durationMinutes: 45,
      startTime: examDateStart,
      endTime: examDateEnd,
      maxWarningsAllowed: 3,
      creatorId: admin._id,
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

    console.log(`🏆 Created Exam Paper: "${exam.title}" with 3 dynamic questions.`);
    console.log('🌱 Seeding process completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/exam_proctor';
  console.log(`Connecting to MongoDB at: ${mongoURI}`);

  try {
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully');
    await seedDatabase();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
