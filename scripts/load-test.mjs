#!/usr/bin/env node
import { performance } from "perf_hooks";

// CLI Arguments parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: "http://localhost:3000",
    taskId: 1,
    count: 100,
    concurrency: 20,
    stage: "default",
    timeout: 15000,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target" && args[i + 1]) options.target = args[++i];
    else if (args[i] === "--task" && args[i + 1]) options.taskId = parseInt(args[++i], 10);
    else if (args[i] === "--count" && args[i + 1]) options.count = parseInt(args[++i], 10);
    else if (args[i] === "--concurrency" && args[i + 1]) options.concurrency = parseInt(args[++i], 10);
    else if (args[i] === "--stage" && args[i + 1]) options.stage = args[++i];
  }

  if (options.stage === "smoke") {
    options.count = 10;
    options.concurrency = 2;
  } else if (options.stage === "ramp") {
    options.count = 200;
    options.concurrency = 20;
  } else if (options.stage === "full" || options.stage === "2k") {
    options.count = 2000;
    options.concurrency = 50;
  }

  return options;
}

const config = parseArgs();

// Format numbers
const formatMs = (n) => `${n.toFixed(1)}ms`;
const formatNum = (n) => new Intl.NumberFormat().format(n);

// Percentile calculator
function getPercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

async function submitTask(baseUrl, taskId, studentIndex, isDuplicate = false) {
  const teamId = isDuplicate ? "TRI_LOADTEST_DUPE" : `TRI_LOADTEST_${String(studentIndex).padStart(5, "0")}`;
  const memberName = isDuplicate ? "Duplicate Student" : `Student_${studentIndex}`;
  const body = {
    team_id: teamId,
    member_name: memberName,
    answer: `Verification token for load test submission #${studentIndex}. Solved algorithmic cipher in 42 iterations.`,
    link: `https://github.com/tricity-hackathon/submission-${studentIndex}`,
  };

  const url = `${baseUrl}/api/tasks/${taskId}/submit`;
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = performance.now() - start;
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    return {
      status: res.status,
      duration,
      ok: res.ok,
      error: data.error,
    };
  } catch (err) {
    const duration = performance.now() - start;
    return {
      status: err.name === "AbortError" ? 408 : 0,
      duration,
      ok: false,
      error: err.message,
    };
  }
}

