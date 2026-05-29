/**
 * Pi 自定义工具：Java 方法级导航（阶段 3）
 * 大 Controller 优先 list_methods → read_method，避免 read 整文件。
 */

import { listMethods, readMethod, resolveJavaFile } from "@lets-talk/ast-tools";
import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const filePathParam = Type.Object({
  filePath: Type.String({
    description:
      "相对工作区根的路径，如 workBack/src/main/java/erp/controller/DetailController.java",
  }),
});

const readMethodParams = Type.Object({
  filePath: Type.String({
    description: "Java 文件路径（相对工作区根）",
  }),
  methodName: Type.String({
    description: "方法名，来自 list_methods 的 name 字段",
  }),
});

/**
 * 注册 Pi 自定义工具 list_methods / read_method。
 * @param workspaceRoot WORKSPACE_ROOT，用于把相对路径 resolve 为绝对路径
 */
export function createJavaAstTools(workspaceRoot: string): ToolDefinition[] {
  const resolveFile = (filePath: string) => resolveJavaFile(workspaceRoot, filePath);

  const listMethodsTool = defineTool({
    name: "list_methods",
    label: "List Java Methods",
    description:
      "列出 Java 类的方法签名与 Spring 映射注解（无方法体）。大文件、Controller 请优先用此工具，不要 read 整文件。",
    promptSnippet: "list_methods(filePath) — Java 类方法签名列表",
    promptGuidelines: [
      "对所有 *Controller.java：一律先 list_methods（与行数无关），需要方法体再用 read_method。",
      "对其它超过约 400 行或 read 会截断的 Java 类，同样先 list_methods。",
      "不要用 read 读取整个大 Java 文件（尤其 1000 行以上的 Controller/Service）。",
    ],
    parameters: filePathParam,
    execute: async (_id, params) => {
      const abs = resolveFile(params.filePath);
      const result = await listMethods(abs);
      const text = JSON.stringify(
        {
          className: result.className,
          methodCount: result.methods.length,
          methods: result.methods.map((m) => ({
            name: m.name,
            signature: m.signature,
            annotations: m.annotations,
            line: m.startLine,
          })),
        },
        null,
        2,
      );
      return {
        content: [{ type: "text", text }],
        details: result,
      };
    },
  });

  const readMethodTool = defineTool({
    name: "read_method",
    label: "Read Java Method",
    description:
      "读取 Java 类中单个方法的完整代码（含注解与方法体）。需先 list_methods 获知 methodName。",
    promptSnippet: "read_method(filePath, methodName) — 单方法完整代码",
    parameters: readMethodParams,
    execute: async (_id, params) => {
      const abs = resolveFile(params.filePath);
      const result = await readMethod(abs, params.methodName);
      const header = `// ${params.filePath} :: ${params.methodName} (L${result.startLine}-L${result.endLine})\n`;
      return {
        content: [{ type: "text", text: header + result.code }],
        details: result,
      };
    },
  });

  return [listMethodsTool, readMethodTool];
}
