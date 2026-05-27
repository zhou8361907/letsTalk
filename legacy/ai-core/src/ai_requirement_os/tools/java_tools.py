"""Java 代码分析工具集"""

import re
from pathlib import Path
from typing import Optional, List, Dict, Any

import javalang
from langchain.tools import tool
from pydantic import BaseModel, Field


class ControllerInfo(BaseModel):
    """Controller 信息"""

    class_name: str = Field(description="Controller 类名")
    method_name: str = Field(description="方法名")
    file_path: str = Field(description="文件路径")
    method_signature: str = Field(description="方法签名")
    line_number: int = Field(description="行号")
    http_method: str = Field(description="HTTP 方法")
    url_pattern: str = Field(description="URL 模式")


class ClassFieldInfo(BaseModel):
    """类字段信息"""

    name: str = Field(description="字段名")
    type: str = Field(description="字段类型")
    comment: Optional[str] = Field(default=None, description="注释")
    annotations: List[str] = Field(default_factory=list, description="注解列表")


def _find_java_files(base_path: str, pattern: str = "**/*.java") -> List[Path]:
    """
    查找 Java 文件

    Args:
        base_path: 基础路径
        pattern: 文件匹配模式

    Returns:
        Java 文件路径列表
    """
    base = Path(base_path)
    if not base.exists():
        return []
    return list(base.glob(pattern))


def _parse_java_file(file_path: Path) -> Optional[javalang.tree.CompilationUnit]:
    """
    解析 Java 文件

    Args:
        file_path: Java 文件路径

    Returns:
        解析后的 AST 或 None
    """
    try:
        content = file_path.read_text(encoding="utf-8")
        tree = javalang.parse.parse(content)
        return tree
    except Exception as e:
        print(f"解析 Java 文件失败 {file_path}: {e}")
        return None


def _extract_mapping_annotation(annotations: List) -> Optional[tuple[str, str]]:
    """
    提取 Mapping 注解信息

    Args:
        annotations: 注解列表

    Returns:
        (HTTP方法, URL路径) 或 None
    """
    if not annotations:
        return None

    for annotation in annotations:
        if not hasattr(annotation, "name"):
            continue

        name = annotation.name
        # 处理各种 Mapping 注解
        method_map = {
            "GetMapping": "GET",
            "PostMapping": "POST",
            "PutMapping": "PUT",
            "DeleteMapping": "DELETE",
            "PatchMapping": "PATCH",
            "RequestMapping": "GET",  # 默认 GET
        }

        if name in method_map:
            # 提取 URL
            url = ""
            if hasattr(annotation, "element") and annotation.element:
                if isinstance(annotation.element, list):
                    for elem in annotation.element:
                        if hasattr(elem, "value") and hasattr(elem.value, "value"):
                            url = elem.value.value.strip('"')
                            break
                elif hasattr(annotation.element, "value"):
                    url = annotation.element.value.strip('"')

            # 对于 RequestMapping，尝试提取 method 参数
            http_method = method_map[name]
            if name == "RequestMapping" and hasattr(annotation, "element"):
                if isinstance(annotation.element, list):
                    for elem in annotation.element:
                        if (
                            hasattr(elem, "name")
                            and elem.name == "method"
                            and hasattr(elem, "value")
                        ):
                            method_value = str(elem.value)
                            if "POST" in method_value:
                                http_method = "POST"
                            elif "PUT" in method_value:
                                http_method = "PUT"
                            elif "DELETE" in method_value:
                                http_method = "DELETE"

            return (http_method, url)

    return None



