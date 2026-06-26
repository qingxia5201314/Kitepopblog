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

## 2026-06-20 - Task: Fix raw image loading root cause
### What was done
- Reworked the public image raw route so stored images are served from file bytes instead of an unstable Node stream response.
- Added explicit HEAD support for `/api/images/raw/:id`, preventing image probes or cache validation requests from crashing the API process.
- Added server route regression coverage for GET byte delivery and HEAD header-only responses.

### Testing
- `npm test -- --run server/imagesRoutes.test.mjs`: passed. GET returns image bytes and HEAD returns headers without a body.
- `npm test -- --run`: passed. 26 test files and 85 tests passed.
- `npm run build`: passed. Vite production build completed successfully.
- Pre-fix VPS evidence: several existing `/api/images/raw/:id` image URLs returned 502 despite files existing in `data/images`, and service logs showed repeated `ERR_INVALID_STATE: ReadableStream is already closed` crashes.

### Notes
- `server/routes/images.mjs`: changed raw image delivery to `readFile`/Buffer responses and added a HEAD route.
- `server/imagesRoutes.test.mjs`: added server-level coverage for raw image GET and HEAD behavior.
- Rollback: run `git checkout -- server/routes/images.mjs progress.md && git rm server/imagesRoutes.test.mjs`.

## 2026-06-20 - Task: Auto-load file and image admin lists
### What was done
- Fixed image hosting so the saved admin session automatically loads the image list when the page opens.
- Fixed file storage so the saved admin session automatically loads the current folder when the page opens or changes folders.
- Synchronized page-local admin tokens with the restored app-level admin session so upload, delete, copy, and refresh actions do not keep using an empty initial token.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Existing admin sessions now auto-load `/api/images` and `/api/files` on page entry.
- `npm test -- --run`: passed. 26 test files and 87 tests passed.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/hooks/useImages.ts`: added token-driven automatic image list loading.
- `src/hooks/useFiles.ts`: added token/folder-driven automatic file folder loading.
- `src/pages/ImagesPage.tsx`: synced local admin token from restored app admin token.
- `src/pages/FilesPage.tsx`: synced local admin token from restored app admin token.
- `src/App.test.tsx`: added regression coverage for auto-loading image and file lists from a saved admin session.
- Rollback: run `git checkout -- src/hooks/useImages.ts src/hooks/useFiles.ts src/pages/ImagesPage.tsx src/pages/FilesPage.tsx src/App.test.tsx progress.md`.

## 2026-06-21 - Task: Add light active state to top navigation
### What was done
- Added route-aware active state to the top navigation buttons.
- Added `aria-current="page"` for the active navigation item.
- Updated the active navigation visual style to a light selected pill with subtle red border, soft shadow, and underline.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. The current route now marks the matching top nav item active.
- `npm test -- --run`: passed. 26 test files and 88 tests passed.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/components/Layout.tsx`: reads the current route and applies active navigation attributes/classes.
- `src/App.css`: adds the light active top-nav styling.
- `src/App.test.tsx`: adds regression coverage for the active nav state.
- Rollback: run `git checkout -- src/components/Layout.tsx src/App.css src/App.test.tsx progress.md`.

## 2026-06-24 - Task: Design Markdown math support
### What was done
- Defined the supported inline and display LaTeX syntax for blog Markdown.
- Specified a shared KaTeX rendering path so admin preview and article detail remain consistent.
- Defined editor controls, error handling, responsive styling, tests, and out-of-scope behavior.

### Testing
- Design self-review completed: no placeholders, contradictory requirements, database changes, or undefined rendering paths remain.

