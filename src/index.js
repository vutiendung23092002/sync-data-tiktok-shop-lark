import { pathToFileURL } from "node:url";

import { loadEnv } from "./config/env.js";
import { validateLarkTableMapping } from "./config/larkTableMapping.js";

export function validateStartup(source = process.env) {
  const env = loadEnv(source);
  validateLarkTableMapping(env.syncEnv);
  return env;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = validateStartup();
  console.info(JSON.stringify({
    event: "startup_validation_complete",
    syncEnv: env.syncEnv,
    from: env.from,
    to: env.to,
    dryRun: env.dryRun,
    shopIds: env.shops.map(({ shopId }) => shopId),
  }));
}
