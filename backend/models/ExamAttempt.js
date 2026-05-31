const { Schema, model } = require('mongoose');

const ExamAttemptSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  examId: { type: String, ref: 'Exam', required: true },
  studentId: { type: String, ref: 'User', required: true },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date },
  status: { type: String, default: 'IN_PROGRESS', enum: ['IN_PROGRESS', 'SUBMITTED', 'TERMINATED'] },
  answers: { type: Schema.Types.Mixed, default: {} },
  integrityScore: { type: Number, default: 100 },
  proctorNotes: { type: String },
}, { timestamps: true });

module.exports = model('ExamAttempt', ExamAttemptSchema);
