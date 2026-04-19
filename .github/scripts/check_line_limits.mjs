#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_ALLOWLIST_PATH = "config/line-governance.allowlist.json";
const DEFAULT_BASE_REF = "origin/main";
const SOURCE_ROOTS = ["src", "src-tauri/src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs"]);

function parseArgs(argv) {
  const parsed = {
    scope: "all",
    baseRef: DEFAULT_BASE_REF,
    allowlist: DEFAULT_ALLOWLIST_PATH,
    format: "text",
    root: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--scope" && next) {
      parsed.scope = next;
      i += 1;
      continue;
    }
    if (token === "--base-ref" && next) {
      parsed.baseRef = next;
      i += 1;
      continue;
    }
    if (token === "--allowlist" && next) {
      parsed.allowlist = next;
      i += 1;
      continue;
    }
    if (token === "--format" && next) {
      parsed.format = next;
      i += 1;
      continue;
    }
    if (token === "--root" && next) {
      parsed.root = next;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (parsed.scope !== "all" && parsed.scope !== "changed") {
    throw new Error(`Unsupported --scope "${parsed.scope}". Use "all" or "changed".`);
  }
  if (parsed.format !== "text" && parsed.format !== "json") {
    throw new Error(`Unsupported --format "${parsed.format}". Use "text" or "json".`);
  }

  parsed.root = path.resolve(parsed.root);
  return parsed;
}

function printHelp() {
  console.log(
    [
      "Usage: node .github/scripts/check_line_limits.mjs [options]",
      "",
      "Options:",
      "  --scope <all|changed>     Check all business source files or only changed files",
      `  --base-ref <git-ref>       Base ref for changed scope (default: ${DEFAULT_BASE_REF})`,
      `  --allowlist <path>         Allowlist path (default: ${DEFAULT_ALLOWLIST_PATH})`,
      "  --format <text|json>       Output format (default: text)",
      "  --root <path>              Repository root path (default: current working directory)",
      "  -h, --help                 Show this help message",
    ].join("\n"),
  );
}

function normalizePath(input) {
  return input.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function pathFromRoot(rootDir, absolutePath) {
  return normalizePath(path.relative(rootDir, absolutePath));
}

function isBusinessSourceFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!SOURCE_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    return false;
  }

  if (normalized.includes("/__tests__/")) {
    return false;
  }
  if (/\.(test|spec)\.[^.]+$/i.test(normalized)) {
    return false;
  }
  if (normalized.endsWith(".d.ts")) {
    return false;
  }

  return SOURCE_EXTENSIONS.has(path.extname(normalized));
}

function collectAllFiles(rootDir) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(rootDir, sourceRoot);
    if (!fs.existsSync(absoluteRoot)) {
      continue;
    }
    walkFiles(absoluteRoot, (absolutePath) => {
      files.push(pathFromRoot(rootDir, absolutePath));
    });
  }
  return files;
}

function walkFiles(currentPath, onFile) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, onFile);
      continue;
    }
    if (entry.isFile()) {
      onFile(absolute);
    }
  }
}

function collectChangedFiles(rootDir, baseRef) {
  const tried = [];
  const candidates = [baseRef];
  if (process.env.GITHUB_BASE_REF) {
    candidates.push(`origin/${process.env.GITHUB_BASE_REF}`);
  }

  for (const ref of candidates) {
    if (!ref) {
      continue;
    }
    const range = `${ref}...HEAD`;
    tried.push(range);
    const result = spawnSync(
      "git",
      ["-C", rootDir, "diff", "--name-only", "--diff-filter=ACMR", range],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      continue;
    }
    const files = result.stdout
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean)
      .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));
    return { files: Array.from(new Set(files)), range, fallbackUsed: false };
  }

  return { files: collectAllFiles(rootDir), range: tried.join(", "), fallbackUsed: true };
}

function loadAllowlist(rootDir, allowlistPath) {
  const absolute = path.join(rootDir, allowlistPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Allowlist file not found: ${allowlistPath}`);
  }

  const raw = fs.readFileSync(absolute, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Allowlist JSON parse failed: ${error.message}`);
  }

  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const errors = [];
  const map = new Map();
  for (const entry of entries) {
    const result = validateAllowlistEntry(entry);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    const normalizedPath = normalizePath(entry.path);
    if (map.has(normalizedPath)) {
      errors.push(`Duplicate allowlist path: ${normalizedPath}`);
      continue;
    }
    map.set(normalizedPath, {
      path: normalizedPath,
      maxLines: entry.maxLines,
      owner: entry.owner,
      reason: entry.reason,
      reviewBy: entry.reviewBy,
    });
  }

  return { map, errors };
}

function validateAllowlistEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { ok: false, error: "Allowlist entry must be an object." };
  }
  if (typeof entry.path !== "string" || entry.path.trim() === "") {
    return { ok: false, error: "Allowlist entry.path must be a non-empty string." };
  }
  if (!Number.isInteger(entry.maxLines)) {
    return { ok: false, error: `Allowlist ${entry.path}: maxLines must be an integer.` };
  }
  if (entry.maxLines <= 500 || entry.maxLines > 1000) {
    return {
      ok: false,
      error: `Allowlist ${entry.path}: maxLines must be in (500, 1000].`,
    };
  }
  if (typeof entry.owner !== "string" || entry.owner.trim() === "") {
    return { ok: false, error: `Allowlist ${entry.path}: owner is required.` };
  }
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
    return { ok: false, error: `Allowlist ${entry.path}: reason is required.` };
  }
  if (typeof entry.reviewBy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy)) {
    return {
      ok: false,
      error: `Allowlist ${entry.path}: reviewBy must use YYYY-MM-DD format.`,
    };
  }
  return { ok: true };
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.length === 0) {
    return 0;
  }
  const newlineCount = content.match(/\n/g)?.length ?? 0;
  return newlineCount + (content.endsWith("\n") ? 0 : 1);
}

function evaluateFiles(rootDir, files, allowlistMap) {
  const violations = [];
  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    const lines = countLines(absolutePath);
    const allow = allowlistMap.get(relativePath);

    if (lines > 1000) {
      violations.push({
        code: "E_MAX_1000",
        path: relativePath,
        lines,
        limit: 1000,
        message: "File exceeds hard max limit (1000 lines).",
      });
      continue;
    }

    if (lines > 500) {
      if (!allow) {
        violations.push({
          code: "E_MAX_500_NO_ALLOWLIST",
          path: relativePath,
          lines,
          limit: 500,
          message: "File exceeds 500 lines and is not allowlisted.",
        });
        continue;
      }
      if (lines > allow.maxLines) {
        violations.push({
          code: "E_ALLOWLIST_LIMIT_EXCEEDED",
          path: relativePath,
          lines,
          limit: allow.maxLines,
          message: "File exceeds its allowlist maxLines value.",
        });
      }
    }
  }
  violations.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return violations;
}

function printTextReport(report) {
  console.log("[line-governance] Summary");
  console.log(`  Scope: ${report.scope}`);
  console.log(`  Checked files: ${report.checkedFiles}`);
  if (report.range) {
    console.log(`  Diff range: ${report.range}`);
  }
  if (report.fallbackUsed) {
    console.log("  Changed-scope fallback: git diff unavailable, scanned all files.");
  }

  if (report.allowlistErrors.length > 0) {
    console.log("");
    console.log("[line-governance] Allowlist configuration errors:");
    for (const error of report.allowlistErrors) {
      console.log(`  - ${error}`);
    }
  }

  if (report.violations.length === 0) {
    console.log("");
    console.log("[line-governance] PASS: no line-limit violations.");
    return;
  }

  console.log("");
  console.log(`[line-governance] FAIL: ${report.violations.length} violation(s) found.`);
  for (const violation of report.violations) {
    console.log(
      `  - [${violation.code}] ${violation.path}: ${violation.lines} lines (limit ${violation.limit})`,
    );
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[line-governance] ${error.message}`);
    process.exit(2);
  }

  let allowlist;
  try {
    allowlist = loadAllowlist(args.root, args.allowlist);
  } catch (error) {
    console.error(`[line-governance] ${error.message}`);
    process.exit(2);
  }

  let collected = { files: [], range: undefined, fallbackUsed: false };
  if (args.scope === "changed") {
    collected = collectChangedFiles(args.root, args.baseRef);
  } else {
    collected.files = collectAllFiles(args.root);
  }

  const businessFiles = collected.files.filter(isBusinessSourceFile);
  const violations = evaluateFiles(args.root, businessFiles, allowlist.map);

  const report = {
    scope: args.scope,
    checkedFiles: businessFiles.length,
    range: collected.range,
    fallbackUsed: collected.fallbackUsed,
    allowlistErrors: allowlist.errors,
    violations,
  };

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }

  if (report.allowlistErrors.length > 0 || report.violations.length > 0) {
    process.exit(1);
  }
}

main();
