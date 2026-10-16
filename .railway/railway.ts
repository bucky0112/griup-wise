import { defineRailway, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "web";
export default defineRailway(() => {
  const web = service("web", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "pnpm start",
    preDeploy: "pnpm db:migrate",
    replicas: { "us-west2": 1 },
  });

  return project("group-wise", {
    variables: { managed: false },
    resources: [web],
  });
});
