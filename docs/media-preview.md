# Media Preview

This repository now supports in-site preview for uploaded `video/*` and `audio/*` files.

## Behavior

- Files are still stored behind signed links.
- The file list now includes a `预览` action for audio and video files.
- The preview page loads media lazily and only requests the stream after the user clicks play.
- Raw file delivery now supports HTTP `Range` requests, so browser players can seek normally.

## Routes

- File preview page: `/files/preview`
- Signed preview link API: `POST /api/files/:id/preview-link`

## Verification

- `npm test -- --run server/fileDownloadHeaders.test.mjs server/fileRangeResponses.test.mjs src/lib/fileApi.test.ts src/App.test.tsx`
- `npm run build`

## Rollback

- `git checkout -- server/fileDownloadHeaders.mjs server/fileDownloadHeaders.test.mjs server/routes/files.mjs server/services/fileService.mjs src/App.css src/App.tsx src/lib/fileApi.ts src/lib/fileApi.test.ts src/pages/FilesPage.tsx src/pages/lazy.ts progress.md`
- Remove `src/pages/MediaPreviewPage.tsx`, `server/fileRangeResponses.test.mjs`, and `docs/media-preview.md`
