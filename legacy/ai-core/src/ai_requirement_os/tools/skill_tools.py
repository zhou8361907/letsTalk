"""Skill 相关工具 - 用于查询和操作 Skills

提供以下工具：
1. find_skill - 在当前页面查找 Skill
2. get_skill_implementation - 获取 Skill 的实现细节
3. get_code_location - 获取代码位置
4. find_similar_skills - 跨页面查找相似 Skills
5. generate_code - 基于 Skill 生成代码
"""

from typing import Dict, Any, List, Optional
import json
from pathlib import Path

from ..simple_agent import ToolRegistry


# 创建工具注册器
skill_tools_registry = ToolRegistry()


@skill_tools_registry.register(
    name="find_skill",
    description="在当前页面查找指定的 Skill（支持模糊匹配）",
    parameters={
        "type": "object",
        "properties": {
            "skill_name": {
                "type": "string",
                "description": "Skill 名称或关键词（例如：'保存'、'删除'、'加载数据'）"
            }
        },
        "required": ["skill_name"]
    }
)
def find_skill(skill_name: str, context=None) -> Dict[str, Any]:
    """在当前页面查找 Skill
    
    Args:
        skill_name: Skill 名称或关键词
        context: PageContext 对象（由 Agent 注入）
        
    Returns:
        Skill 信息字典
    """
    if context is None:
        return {"error": "没有页面上下文"}
    
    # 搜索 Skills
    skills = context.search_skills(skill_name)
    
    if not skills:
        return {
            "found": False,
            "message": f"未找到包含 '{skill_name}' 的 Skill"
        }
    
    # 返回第一个匹配的 Skill
    skill = skills[0]
    
    return {
        "found": True,
        "skill": {
            "id": skill.skill_id,
            "name": skill.skill_name,
            "type": skill.skill_type,
            "description": skill.business_description,
            "trigger": skill.trigger,
            "dependencies": skill.dependencies,
            "side_effects": skill.side_effects
        }
    }


@skill_tools_registry.register(
    name="get_skill_implementation",
    description="获取 Skill 的完整实现细节（前端、API、后端、数据库）",
    parameters={
        "type": "object",
        "properties": {
            "skill_id": {
                "type": "string",
                "description": "Skill ID"
            }
        },
        "required": ["skill_id"]
    }
)
def get_skill_implementation(skill_id: str, context=None) -> Dict[str, Any]:
    """获取 Skill 的实现细节
    
    Args:
        skill_id: Skill ID
        context: PageContext 对象
        
    Returns:
        实现细节字典
    """
    if context is None:
        return {"error": "没有页面上下文"}
    
    skill = context.get_skill_by_id(skill_id)
    
    if not skill:
        return {"error": f"未找到 Skill: {skill_id}"}
    
    return {
        "skill_id": skill.skill_id,
        "skill_name": skill.skill_name,
        "implementation": skill.implementation,
        "data_flow": skill.data_flow,
        "validations": skill.validations,
        "error_handling": skill.error_handling
    }


@skill_tools_registry.register(
    name="get_code_location",
    description="获取 Skill 的代码位置（文件路径和行号）",
    parameters={
        "type": "object",
        "properties": {
            "skill_id": {
                "type": "string",
                "description": "Skill ID"
            },
            "layer": {
                "type": "string",
                "description": "代码层（frontend, api, backend）",
                "enum": ["frontend", "api", "backend", "all"]
            }
        },
        "required": ["skill_id"]
    }
)
def get_code_location(
    skill_id: str,
    layer: str = "all",
    context=None
) -> Dict[str, Any]:
    """获取代码位置
    
    Args:
        skill_id: Skill ID
        layer: 代码层（frontend, api, backend, all）
        context: PageContext 对象
        
    Returns:
        代码位置字典
    """
    if context is None:
        return {"error": "没有页面上下文"}
    
    skill = context.get_skill_by_id(skill_id)
    
    if not skill:
        return {"error": f"未找到 Skill: {skill_id}"}
    
    implementation = skill.implementation
    locations = {}
    
    # 前端位置
    if layer in ["frontend", "all"] and "frontend" in implementation:
        frontend = implementation["frontend"]
        locations["frontend"] = {
            "file": frontend.get("file"),
            "method": frontend.get("method"),
            "line": frontend.get("line"),
            "code_snippet": frontend.get("code_snippet")
        }
    
    # API 位置
    if layer in ["api", "all"] and "api" in implementation:
        api = implementation["api"]
        locations["api"] = {
            "method": api.get("method"),
            "url": api.get("url"),
            "params": api.get("params"),
            "payload": api.get("payload"),
            "response": api.get("response")
        }
    
    # 后端位置
    if layer in ["backend", "all"] and "backend" in implementation:
        backend = implementation["backend"]
        locations["backend"] = {}
        
        if "controller" in backend:
            controller = backend["controller"]
            locations["backend"]["controller"] = {
                "class": controller.get("class"),
                "method": controller.get("method"),
                "file": controller.get("file"),
                "line": controller.get("line"),
                "signature": controller.get("signature")
            }
        
        if "service" in backend:
            service = backend["service"]
            locations["backend"]["service"] = {
                "class": service.get("class"),
                "method": service.get("method"),
                "file": service.get("file"),
                "line": service.get("line"),
                "logic": service.get("logic")
            }
        
        if "database" in backend:
            database = backend["database"]
            locations["backend"]["database"] = {
                "table": database.get("table"),
                "operation": database.get("operation"),
                "conditions": database.get("conditions"),
                "affected_tables": database.get("affected_tables")
            }
    
    return {
        "skill_id": skill_id,
        "skill_name": skill.skill_name,
        "locations": locations
    }


