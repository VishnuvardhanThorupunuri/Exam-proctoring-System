const { Schema, model } = require('mongoose');

const ExamAttemptSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  examId: { type: String, ref: 'Exam', required: true },
  studentId: { type: String, ref: 'User', required: true },
  deviceSessionId: { type: String, required: true, default: () => require('crypto').randomUUID() },
  deviceInfo: {
    browser: { type: String, default: 'Browser' },
    os: { type: String, default: 'Operating System' },
    deviceType: { type: String, default: 'Laptop/Desktop' },
    userAgent: { type: String },
    screenDimensions: { type: String },
  },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date },
  status: { type: String, default: 'IN_PROGRESS', enum: ['IN_PROGRESS', 'SUBMITTED', 'TERMINATED'] },
  answers: { type: Schema.Types.Mixed, default: {} },
  integrityScore: { type: Number, default: 100 },
  proctorNotes: { type: String },
  allowReattempt: { type: Boolean, default: false },
  reattemptAllowedBy: { type: String, ref: 'User' },
  reattemptAllowedAt: { type: Date },
}, { timestamps: true });

ExamAttemptSchema.index({ deviceSessionId: 1 });
ExamAttemptSchema.index({ studentId: 1, examId: 1 });

module.exports = model('ExamAttempt', ExamAttemptSchema);
