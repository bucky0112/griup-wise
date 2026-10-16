## Context

`railway.toml` at the repo root holds the whole Railway service configuration for `web`:

- `[build] builder = "RAILPACK"`
- `[deploy] preDeployCommand = "pnpm db:migrate"`, `startCommand = "pnpm start"`, `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 10`

The project (`group-wise`) has two environments, `production` and `staging`, each with a `web` service and a Postgres service. Deploys are run from a clean worktree with `railway up --environment <env> --service web --ci`. Staging's service instance had `railwayConfigFile` set to `railway.toml` through the GraphQL `serviceInstanceUpdate` mutation on 2026-10-15; production reads the file by default. The linked CLI environment is `staging`.

Facts measured on 2026-10-16:

- `railway config migrate status` lists `web` (staging) as still on Config as Code via `railway.toml`.
- A dry run of `railway config migrate --variables=unmanaged --show` produces a file declaring `service("web", { build: { buildEnvironment: "V3", builder: "RAILPACK" }, start: "pnpm start", preDeploy: "pnpm db:migrate", replicas: { "us-west2": 1 } })` inside `project("group-wise", { variables: { managed: false }, resources: [web] })`, with `export const partial = "web"`. It contains no restart policy.
- The staging service instance currently reports `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10` (Railway GraphQL `serviceInstance` query). The production instance could not be read with the CLI token ("Not Authorized").
- Railway's docs state that deploys do not read `.railway/`; configuration reaches Railway only through `railway config apply`, and plans are blocked while a service still reads a config file.
- The `railway` npm package's `./iac` export is published from `github.com/railwayapp/railway-ts-sdk`; its latest version, 3.16.0, was modified on 2026-10-14.

## Goals / Non-Goals

**Goals:**

- Both environments keep running `pnpm db:migrate` before every deploy after 2026-12-01.
- Restart behaviour, build and start commands stay as they are now.
- The configuration is versioned in the repo and changed only through `railway config plan` / `apply`.

**Non-Goals:**

- Managing variables, domains, the Postgres services or replicas policy through IaC; `variables: { managed: false }` leaves variables on the dashboard, and `SESSION_SECRET` must never be written to the repo.
- Automating `railway config apply` in GitHub Actions; applies stay manual, like deploys.
- Changing how deploys are triggered (`railway up` from a clean worktree stays).
- Migrating to Python or Go authoring files.

## Decisions

### Generate the file with the CLI migrator and keep variables unmanaged

Use `railway config migrate --variables=unmanaged --apply` rather than hand-writing the file or using `railway config pull`. The migrator reads `railway.toml`, so the output is a translation of what we already run; `unmanaged` keeps every variable, including `DATABASE_URL` and `SESSION_SECRET`, out of the file and under dashboard control.

Alternative considered: `--variables=managed`. Rejected because it would make the file the owner of secrets that must not be committed, and a later apply could delete dashboard-only variables.

### Restart policy is confirmed by the plan, not assumed

The generated file has no restart policy. Railway's documented default is not quoted in its IaC reference, so the plan output decides: if `railway config plan` shows any change to restart policy, add the explicit setting the reference supports (or keep the dashboard value) before applying. After apply, the `serviceInstance` query must still report `ON_FAILURE` / 10 in staging.

### Staging first, production only after staging is verified and the user confirms

Order per environment: cutover → plan (review) → apply → deploy → verify. Production follows only after staging passes and with explicit user confirmation, because cutover and apply change live service configuration. `railway config migrate undo` restores the config-file paths saved by cutover if a step fails.

### Remove railway.toml last

`railway.toml` stays in the repo until both environments are cut over and applied, so a deploy to a not-yet-migrated environment still runs migrations. The removal is part of the same PR, merged after production is applied.

### Pin the railway package

Add `railway` as a devDependency at an exact version published at least two weeks before installation that exports `railway/iac`, falling back to the newest version that satisfies this. It is needed only for the CLI to evaluate and type-check `.railway/railway.ts`, not at runtime.

## Implementation Contract

**Behavior**

- After this change, each `railway up` deploy to staging or production runs `pnpm db:migrate` as its pre-deploy step and starts with `pnpm start`; build logs show Railpack.
- `railway config migrate status` reports no service still on Config as Code in either environment.
- The staging `web` service instance reports `restartPolicyType: ON_FAILURE` and `restartPolicyMaxRetries: 10`, and `railwayConfigFile` is empty.

**Interface / data shape**

- `.railway/railway.ts` exports `partial = "web"` and a default `defineRailway(...)` declaring only the `web` service.
- `package.json` devDependencies gain `"railway": "<exact version>"`.

**Failure modes**

- A plan that shows deletions, variable changes or changes to services other than `web` stops the rollout for that environment; nothing is applied.
- A failed apply or a deploy whose logs lack the migration step: run `railway config migrate undo` for that environment, redeploy, and report.

**Acceptance criteria**

- `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm build` exit 0 with `.railway/railway.ts` present.
- Staging: plan reviewed and recorded in the PR; after apply and deploy, deploy logs contain `migrations applied successfully` and `/login` returns 200; the `serviceInstance` query shows the restart policy and empty `railwayConfigFile`.
- Production: same checks after user confirmation, recorded in the PR.

**Scope boundaries**

- In scope: `.railway/railway.ts`, the `railway` devDependency, cutover/apply in both environments, deleting `railway.toml`, README deploy notes.
- Out of scope: application code, variables, databases, CI.

## Risks / Trade-offs

- [Apply may redeploy the service] If `railway config apply` triggers a deploy, staging and production restart during the change. Mitigation: apply production at a time with no quiz running, as with the session change.
- [Restart policy silently reset] Covered by the plan review and the post-apply `serviceInstance` check in staging; production cannot be read with the current token, so production relies on the plan output.
- [Young IaC tooling] The CLI and SDK are new and change frequently. Mitigation: pinned package version, manual applies, and `undo` as the rollback path.
