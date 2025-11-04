import fs from "fs";
import { program } from "commander";

program
  .name("AI Driven Cost Analysis")
  .description("Analizza costi, token, medie globali, failed steps, duration e trend di efficienza")
  .version("1.2.0")
  .option(
    "--stepspacks <name>",
    "Comma-separated values (e.g. stepspack1,stepspack2)",
    "stepspack1, stepspack2"
  );

program.parse();
const option = program.opts();
const stepspacks = option.stepspacks.split(",").map((i) => i.trim());

const COST_INPUT_TOKEN = 0.000005;
const COST_OUTPUT_TOKEN = 0.00002;
const COST_CACHED_TOKEN = 0.0000025;
const USD_TO_EUR = 0.92;

(async () => {
  const path = "./stepspacks/";

  let totalTO = 0;
  let totalTI = 0;
  let totalTC = 0;
  let totCosts = 0;
  let totRuns = 0;
  let totSteps = 0;
  let totFailedSteps = 0;
  let totDurationMs = 0;

  let weightedDeclineSum = 0;
  let totalWeightedSteps = 0;

  console.log("Totale stepspacks:", stepspacks.length);

  for (const sp of stepspacks) {
    const spPath = `${path}${sp}/generated/run-logs.json`;
    if (!fs.existsSync(spPath)) {
      console.warn(`⚠️ File non trovato: ${spPath}`);
      continue;
    }

    const json = JSON.parse(fs.readFileSync(spPath));

    let tokenOutSP = 0;
    let tokenInSP = 0;
    let tokenCacheSP = 0;
    let costsSP = 0;
    let totalResultsSP = 0;
    let failedStepsSP = 0;
    let durationSP = 0;

    const costs = []; // costi per run

    for (const run of json.runs) {
      tokenOutSP += run.usage.output_tokens;
      tokenInSP += run.usage.input_tokens;
      tokenCacheSP += run.usage.cached_tokens;
      costsSP += run.usage.calculated_cost;
      totalResultsSP += run.results.length;
      durationSP += run.duration_ms;

      if (run.usage.calculated_cost > 0) costs.push(run.usage.calculated_cost);

      // Conteggio step falliti
      const failedSteps = run.results.filter(step => {
        if (step.status !== "error") return false;
        if (step.attempts === 1) {
          if (
            (step.errors && step.errors.some(e => e.message.includes("Test failed:"))) ||
            (step.errors && step.errors.some(e => e.name && e.name.includes("Test failed:")))
          ) return false;
        }
        return true;
      }).length;

      failedStepsSP += failedSteps;
    }

    const avgTokensOutPerRun = tokenOutSP / json.runs.length;
    const avgTokensInPerRun = tokenInSP / json.runs.length;
    const failedPercentage = (failedStepsSP / totalResultsSP) * 100;
    const avgDurationPerRun = durationSP / json.runs.length;

    // === CALCOLO TASSO DI DISCESA COSTO (weighted) ===
    let declineRate = 0;
    if (costs.length > 1) {
      let weightedSum = 0;
      let weightedSteps = 0;
      for (let i = 1; i < costs.length; i++) {
        const prev = costs[i - 1];
        const curr = costs[i];
        if (curr < prev) { // consideriamo solo decrementi
          const rate = ((prev - curr) / prev) * 100;
          weightedSum += rate * json.runs[i].results.length;
          weightedSteps += json.runs[i].results.length;
        }
      }
      if (weightedSteps > 0) declineRate = weightedSum / weightedSteps;

      weightedDeclineSum += weightedSum;
      totalWeightedSteps += weightedSteps;
    }

    console.log(`\n📦 Stepspack: ${sp}`);
    console.log(`  Runs: ${json.runs.length}`);
    console.log(`  Steps: ${totalResultsSP}`);
    console.log(`  Avg token OUT per run: ${avgTokensOutPerRun.toFixed(2)}`);
    console.log(`  Avg token IN per run: ${avgTokensInPerRun.toFixed(2)}`);
    console.log(`  Failed steps %: ${failedPercentage.toFixed(2)}%`);
    console.log(`  Avg duration per run: ${(avgDurationPerRun / 1000).toFixed(2)} s`);
    console.log(`📉 Weighted cost decline rate: ${declineRate.toFixed(2)}%`);

    totalTO += tokenOutSP;
    totalTI += tokenInSP;
    totalTC += tokenCacheSP;
    totCosts += costsSP;
    totRuns += json.runs.length;
    totSteps += totalResultsSP;
    totFailedSteps += failedStepsSP;
    totDurationMs += durationSP;
  }

  // === MEDIE GLOBALI ===
  const avgGlobalOutPerRun = totalTO / totRuns;
  const avgGlobalInPerRun = totalTI / totRuns;
  const avgGlobalOutPerStep = totalTO / totSteps;
  const avgGlobalInPerStep = totalTI / totSteps;
  const globalFailedPercentage = (totFailedSteps / totSteps) * 100;
  const avgGlobalDurationPerRun = totDurationMs / totRuns;
  const avgGlobalDurationPerStep = totDurationMs / totSteps;

  // weighted global decline rate
  const weightedGlobalDeclineRate = totalWeightedSteps > 0 ? weightedDeclineSum / totalWeightedSteps : 0;

  console.log("\n===== TOTALI GLOBALI =====");
  console.log("TOTAL RUNS:", totRuns);
  console.log("TOTAL STEPS:", totSteps);
  console.log("TOTAL TOKENS OUT:", totalTO);
  console.log("TOTAL TOKENS IN:", totalTI);
  console.log("TOTAL COSTS:", totCosts.toFixed(6));
  console.log("TOTAL FAILED STEPS:", totFailedSteps);
  console.log("FAILED STEPS %:", globalFailedPercentage.toFixed(2) + "%");
  console.log("TOTAL DURATION:", (totDurationMs / 1000).toFixed(2), "s");

  console.log("\n===== MEDIE GLOBALI =====");
  console.log(`Avg token OUT per run: ${avgGlobalOutPerRun.toFixed(2)}`);
  console.log(`Avg token IN per run: ${avgGlobalInPerRun.toFixed(2)}`);
  console.log(`Avg token OUT per step: ${avgGlobalOutPerStep.toFixed(2)}`);
  console.log(`Avg token IN per step: ${avgGlobalInPerStep.toFixed(2)}`);
  console.log(`Failed steps %: ${globalFailedPercentage.toFixed(2)}%`);
  console.log(`Avg duration per run: ${(avgGlobalDurationPerRun / 1000).toFixed(2)} s`);
  console.log(`Avg duration per step: ${(avgGlobalDurationPerStep / 1000).toFixed(2)} s`);

  console.log("\n===== COSTI MEDI CALCOLATI =====");
  const TOCost = (avgGlobalOutPerRun * COST_OUTPUT_TOKEN) * USD_TO_EUR;
  const TICost = (avgGlobalInPerRun * COST_INPUT_TOKEN) * USD_TO_EUR;
  console.log(`Avg token OUT cost per run: ${TOCost.toFixed(4)} euro`);
  console.log(`Avg token IN cost per run: ${TICost.toFixed(4)} euro`);
  console.log(`Avg cost per run: ${(TICost + TOCost).toFixed(2)} euro`);

  console.log("\n===== TREND EFFICIENZA =====");
  console.log(`Weighted global decline rate: ${weightedGlobalDeclineRate.toFixed(2)}%`);

  // Proiezione futura (10 funzionalità)
  const estimatedCost = (TICost + TOCost) * 10 * (1 - weightedGlobalDeclineRate / 100);
  console.log(`Costo stimato per 10 funzionalità simili: ${estimatedCost.toFixed(2)} euro`);
})();