### Notes
- `docs/superpowers/specs/2026-06-24-markdown-math-design.md`: records the approved Markdown math design.
- `progress.md`: records this design task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/specs/2026-06-24-markdown-math-design.md`.

## 2026-06-24 - Task: Plan Markdown math support
### What was done
- Created a TDD implementation plan covering KaTeX dependency setup, display-math parsing, shared formula rendering, admin editor controls, styling, and regression verification.
- Mapped each requirement from the approved design to exact files, test commands, and expected outcomes.

### Testing
- Plan self-review completed against the approved design: inline and display formulas, escaped dollar signs, code exclusions, shared preview/detail rendering, invalid formula handling, mobile overflow, and editor controls are covered.
- Placeholder and type-consistency review completed with no unresolved implementation steps.

### Notes
- `docs/superpowers/plans/2026-06-24-markdown-math.md`: contains the implementation plan.
- `progress.md`: records this planning task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/plans/2026-06-24-markdown-math.md`.

## 2026-06-24 - Task: Implement Markdown math support
### What was done
- Added KaTeX rendering for inline `$...$` and display `$$...$$` formulas.
- Kept escaped dollar signs and formulas inside code spans or fenced code blocks as normal source text.
- Reused the shared Markdown renderer so admin preview and article detail render formulas identically.
- Added inline and display formula insertion buttons to the admin Markdown toolbar.
- Added responsive formula styling so long display equations scroll horizontally on narrow screens.

### Testing
- `npm test -- --run src/lib/markdown.test.ts`: passed. Display formula parsing and code-block exclusion are covered.
- `npm test -- --run src/lib/math.test.ts src/components/shared.test.tsx src/lib/markdown.test.ts`: passed. KaTeX rendering, invalid formulas, escaped dollars, inline code, and display rendering are covered.
- `npm test -- --run src/App.test.tsx`: passed. Admin formula toolbar controls are covered.
- `npm test -- --run`: passed. 27 test files and 95 tests passed.
- `npm run build`: passed. Vite emitted the KaTeX CSS and font assets; the build reports a non-blocking chunk-size warning after adding KaTeX.

### Notes
- `package.json`, `package-lock.json`: add KaTeX and its TypeScript declarations.
- `src/lib/markdown.ts`, `src/lib/markdown.test.ts`: add display-math block parsing and regression tests.
- `src/lib/math.ts`, `src/lib/math.test.ts`: add the non-throwing KaTeX rendering helper and tests.
- `src/components/shared.tsx`, `src/components/shared.test.tsx`: render inline/display formulas through the shared Markdown path and test escaping/code exclusions.
- `src/main.tsx`: loads KaTeX base styles.
- `src/pages/AdminPage.tsx`, `src/App.test.tsx`: add and test formula toolbar controls.
- `src/App.css`: adds inline and responsive display formula styling.
- `docs/superpowers/plans/2026-06-24-markdown-math.md`: marks the implementation plan complete.
- Rollback: run `git revert <implementation-commit>` after this task is committed, or restore the listed files from commit `6824d9b`.

## 2026-06-25 - Task: Auto-load draft posts after restoring admin session
### What was done
- Fixed the admin article list so a restored backend session immediately reloads posts with draft visibility instead of staying on the public-only article snapshot.
- Added a regression test that reproduces the exact refresh-only draft visibility bug from the admin page.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Restored admin sessions now auto-load draft posts, and existing admin shell checks still pass.
- `npm test -- --run src/lib/blogApi.test.ts src/App.test.tsx`: passed. Draft-request API coverage and admin-page regression coverage both pass.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/context/AppContext.tsx`: reloads posts when admin session state changes so restored sessions fetch drafts automatically.
- `src/App.test.tsx`: adds the regression test for draft visibility after session restore.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/context/AppContext.tsx src/App.test.tsx progress.md`.

## 2026-06-25 - Task: Design website architecture optimization
### What was done
- Defined a phased architecture optimization design focused on unified frontend data loading, smaller admin boundaries, route-level lazy loading, and backend service/storage layering.
- Locked in the business-safety rules for this refactor: website flows must stay usable, file/image records must remain linked to the database, and schema migration is optional rather than automatic.

