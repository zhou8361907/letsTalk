"""Vue 代码分析工具集"""

import re
from pathlib import Path
from typing import List, Dict, Any, Optional

from langchain.tools import tool
from pydantic import BaseModel, Field


class ApiCall(BaseModel):
    """API 调用信息"""

    method: str = Field(description="HTTP 方法")
    url: str = Field(description="API URL")
    trigger: str = Field(description="触发位置")
    line_number: int = Field(description="行号")


class FormField(BaseModel):
    """表单字段信息"""

    name: str = Field(description="字段名")
    label: str = Field(description="字段标签")
    type: str = Field(description="字段类型")
    required: bool = Field(default=False, description="是否必填")
    default_value: Optional[Any] = Field(default=None, description="默认值")


@tool
def parse_vue_ast(file_path: str) -> Dict[str, Any]:
    """
    解析 Vue 文件的 AST 结构

    Args:
        file_path: Vue 文件路径

    Returns:
        包含 template, script, style 的字典
    """
    try:
        content = Path(file_path).read_text(encoding="utf-8")
    except Exception as e:
        return {"error": f"读取文件失败: {e}", "file_path": file_path}

    # 简单的正则提取（生产环境建议用 tree-sitter）
    template_match = re.search(r"<template>(.*?)</template>", content, re.DOTALL)
    script_match = re.search(r"<script.*?>(.*?)</script>", content, re.DOTALL)
    style_match = re.search(r"<style.*?>(.*?)</style>", content, re.DOTALL)

    return {
        "template": template_match.group(1).strip() if template_match else "",
        "script": script_match.group(1).strip() if script_match else "",
        "style": style_match.group(1).strip() if style_match else "",
        "file_path": file_path,
    }


@tool
def extract_api_calls(file_path: str) -> List[ApiCall]:
    """
    提取 Vue 文件中的所有 API 调用

    Args:
        file_path: Vue 文件路径

    Returns:
        API 调用列表
    """
    ast = parse_vue_ast.invoke({"file_path": file_path})
    if "error" in ast:
        return []

    script = ast["script"]
    api_calls = []

    # 匹配各种 API 调用模式
    patterns = [
        # axios.get('/api/user')
        (r"axios\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", "axios"),
        # this.$http.get('/api/user') 或 this.$http.delete(`/api/user/${id}`)
        (r"\$http\.(get|post|put|delete|patch)\s*\(\s*['\"`]([^'\"`]+)['\"`]", "$http"),
        # fetch('/api', {method: 'POST'})
        (r"fetch\s*\(\s*['\"]([^'\"]+)['\"].*?method:\s*['\"](\w+)['\"]", "fetch"),
        # request.get('/api/user')
        (r"request\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", "request"),
    ]

    for line_num, line in enumerate(script.split("\n"), 1):
        for pattern, api_type in patterns:
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                groups = match.groups()

                # 根据不同的模式提取 method 和 url
                if api_type == "fetch":
                    url, method = groups
                else:
                    method, url = groups

                # 尝试识别触发位置
                trigger = "unknown"
                # 查找函数名
                func_match = re.search(r"(async\s+)?(\w+)\s*\([^)]*\)\s*{", line)
                if func_match:
                    trigger = func_match.group(2)
                # 查找生命周期钩子
                elif "onMounted" in line:
                    trigger = "onMounted"
                elif "onCreated" in line:
                    trigger = "onCreated"
                elif "mounted" in line:
                    trigger = "mounted"
                elif "created" in line:
                    trigger = "created"

                api_calls.append(
                    ApiCall(
                        method=method.upper(),
                        url=url,
                        trigger=trigger,
                        line_number=line_num,
                    )
                )

    return api_calls


@tool
def get_form_fields(file_path: str) -> List[FormField]:
    """
    提取 Vue 文件中的表单字段

    Args:
        file_path: Vue 文件路径

    Returns:
        表单字段列表
    """
    ast = parse_vue_ast.invoke({"file_path": file_path})
    if "error" in ast:
        return []

    template = ast["template"]
    fields = []

    # 匹配 Element UI 表单组件
    patterns = [
        # <el-form-item label="用户名" prop="userName">
        #   <el-input v-model="form.userName" />
        # </el-form-item>
        r'<el-form-item[^>]*label=["\']([^"\']*)["\'][^>]*>.*?v-model=["\']([^"\']*)["\']',
        # <el-input v-model="userName" placeholder="用户名" />
        r'<el-input[^>]*v-model=["\']([^"\']*)["\'][^>]*placeholder=["\']([^"\']*)["\']',
    ]

    for pattern in patterns:
        matches = re.finditer(pattern, template, re.DOTALL)
        for match in matches:
            groups = match.groups()

            if len(groups) == 2:
                label, model = groups
                # 清理 model 名称（去掉 form. 前缀）
                model = model.split(".")[-1]

                # 检查是否必填
                required = "required" in match.group(0) or ":required" in match.group(0)

                # 识别字段类型
                field_type = "input"
                if "el-select" in match.group(0):
                    field_type = "select"
                elif "el-date-picker" in match.group(0):
                    field_type = "date-picker"
                elif "el-input-number" in match.group(0):
                    field_type = "input-number"
                elif "el-switch" in match.group(0):
                    field_type = "switch"
                elif "el-checkbox" in match.group(0):
                    field_type = "checkbox"
                elif "el-radio" in match.group(0):
                    field_type = "radio"

                fields.append(
                    FormField(
                        name=model,
                        label=label,
                        type=field_type,
                        required=required,
                    )
                )

    # 去重
    seen = set()
    unique_fields = []
    for field in fields:
        key = (field.name, field.label)
        if key not in seen:
            seen.add(key)
            unique_fields.append(field)

    return unique_fields
