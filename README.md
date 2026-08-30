# CampusGuard — Location-Based Emergency System for Students

A working implementation of the system described as a Location Based Emergency System for Students\* (Comfort Leo, FT22BCMP0767, NSUK).

## What it does

- **Students** register, log in, and can send an emergency alert with one press-and-hold action. The browser's Geolocation API captures GPS coordinates automatically and attaches them to the report.
- **Campus security (admin)** log in to a monitoring dashboard, see every alert in real time, open an alert to see the student's details and location on a map, and move an alert through `pending → acknowledged → resolved`.
- Every alert keeps a timestamped event trail (created, acknowledged, resolved).

## Tech stack

- **Backend:** Node.js, Express
- **Database:** SQLite via Node's built-in `node:sqlite` module — file-based, zero setup, **no native compiler required** (needs Node 22.5+; run `node -v` to check)
- **Auth:** `bcryptjs` password hashing + server-side sessions (`express-session`), stored in a small custom SQLite-backed session store so logins survive a server restart
- **Views:** EJS templates, no client framework required
- **Location:** Browser Geolocation API (client) + OpenStreetMap embed (admin map view) — no API key needed

> Earlier versions of this project used `better-sqlite3`, which needs a C++ build toolchain to install on Windows and fails with `gyp ERR!` on machines without one. It's since been swapped for Node's built-in SQLite support, so `npm install` never compiles anything.

## Running it

```bash
cd campusguard
npm install
npm start
```

The app runs at **http://localhost:3000**.

- Student pages: `/`, `/register`, `/login`, `/dashboard`, `/alert`
- Security desk: `/admin/login`

A default security account is created automatically the first time the server starts:

```
email:    security@nsuk.edu.ng
password: 12345678
```

Change this password (or edit the seed in `db.js`) before using the system for anything real.

## Project structure

```
campusguard/
├── server.js              # App entry point, session + view setup
├── db.js                  # SQLite schema + default admin seed
├── middleware/auth.js     # Route guards for students vs admins
├── routes/
│   ├── auth.js             # Student register / login / logout
│   ├── alerts.js           # Student dashboard, alert creation, confirmation
│   └── admin.js             # Admin login, dashboard, monitoring, alert detail
├── views/                  # EJS templates (student pages + admin console)
├── public/css/style.css    # Two-theme design system (paper for students, console for admins)
├── public/js/alert.js      # Geolocation capture + press-and-hold submit
└── data/                   # SQLite database files (created on first run)
```

## Notes on design choices

- The **press-and-hold** alert button (2 seconds) is a deliberate anti-accidental-trigger pattern, matching real-world panic-button UX.
- If a student's device denies location access, the alert still sends — the note field becomes the fallback way to describe where they are, exactly the gap the project's literature review identifies in other systems.
- The admin console uses a distinct dark "dispatch" theme from the student-facing pages, since campus security is a different audience doing a different job (triage, not reporting).

## Extending it (matches Chapter 5's future direction)

- SMS fallback via a provider like Termii or Africa's Talking for when data connectivity is poor.
- A dedicated mobile app to use native GPS/push notifications.
- Role-based admin accounts (security vs. health services vs. fire) with alert routing by category.
- Geofencing so alerts route to the nearest security post automatically.
