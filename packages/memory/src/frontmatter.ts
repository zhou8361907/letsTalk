export type MemoryConfidence = "draft" | "verified";

export interface MemoryMeta {
  topic: string;
  confidence: MemoryConfidence;
  tags?: string[];
  updated_at: string;
  sources?: string[];
}

export function buildMemoryMarkdown(meta: MemoryMeta, body: string): string {
  const lines = ["---", `topic: ${meta.topic}`, `confidence: ${meta.confidence}`];
  if (meta.tags?.length) {
    lines.push(`tags: [${meta.tags.join(", ")}]`);
  }
  lines.push(`updated_at: ${meta.updated_at}`);
  if (meta.sources?.length) {
    lines.push("sources:");
    for (const s of meta.sources) {
      lines.push(`  - ${s}`);
    }
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

export function parseMemoryMarkdown(raw: string): {
  meta: Partial<MemoryMeta>;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) {
    return { meta: {}, body: raw };
  }
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");

  const meta: Partial<MemoryMeta> = {};
  let inSources = false;
  const sources: string[] = [];

  for (const line of fm.split("\n")) {
    if (inSources) {
      const m = line.match(/^\s*-\s+(.+)$/);
      if (m) {
        sources.push(m[1].trim());
        continue;
      }
      inSources = false;
    }
    if (line.startsWith("topic:")) meta.topic = line.slice(6).trim();
    else if (line.startsWith("confidence:")) {
      meta.confidence = line.slice(11).trim() as MemoryConfidence;
    } else if (line.startsWith("tags:")) {
      const inner = line.slice(5).trim().replace(/^\[|\]$/g, "");
      meta.tags = inner
        ? inner.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    } else if (line.startsWith("updated_at:")) {
      meta.updated_at = line.slice(11).trim();
    } else if (line.startsWith("sources:")) {
      inSources = true;
    }
  }
  if (sources.length) meta.sources = sources;

  return { meta, body };
}
