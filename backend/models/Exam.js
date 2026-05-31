const { Schema, model } = require('mongoose');

const ExamSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  title: { type: String, required: true },
  description: { type: String },
  durationMinutes: { type: Number, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  maxWarningsAllowed: { type: Number, default: 3 },
  questions: [{ type: Schema.Types.Mixed }], // store raw question objects
  isActive: { type: Boolean, default: true },
  creatorId: { type: String, ref: 'User' },
}, { timestamps: true });

module.exports = model('Exam', ExamSchema);
