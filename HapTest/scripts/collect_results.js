#!/usr/bin/env node
/**
 * HapTest 实验数据采集工具 (v2)
 *
 * 从测试结果目录提取:
 *   transition数量、PTG节点/边数、截图数、崩溃数、耗时
 *   覆盖率(语句/分支/函数)、效率指标、UIAbility 覆盖数
 *
 * 生成统一 CSV 报告，支撑开题报告全部量化指标对比。
 *
 * 用法:
 *   node scripts/collect_results.js                          # 扫描 out/ 和 out_static/
 *   node scripts/collect_results.js -d out -o results.csv
 *   node scripts/collect_results.js -d out_enhanced,out_greedy
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HAPT_PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTimestampDir(name) {
  return /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(name);
}

function listRunDirs(parentDir) {
  if (!fs.existsSync(parentDir)) return [];
  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && isTimestampDir(d.name); })
    .map(function (d) { return path.join(parentDir, d.name); })
    .sort();
}

function countFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(function (f) { return pattern.test(f); }).length;
}

// ---------------------------------------------------------------------------
// 日志时间范围提取
// ---------------------------------------------------------------------------

function extractDuration(logPath) {
  if (!fs.existsSync(logPath)) return null;
  var content = fs.readFileSync(logPath, "utf-8");
  var lines = content.split("\n");
  if (lines.length === 0) return null;

  var tsRe = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})\]/;

  var first = lines[0].match(tsRe);
  if (!first) return null;

  var last = null;
  for (var i = lines.length - 1; i >= 0; i--) {
    last = lines[i].match(tsRe);
    if (last) break;
  }
  if (!last) return null;

  return (new Date(last[1]).getTime() - new Date(first[1]).getTime()) / 1000;
}

function extractBundleName(logPath) {
  if (!fs.existsSync(logPath)) return null;
  var firstLine = fs.readFileSync(logPath, "utf-8").split("\n")[0];
  var m = firstLine.match(/"hap"\s*:\s*\["([^"]+)"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// PTG dot 解析
// ---------------------------------------------------------------------------

function parsePtgDot(dotPath) {
  if (!fs.existsSync(dotPath)) return { nodes: 0, edges: 0 };
  var content = fs.readFileSync(dotPath, "utf-8");
  var nodes = 0;
  var edges = 0;
  var lines = content.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\s*"[^"]+"\s*\[/.test(line) && line.indexOf("->") === -1) {
      nodes++;
    }
    if (/^\s*"[^"]+"\s*->\s*"[^"]+"/.test(line)) {
      edges++;
    }
  }
  return { nodes: nodes, edges: edges };
}

// ---------------------------------------------------------------------------
// 崩溃统计
// ---------------------------------------------------------------------------

function countCrashes(runDir) {
  var eventsDir = path.join(runDir, "events");
  if (!fs.existsSync(eventsDir)) return 0;

  var crashes = 0;
  var files = fs
    .readdirSync(eventsDir)
    .filter(function (f) { return f.startsWith("transition_") && f.endsWith(".json"); })
    .sort();

  for (var i = 0; i < files.length; i++) {
    try {
      var raw = fs.readFileSync(path.join(eventsDir, files[i]), "utf-8");
      var data = JSON.parse(raw);

      var fromFaults = data && data.from && data.from.snapshot && data.from.snapshot.faultLogs;
      if (Array.isArray(fromFaults) && fromFaults.length > 0) crashes++;

      var toFaults = data && data.to && data.to.snapshot && data.to.snapshot.faultLogs;
      if (Array.isArray(toFaults) && toFaults.length > 0) crashes++;
    } catch (_e) { /* 忽略损坏的 JSON */ }
  }
  return crashes;
}

function countLogErrors(logPath) {
  if (!fs.existsSync(logPath)) return 0;
  var content = fs.readFileSync(logPath, "utf-8");
  var lines = content.split("\n");
  var count = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("[ERROR]") !== -1) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 覆盖率提取 (新增)
// ---------------------------------------------------------------------------

/**
 * 从 transition JSON 的 to.snapshot.coverage.summary 提取覆盖率。
 * 遍历 events 目录中所有 transition JSON，取含 coverage 数据的最后一个。
 * 备选: 从 {runDir}/cov/bjc_cov_*.json 直接解析。
 */
