# TODO - IHIMS Icon System & UI Polish

## Goal
Replace placeholder text/emoji icons with a clean, consistent SVG icon system and polish the UI. Then commit and push to GitHub.

## Progress
- [x] Create `src/components/Icon.jsx` — reusable SVG icon component (~30 named icons)
- [x] Enhance `public/favicon.svg` + `index.html` for brand consistency
- [x] Update `src/rbac.js` — use meaningful icon keys in MODULES
- [x] Update `src/App.jsx` — wire `<Icon>` into Navbar, stat cards, learning/recognition stats, logo, avatars, action buttons
- [x] Polish `src/App.css` — icon sizing/transitions, subtle UI refinements
- [x] Run `npm run build` to verify it passes ✓
- [x] Run `npm run lint` to verify 0 warnings/errors ✓
- [x] Commit changes (commit 062a7ff)
- [x] Push to `github.com/RanpoCM/ihims` (origin/master ✓)

## Done
The unified SVG icon system and UI polish are complete, committed, and pushed to GitHub.

## Additional enhancement: clickable notifications
- [x] Made each notification in the NotificationBell clickable
- [x] Notifications navigate to their related module (announcements → Announcements, training → Learning, low performance → Performance)
- [x] Replaced emoji notification icons with SVG icons + themed icon containers
- [x] Added hover state with arrow indicator
- [x] Wired `onNavigate` prop from AppContent to NotificationBell
- [x] Build + lint pass (0 warnings/errors)

## Enhancement round 2 (user feedback)
- [ ] Add notification sound (gentle chime via Web Audio API) when there are unread notifications
- [ ] Mark notification as read when clicked; unread badge reflects unread count
- [ ] Add "Mark all as read" action
- [ ] Add Settings module to manage employee profiles + upload employee pictures (avatars)
- [ ] Display employee avatars across the app (performance table, dashboard, succession, etc.)
- [ ] Build + lint pass
- [ ] Commit + push to GitHub

