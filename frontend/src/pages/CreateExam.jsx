import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './CreateExam.css';

const API = 'http://localhost:5000';

export default function CreateExam({ token }) {
  const navigate = useNavigate();
  const { id: editId } = useParams(); // present only in edit mode
  const isEditing = Boolean(editId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxWarnings, setMaxWarnings] = useState(3);
  const [questions, setQuestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExam, setLoadingExam] = useState(isEditing);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ── Pre-fill form when editing ──────────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) return;
    const fetchExam = async () => {
      try {
        const res = await fetch(`${API}/api/exams/${editId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load exam data.');
        const data = await res.json();

        setTitle(data.title || '');
        setDescription(data.description || '');
        setDurationMinutes(data.durationMinutes || 60);
        setMaxWarnings(data.maxWarningsAllowed ?? 3);

        // Convert ISO date strings to datetime-local format (YYYY-MM-DDTHH:MM)
        const toLocal = (iso) => iso ? iso.slice(0, 16) : '';
        setStartTime(toLocal(data.startTime));
        setEndTime(toLocal(data.endTime));

        // Normalise questions — options may be JSON-stringified array
        const qs = (data.questions || []).map((q) => {
          let opts = q.options;
          if (typeof opts === 'string') {
            try { opts = JSON.parse(opts); } catch { opts = opts.split(',').map(o => o.trim()); }
          }
          if (!Array.isArray(opts)) opts = ['', '', '', ''];
          // Pad to 4 options for MCQ display
          while (opts.length < 4) opts.push('');
          return { ...q, options: opts };
        });
        setQuestions(qs);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingExam(false);
      }
    };
    fetchExam();
  }, [editId, token, isEditing]);

  // ── Question helpers ─────────────────────────────────────────────────────────
  const handleAddQuestion = () => {
    setQuestions([...questions, { questionText: '', questionType: 'MCQ', options: ['', '', '', ''], correctAnswer: '', points: 1 }]);
  };

  const handleRemoveQuestion = (index) => setQuestions(questions.filter((_, i) => i !== index));

  const handleQuestionChange = (index, field, value) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const handleOptionChange = (qIndex, optIndex, val) => {
    const updated = [...questions];
    const opts = [...updated[qIndex].options];
    opts[optIndex] = val;
    updated[qIndex].options = opts;
    setQuestions(updated);
  };

  // ── Submit (create or update) ────────────────────────────────────────────────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    if (questions.length === 0) {
      setError('Please add at least one question to the exam.');
      setSubmitting(false);
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      setError('End Time must be strictly after Start Time.');
      setSubmitting(false);
      return;
    }
    const diffMins = (end - start) / 60000;
    if (durationMinutes > diffMins) {
      setError('Exam duration cannot exceed the scheduled time window.');
      setSubmitting(false);
      return;
    }

    const payload = {
      title,
      description,
      durationMinutes,
      startTime,
      endTime,
      maxWarningsAllowed: maxWarnings,
      questions: questions.map((q) => ({
        _id: q._id,           // preserved so backend keeps the same IDs on update
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.questionType === 'MCQ' ? q.options.filter((o) => o.trim() !== '') : [],
        correctAnswer: q.correctAnswer,
        points: q.points,
      })),
    };

    try {
      const url = isEditing ? `${API}/api/exams/${editId}` : `${API}/api/exams`;
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Failed to ${isEditing ? 'update' : 'create'} exam`);
      }

      setSuccessMsg(isEditing ? '✅ Exam updated successfully!' : '✅ Exam created successfully!');
      setTimeout(() => navigate('/admin'), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading skeleton (edit mode) ─────────────────────────────────────────────
  if (loadingExam) {
    return (
      <div className="create-exam-root bg-mesh" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }} className="pulse-glow">📝</div>
          <p>Loading exam data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-exam-root bg-mesh">
      <header className="student-header glass-panel" style={{ zIndex: 100 }}>
        <div className="header-brand">
          <span className="logo-icon floating" onClick={() => navigate('/admin')} style={{ cursor: 'pointer' }}>🛡️</span>
          <h1>Aegis Admin Console</h1>
        </div>
        <div className="header-user">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin')}>Cancel &amp; Back</button>
        </div>
      </header>

      <main className="create-main fade-in-up">
        <div className="create-header-text">
          <h2 className="section-title gradient-text" style={{ fontSize: '2rem' }}>
            {isEditing ? '✏️ Edit Examination' : 'Create Examination'}
          </h2>
          <p className="section-subtitle">
            {isEditing
              ? 'Update the exam details, schedule, and questions below.'
              : 'Deploy a secure online exam paper with sandboxed edge AI configurations.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error fade-in" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️</span> {error}
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success fade-in" style={{ marginBottom: '1.5rem' }}>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="create-form">
          {/* Basic Configuration */}
          <section className="create-section glass-panel">
            <h3 className="section-heading">
              <span className="section-icon">📋</span> Basic Configuration
            </h3>

            <div className="form-group mb-4">
              <label className="form-label">Exam Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Data Structures Midterm"
                required
                className="form-input"
                id="exam-title-input"
              />
            </div>

            <div className="form-group mb-4">
              <label className="form-label">Instructions / Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide instructions for the exam..."
                className="form-input form-textarea"
                id="exam-desc-input"
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Duration (Minutes)</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  min={5}
                  required
                  className="form-input"
                  id="exam-duration-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Allowed Warnings Threshold</label>
                <input
                  type="number"
                  value={maxWarnings}
                  onChange={(e) => setMaxWarnings(Number(e.target.value))}
                  min={1}
                  required
                  className="form-input"
                  id="exam-maxwarn-input"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  max="2099-12-31T23:59"
                  className="form-input"
                  style={{ colorScheme: 'dark' }}
                  id="exam-start-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  min={startTime || undefined}
                  max="2099-12-31T23:59"
                  className="form-input"
                  style={{ colorScheme: 'dark' }}
                  id="exam-end-input"
                />
              </div>
            </div>
          </section>

          {/* Questions Panel */}
          <section className="create-section glass-panel">
            <div className="section-header-row">
              <h3 className="section-heading" style={{ margin: 0 }}>
                <span className="section-icon">🙋</span> Questions Bank{' '}
                <span className="badge badge-info">{questions.length}</span>
              </h3>
              <button type="button" onClick={handleAddQuestion} className="btn btn-secondary btn-sm" id="add-question-btn">
                ➕ Add Question
              </button>
            </div>

            {questions.length === 0 ? (
              <div className="empty-questions">
                <div style={{ fontSize: '3rem', opacity: 0.5 }}>🗂️</div>
                <p>No questions added yet.<br />Click "Add Question" above to begin stacking.</p>
              </div>
            ) : (
              <div className="questions-list">
                {questions.map((q, qIndex) => (
                  <div key={qIndex} className="question-card glass-card fade-in">
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIndex)}
                      className="question-remove"
                      title="Remove Question"
                    >
                      🗑️
                    </button>

                    <h4 className="question-number">Question {qIndex + 1}</h4>

                    <div className="form-group mb-3">
                      <label className="form-label">Question Text</label>
                      <textarea
                        value={q.questionText}
                        onChange={(e) => handleQuestionChange(qIndex, 'questionText', e.target.value)}
                        placeholder="What is the time complexity of bubble sort?"
                        required
                        className="form-input"
                        style={{ minHeight: '80px' }}
                      />
                    </div>

                    <div className="form-grid mb-3">
                      <div className="form-group">
                        <label className="form-label">Question Type</label>
                        <select
                          value={q.questionType}
                          onChange={(e) => handleQuestionChange(qIndex, 'questionType', e.target.value)}
                          className="form-input form-select"
                        >
                          <option value="MCQ">Multiple Choice Question (MCQ)</option>
                          <option value="text">Free-Form Text Answer</option>
                          <option value="coding">Coding IDE Workspace</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Points</label>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => handleQuestionChange(qIndex, 'points', Number(e.target.value))}
                          min={1}
                          required
                          className="form-input"
                        />
                      </div>
                    </div>

                    {q.questionType === 'MCQ' && (
                      <div className="form-group mb-3">
                        <label className="form-label">Options</label>
                        <div className="options-grid">
                          {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className="option-row">
                              <span className="option-letter">{String.fromCharCode(65 + optIdx)}.</span>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => handleOptionChange(qIndex, optIdx, e.target.value)}
                                placeholder={`Option ${optIdx + 1}`}
                                required
                                className="form-input"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Correct / Model Answer</label>
                      <input
                        type="text"
                        value={q.correctAnswer}
                        onChange={(e) => handleQuestionChange(qIndex, 'correctAnswer', e.target.value)}
                        placeholder={q.questionType === 'MCQ' ? 'e.g. Option text matching exactly' : 'Model answer or key points'}
                        required
                        className="form-input"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Action Buttons */}
          <div className="create-actions">
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-secondary btn-lg">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary btn-lg" id="submit-exam-btn">
              {submitting
                ? <><span className="spin">⏳</span> {isEditing ? 'Saving...' : 'Creating...'}</>
                : isEditing ? '💾 Save Changes' : '🚀 Create Exam'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
