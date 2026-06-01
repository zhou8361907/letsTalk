export interface SaveMemoryValidation {
  warnings: string[];
  /** 硬拒绝写入（明显违反 memory 边界） */
  blocked?: string;
}

const REST_LINE = /^\s*(GET|POST|PUT|DELETE|PATCH)\s+\/\S+/im;
const WORKSPACE_PATH = /(?:workFront|workBack)\/[^\s)\]`]+/g;
const EPHEMERAL_HINT =
  /(?:当前\s*PR|本周\s*PR|feature\/|正在改(?:的)?|今天改了|当前分支)/i;

/** save 前可推导性 / 反模式检查（ShareAI s09） */
export function validateSaveMemoryContent(content: string): SaveMemoryValidation {
  const warnings: string[] = [];
  const text = content.trim();
  if (!text) {
    return { warnings: [], blocked: "content 不能为空" };
  }

  const restLines = text.split("\n").filter((line) => REST_LINE.test(line));
  if (restLines.length >= 8) {
    return {
      warnings: [],
      blocked:
        "正文含大量 REST 接口（≥8 条），应写入「怎么查」策略而非 API 快照；请改写后重试。",
    };
  }
  if (restLines.length >= 4) {
    warnings.push(
      "检测到多条 REST 路径；memory 只存怎么查，不存接口列表。如确实需要可保留 1-2 条示例。",
    );
  }

  const paths = text.match(WORKSPACE_PATH) ?? [];
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length >= 5) {
    warnings.push(
      `正文含 ${uniquePaths.length} 处代码路径；可保留 1～2 个 sources，其余改为 grep/list_methods 策略。`,
    );
  }

  if (EPHEMERAL_HINT.test(text)) {
    warnings.push(
      "含当前 PR/分支/进度类表述，易过时；请提炼跨会话仍成立的非显然信息。",
    );
  }

  if (
    text.length > 2500 &&
    !text.includes("## 怎么查") &&
    !text.includes("## 含义")
  ) {
    warnings.push("正文较长且缺少结构化小节；建议按 glossary/history 模板组织。");
  }

  return { warnings };
}
