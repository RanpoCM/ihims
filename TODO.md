# TODO — Focus IHIMS on 6 core modules with supporting admin features

## Goal
Restructure the sidebar so the system's primary focus is 6 core modules, while the
other 5 modules (Recognition, Accounts, Announcements, Audit Log, Settings) remain
fully functional as supporting/admin features in a secondary "Admin & Tools" section.

## Core 6 modules (main navigation)
1. Dashboard
2. Performance
3. Competency
4. AI Competency (Gap Analysis)
5. Learning & Training
6. Succession Planning

## Supporting / Admin modules (secondary section)
- Recognition
- Accounts
- Announcements
- Audit Log
- Settings

## Plan
- [x] Read rbac.js MODULES + Navbar component to understand current structure
- [x] rbac.js: add `featured` flag to MODULES (true for the 6 core, false for supporting)
- [x] App.jsx Navbar: split visible modules into featured (main) + supporting (Admin section)
- [x] App.css: add styles for the admin section divider/heading
- [x] npm run lint → must pass (0 warnings/errors)
- [x] npm run build → must pass
- [x] Commit + push to github.com/RanpoCM/ihims on master

