/**
 * Pi 自定义工具：Skills（渐进披露 + skill_manage）
 */

import {
  ensureSkillsReady,
  getSkillIndex,
  manageSkill,
  readSkillContent,
  type SkillManageAction,
} from "@lets-talk/skills";
import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const skillManageActionSchema = Type.Union([
  Type.Literal("create"),
  Type.Literal("edit"),
  Type.Literal("patch"),
  Type.Literal("delete"),
  Type.Literal("write_file"),
  Type.Literal("remove_file"),
]);

function jsonText(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

export function createSkillTools(workspaceRoot: string): ToolDefinition[] {
  const skillsListTool = defineTool({
    name: "skills_list",
    label: "Skills list",
    description:
      "列出 .agent/skills/ 下所有 skill 的 name、description、category。完整正文用 skill_view。",
    promptSnippet: "skills_list()",
    promptGuidelines: [
      "索引已在 system；需要刷新或查 category 时调用。",
      "匹配任务后必须 skill_view(name) 加载全文。",
    ],
    parameters: Type.Object({}),
    execute: async () => {
      await ensureSkillsReady(workspaceRoot);
      const skills = await getSkillIndex(workspaceRoot, { force: true });
      const categories = [...new Set(skills.map((s) => s.category))].sort();
      return jsonText({
        success: true,
        skills,
        categories,
        count: skills.length,
        hint: "Use skill_view(name) for full SKILL.md",
      });
    },
  });

  const skillViewTool = defineTool({
    name: "skill_view",
    label: "Skill view",
    description:
      "加载 skill 全文（SKILL.md）或附属文件（references/ templates/ scripts/ assets/）。",
    promptSnippet: "skill_view(name, file_path?)",
    promptGuidelines: [
      "任务匹配任一 skill 时必须先加载再执行。",
      "file_path 示例：references/api.md",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "skill name 或 category/name 路径" }),
      file_path: Type.Optional(
        Type.String({ description: "附属文件相对 skill 目录的路径" }),
      ),
    }),
    execute: async (_id, params) => {
      await ensureSkillsReady(workspaceRoot);
      const result = await readSkillContent(
        workspaceRoot,
        params.name,
        params.file_path,
      );
      return jsonText(result);
    },
  });

  const skillManageTool = defineTool({
    name: "skill_manage",
    label: "Skill manage",
    description:
      "管理 .agent/skills/ 程序性记忆。create/patch 保存可复用流程；bundled skill 只读不可改。",
    promptSnippet:
      "skill_manage(action, name, content?, category?, old_string?, new_string?, file_path?, file_content?)",
    promptGuidelines: [
      "复杂任务（5+ 工具调用）成功后 create 或 patch skill。",
      "更新优先 patch，勿 edit 整篇。",
      "bundled skill 不可 delete/edit/patch，需新建用户 skill。",
      "勿用 write/edit 改 .agent/skills/。",
    ],
    parameters: Type.Object({
      action: skillManageActionSchema,
      name: Type.String({ description: "skill name" }),
      content: Type.Optional(
        Type.String({ description: "create/edit 的完整 SKILL.md" }),
      ),
      category: Type.Optional(
        Type.String({ description: "create 时目录分类，默认 user" }),
      ),
      file_path: Type.Optional(
        Type.String({ description: "patch/write_file/remove_file 目标路径" }),
      ),
      file_content: Type.Optional(
        Type.String({ description: "write_file 内容" }),
      ),
      old_string: Type.Optional(Type.String({ description: "patch 查找" })),
      new_string: Type.Optional(Type.String({ description: "patch 替换" })),
      replace_all: Type.Optional(Type.Boolean({ description: "patch 全局替换" })),
    }),
    execute: async (_id, params) => {
      await ensureSkillsReady(workspaceRoot);
      const result = await manageSkill(workspaceRoot, {
        action: params.action as SkillManageAction,
        name: params.name,
        content: params.content,
        category: params.category,
        file_path: params.file_path,
        file_content: params.file_content,
        old_string: params.old_string,
        new_string: params.new_string,
        replace_all: params.replace_all,
      });
      return jsonText(result);
    },
  });

  return [skillsListTool, skillViewTool, skillManageTool];
}

/** 后台 review 仅 skill_manage */
export function createSkillManageOnlyTool(
  workspaceRoot: string,
): ToolDefinition {
  const tools = createSkillTools(workspaceRoot);
  const manage = tools.find((t) => t.name === "skill_manage");
  if (!manage) {
    throw new Error("skill_manage tool missing");
  }
  return manage;
}
