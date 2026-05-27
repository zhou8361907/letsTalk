import { readFile } from "node:fs/promises";

export interface JavaMethodInfo {
  name: string;
  /** 方法声明行（含修饰符，不含注解块） */
  signature: string;
  annotations: string[];
  startLine: number;
}

export interface ListMethodsResult {
  filePath: string;
  className: string;
  methods: JavaMethodInfo[];
}

const METHOD_LINE =
  /^\s*(public|protected|private)\s+(?:static\s+)?[\w<>,\s\[\]?]+\s+(\w+)\s*\(/;

const ANNOTATION_LINE = /^\s*@\w+/;

/** 列出 Java 类中的方法签名（适配 Spring Controller，无 tree-sitter 原生依赖） */
export async function listMethods(absPath: string): Promise<ListMethodsResult> {
  const source = await readFile(absPath, "utf8");
  const lines = source.split(/\r?\n/);
  const classMatch = source.match(/(?:public\s+)?class\s+(\w+)/);
  const className = classMatch?.[1] ?? "Unknown";

  const methods: JavaMethodInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (ANNOTATION_LINE.test(line) && !trimmed.startsWith("@interface")) {
      pendingAnnotations.push(trimmed);
      continue;
    }

    const m = METHOD_LINE.exec(line);
    if (!m) {
      // 非方法行且不是注解续行时清空注解缓冲（避免字段 @Autowired 污染）
      if (trimmed && !trimmed.startsWith("@") && pendingAnnotations.length > 0) {
        pendingAnnotations = [];
      }
      continue;
    }

    const name = m[2];
    if (!name || name === className) {
      pendingAnnotations = [];
      continue;
    }

    methods.push({
      name,
      signature: trimmed.replace(/\s*\{$/, ""),
      annotations: [...pendingAnnotations],
      startLine: i + 1,
    });
    pendingAnnotations = [];
  }

  return { filePath: absPath, className, methods };
}

/** 读取单个方法的完整代码块（含注解与方法体） */
export async function readMethod(
  absPath: string,
  methodName: string,
): Promise<{ methodName: string; code: string; startLine: number; endLine: number }> {
  const source = await readFile(absPath, "utf8");
  const lines = source.split(/\r?\n/);

  let matchIndex = -1;
  let pendingAnnotations: string[] = [];
  let captureStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (ANNOTATION_LINE.test(line)) {
      pendingAnnotations.push(trimmed);
      continue;
    }

    const m = METHOD_LINE.exec(line);
    if (!m || m[2] !== methodName) {
      if (trimmed && !trimmed.startsWith("@") && pendingAnnotations.length > 0) {
        pendingAnnotations = [];
      }
      continue;
    }

    if (matchIndex >= 0) {
      // 已有同名重载，继续找下一个（默认取第一个）
      continue;
    }

    matchIndex = i;
    captureStart = pendingAnnotations.length > 0 ? i - pendingAnnotations.length : i;
    pendingAnnotations = [];

    const bodyStart = findMethodBodyStart(lines, i);
    const endIndex = extractBalancedBlockEnd(lines, bodyStart);
    const slice = lines.slice(captureStart, endIndex + 1);
    return {
      methodName,
      code: slice.join("\n"),
      startLine: captureStart + 1,
      endLine: endIndex + 1,
    };
  }

  throw new Error(`未找到方法: ${methodName}`);
}

function findMethodBodyStart(lines: string[], methodLineIndex: number): number {
  for (let i = methodLineIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("{")) return i;
  }
  return methodLineIndex;
}

function extractBalancedBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          return i;
        }
      }
    }
  }

  return lines.length - 1;
}
