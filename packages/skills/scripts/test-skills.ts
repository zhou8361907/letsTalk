import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSkillsSystemBlock,
  getSkillIndex,
  installBundledSkillsIfEmpty,
  manageSkill,
  parseSkillMarkdown,
  readSkillContent,
} from "../src/index.js";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "lt-skills-"));
  try {
    const sampleSkill = `---
name: test-skill
description: A test skill
metadata:
  letsTalk:
    source: bundled
---

# Test

Do the thing.
`;

    const create = await manageSkill(root, {
      action: "create",
      name: "test-skill",
      category: "qa",
      content: sampleSkill,
    });
    assert.equal(create.success, true);

    const parsed = parseSkillMarkdown(sampleSkill);
    assert.equal(parsed.frontmatter.name, "test-skill");

    const view = await readSkillContent(root, "test-skill");
    assert.equal(view.success, true);
    assert.ok(view.content?.includes("Do the thing"));

    const patchBlocked = await manageSkill(root, {
      action: "patch",
      name: "test-skill",
      old_string: "Do the thing.",
      new_string: "Do other thing.",
    });
    assert.equal(patchBlocked.success, false);

    const index = await getSkillIndex(root, { force: true });
    assert.equal(index.length, 1);
    assert.equal(index[0].protected, true);

    const block = buildSkillsSystemBlock(index);
    assert.ok(block.includes("<available_skills>"));
    assert.ok(block.includes("test-skill"));

    const userCreate = await manageSkill(root, {
      action: "create",
      name: "user-flow",
      category: "user",
      content: `---
name: user-flow
description: User workflow
---

Steps here.
`,
    });
    assert.equal(userCreate.success, true);

    const userPatch = await manageSkill(root, {
      action: "patch",
      name: "user-flow",
      old_string: "Steps here.",
      new_string: "Updated steps.",
    });
    assert.equal(userPatch.success, true);

    console.log("packages/skills: all tests passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
