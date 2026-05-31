# Aegis - AI-Powered Exam Proctoring System

Aegis is a modern, high-integrity online examination platform utilizing hybrid **Edge-AI Proctoring** and real-time WebSocket telemetry coordination.

---

##  Quick Start Guide

This project is divided into two modules: `/backend` (Node.js/Express, Prisma, SQLite, and Socket.io) and `/frontend` (React, Vite, TypeScript, and Canvas edge visuals).

### 1. Start the Backend Server
Open your terminal and run:
```bash
cd backend
npm run dev
```
The server will boot on port **5000**.
* Database initialized: `/backend/prisma/dev.db` (SQLite)
* The database has been pre-seeded with custom mock profiles and exam schedules.

### 2. Start the Frontend Client
Open a second terminal and run:
```bash
cd frontend
npm run dev
```
The React portal will boot locally on **http://localhost:3000**.

---

##  Test Credentials (Pre-seeded)

Use these credentials on the login screen, or click the **Demo Quick Login Profiles** buttons at the bottom of the card:

| Role | Email | Password | Access Capabilities |
| :--- | :--- | :--- | :--- |
|  **Student** | `student@aegis.com` | `password123` | Active exam console, permission diagnostics, fullscreen browser sandbox, simulated AI gaze tracking. |
|  **Proctor** | `proctor@aegis.com` | `password123` | Access to the live telemetry cockpit, monitoring student warnings, dynamic alarm logs, and block options. |
|  **Admin** | `admin@aegis.com` | `password123` | All proctor views, plus creating new exams and stacking custom question sets. |

---

##  System File Architecture

```text
exam-proctoring-system/
├── backend/
│   ├── prisma/
│   │   ├── dev.db             <-- Instanced SQLite database
│   │   └── schema.prisma      <-- Database entity layouts
│   ├── src/
│   │   ├── seed.ts            <-- Auto-populator script
│   │   └── server.ts          <-- Express REST APIs & Socket server
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Navbar.tsx     <-- Header utility panel
│   │   ├── pages/
│   │   │   ├── Login.tsx            <-- Glassmorphic entrance login
│   │   │   ├── Register.tsx         <-- Profile creator
│   │   │   ├── StudentDashboard.tsx <-- Schedule catalog & camera diagnostics
│   │   │   ├── CreateExam.tsx       <-- Exam dynamic creation manager
│   │   │   ├── ProctorDashboard.tsx <-- Real-time WebSocket alarm console
│   │   │   └── ExamSession.tsx      <-- Secure full-screen exam canvas
│   │   ├── App.tsx            <-- Global router & state coordinator
│   │   ├── index.css          <-- Custom modern CSS variables stylesheet
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

##  Key Features & AI Algorithms

1. **Gaze & Presence Simulation**: The Exam workspace utilizes a canvas scanner grid mirroring your actual camera stream. In the background, it runs an automated tracking simulation log that checks for gaze movements, audio spikes, and triggers immediate alarms if a violation is detected.
2. **Real-time Synchronization**: As soon as a student gets flagged in the `/exam` page, Socket.io sends the telemetry data immediately. The Proctor watching the active exam receives a dynamic animated alert card, and the student's integrity rating updates automatically.
3. **Automated Submission & Lockdown**:
   - Exiting full screen or clicking away generates warnings.
   - If warnings exceed the threshold or the Integrity rating falls to 20%, the exam force-terminates and blocks further entry.
