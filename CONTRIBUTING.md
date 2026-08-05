# Contributing

## Prerequisites

- Node 20.19+ (Vite 7 requires it)
- npm 10+
- A MongoDB database — Atlas free tier is fine

## Setup

```bash
npm install                      # workspace root only
cp .env.example backend/.env    # then fill it in — see README
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
- [ ] Relative imports in `backend` and `packages/shared` end in `.js`
- [ ] Any route touching a user-owned resource has an ownership check
- [ ] Docs updated if behaviour, config, or commands changed

Frontend changes additionally:

- [ ] `npm run lint:colour --workspace @jobportal/web` reports no *new* colour.
      It currently exits 1 with 18 known violations in the pages 2B-2 and 2B-3
      still own; adding to that list is a regression
- [ ] Spacing comes from `density` on `PageShell`, not hand-tuned padding
- [ ] No `framer-motion` import outside `lib/motion.tsx`
- [ ] No portal read from state, a control, or a query — it comes from the route
- [ ] If a token pairing changed, `node frontend/tests/visual/contrast.mjs`
      still reports 18/18 at 4.5:1

## Running a single test

```bash
npm test --workspace @jobportal/api -- errors      # file name substring
npm test --workspace @jobportal/api -- -t "429"    # test name substring
npm test --workspace @jobportal/web -- navbar      # frontend, same syntax
```

The frontend suite is jsdom. The Playwright scripts under
`frontend/tests/visual/` are excluded from it and run separately:

```bash
npm run dev:web                                    # must be on 5173
npm run test:visual --workspace @jobportal/web     # screenshots + assertions
node frontend/tests/visual/contrast.mjs            # WCAG audit, no server needed
```

## Notes that will save you time

- **`.js` extensions on relative imports.** `backend` and `packages/shared` use
  `moduleResolution: NodeNext`, so `import { env } from "./config/env.js"` is
  correct even though the file is `env.ts`. Omitting it typechecks but fails at
  runtime. `frontend` uses `Bundler` resolution and does not need them.
- **Build `shared` before typechecking the API.** The API compiles against
  `packages/shared/dist/*.d.ts`. A stale build produces confusing type errors.
- **Env vars in tests** are set in `backend/tests/setup.ts`, which runs before
  any import. Adding a required variable to the env schema means adding it there
  too, or every test fails at import time.
- **`LegacyJob`, `LegacyUser`, and friends** in `packages/shared/src/legacy-dto.ts`
  are **vestigial**. Phase 1C rewrote the endpoints they described with
  projected DTOs, and nothing imports the `Legacy*` types any more. Do not build
  on them; the file is pending deletion.
- **shadcn components are TypeScript.** `components.json` has `"tsx": true`. If
  you add a component with `npx shadcn add`, it will be generated as `.tsx`
  correctly — the original 12 were JS because that flag was false. Whatever it
  generates will carry raw palette colours; convert them to tokens before
  committing, or `lint:colour` will catch it.
- **Import casing matters.** `import ... from "./ui/Table"` when the file is
  `table.tsx` builds fine on Windows and fails on Linux CI. Match the filename
  exactly.
- **Never import the app store in a frontend test.** `@/redux/store` is wrapped
  in redux-persist and rehydrates from `localStorage`, so a test that dispatches
  a signed-in user leaks it into every later test and failures start depending
  on file order. Use `makeStore()` from `tests/helpers/renderRoute.tsx`.
- **Start Vite on 5173 with `--strictPort`.** `CLIENT_URLS` in `backend/.env` is
  `http://localhost:5173` only, so if Vite falls back to 5174 every API call
  fails CORS with no obvious cause.
- **`matchMedia` is stubbed in `frontend/tests/setup.ts`.** jsdom does not
  implement it and both next-themes and framer-motion read it. A test needing
  reduced motion overrides the stub rather than removing it.
