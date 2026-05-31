import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import CreateExam from './pages/CreateExam';
import ProctorDashboard from './pages/ProctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Navbar from './components/Navbar';
import ExamSession from './pages/ExamSession';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('https://exam-proctoring-system-vrbm.onrender.com/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        // Clear stale token so we don't get stuck in an infinite redirect loop
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [token]);

  const handleLogin = (newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0a0d14',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="pulse-glow" style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
          <h2>Loading Aegis Proctoring Portal...</h2>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {token && user && <Navbar user={user} onLogout={handleLogout} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Routes>
            <Route path="/login" element={!token ? <Login onLogin={handleLogin} /> : <Navigate to="/" />} />
            <Route path="/register" element={!token ? <Register /> : <Navigate to="/" />} />
            <Route
              path="/"
              element={token && user ? (
                user.role === 'STUDENT' ? (
                  <StudentDashboard token={token} user={user} />
                ) : user.role === 'ADMIN' ? (
                  <AdminDashboard token={token} user={user} />
                ) : (
                  <ProctorDashboard token={token} user={user} />
                )
              ) : (
                <Navigate to="/login" />
              )}
            />
            <Route
              path="/exam/:id"
              element={token && user && user.role === 'STUDENT' ? <ExamSession token={token} user={user} /> : <Navigate to="/login" />}
            />
            <Route
              path="/proctor/dashboard"
              element={token && user && (user.role === 'PROCTOR' || user.role === 'ADMIN') ? (
                <ProctorDashboard token={token} user={user} />
              ) : (
                <Navigate to="/login" />
              )}
            />
            <Route
              path="/admin/create-exam"
              element={token && user && (user.role === 'PROCTOR' || user.role === 'ADMIN') ? (
                <CreateExam token={token} />
              ) : (
                <Navigate to="/login" />
              )}
            />
            <Route
              path="/admin/edit-exam/:id"
              element={token && user && (user.role === 'PROCTOR' || user.role === 'ADMIN') ? (
                <CreateExam token={token} />
              ) : (
                <Navigate to="/login" />
              )}
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
