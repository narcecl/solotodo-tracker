import { checkPrices } from "../lib/check-prices";
import { closeDb } from "../lib/db";
import { createCheckDeps } from "../lib/deps";

async function main() {
  process.loadEnvFile(".env.local");
  try {
    const summary = await checkPrices(createCheckDeps(), { source: "cron" });
    console.log(`[${new Date().toISOString()}] check-prices ${JSON.stringify(summary)}`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    // postgres.js mantiene conexiones abiertas; sin cerrarlas el proceso no termina
    await closeDb();
  }
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] check-prices falló:`, error);
  process.exit(1);
});