function extractCoverage(runDir) {
  var eventsDir = path.join(runDir, "events");
  if (!fs.existsSync(eventsDir)) return null;

  var files = fs
    .readdirSync(eventsDir)
    .filter(function (f) { return f.startsWith("transition_") && f.endsWith(".json"); })
    .sort();

  // 从后向前扫描，找第一个包含 coverage 的 transition
  for (var i = files.length - 1; i >= 0; i--) {
    try {
      var raw = fs.readFileSync(path.join(eventsDir, files[i]), "utf-8");
      var data = JSON.parse(raw);
      var cov =
        (data.to && data.to.snapshot && data.to.snapshot.coverage) ||
        (data.from && data.from.snapshot && data.from.snapshot.coverage);
      if (cov && cov.summary) {
        return {
          statement: cov.summary.lines ? cov.summary.lines.pct : -1,
          branch: cov.summary.branches ? cov.summary.branches.pct : -1,
          func: cov.summary.functions ? cov.summary.functions.pct : -1,
        };
      }
    } catch (_e) { continue; }
  }

  // 备选: 从 cov/ 目录直接读取 bjc_cov_*.json
  return extractCoverageFromCovDir(path.join(runDir, "cov"));
}

/** 从 cov/ 目录的 bjc_cov_*.json 文件中计算 summary */
function extractCoverageFromCovDir(covDir) {
  if (!fs.existsSync(covDir)) return null;

  var covFiles = fs.readdirSync(covDir).filter(function (f) {
    return f.startsWith("bjc_cov_") && f.endsWith(".json");
  }).sort();
  if (covFiles.length === 0) return null;

  var raw = fs.readFileSync(path.join(covDir, covFiles[covFiles.length - 1]), "utf-8");
  try {
    var data = JSON.parse(raw);
    // bjc_cov JSON 格式: { "filePath": { path, functions, lineCnt, exeLine, ... } }
    var totalLinesSet = new Set();
    var coveredLinesSet = new Set();
    var totalBranches = 0, coveredBranches = 0;
    var totalFunctions = 0, coveredFunctions = 0;

    for (var filePath in data) {
      if (!data.hasOwnProperty(filePath)) continue;
      var fileData = data[filePath];

      // 行覆盖率: exeLine 为可执行行号
      var exeLines = objectValues(fileData.exeLine);
      for (var el = 0; el < exeLines.length; el++) {
        totalLinesSet.add(filePath + ":" + exeLines[el]);
      }

      // 函数覆盖率 — bjc 以数字键对象存储
      var funcs = objectValues(fileData.functions);
      for (var f = 0; f < funcs.length; f++) {
        totalFunctions++;
        if (funcs[f].count > 0) coveredFunctions++;

        // 从 regions 计算行覆盖（去重）
        var regions = objectValues(funcs[f].regions);
        for (var r = 0; r < regions.length; r++) {
          if (regions[r].count > 0 && regions[r].startLoc && regions[r].endLoc) {
            for (var line = regions[r].startLoc.line; line <= regions[r].endLoc.line; line++) {
              coveredLinesSet.add(filePath + ":" + line);
            }
          }
        }

        // 从 branches 计算分支覆盖
        var branches = objectValues(funcs[f].branches);
        for (var b = 0; b < branches.length; b++) {
          totalBranches++;
          if (branches[b].trueCount > 0 || branches[b].falseCount > 0) {
            coveredBranches++;
          }
        }
      }
    }

    return {
      statement: totalLinesSet.size > 0 ? Math.round(coveredLinesSet.size / totalLinesSet.size * 1000) / 10 : -1,
      branch: totalBranches > 0 ? Math.round(coveredBranches / totalBranches * 1000) / 10 : -1,
      func: totalFunctions > 0 ? Math.round(coveredFunctions / totalFunctions * 1000) / 10 : -1,
    };
  } catch (_e) {
    return null;
  }
}

