import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fillCredentials = (role) => {
    if (role === 'STUDENT')  { setEmail('student@aegis.com');  setPassword('password123'); }
    if (role === 'PROCTOR')  { setEmail('proctor@aegis.com');  setPassword('password123'); }
    if (role === 'ADMIN')    { setEmail('admin@aegis.com');    setPassword('password123'); }
  };

  return (
    <div className="login-root bg-mesh">
      {/* Decorative orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-card glass fade-in-up">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo floating">🛡️</div>
          <h1 className="login-title gradient-text">Aegis Proctor</h1>
          <p className="login-subtitle">AI-Powered Real-Time Exam Proctoring</p>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error fade-in">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLoginSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-icon-wrap">
              <span className="input-icon">✉️</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@aegis.com"
                required
                className="form-input"
                id="login-email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-icon-wrap">
              <span className="input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="form-input"
                id="login-password"
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-lg login-submit"
            id="login-submit-btn"
          >
            {submitting ? (
              <><span className="spin">⏳</span> Authenticating…</>
            ) : (
              <><span>🔐</span> Sign In</>
            )}
          </button>
        </form>

        <p className="login-register-link">
          Don't have an account? <Link to="/register" id="goto-register">Register here</Link>
        </p>

        {/* Demo profiles */}
        <div className="login-demo">
          <p className="login-demo-label">⚡ Demo Quick Login</p>
          <div className="login-demo-btns">
            <button id="demo-student" onClick={() => fillCredentials('STUDENT')} className="demo-btn">
              🎓 Student
            </button>
            <button id="demo-proctor" onClick={() => fillCredentials('PROCTOR')} className="demo-btn">
              👁️ Proctor
            </button>
            <button id="demo-admin" onClick={() => fillCredentials('ADMIN')} className="demo-btn">
              ⚙️ Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
