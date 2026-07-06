# User Auth

The public reading page has a lightweight user account flow for article comments.

## Behavior

- The home auth card submits login requests to `/api/users/login`.
- The register tab submits new reader accounts to `/api/users/register`.
- Successful login or registration stores `kitepop-user-session` in `localStorage`.
- The stored session is restored on page load and verified through `/api/users/me`.
- The logout button clears the stored user session.
- The form validates usernames before sending requests. Usernames must be 3-24 characters and may contain letters, numbers, and underscores.
- Registration or login failures are shown inside the auth card so users can see why the account did not change.

## Verification

- `npm test -- --run src/App.test.tsx -t "public auth error|public users"`
- `npm run build`

## Rollback

- `git checkout -- src/App.css src/pages/HomePage.tsx src/App.test.tsx progress.md docs/user-auth.md`
- `git rm docs/user-auth.md`