### Testing
- Design self-review completed: the scope, rollout order, data-safety rules, and verification requirements are internally consistent and do not require a forced database replacement.
- Requirement coverage review completed: session recovery, admin drafts, image hosting, file storage, accounting loading, deployment verification, and migration guardrails are all covered in the spec.

### Notes
- `docs/superpowers/specs/2026-06-25-architecture-optimization-design.md`: records the approved architecture direction and safety constraints for the refactor.
- `progress.md`: records this design task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/specs/2026-06-25-architecture-optimization-design.md`.

## 2026-06-25 - Task: Plan website architecture optimization
### What was done
- Created a phased implementation plan for shared admin session extraction, `AppContext` shrinkage, admin-page decomposition, route-level lazy loading, backend service wrappers, and final deploy verification.
- Mapped the refactor into TDD-oriented tasks with explicit files, commands, and rollback-aware verification steps.

### Testing
- Plan self-review completed: the plan covers session restore, draft loading, image/file database linkage, admin split, lazy routes, backend storage seams, and VPS deployment checks.
- Placeholder and sequencing review completed: each task stays within the approved design and keeps business continuity verification in scope.

### Notes
- `docs/superpowers/plans/2026-06-25-architecture-optimization.md`: contains the implementation plan for the architecture refactor.
- `progress.md`: records this planning task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/plans/2026-06-25-architecture-optimization.md`.

## 2026-06-25 - Task: Implement website architecture optimization
### What was done
- Moved admin-session persistence and blog post loading into dedicated shared layers, so restored sessions now drive data loading consistently across the site.
- Split the admin page into article management, editor panel, and user management modules while keeping existing publishing, autosave, image upload, and user operations available.
- Unified admin unlock behavior for admin, files, and images pages so cross-page login reuse no longer depends on refresh order.
- Added route-level lazy page bundles and preserved lightweight first-load behavior for the home route.
- Added backend post/file/image service seams without changing API response shapes, so file storage and image-host records stay linked to SQLite while future storage swaps have a clean entry point.

### Testing
- `npm test -- --run src/App.test.tsx server/postStore.test.mjs server/fileStore.test.mjs server/imagesRoutes.test.mjs`: passed. Frontend session/data-loading regressions and backend storage/image route regressions all passed.
- `npm run build`: passed. Production build completed successfully and emitted split route bundles for `AdminPage`, `FilesPage`, `ImagesPage`, `HomePage`, and `AccountingPage`.

### Notes
- `src/context/AppContext.tsx`, `src/lib/adminSession.ts`: keep only global app concerns in app context and centralize admin-session persistence.
- `src/context/BlogDataContext.tsx`, `src/App.tsx`, `src/pages/lazy.ts`, `src/pages/HomePage.tsx`: move blog data loading into its own provider and lazy-load route pages.
- `src/hooks/useAdminAccess.ts`, `src/pages/FilesPage.tsx`, `src/pages/ImagesPage.tsx`: unify admin login flow and keep file/image pages loading correctly with restored or freshly created admin sessions.
- `src/components/admin/ArticleManager.tsx`, `src/components/admin/EditorPanel.tsx`, `src/components/admin/UserManager.tsx`, `src/pages/AdminPage.tsx`: split the admin experience into focused modules while preserving publishing, preview, formula toolbar, autosave, and user-management behavior.
- `server/services/postService.mjs`, `server/services/fileService.mjs`, `server/services/imageService.mjs`, `server/index.mjs`, `server/routes/posts.mjs`, `server/routes/files.mjs`, `server/routes/images.mjs`, `server/imagesRoutes.test.mjs`: add backend service seams and keep current file/image/post API behavior covered by tests.
- `src/App.test.tsx`: refresh regression checks so they validate the current stable UI labels and session-loading behavior.
- Rollback: run `git revert <implementation-commit>` after this task is committed, or restore the listed files from commit `ed0b776` and then replay only the desired subsets.

