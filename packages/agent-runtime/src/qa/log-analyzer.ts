/**
 * QA 日志分析引擎
 * - 按 traceId 精准检索后端日志
 * - 按时间窗 + 类名模糊检索（降级）
 * - 读取 Java 源码上下文
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

/** 日志条目 */
export interface LogEntry {
  timestamp: string;
  traceId: string | null;
  level: string;
  logger: string;
  message: string;
  stackTrace: string[];
}

/** 源码片段 */
export interface SourceSnippet {
  filePath: string;
  beforeLines: string[];
  targetLine: string;
  afterLines: string[];
  lineNumber: number;
}

// 日志文件路径，可配置
let smficLogsBase = "/Users/zs/IdeaProjects/work/YB/831/yb-831-dev/smfic_logs";
let workBackBase = "/Users/zs/IdeaProjects/work/letsTalk/workBack";

/** 设置日志路径 */
export function setLogBasePath(path: string): void {
  smficLogsBase = path;
}

/** 设置源码路径 */
export function setSrcBasePath(path: string): void {
  workBackBase = path;
}

/** 解析日志格式：时间 [traceId] [thread] LEVEL logger - message */
function parseLogLine(line: string): LogEntry | null {
  const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+\[([^\]]*)\]\s+\[[^\]]*\]\s+(\w+)\s+([\w.]+)\s*-\s*(.*)/;
  const match = line.match(regex);
  if (!match) return null;
  return {
    timestamp: match[1]!,
    traceId: match[2] || null,
    level: match[3]!,
    logger: match[4]!,
    message: match[5]!,
    stackTrace: [],
  };
}

/** 获取当天的日志文件路径 */
export function resolveLogPath(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${day}`;
  const dir = join(smficLogsBase, dateStr);
  // 找该目录下第一个 .log 文件
  if (!existsSync(dir)) return "";
  const files = readdirSync(dir).filter((f) => f.endsWith(".log"));
  if (files.length === 0) return "";
  return join(dir, files[0]!);
}

/** 按 traceId 精准检索日志 */
export function findLogsByTraceId(
  traceId: string,
  date?: Date,
): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const logPath = resolveLogPath(date);
    if (!logPath) return resolve([]);

    const results: LogEntry[] = [];
    let current: LogEntry | null = null;

    const rl = createInterface({
      input: createReadStream(logPath),
      crlfDelay: Infinity,
    });

    rl.on("line", (line: string) => {
      // 如果是新日志行（以时间开头）
      if (/^\d{4}-\d{2}-\d{2}/.test(line)) {
        if (current && current.traceId === traceId) {
          results.push(current);
        }
        const parsed = parseLogLine(line);
        if (parsed && parsed.traceId === traceId) {
          current = parsed;
        } else {
          current = null;
        }
      } else if (current && current.traceId === traceId) {
        // 堆栈延续行
        current.stackTrace.push(line.trim());
      }
    });

    rl.on("close", () => {
      if (current && current.traceId === traceId) {
        results.push(current);
      }
      resolve(results);
    });

    rl.on("error", reject);
  });
}

/** 按时间窗 + 类名模糊检索（降级方案）*/
export function findLogsByTimeWindow(
  controllerHint: string,    // 如 SettlementController
  timestamp: string,         // ISO 时间戳
  windowSec = 3,
  date?: Date,
): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const logPath = resolveLogPath(date);
    if (!logPath) return resolve([]);

    const targetMs = new Date(timestamp).getTime();
    const windowMs = windowSec * 1000;
    const results: LogEntry[] = [];
    let current: LogEntry | null = null;

    const rl = createInterface({
      input: createReadStream(logPath),
      crlfDelay: Infinity,
    });

    rl.on("line", (line: string) => {
      if (/^\d{4}-\d{2}-\d{2}/.test(line)) {
        // 检查上一个 current
        if (current && isInTimeWindow(current.timestamp, targetMs, windowMs)) {
          results.push(current);
        }
        const parsed = parseLogLine(line);
        if (parsed) {
          const logMs = new Date(parsed.timestamp).getTime();
          if (
            Math.abs(logMs - targetMs) <= windowMs &&
            parsed.logger.includes(controllerHint)
          ) {
            current = parsed;
          } else {
            current = null;
          }
        } else {
          current = null;
        }
      } else if (current) {
        current.stackTrace.push(line.trim());
      }
    });

    rl.on("close", () => {
      if (current && isInTimeWindow(current.timestamp, targetMs, windowMs)) {
        results.push(current);
      }
      resolve(results);
    });

    rl.on("error", reject);
  });
}

function isInTimeWindow(logTimestamp: string, targetMs: number, windowMs: number): boolean {
  const logMs = new Date(logTimestamp).getTime();
  return Math.abs(logMs - targetMs) <= windowMs;
}

/** 根据 FQCN 和行号读取 Java 源码上下文 */
export function readJavaSource(
  fqcn: string,              // com.yonyougov.smifc.smps.settlement.SettlementServiceImpl
  lineNumber: number,        // 88
  contextLines = 30,         // 上下文行数
): SourceSnippet | null {
  // 将 FQCN 映射为文件路径
  // com.yonyougov.smifc.smps.settlement.SettlementServiceImpl
  // → {module}/src/main/java/com/yonyougov/smifc/smps/settlement/SettlementServiceImpl.java
  const parts = fqcn.split(".");
  const className = parts[parts.length - 1]!;
  const pkg = parts.slice(0, -1).join(".");

  // 推断模块名：从包名第三段（smps/smr/smsbm 等）
  const moduleHint = parts.length >= 3 ? parts[2]! : "";

  // 对应的 workBack 模块目录
  const moduleDirs = [
    `com.yonyougov.${moduleHint}-8.31`,
    `com.yonyougov.sm${moduleHint}-8.31`,
  ];

  for (const moduleDir of moduleDirs) {
    const javaPath = join(
      workBackBase,
      moduleDir,
      "src/main/java",
      pkg.replace(/\./g, "/"),
      `${className}.java`,
    );
    if (existsSync(javaPath)) {
      return readSourceFile(javaPath, lineNumber, contextLines);
    }
  }

  // 尝试在 smc 或 smcs 模块中查找
  const fallbackDirs = ["com.yonyougov.smc-8.31", "com.yonyougov.smcs-8.31"];
  for (const moduleDir of fallbackDirs) {
    const javaPath = join(
      workBackBase,
      moduleDir,
      "src/main/java",
      pkg.replace(/\./g, "/"),
      `${className}.java`,
    );
    if (existsSync(javaPath)) {
      return readSourceFile(javaPath, lineNumber, contextLines);
    }
  }

  return null;
}

function readSourceFile(
  filePath: string,
  lineNumber: number,
  contextLines: number,
): SourceSnippet {
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const start = Math.max(0, lineNumber - contextLines - 1);
  const end = Math.min(lines.length, lineNumber + contextLines);
  const before = lines.slice(start, lineNumber - 1);
  const target = lines[lineNumber - 1] ?? "";
  const after = lines.slice(lineNumber, end);
  return {
    filePath,
    beforeLines: before,
    targetLine: target,
    afterLines: after,
    lineNumber,
  };
}
