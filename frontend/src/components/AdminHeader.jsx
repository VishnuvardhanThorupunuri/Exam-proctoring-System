import React from 'react';
import './AdminHeader.css';

export default function AdminHeader({ user, onToggleTheme }) {
  return (
    <header className="admin-header glass-card">
      <div className="logo">🛡️ Exam Proctor</div>
      <div className="spacer" />
      <button className="theme-toggle" onClick={onToggleTheme}>🌓</button>
      <div className="user-info">
        <span className="user-name">{user?.firstName || 'Admin'}</span>
        <img src={user?.avatar || 'https://via.placeholder.com/32'} alt="avatar" className="avatar" />
      </div>
    </header>
  );
}
