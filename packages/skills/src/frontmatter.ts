export interface SkillLetsTalkMeta {
  source?: string;
}

export interface SkillMetadata {
  letsTalk?: SkillLetsTalkMeta;
  [key: string]: unknown;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  metadata?: SkillMetadata;
  [key: string]: unknown;
}

export function parseSkillMarkdown(raw: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) {
    return { frontmatter: {}, body: raw };
  }
  const fmText = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: parseSimpleYaml(fmText), body };
}

/** 轻量 YAML 解析（支持 name、description、metadata.letsTalk.source） */
function parseSimpleYaml(text: string): SkillFrontmatter {
  const result: SkillFrontmatter = {};
  let currentKey: string | null = null;
  let metadata: SkillMetadata | undefined;
  let letsTalk: SkillLetsTalkMeta | undefined;
  let inMetadata = false;
  let inLetsTalk = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (inLetsTalk && /^\S/.test(line) && !line.startsWith("  ")) {
      inLetsTalk = false;
      inMetadata = false;
    } else if (inMetadata && /^\S/.test(line) && !line.startsWith("  ")) {
      inMetadata = false;
      inLetsTalk = false;
    }

    if (trimmed === "metadata:") {
      metadata = metadata ?? {};
      result.metadata = metadata;
      inMetadata = true;
      inLetsTalk = false;
      continue;
    }
    if (inMetadata && trimmed === "letsTalk:") {
      letsTalk = letsTalk ?? {};
      metadata!.letsTalk = letsTalk;
      inLetsTalk = true;
      continue;
    }

    const topMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (topMatch && !line.startsWith("  ")) {
      const key = topMatch[1];
      const value = topMatch[2].trim();
      currentKey = key;
      if (key === "name") result.name = stripQuotes(value);
      else if (key === "description") result.description = stripQuotes(value);
      else if (key === "version") result.version = stripQuotes(value);
      continue;
    }

    const nestedMatch = line.match(/^\s+([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (nestedMatch) {
      const key = nestedMatch[1];
      const value = nestedMatch[2].trim();
      if (inLetsTalk && letsTalk) {
        if (key === "source") letsTalk.source = stripQuotes(value);
      } else if (inMetadata && metadata) {
        metadata[key] = stripQuotes(value);
      } else if (currentKey === "metadata" && key === "letsTalk") {
        metadata = metadata ?? {};
        result.metadata = metadata;
        letsTalk = {};
        metadata.letsTalk = letsTalk;
        inLetsTalk = true;
      }
    }
  }

  return result;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function getSkillSource(frontmatter: SkillFrontmatter): string | undefined {
  const src = frontmatter.metadata?.letsTalk?.source;
  return typeof src === "string" ? src : undefined;
}

export function isSkillProtected(frontmatter: SkillFrontmatter): boolean {
  return getSkillSource(frontmatter) === "bundled";
}

export function scanInjectionRisk(content: string): string | null {
  const lower = content.toLowerCase();
  for (const pattern of [
    "ignore previous instructions",
    "ignore all previous",
    "you are now",
    "disregard your",
    "forget your instructions",
    "new instructions:",
    "system prompt:",
    "<system>",
  ]) {
    if (lower.includes(pattern)) {
      return `内容含可疑指令片段：${pattern}`;
    }
  }
  return null;
}
