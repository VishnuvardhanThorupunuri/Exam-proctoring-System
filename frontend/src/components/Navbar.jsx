import { Link, useNavigate } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();

  const handleLogoutClick = () => {
    if (onLogout) onLogout();
    navigate('/login');
  };

  return (
    <nav style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 1rem', background: 'linear-gradient(90deg, #2c3e50, #4ca1af)', color: '#fff' }}>
      <div style={{ marginRight: 'auto', fontWeight: 'bold', fontSize: '1.2rem' }}>
        🛡️ AEGIS AI Proctor Engine
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {user && user.role !== 'STUDENT' && (
          <>
            <Link to="/dashboard" style={{ color: '#fff', textDecoration: 'none' }}>Dashboard</Link>
            {user.role === 'ADMIN' && (
              <Link to="/create-exam" style={{ color: '#fff', textDecoration: 'none' }}>Create Exam</Link>
            )}
          </>
        )}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{user.firstName} {user.lastName}</span>
            <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{user.role}</span>
            <button onClick={handleLogoutClick} style={{ background: 'transparent', border: '1px solid #fff', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
