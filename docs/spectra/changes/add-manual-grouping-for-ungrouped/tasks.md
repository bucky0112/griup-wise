## 1. Manual grouping for ungrouped participants

- [x] 1.1 Admin can place an ungrouped participant into a group: generalise `handleBatchMove` in `GroupManagement.tsx` into a move handler that takes participant ids, wire "手動分組" to a dialog listing the active run's groups, and send the chosen group with that participant. Verify manually on the local app: remove a participant through the members `PATCH` API, click "手動分組", choose a group, and see the participant in that group and gone from the ungrouped list.
- [x] 1.2 [after: 1.1] Stale group views refresh after a rejected move: on a 409 response the handler shows the message, closes the dialog and calls `refreshData`. Verify manually: open the page in two tabs, regenerate groups in one, move from the other, and see the toast, a closed dialog and the new groups.

## 2. Wrap-up

- [x] 2.1 [after: 1.2] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the base.
- [ ] 2.2 [after: 2.1] Staging acceptance after `railway up`: repeat 1.1 and 1.2 on the Railway staging site.
