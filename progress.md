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