@skill_tools_registry.register(
    name="find_similar_skills",
    description="在其他页面查找类似的 Skills（用于参考和代码生成）",
    parameters={
        "type": "object",
        "properties": {
            "keyword": {
                "type": "string",
                "description": "关键词（例如：'导入'、'导出'、'批量删除'）"
            },
            "skill_type": {
                "type": "string",
                "description": "Skill 类型（query, mutation, navigation）",
                "enum": ["query", "mutation", "navigation", "all"]
            }
        },
        "required": ["keyword"]
    }
)
def find_similar_skills(
    keyword: str,
    skill_type: str = "all",
    context=None
) -> Dict[str, Any]:
    """跨页面查找相似 Skills
    
    Args:
        keyword: 关键词
        skill_type: Skill 类型
        context: PageContext 对象
        
    Returns:
        相似 Skills 列表
    """
    # TODO: 实现跨页面搜索
    # 这需要一个全局的 Skill 数据库或索引
    
    return {
        "keyword": keyword,
        "skill_type": skill_type,
        "results": [
            {
                "page": "UserList.vue",
                "skill_name": "批量导入用户",
                "skill_id": "user_import",
                "similarity": 0.85,
                "description": "从 Excel 文件批量导入用户数据"
            },
            {
                "page": "ProductList.vue",
                "skill_name": "Excel 导入",
                "skill_id": "product_import",
                "similarity": 0.78,
                "description": "导入产品数据"
            }
        ],
        "note": "这是一个示例结果，实际需要实现全局搜索"
    }


@skill_tools_registry.register(
    name="generate_code",
    description="基于现有 Skill 生成新功能的代码",
    parameters={
        "type": "object",
        "properties": {
            "template_skill_id": {
                "type": "string",
                "description": "模板 Skill ID（参考的现有功能）"
            },
            "new_feature_description": {
                "type": "string",
                "description": "新功能描述"
            },
            "layer": {
                "type": "string",
                "description": "生成哪一层的代码（frontend, backend, all）",
                "enum": ["frontend", "backend", "all"]
            }
        },
        "required": ["template_skill_id", "new_feature_description"]
    }
)
def generate_code(
    template_skill_id: str,
    new_feature_description: str,
    layer: str = "all",
    context=None
) -> Dict[str, Any]:
    """基于现有 Skill 生成代码
    
    Args:
        template_skill_id: 模板 Skill ID
        new_feature_description: 新功能描述
        layer: 生成哪一层的代码
        context: PageContext 对象
        
    Returns:
        生成的代码
    """
    if context is None:
        return {"error": "没有页面上下文"}
    
    skill = context.get_skill_by_id(template_skill_id)
    
    if not skill:
        return {"error": f"未找到模板 Skill: {template_skill_id}"}
    
    # TODO: 实现代码生成逻辑
    # 这需要调用 LLM 基于模板生成新代码
    
    return {
        "template_skill": skill.skill_name,
        "new_feature": new_feature_description,
        "generated_code": {
            "frontend": "// 前端代码\n// TODO: 实现代码生成",
            "backend": "// 后端代码\n// TODO: 实现代码生成"
        },
        "note": "这是一个示例结果，实际需要实现代码生成逻辑"
    }


@skill_tools_registry.register(
    name="analyze_page",
    description="分析页面并提取 Skills（V1 页面分析功能）",
    parameters={
        "type": "object",
        "properties": {
            "page_path": {
                "type": "string",
                "description": "页面文件路径"
            }
        },
        "required": ["page_path"]
    }
)
def analyze_page(page_path: str) -> Dict[str, Any]:
    """分析页面并提取 Skills
    
    Args:
        page_path: 页面文件路径
        
    Returns:
        页面信息和 Skills
    """
    # TODO: 调用 V1 的页面分析功能
    # 这需要集成现有的 page_analysis.py
    
    # 示例返回（实际需要调用 V1 分析）
    return {
        "page_info": {
            "page_name": "Detail",
            "page_path": page_path,
            "module": "财务管理",
            "description": "明细数据管理页面"
        },
        "skills": [
            {
                "skill_id": "detail_load_data",
                "skill_name": "加载明细数据",
                "skill_type": "query",
                "business_description": "页面打开时自动加载明细列表",
                "trigger": {
                    "type": "lifecycle",
                    "event": "mounted"
                },
                "implementation": {
                    "frontend": {
                        "method": "loadData",
                        "file": "Detail.vue",
                        "line": 45,
                        "code_snippet": "async loadData() { ... }"
                    },
                    "api": {
                        "method": "GET",
                        "url": "/api/detail",
                        "params": {
                            "accountId": "账户ID",
                            "dateRange": "日期范围"
                        }
                    },
                    "backend": {
                        "controller": {
                            "class": "DetailController",
                            "method": "list",
                            "file": "DetailController.java",
                            "line": 38
                        }
                    }
                },
                "data_flow": [
                    "用户打开页面",
                    "触发 mounted 生命周期",
                    "调用 loadData() 方法",
                    "发送 GET /api/detail 请求",
                    "后端返回数据",
                    "前端更新 tableData"
                ],
                "dependencies": [],
                "side_effects": ["更新 tableData"],
                "validations": {},
                "error_handling": {
                    "frontend": "显示错误提示"
                }
            }
        ],
        "note": "这是一个示例结果，实际需要调用 V1 分析"
    }


def get_all_skill_tools():
    """获取所有 Skill 工具"""
    return skill_tools_registry.get_all()
