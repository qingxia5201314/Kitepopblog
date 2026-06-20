## 2026-06-20 - Task: Fix Haruhi hero image and avatar rendering
### What was done
- Rebuilt the homepage Haruhi hero image as a browser-stable transparent WebP.
- Removed the enclosed white gap between the arm and body in the hero cutout.
- Replaced the harsh white base under the character with a subtle shadow only.
- Switched the site avatar to a standard JPEG asset to avoid browser decode failures.
- Added an explicit favicon link in `index.html`.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview at `http://127.0.0.1:4180/`: verified in browser that the hero image reports `naturalWidth=620`, the avatar is rendered through a CSS background image, and there is no horizontal overflow.

### Notes
- `index.html`: added the favicon link.
- `src/App.tsx`: changed the hero import to the transparent WebP asset and removed the topbar avatar `<img>`.
- `src/App.css`: adjusted the hero visual area, soft bottom shadow, metric-card styling, and avatar background path.
- `src/assets/haruhi-avatar.jpg`: added a browser-stable avatar image.
- `src/assets/haruhi-cutout.png`: replaced with the cleaned transparent hero cutout source.
- `src/assets/haruhi-cutout.webp`: added the transparent hero asset used by the page.
- Rollback: run `git checkout -- index.html src/App.css src/App.tsx src/assets/haruhi-cutout.png progress.md` and delete `src/assets/haruhi-avatar.jpg` plus `src/assets/haruhi-cutout.webp`.

## 2026-06-20 - Task: Make admin content management list two-column
### What was done
- Added a dedicated `admin-content-group` class to the admin content management panel.
- Changed the expanded content management panel to a two-column grid when there is enough room.
- Kept the panel heading, create button, and status filter spanning the full width.
- Kept the layout responsive by falling back to one column on narrow screens.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- CSS/structure check: the admin content panel now has a dedicated class, while the user management panel is not affected by the new grid rules.

### Notes
- `src/pages/AdminPage.tsx`: added the content-management-specific class name.
- `src/App.css`: added the responsive two-column grid rules for admin content cards.
- Rollback: run `git checkout -- src/pages/AdminPage.tsx src/App.css progress.md`.

## 2026-06-20 - Task: Narrow admin content management panel
### What was done
- Reduced the visual width of the admin content management area on narrower admin layouts.
- Tightened the two-column card spacing so the list feels less stretched.
- Changed the responsive breakpoint so the two-column list falls back to one column before the cards become cramped.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.

### Notes
- `src/App.css`: limited the admin list width under 980px, tightened the content grid gap, and adjusted the single-column breakpoint to 760px.
- Rollback: run `git checkout -- src/App.css progress.md`.