## 2026-06-25 - Task: Fix loading fallback and new admin-page mojibake
### What was done
- Removed the visible bare `Loading...` fallback from route loading and replaced it with a lightweight three-dot loading state.
- Stopped the homepage from going through lazy loading so the main route no longer flashes the fallback during normal first paint.
- Cleaned the newly introduced admin editor mojibake so the editor toolbar, form labels, formula buttons, and preview copy render as normal Chinese text.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Route shell rendering and admin editor formula controls still work.
- `npm run build`: passed. Production build completed successfully after the loading fallback and editor text cleanup.

### Notes
- `src/App.tsx`: switches the home route back to direct render and replaces the Suspense fallback with a minimal loader shell.
- `src/pages/lazy.ts`: removes the now-unused lazy home export.
- `src/App.css`: adds the three-dot loading state styling and animation.
- `src/components/admin/EditorPanel.tsx`: rewrites the visible editor text and formula button labels to eliminate mojibake.
- `progress.md`: records this bugfix task.
- Rollback: run `git revert <bugfix-commit>` after this task is committed, or restore `src/App.tsx`, `src/pages/lazy.ts`, `src/App.css`, `src/components/admin/EditorPanel.tsx`, and `progress.md` from commit `435ddf3`.

## 2026-06-26 - Task: Fix remaining admin-page mojibake
### What was done
- Replaced the remaining mojibake in the admin content manager, editor panel, user manager, page-loading label, and blog data loading error message with readable Chinese text.
- Added a regression check for readable admin content/user manager labels so the admin page does not silently regress to mojibake again.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. All 9 App shell/admin regression tests passed, including the new readable-label check.
- `npm run build`: passed. TypeScript and Vite production build completed successfully.
- `rg -n "鍐呭|鏂囩|鍚庡|鍥惧|鏂板|缂栬|鐢ㄦ|鑽夌|棰勮|鍧楃|琛屽唴|椤甸潰|閸|閺|鐏|锟|鎴|寮|璇|鏍|鍒" src --glob '!src/assets/**'`: no matches in source text files.

### Notes
- `src/components/admin/ArticleManager.tsx`: restored readable Chinese labels for content management, status filters, post badges, and actions.
- `src/components/admin/EditorPanel.tsx`: restored readable Chinese editor labels, placeholders, toolbar titles, upload copy, and preview fallback text.
- `src/components/admin/UserManager.tsx`: restored readable Chinese user-management labels and actions.
- `src/context/BlogDataContext.tsx`: restored the readable article-loading failure notification.
- `src/App.test.tsx`: updates admin editor label assertions and adds a regression test for readable admin manager labels.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/components/admin/ArticleManager.tsx src/components/admin/EditorPanel.tsx src/components/admin/UserManager.tsx src/context/BlogDataContext.tsx src/App.test.tsx progress.md`.

## 2026-06-26 - Task: Fix parenthesized inline math rendering
### What was done
- Added support for Markdown inline LaTeX written as `\(...\)`, so formulas like `\(a\)` and `\(3\mid12\)` render through KaTeX instead of appearing as raw source text.
- Kept the existing `$...$`, code, bold, and link inline rendering behavior unchanged.
- Corrected the reader permission label to readable Chinese text.

### Testing
- `npm test -- --run src/components/shared.test.tsx -t "renders parenthesized LaTeX inline formulas"`: passed. The regression case for `\(...\)` inline formulas now renders two KaTeX inline nodes.
- `npm test -- --run src/components/shared.test.tsx src/lib/markdown.test.ts src/lib/math.test.ts src/App.test.tsx`: passed. All 23 related Markdown, math, shared component, and app tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/components/shared.tsx`: extends inline Markdown parsing to recognize `\(...\)` formulas and render them as inline KaTeX; updates the reader permission label.
- `src/components/shared.test.tsx`: adds regression coverage for parenthesized inline formulas and readable permission labels.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/components/shared.tsx src/components/shared.test.tsx progress.md`.
