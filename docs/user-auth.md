# User Auth

The public reading page has a lightweight user account flow for article comments.

## Behavior

- The home auth card submits login requests to `/api/users/login`.
- The register tab submits new reader accounts to `/api/users/register`.
- Successful login or registration stores `kitepop-user-session` in `localStorage`.
- The stored session is restored on page load and verified through `/api/users/me`.
- The logout button clears the stored user session.

## Verification

- `npm test -- --run src/App.test.tsx -t "public users"`
- `npm run build`

## Rollback

- `git checkout -- src/pages/HomePage.tsx src/App.test.tsx progress.md`
- `git rm docs/user-auth.md`
