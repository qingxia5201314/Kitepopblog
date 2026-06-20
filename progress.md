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

## 2026-06-20 - Task: Fix admin two-column layout proportions
### What was done
- Reduced the admin page's left column share so it no longer takes about half of the desktop layout.
- Made the content-management two-column cards scale down inside the narrower column.
- Tightened the content-management filter tabs, post title, status badge, and metadata text so they no longer push into the editor area.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.

### Notes
- `src/App.css`: adjusted the admin grid column ratio and added scoped compact styles for the content-management double-column list.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Force compact admin content column
### What was done
- Replaced the proportional admin left column with a fixed 430px desktop column so it no longer visually takes about half of the page.
- Converted the content-management cards to a compact two-column mode with smaller title, badge, icon, metadata, and filter-tab sizing.
- Removed the previous 500px minimum-width behavior that prevented the prior narrowing from being visible.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: measured `.admin-layout` at 959px wide, `.admin-list` at 430px, `.editor-panel` at 509px, content cards at 175px each, and horizontal overflow at 0px.

### Notes
- `src/App.css`: changed the admin desktop grid to `430px minmax(0, 1fr)` and added compact scoped styles for `.admin-content-group`.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Fix compact admin card expansion behavior
### What was done
- Stopped unexpanded cards in the same row from stretching when a neighboring content card is expanded.
- Changed the compact content-card action area to a three-column button row so edit, status, and delete actions stay on one line.
- Reduced the compact action button size so the row fits inside the narrow double-column card.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: expanded card measured 112px tall, neighboring unexpanded card stayed 70px tall, the three action buttons stayed on the same row at 49px each, and horizontal overflow was 0px.

### Notes
- `src/App.css`: removed equal-height stretching from compact content cards and added scoped three-column compact action-button rules.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Fix compact admin user management
### What was done
- Updated the user management panel to use compact form and row layouts that fit the 430px admin column.
- Kept the new-user permission selector and submit button on the same row.
- Fixed user-list loading after an existing admin session is restored, so the user list no longer appears empty just because the page was opened from a saved session.
- Switched the user list loader to the existing `/api/admin/users` client wrapper.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: rendered 2 user rows, measured the new-user form at 358px wide, kept the permission selector and 78px submit button on the same row, and horizontal overflow was 0px.

### Notes
- `src/pages/AdminPage.tsx`: loads admin users through `listUsers`, syncs restored admin sessions into the page state, and fetches users once per active admin token.
- `src/App.css`: added scoped compact styles for `.admin-user-group` forms, user rows, inputs, selects, and buttons.
- Rollback: run `git checkout -- src/pages/AdminPage.tsx src/App.css progress.md`.

## 2026-06-20 - Task: Fix broken article cover images
### What was done
- Added a reusable image fallback component so failed image loads no longer show browser broken-image icons.
- Applied the fallback to homepage article covers, article detail covers, and markdown article images.
- Added regression coverage for failed image loading and styled the article-image fallback state.

### Testing
- `npm test -- --run src/components/shared.test.tsx`: passed. The fallback renders after an image error event.
- `npm test -- --run`: passed. 25 test files and 84 tests passed.
- `npm run build`: passed. Vite production build completed successfully.
- Checked live post cover URLs: site-hosted `/api/images/raw/...` URLs returned 200; one external `pub.mini-tools.uk` image returned 404, which is now handled by the fallback UI.

### Notes
- `src/components/shared.tsx`: added `ImageWithFallback` and used it for markdown images.
- `src/pages/HomePage.tsx`: replaced homepage and detail cover `<img>` rendering with the fallback-aware component.
- `src/App.css`: added the styled fallback block for failed article-body images.
- `src/components/shared.test.tsx`: added regression coverage for image-load failure fallback.
- `src/App.test.tsx`: kept asset mocks current after the Haruhi cutout asset changed to `.webp`.
- Rollback: run `git checkout -- src/components/shared.tsx src/pages/HomePage.tsx src/App.css src/App.test.tsx progress.md && git rm src/components/shared.test.tsx`.
