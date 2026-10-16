## Why

Railway stops reading Config as Code files (`railway.json` / `railway.toml`) on 2026-12-01 (GitHub issue #25). Our `railway.toml` is what runs `pnpm db:migrate` before every deploy and sets the start command and restart policy for the `web` service in staging and production. After the cutoff, deploys would no longer run migrations, so the first deploy that ships a schema change would start the app against an unmigrated database.

## What Changes

- Generate `.railway/railway.ts` with `railway config migrate --variables=unmanaged --apply`, declaring the `web` service (Railpack build, `pnpm start`, pre-deploy `pnpm db:migrate`) and leaving every service variable to the Railway dashboard.
- Add the official `railway` npm package (`railwayapp/railway-ts-sdk`) as a pinned devDependency so the CLI can evaluate `railway/iac` locally and the file type-checks.
- Per environment, staging first: run `railway config migrate cutover`, review `railway config plan`, run `railway config apply`, then deploy and confirm that the pre-deploy migration still runs and the restart policy is unchanged.
- Remove `railway.toml` once both environments are cut over.
- Document the deploy and config workflow in the README.

## Non-Goals (optional)

See design.md.

## Impact

- Affected specs: none
- Affected code:
  - New: .railway/railway.ts
  - Modified: package.json, pnpm-lock.yaml, README.md
  - Removed: railway.toml
- Compatibility: no capability-level observable behavior changes. Railway service settings move from the repo file to IaC-managed service configuration; variables, domains and databases are untouched.
