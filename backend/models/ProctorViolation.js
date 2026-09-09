const { Schema, model } = require('mongoose');

const VIOLATION_TYPES = [
  'NO_FACE',
  'MULTIPLE_FACES',
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'PHONE_DETECTED',
  'BOOK_DETECTED',
  'TABLET_DETECTED',
  'CAMERA_DISCONNECTED',
  'MICROPHONE_DISCONNECTED',
  'NETWORK_DISCONNECTED',
];

const ProctorViolationSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  attemptId: { type: String, ref: 'ExamAttempt', required: true },
  examId:    { type: String, ref: 'Exam', required: false },
  studentId: { type: String, ref: 'User', required: true },
  deviceSessionId: { type: String, required: true },
  violationType: {
    type: String,
    required: true,
    enum: VIOLATION_TYPES,
  },
  severity:  { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  confidence: { type: Number, default: 1.0, min: 0, max: 1 },
  previousRiskScore: { type: Number, default: 100 },
  riskContribution: { type: Number, default: 0 },
  newRiskScore: { type: Number, default: 100 },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },
  timestamp: { type: Date, default: Date.now },
  snapshotUrl: { type: String },
  metadata:  { type: Schema.Types.Mixed },
}, { timestamps: true });

// Compound indexes for high performance admin and proctor queries
ProctorViolationSchema.index({ examId: 1, timestamp: -1 });
ProctorViolationSchema.index({ attemptId: 1, timestamp: -1 });
ProctorViolationSchema.index({ studentId: 1, timestamp: -1 });
ProctorViolationSchema.index({ deviceSessionId: 1, timestamp: -1 });
ProctorViolationSchema.index({ violationType: 1, severity: 1 });

module.exports = model('ProctorViolation', ProctorViolationSchema);
