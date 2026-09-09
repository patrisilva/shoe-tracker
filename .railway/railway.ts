/**
 * Railway project as code, replacing the deprecated railway.json.
 *
 * Imported from the live project with `railway config pull` rather than
 * translated from railway.json, because that file was never actually being
 * applied — it asked for the NIXPACKS builder, an explicit start command and a
 * healthcheck, and the running service had RAILPACK, no start command and no
 * healthcheck. Translating it would have silently changed the build.
 *
 * So this describes what is really deployed, with two deliberate corrections
 * noted below. Verify with `railway config plan` before `railway config apply`.
 *
 * Environment variables are `preserve()`: they hold secrets and stay managed in
 * the Railway dashboard, not in the repo.
 */
import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

const REPO = "patrisilva/shoe-tracker";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "iad" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };

  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "iad",
    sizeMB: 500,
  });

  // Daily job. Its own start command matters: it shares a repo with the web
  // service, and a project-wide start command would turn this into a second
  // web server that never exits.
  const shoeTrackerCron = service("shoe-tracker-cron", {
    source: github(REPO),
    start: "npm run cron:prices",
    replicas: { iad: 1 },
    deploy: { cronSchedule: "0 9 * * *", restartPolicyType: "NEVER" },
    env: {
      DATABASE_URL: preserve(),
      SERPAPI_KEY: preserve(),
    },
  });

  const shoeTracker = service("shoe-tracker", {
    // No commitSha: the pull pinned this to the very first commit, which would
    // have frozen every future deploy to it. Tracking the branch is the point.
    source: github(REPO),
    replicas: { iad: 1 },
    deploy: {
      // Restored from the old railway.json, which never took effect. Without
      // it a boot failure is reported as a healthy deploy — which is exactly
      // how the P1012 crash loop first went unnoticed.
      healthcheckPath: "/api/health",
      // restartPolicyType is left out on purpose: ON_FAILURE is the platform
      // default, so Railway stores it as null and declaring it leaves `config
      // plan` permanently reporting one pending change. Drift detection is
      // only useful while a clean plan means clean.
      restartPolicyMaxRetries: 5,
    },
    env: {
      AUTH_GOOGLE_ID: preserve(),
      AUTH_GOOGLE_SECRET: preserve(),
      AUTH_SECRET: preserve(),
      AUTH_TRUST_HOST: preserve(),
      AUTH_URL: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      SERPAPI_KEY: preserve(),
    },
  });

  return project("robust-happiness", {
    resources: [Postgres, postgresVolume, shoeTrackerCron, shoeTracker],
  });
});
