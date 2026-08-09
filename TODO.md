# TODO — Focus IHIMS on 6 core modules with supporting features

## Goal
Restructure the sidebar so the system's primary focus is 6 core modules, while the
other modules (Recognition, Accounts, Announcements, Audit Log, Settings) remain
fully functional as supporting features in a secondary navigation section.

## Core 6 modules (main navigation)
1. Dashboard
2. Performance
3. Competency
4. AI Competency (Gap Analysis)
5. Learning & Training
6. Succession Planning

## Supporting functions (secondary section)
- Recognition
- Accounts
- Announcements
- Audit Log
- Settings

## Plan
- [x] Read rbac.js MODULES + Navbar component to understand current structure
- [x] rbac.js: add `featured` flag to MODULES (true for the 6 core, false for supporting)
- [x] App.jsx Navbar: split visible modules into featured (main) + supporting section
- [x] Navbar section label is role-aware: "Admin & Tools" (admin), "HR Tools" (hr), "More" (staff)
- [x] App.css: add styles for the section divider/label
- [x] npm run lint -> must pass (0 warnings/errors)
- [x] npm run build -> must pass
- [x] Commit + push to github.com/RanpoCM/ihims on master

