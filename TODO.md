# TODO - IHIMS admin/viewer role access

- [x] Update src/App.jsx to add login (admin/viewer) with localStorage session persistence.
- [x] Add role-based navigation + module gating (admin full access, viewer read-only).
- [x] Hide all add/edit/delete actions for viewer.
- [x] Update Navbar to show logged-in user/role instead of static "Admin".
- [x] Add basic logout button.
- [x] Run `npm run dev` and manually verify (build + lint pass).

  - Viewer can access Dashboard only and cannot modify data.
  - Admin can access all modules and modify data.

