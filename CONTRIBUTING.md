# Contributing

## Prerequisites

- Node 20.19+ (Vite 7 requires it)
- npm 10+
- A MongoDB database — Atlas free tier is fine

## Setup

```bash
npm install                      # workspace root only
cp .env.example apps/api/.env    # then fill it in — see README
npm run dev:api                  # terminal 1
npm run dev:web                  # terminal 2
```

## Branches

| Prefix | Use |
|---|---|
| `phase-N/topic` | Work from a plan in `docs/superpowers/plans/` |
| `feat/topic` | New functionality |
| `fix/topic` | Bug fix |
| `docs/topic` | Documentation only |

Never commit directly to `main`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), with a scope where
it clarifies:

```
feat(api): add refresh token rotation
fix(web): stop resetting filters on navigation
refactor(api): extract job service from controller
docs: document the deployment build order
test(api): cover the authorization matrix
chore: bump mongoose to 8.20
```

Write the body to explain *why*, not what — the diff already shows what. If a
change fixes something subtle, say what would break without it.

## Before opening a pull request

```bash
npm run ci
```

That runs, in order: build `shared` → typecheck → lint → test → build. It must
exit 0.

Checklist:

- [ ] `npm run ci` passes
- [ ] Tests added for new behaviour, and for the bug in a bug fix
- [ ] No new direct `process.env` reads — use `env()` from `config/env.ts`
- [ ] No Mongoose document serialized straight into a response — build a DTO
- [ ] Failures throw `AppError`, not `res.status(...).json(...)`
- [ ] Relative imports in `apps/api` and `packages/shared` end in `.js`
- [ ] Any route touching a user-owned resource has an ownership check
- [ ] Docs updated if behaviour, config, or commands changed

## Running a single test

```bash
npm test --workspace @jobportal/api -- errors      # file name substring
npm test --workspace @jobportal/api -- -t "429"    # test name substring
```

## Notes that will save you time

- **`.js` extensions on relative imports.** `apps/api` and `packages/shared` use
  `moduleResolution: NodeNext`, so `import { env } from "./config/env.js"` is
  correct even though the file is `env.ts`. Omitting it typechecks but fails at
  runtime. `apps/web` uses `Bundler` resolution and does not need them.
- **Build `shared` before typechecking the API.** The API compiles against
  `packages/shared/dist/*.d.ts`. A stale build produces confusing type errors.
- **Env vars in tests** are set in `apps/api/tests/setup.ts`, which runs before
  any import. Adding a required variable to the env schema means adding it there
  too, or every test fails at import time.
- **Web lint is temporarily non-fatal.** `apps/web` has 17 pre-existing
  dead-code errors in files that the Phase 2 UI rebuild replaces. Do not add new
  ones; the script goes back to blocking once those files are rewritten.
