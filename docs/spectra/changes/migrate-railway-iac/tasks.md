## 1. Authoring file in the repo

- [x] 1.1 Per "Generate the file with the CLI migrator and keep variables unmanaged" and "Pin the railway package": run `railway config migrate --variables=unmanaged --apply` (filesystem only; services keep reading `railway.toml`), and add `railway` as an exact-version devDependency that exports `railway/iac` and was published at least two weeks earlier. `.railway/railway.ts` declares only `web` with Railpack, `pnpm start` and pre-deploy `pnpm db:migrate`, and contains no variable values. Verify: `grep` finds no `SESSION_SECRET`, `DATABASE_URL` or `postgres` in `.railway/`; `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm build` exit 0.

## 2. Staging rollout

- [x] 2.1 [after: 1.1] Per "Restart policy is confirmed by the plan, not assumed" and "Staging first": with the CLI linked to `staging`, run `railway config migrate cutover --service web`, then `railway config plan --environment staging --verbose`. The plan changes only `web` and shows no deletions, variable changes or restart-policy change; if it does, adjust `.railway/railway.ts` or run `railway config migrate undo` and stop. Record the plan summary in the PR.
- [ ] 2.2 [after: 2.1] Run `railway config apply --environment staging`, then deploy this branch to staging from a clean worktree. Verify: deploy logs contain `migrations applied successfully`; `/login` returns 200; the staging `serviceInstance` query reports `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10` and an empty `railwayConfigFile`; `railway config migrate status` lists no service on Config as Code.

## 3. Production rollout

- [ ] 3.1 [after: 2.2] With the user's confirmation, repeat 2.1 and the apply step of 2.2 for `production` (cutover with the CLI linked to `production`, plan reviewed, apply), then relink the CLI to `staging`. Verify the plan showed only the intended `web` settings and `railway config migrate status` for production lists no service on Config as Code. Record in the PR.

## 4. Remove the old config and document

- [ ] 4.1 [after: 3.1] Per "Remove railway.toml last": delete `railway.toml` and add a README section on deploying (`railway up` from a clean worktree) and changing Railway configuration (`railway config plan` / `apply`, variables stay on the dashboard). Verify: `pnpm build` exits 0 and the PR diff removes `railway.toml`.
- [ ] 4.2 [after: 4.1] After the PR is merged, deploy `main` to production (with the user's confirmation). Verify: production deploy logs contain `migrations applied successfully`, `/login` returns 200, and the deploy output no longer shows the Config as Code deprecation warning. Record in the PR, which closes GitHub issue #25.