async function runWorkerPool(totalRequests, concurrency, onProgress) {
  let currentIndex = 0;
  const results = [];
  const startWallTime = performance.now();

  async function worker() {
    while (true) {
      const idx = ++currentIndex;
      if (idx > totalRequests) break;

      const res = await submitTask(config.target, config.taskId, idx);
      results.push(res);
      onProgress(results.length, totalRequests, performance.now() - startWallTime);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log("===================================================================");
  console.log("🚀  TRICITY TASKS — 2,000+ STUDENTS LOAD TESTING SUITE");
  console.log("===================================================================");
  console.log(`🎯 Target Endpoint : ${config.target}/api/tasks/${config.taskId}/submit`);
  console.log(`👥 Total Submissions: ${formatNum(config.count)}`);
  console.log(`⚡ Concurrency Level: ${config.concurrency} parallel workers`);
  console.log(`🏷️  Test Stage       : ${config.stage}`);
  console.log("-------------------------------------------------------------------\n");

  // Step 1: Health check endpoint first
  process.stdout.write("🔍 Verifying target server is reachable... ");
  try {
    const health = await fetch(`${config.target}/api/tasks`);
    if (!health.ok) {
      console.log(`❌ Failed with status ${health.status}`);
      process.exit(1);
    }
    console.log("✅ Ready!\n");
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}`);
    console.log("Make sure your Next.js server is running (`npm run dev` or `npm run start`)\n");
    process.exit(1);
  }

  // Step 2: Test duplicate protection first
  console.log("🔒 Checking Duplicate Prevention Guard (Composite Unique Constraint)...");
  const firstSubmission = await submitTask(config.target, config.taskId, 99999, true);
  const secondSubmission = await submitTask(config.target, config.taskId, 99999, true);

  if (secondSubmission.status === 409) {
    console.log("   ✅ Duplicate submission successfully blocked with HTTP 409 Conflict!");
  } else if (secondSubmission.status === 200) {
    console.log("   ⚠️ Warning: Duplicate submission was accepted (returned 200).");
  } else {
    console.log(`   ℹ️  Duplicate check response: HTTP ${secondSubmission.status} (${secondSubmission.error})`);
  }
  console.log("");

  // Step 3: Run the main load test
  console.log(`🚀 Starting load test: ${formatNum(config.count)} submissions at ${config.concurrency} concurrent requests...\n`);

  let lastReport = 0;
  const updateProgress = (completed, total, elapsedMs) => {
    const now = Date.now();
    if (now - lastReport > 250 || completed === total) {
      lastReport = now;
      const pct = ((completed / total) * 100).toFixed(1);
      const rps = (completed / (elapsedMs / 1000)).toFixed(1);
      const barLen = 30;
      const filled = Math.round((completed / total) * barLen);
      const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
      process.stdout.write(`\r[${bar}] ${pct}% | ${completed}/${total} completed | ${rps} req/sec | ${(elapsedMs / 1000).toFixed(1)}s`);
    }
  };

  const startTime = performance.now();
  const results = await runWorkerPool(config.count, config.concurrency, updateProgress);
  const totalDuration = performance.now() - startTime;
  console.log("\n\n🏁 Load test execution completed!\n");

  // Analyze Results
  const total = results.length;
  const success200 = results.filter((r) => r.status === 200).length;
  const conflict409 = results.filter((r) => r.status === 409).length;
  const clientError400 = results.filter((r) => r.status === 400).length;
  const rateLimit429 = results.filter((r) => r.status === 429).length;
  const serverError500 = results.filter((r) => r.status >= 500).length;
  const networkErrors = results.filter((r) => r.status === 0 || r.status === 408).length;

  const latencies = results.map((r) => r.duration).sort((a, b) => a - b);
  const minLat = latencies[0] || 0;
  const maxLat = latencies[latencies.length - 1] || 0;
  const sumLat = latencies.reduce((acc, curr) => acc + curr, 0);
  const avgLat = sumLat / latencies.length || 0;
  const p50 = getPercentile(latencies, 50);
  const p90 = getPercentile(latencies, 90);
  const p95 = getPercentile(latencies, 95);
  const p99 = getPercentile(latencies, 99);

  const rps = (total / (totalDuration / 1000)).toFixed(1);

  console.log("===================================================================");
  console.log("📊  LOAD TEST PERFORMANCE SUMMARY");
  console.log("===================================================================");
  console.log(`⏱️  Total Duration      : ${(totalDuration / 1000).toFixed(2)} seconds`);
  console.log(`⚡ Throughput          : ${rps} requests/second`);
  console.log(`📦 Total Submissions   : ${formatNum(total)}`);
  console.log(`✅ Success (200 OK)    : ${formatNum(success200)} (${((success200 / total) * 100).toFixed(1)}%)`);
  if (conflict409 > 0) {
    console.log(`🔒 Duplicates (409)    : ${formatNum(conflict409)}`);
  }
  if (clientError400 > 0) {
    console.log(`⚠️  Bad Request (400)   : ${formatNum(clientError400)}`);
  }
  if (rateLimit429 > 0) {
    console.log(`🛑 Rate Limited (429)  : ${formatNum(rateLimit429)}`);
  }
  if (serverError500 > 0) {
    console.log(`❌ Server Errors (500) : ${formatNum(serverError500)}`);
  }
  if (networkErrors > 0) {
    console.log(`💥 Network Timeouts    : ${formatNum(networkErrors)}`);
  }

  console.log("-------------------------------------------------------------------");
  console.log("📈  RESPONSE TIME DISTRIBUTION (LATENCY)");
  console.log("-------------------------------------------------------------------");
  console.log(`   Fastest (Min)       : ${formatMs(minLat)}`);
  console.log(`   Average (Mean)      : ${formatMs(avgLat)}`);
  console.log(`   Median (p50)        : ${formatMs(p50)}`);
  console.log(`   90th Percentile (p90): ${formatMs(p90)}`);
  console.log(`   95th Percentile (p95): ${formatMs(p95)}`);
  console.log(`   99th Percentile (p99): ${formatMs(p99)}`);
  console.log(`   Slowest (Max)       : ${formatMs(maxLat)}`);
  console.log("===================================================================\n");

  console.log("💡 NEXT STEP:");
  console.log("   To clean up all test submissions from Supabase, run:");
  console.log("   npm run test:cleanup\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
