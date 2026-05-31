import React from 'react';

/**
 * RoleInfo displays a premium glass-morphic card summarising the current user's
 * permissions within the Aegis exam-proctoring system. It is used across the
 * Student, Proctor and Admin dashboards to provide a clear visual cue of the
 * active role and the associated capabilities.
 */
export default function RoleInfo({ role }) {
  const roleDetails = {
    STUDENT: {
      title: '🎓 Candidate',
      description: 'Access your scheduled exams, submit answers, and view results after grading.',
    },
    PROCTOR: {
      title: '👁️ Exam Proctor',
      description: 'Monitor live exam sessions, review violations, and manage candidate attempts.',
    },
    ADMIN: {
      title: '⚙️ System Administrator',
      description: 'Create exams, manage users, configure proctoring rules, and oversee the platform.',
    },
  };

  const info = roleDetails[role] || roleDetails['STUDENT'];

  return (
    <div style={{
      background: 'rgba(108, 99, 255, 0.08)',
      border: '1px solid rgba(108, 99, 255, 0.3)',
      borderRadius: '12px',
      padding: '1rem 1.25rem',
      marginBottom: '1.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#a89cff' }}>{info.title}</div>
        <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.2rem' }}>{info.description}</div>
      </div>
    </div>
  );
}