@tool
def search_controller_by_url(
    method: str, url: str, backend_path: str = ""
) -> Optional[ControllerInfo]:
    """
    根据 HTTP 方法和 URL 查找对应的 Controller 方法

    Args:
        method: HTTP 方法，如 "GET", "POST"
        url: API 路径，如 "/api/detail/info"
        backend_path: 后端代码路径

    Returns:
        ControllerInfo 或 None
    """
    if not backend_path:
        return None

    # 查找所有 Controller 文件
    java_files = _find_java_files(backend_path, "**/*Controller.java")

    for file_path in java_files:
        tree = _parse_java_file(file_path)
        if not tree:
            continue

        # 遍历类
        for path, node in tree.filter(javalang.tree.ClassDeclaration):
            class_name = node.name
            if not class_name.endswith("Controller"):
                continue

            # 获取类级别的 RequestMapping
            class_base_url = ""
            if node.annotations:
                for ann in node.annotations:
                    if ann.name == "RequestMapping" and hasattr(ann, "element"):
                        if isinstance(ann.element, list):
                            for elem in ann.element:
                                if hasattr(elem, "value") and hasattr(elem.value, "value"):
                                    class_base_url = elem.value.value.strip('"')
                                    break
                        elif hasattr(ann.element, "value"):
                            class_base_url = ann.element.value.strip('"')

            # 遍历方法
            for method_node in node.methods:
                if not method_node.annotations:
                    continue

                mapping_info = _extract_mapping_annotation(method_node.annotations)
                if not mapping_info:
                    continue

                http_method, method_url = mapping_info

                # 组合完整 URL
                full_url = class_base_url + method_url
                full_url = full_url.replace("//", "/")

                # 匹配 URL（支持路径变量）
                url_pattern = re.sub(r"\{[^}]+\}", r"[^/]+", full_url)
                if re.match(f"^{url_pattern}$", url) and http_method.upper() == method.upper():
                    # 找到匹配的方法
                    return ControllerInfo(
                        class_name=class_name,
                        method_name=method_node.name,
                        file_path=str(file_path),
                        method_signature=f"{method_node.return_type} {method_node.name}(...)",
                        line_number=method_node.position.line if method_node.position else 0,
                        http_method=http_method,
                        url_pattern=full_url,
                    )

    return None


@tool
def get_method_source(
    class_name: str, method_name: str, backend_path: str = ""
) -> Optional[str]:
    """
    获取指定方法的源码

    Args:
        class_name: 类名
        method_name: 方法名
        backend_path: 后端代码路径

    Returns:
        方法源码或 None
    """
    if not backend_path:
        return None

    # 查找类文件
    java_files = _find_java_files(backend_path, f"**/{class_name}.java")

    for file_path in java_files:
        try:
            content = file_path.read_text(encoding="utf-8")
            lines = content.split("\n")

            tree = _parse_java_file(file_path)
            if not tree:
                continue

            # 查找方法
            for path, node in tree.filter(javalang.tree.MethodDeclaration):
                if node.name == method_name:
                    # 获取方法的起始和结束行
                    if not node.position:
                        continue

                    start_line = node.position.line - 1  # 转为 0-based index

                    # 查找方法结束位置（简单的大括号匹配）
                    brace_count = 0
                    end_line = start_line
                    found_start = False

                    for i in range(start_line, len(lines)):
                        line = lines[i]
                        if "{" in line:
                            found_start = True
                            brace_count += line.count("{")
                        if "}" in line:
                            brace_count -= line.count("}")

                        if found_start and brace_count == 0:
                            end_line = i
                            break

                    # 提取方法源码
                    method_source = "\n".join(lines[start_line : end_line + 1])
                    return method_source

        except Exception as e:
            print(f"读取文件失败 {file_path}: {e}")
            continue

    return None


@tool
def get_class_fields(class_name: str, backend_path: str = "") -> List[ClassFieldInfo]:
    """
    获取类的所有字段信息

    Args:
        class_name: 类名
        backend_path: 后端代码路径

    Returns:
        字段信息列表
    """
    if not backend_path:
        return []

    # 查找类文件
    java_files = _find_java_files(backend_path, f"**/{class_name}.java")

    for file_path in java_files:
        tree = _parse_java_file(file_path)
        if not tree:
            continue

        fields = []

        # 查找类
        for path, node in tree.filter(javalang.tree.ClassDeclaration):
            if node.name != class_name:
                continue

            # 遍历字段
            for field_decl in node.fields:
                for declarator in field_decl.declarators:
                    field_info = ClassFieldInfo(
                        name=declarator.name,
                        type=str(field_decl.type.name)
                        if hasattr(field_decl.type, "name")
                        else str(field_decl.type),
                        comment=field_decl.documentation if field_decl.documentation else None,
                        annotations=[
                            ann.name for ann in field_decl.annotations if hasattr(ann, "name")
                        ]
                        if field_decl.annotations
                        else [],
                    )
                    fields.append(field_info)

        return fields

    return []
