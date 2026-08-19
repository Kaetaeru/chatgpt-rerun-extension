import { installPatientOracleRuntime, startOracle, stopOracle } from "./oracle-background.js";
import { assertOracleStartIsSafe } from "./oracle-safety.js";

export { installPatientOracleRuntime, stopOracle };

export async function safeStartOracle(tabId, repositoryConfig, oracleConfig = {}) {
  await assertOracleStartIsSafe(tabId, repositoryConfig, oracleConfig);
  return startOracle(tabId, repositoryConfig, oracleConfig);
}
