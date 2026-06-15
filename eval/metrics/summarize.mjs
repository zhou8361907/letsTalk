/**
 * 读 Promptfoo output → 汇总 metrics
 *
 * 用法: node eval/metrics/summarize.mjs .promptfoo/output.json
 */

import { readFileSync } from "node:fs";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: node eval/metrics/summarize.mjs <promptfoo-output.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(outputPath, "utf-8"));

const results = data.results || [];
const total = results.length;
const passed = results.filter((r) => r.pass).length;
const failed = total - passed;

// 计算 premature_finalize_rate
const prematureFinalizeCount = results.filter((r) => {
  const draft = r.output?.draft;
  return draft?.readyToFinalize === true;
}).length;

const prematureFinalizeRate = total > 0 ? (prematureFinalizeCount / total) * 100 : 0;

// 计算 cost
const costs = results
  .map((r) => r.output?.turnCostUsd)
  .filter((c) => c != null && c > 0);
const avgCost =
  costs.length > 0
    ? costs.reduce((sum, c) => sum + c, 0) / costs.length
    : 0;
const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
const totalCost = costs.reduce((sum, c) => sum + c, 0);

// 计算 latency
const latencies = results
  .map((r) => r.output?.durationMs)
  .filter((d) => d != null && d > 0);
const avgLatency =
  latencies.length > 0
    ? latencies.reduce((sum, d) => sum + d, 0) / latencies.length
    : 0;
const p95Latency = latencies.length > 0
  ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
  : 0;

console.log("\n=== Eval Metrics Summary ===");
console.log(`Total: ${total}`);
console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
console.log(`Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
console.log(`\nPremature Finalize Rate: ${prematureFinalizeRate.toFixed(1)}%`);
console.log(`\nCost (USD):`);
console.log(`  Average: $${avgCost.toFixed(4)}`);
console.log(`  Max: $${maxCost.toFixed(4)}`);
console.log(`  Total: $${totalCost.toFixed(4)}`);
console.log(`\nLatency (ms):`);
console.log(`  Average: ${avgLatency.toFixed(0)}`);
console.log(`  P95: ${p95Latency.toFixed(0)}`);

// 按场景分组
const byScenario = {};
results.forEach((r) => {
  const desc = r.description || "unknown";
  if (!byScenario[desc]) {
    byScenario[desc] = { total: 0, passed: 0, failed: 0 };
  }
  byScenario[desc].total++;
  if (r.pass) {
    byScenario[desc].passed++;
  } else {
    byScenario[desc].failed++;
  }
});

console.log("\n=== By Scenario ===");
Object.entries(byScenario).forEach(([desc, stats]) => {
  console.log(`${desc}:`);
  console.log(`  ${stats.passed}/${stats.total} passed (${((stats.passed / stats.total) * 100).toFixed(1)}%)`);
});