/** 将 bjc 的数字键对象转为数组。如 {"0":{a:1}, "1":{a:2}} → [{a:1}, {a:2}]。已是数组的保持不变 */
function objectValues(obj) {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== "object") return [];
  var result = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      result.push(obj[key]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// UIAbility 页面覆盖数统计 (新增)
// ---------------------------------------------------------------------------

/**
 * 统计 transition JSON 中出现的独立 pagePath 数。
 * 排除空路径和 STOP 标记。
 */
function extractUIAbilityCount(runDir) {
  var eventsDir = path.join(runDir, "events");
  if (!fs.existsSync(eventsDir)) return 0;

  var pages = new Set();
  var files = fs
    .readdirSync(eventsDir)
    .filter(function (f) { return f.startsWith("transition_") && f.endsWith(".json"); })
    .sort();

  for (var i = 0; i < files.length; i++) {
    try {
      var raw = fs.readFileSync(path.join(eventsDir, files[i]), "utf-8");
      var data = JSON.parse(raw);

      [data.from, data.to].forEach(function (side) {
        if (side && side.pagePath && side.pagePath !== "STOP") {
          pages.add(side.pagePath);
        }
      });
    } catch (_e) { /* 忽略损坏的 JSON */ }
  }

  return pages.size;
}

// ---------------------------------------------------------------------------
// 单次运行采集
// ---------------------------------------------------------------------------

function collectRun(runDir, policy) {
  var resultTime = path.basename(runDir);
  var logPath = path.join(path.dirname(runDir), "haptest.log");
  var dotPath = path.join(runDir, "ptg.dot");

  var bundleName = extractBundleName(logPath) || resultTime;
  var dot = parsePtgDot(dotPath);
  var events = countFiles(path.join(runDir, "events"), /^transition_.*\.json$/);
  var screenshots = countFiles(path.join(runDir, "temp"), /^screenCap_.*\.png$/);
  var crashes = countCrashes(runDir) + countLogErrors(logPath);
  var duration = extractDuration(logPath);

  if (events === 0 && dot.nodes === 0) return null;

  // --- 新增字段 ---
  var cov = extractCoverage(runDir);
  var covStatement = cov ? cov.statement : -1;
  var covBranch = cov ? cov.branch : -1;
  var covFunc = cov ? cov.func : -1;

  var uiabilityCount = extractUIAbilityCount(runDir);

  // 效率派生指标
  var eventsPerCovPct = covStatement > 0 ? Math.round(events / covStatement * 100) / 100 : -1;
  var crashesPer1000ev = events > 0 ? Math.round(crashes / events * 100000) / 100 : -1;

  return {
    project: bundleName,
    policy: policy,
    result_time: resultTime,
    events: events,
    ptg_nodes: dot.nodes,
    ptg_edges: dot.edges,
    screenshots: screenshots,
    crashes: crashes,
    duration: duration !== null ? Math.round(duration * 10) / 10 : -1,
    cov_statement: covStatement,
    cov_branch: covBranch,
    cov_function: covFunc,
    events_per_cov_pct: eventsPerCovPct,
    crashes_per_1000ev: crashesPer1000ev,
    uiability_count: uiabilityCount,
  };
}

// ---------------------------------------------------------------------------
// CSV 输出
// ---------------------------------------------------------------------------

var CSV_HEADER = [
  "project", "policy", "result_time",
  "events", "ptg_nodes", "ptg_edges", "screenshots", "crashes", "duration",
  "cov_statement", "cov_branch", "cov_function",
  "events_per_cov_pct", "crashes_per_1000ev",
  "uiability_count",
].join(",");

function metricsToCsvRow(m) {
  return [
    m.project,
    m.policy,
    m.result_time,
    m.events,
    m.ptg_nodes,
    m.ptg_edges,
    m.screenshots,
    m.crashes,
    m.duration,
    m.cov_statement,
    m.cov_branch,
    m.cov_function,
    m.events_per_cov_pct,
    m.crashes_per_1000ev,
    m.uiability_count,
  ].join(",");
}

function writeCsv(metrics, outPath) {
  var dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  var lines = [CSV_HEADER];
  for (var i = 0; i < metrics.length; i++) {
    lines.push(metricsToCsvRow(metrics[i]));
  }
  lines.push("");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// 统计摘要 (增强 — 覆盖率+效率对比)
// ---------------------------------------------------------------------------

function avg(vals) {
  var filtered = vals.filter(function (v) { return isFinite(v); });
  if (filtered.length === 0) return NaN;
  var sum = 0;
  for (var i = 0; i < filtered.length; i++) sum += filtered[i];
  return sum / filtered.length;
}

function fmtPct(v, suffix) {
  if (!isFinite(v) || v < 0) return "N/A";
  return v.toFixed(1) + (suffix || "");
}

function printSummary(metrics) {
  if (metrics.length === 0) {
    console.log("\n  没有找到可采集的测试结果。");
    return;
  }

  var byPolicy = new Map();
  for (var i = 0; i < metrics.length; i++) {
    var m = metrics[i];
    var list = byPolicy.get(m.policy) || [];
    list.push(m);
    byPolicy.set(m.policy, list);
  }

  console.log("\n  总计 " + metrics.length + " 次测试运行:\n");

  byPolicy.forEach(function (runs, policy) {
    var avgEvents = avg(runs.map(function (r) { return r.events; }));
    var avgNodes = avg(runs.map(function (r) { return r.ptg_nodes; }));
    var avgEdges = avg(runs.map(function (r) { return r.ptg_edges; }));
    var avgScreenshots = avg(runs.map(function (r) { return r.screenshots; }));
    var totalCrashes = runs.reduce(function (s, r) { return s + r.crashes; }, 0);
    var avgDur = avg(runs.map(function (r) { return r.duration > 0 ? r.duration : NaN; }));

    // 覆盖率
    var avgCovStmt = avg(runs.map(function (r) { return r.cov_statement >= 0 ? r.cov_statement : NaN; }));
    var avgCovBranch = avg(runs.map(function (r) { return r.cov_branch >= 0 ? r.cov_branch : NaN; }));
    var avgCovFunc = avg(runs.map(function (r) { return r.cov_function >= 0 ? r.cov_function : NaN; }));

    // 效率
    var avgEff = avg(runs.map(function (r) { return r.events_per_cov_pct >= 0 ? r.events_per_cov_pct : NaN; }));
    var avgCrashDensity = avg(runs.map(function (r) { return r.crashes_per_1000ev >= 0 ? r.crashes_per_1000ev : NaN; }));
    var maxUIAbility = runs.reduce(function (max, r) { return Math.max(max, r.uiability_count); }, 0);

    console.log("  [" + policy + "] (" + runs.length + " 次)");
    console.log("    --- 探索结果 ---");
    console.log("    平均 events:        " + avgEvents.toFixed(1));
    console.log("    平均 PTG nodes:     " + avgNodes.toFixed(1));
    console.log("    平均 PTG edges:     " + avgEdges.toFixed(1));
    console.log("    平均 screenshots:   " + avgScreenshots.toFixed(1));
    console.log("    总 crashes:         " + totalCrashes);
    console.log("    平均耗时:           " + (isFinite(avgDur) ? avgDur.toFixed(1) + "s" : "N/A"));
    console.log("    UIAbility 覆盖:     " + maxUIAbility);
    console.log("    --- 覆盖率 ---");
    console.log("    平均语句覆盖率:     " + fmtPct(avgCovStmt, "%"));
    console.log("    平均分支覆盖率:     " + fmtPct(avgCovBranch, "%"));
    console.log("    平均函数覆盖率:     " + fmtPct(avgCovFunc, "%"));
    console.log("    --- 效率指标 ---");
    console.log("    探索效率(e/cov%):   " + fmtPct(avgEff, ""));
    console.log("    崩溃密度(c/1000ev): " + fmtPct(avgCrashDensity, ""));
    console.log();
  });

  // 跨策略对比 (如果有两种以上策略)
  if (byPolicy.size >= 2) {
    var entries = Array.from(byPolicy.entries());
    console.log("  === 策略对比 ===\n");
    for (var e = 0; e < entries.length; e++) {
      var pName = entries[e][0];
      var runs = entries[e][1];
      var aCovStmt = avg(runs.map(function (r) { return r.cov_statement >= 0 ? r.cov_statement : NaN; }));
      var aEvents = avg(runs.map(function (r) { return r.events; }));
      var aEff = avg(runs.map(function (r) { return r.events_per_cov_pct >= 0 ? r.events_per_cov_pct : NaN; }));
      console.log("    " + pName + ": events=" + aEvents.toFixed(1) +
        " | 语句覆盖=" + fmtPct(aCovStmt, "%") +
        " | 探索效率=" + fmtPct(aEff, ""));
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  var args = process.argv.slice(2);
  var dirs = ["out", "out_static"];
  var outPath = path.join(HAPT_PROJECT_ROOT, "results.csv");

  for (var i = 0; i < args.length; i++) {
    if (args[i] === "-d" && args[i + 1]) {
      dirs = args[i + 1].split(",").map(function (s) { return s.trim(); });
      i++;
    } else if (args[i] === "-o" && args[i + 1]) {
      outPath = path.resolve(args[i + 1]);
      i++;
    }
  }

  return { dirs: dirs, outPath: outPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  var opts = parseArgs();

  console.log("HapTest 实验数据采集 v2");
  console.log("  扫描目录: " + opts.dirs.join(", "));
  console.log("  输出 CSV: " + opts.outPath);

  var allMetrics = [];

  for (var d = 0; d < opts.dirs.length; d++) {
    var dirName = opts.dirs[d];
    var absDir = path.resolve(HAPT_PROJECT_ROOT, dirName);
    var policy = dirName.replace(/^out_?/, "") || "default";
    var runDirs = listRunDirs(absDir);

    console.log("\n  " + dirName + "/ 找到 " + runDirs.length + " 个运行结果");

    for (var r = 0; r < runDirs.length; r++) {
      var m = collectRun(runDirs[r], policy);
      if (m) {
        allMetrics.push(m);
        console.log(
          "    " + m.result_time +
          ": events=" + m.events +
          " nodes=" + m.ptg_nodes +
          " edges=" + m.ptg_edges +
          " crashes=" + m.crashes +
          " dur=" + m.duration + "s" +
          " cov(stmt)=" + (m.cov_statement >= 0 ? m.cov_statement + "%" : "N/A") +
          " uiability=" + m.uiability_count
        );
      }
    }
  }

  writeCsv(allMetrics, opts.outPath);
  console.log("\n  CSV 已写入: " + opts.outPath);

  printSummary(allMetrics);
}

main();
