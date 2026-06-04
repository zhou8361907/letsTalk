export const SKILLS_DIR_REL = ".agent/skills";
export const SKILLS_INDEX_CACHE_REL = ".agent/skills/.skills-index.json";
export const BUNDLED_SKILLS_REL = "packages/skills-bundled";

export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_CONTENT_CHARS = 100_000;
export const MAX_SKILL_FILE_BYTES = 1_048_576;
export const MAX_INDEX_SKILLS = 80;
export const MAX_INDEX_CHARS = 3_000;

export const VALID_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export const ALLOWED_SUBDIRS = new Set([
  "references",
  "templates",
  "scripts",
  "assets",
]);

export const EXCLUDED_SKILL_DIRS = new Set([
  ".git",
  ".github",
  ".hub",
  ".archive",
]);

export const INJECTION_PATTERNS = [
  "ignore previous instructions",
  "ignore all previous",
  "you are now",
  "disregard your",
  "forget your instructions",
  "new instructions:",
  "system prompt:",
  "<system>",
  "]]>",
];
