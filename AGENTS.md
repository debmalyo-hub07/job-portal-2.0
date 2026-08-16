# Repository Guide

Keep this file short. It is the default context for coding agents; detailed
information belongs in the canonical documents linked below and should be read
only when relevant to the task.

## Commands

Run commands from the workspace root unless noted.

| Task | Command |
|---|---|
| Install | `npm install` |
| API dev server | `npm run dev:api` |
| Web dev server | `npm run dev:web` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Colour lint | `npm run lint:colour` |
| Tests | `npm test` |
| Full CI | `npm run ci` |
| Production audit | `npm run audit:prod` |

Build `@jobportal/shared` before isolated backend typechecks when shared types
have changed. The root CI script already handles the correct order.

## Structure

- `backend`: Express 5, Mongoose 8, Zod API.
- `frontend`: React 19, Vite, Redux Toolkit client.
- `packages/shared`: schemas and types shared by API and client.
- `docs/adr`: durable architectural decisions.

Backend flow is `route -> controller -> service -> model`. Controllers handle
HTTP; services own business rules and database access. Return explicit DTOs,
never raw Mongoose documents.

## Required Rules

- Preserve unrelated work in a dirty tree.
- Use existing patterns and keep changes scoped.
- Backend relative imports include `.js`; frontend imports do not.
- Read configuration through `env()` except the documented bootstrap reads in
  the logging modules.
- Define cross-boundary request and response schemas in `packages/shared`.
- Throw `AppError` for API failures and let Express 5 forward async errors.
- Validate all input and enforce ownership and authorization server-side.
- Never log secrets, OTPs, tokens, cookies, password hashes, or provisioning
  keys. Never commit real environment values.
- Update tests with behavior changes. Run focused tests first, then checks that
  match the change's blast radius.

## Authentication

There are three independent portals: `seeker`, `recruiter`, and `admin`.
Portal identity comes from server-owned route literals, never request input.

- Sessions use portal-scoped access, refresh, and CSRF cookies.
- Client users, bootstrap flags, CSRF tokens, and refresh promises are also
  portal-scoped. One portal must not overwrite or log out another.
- `/hire` and `/admin` are protected session doors. Public jobs and job details
  remain browseable; anonymous Apply redirects to seeker login with a safe
  return path.
- Recruiters may sign in while pending but protected recruiter mutations require
  admin approval.
- Admin access is authorized by the backend. URL obscurity is not security.
- The first admin is created with runtime `seed:admin`; later admins require an
  authenticated admin and `ADMIN_PROVISIONING_SECRET`.
- Session endpoints return the CSRF token in the response body. The browser
  cannot reliably recover cross-site cookies through `document.cookie`.

## Frontend

- Preserve the established Ink & Signal design tokens and responsive patterns.
- Use existing UI primitives and Lucide icons.
- Do not introduce raw colours; run `npm run lint:colour` after styling changes.
- Keep route guards portal-specific. Public pages must not depend on a cached
  role, and protected pages must wait for the required portal bootstrap.
- The production build requires `VITE_TURNSTILE_SITE_KEY`. Tests normally run
  without it; supplying it to jsdom enables CAPTCHA and disables auth submits
  unless Turnstile is mocked.

## Verification

Before commit, normally run:

```powershell
npm run typecheck
npm run lint
npm run lint:colour
npm test
npm run audit:prod
git diff --check
```

For a production web build, provide only Cloudflare's public site key:

```powershell
$env:VITE_TURNSTILE_SITE_KEY='<public-site-key>'
npm run build --workspace @jobportal/web
```

## Documentation Policy

Do not append task diaries or duplicate implementation details across files.
Update only the canonical document affected by a durable change:

- `README.md`: setup, public behavior, commands, and high-level usage.
- `ARCHITECTURE.md`: current system structure and data flow.
- `SECURITY.md`: security boundaries, known risks, and incident procedures.
- `docs/deployment-runbook.md`: Render, Vercel, Atlas, Brevo, and Cloudflare.
- `docs/adr`: decisions whose reasoning must survive future refactors.
- `CONTRIBUTING.md`: contributor workflow.

Prefer correcting an existing section over adding a new chronological section.
Do not create implementation-plan archives in the repository. Git history is
the archive.
