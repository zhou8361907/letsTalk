"""页面上下文管理器 - 管理当前页面的 Skills 和对话历史

核心功能：
1. 管理当前页面上下文
2. 保存页面 Skills
3. 管理对话历史
4. 提供上下文字符串
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Message:
    """对话消息"""
    role: str  # user, assistant, tool
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    tool_calls: Optional[List[Dict]] = None
    tool_call_id: Optional[str] = None


@dataclass
class PageSkill:
    """页面 Skill"""
    skill_id: str
    skill_name: str
    skill_type: str  # query, mutation, navigation
    business_description: str
    trigger: Dict[str, Any]
    implementation: Dict[str, Any]
    data_flow: List[str]
    dependencies: List[str] = field(default_factory=list)
    side_effects: List[str] = field(default_factory=list)
    validations: Dict[str, List[str]] = field(default_factory=dict)
    error_handling: Dict[str, str] = field(default_factory=dict)


@dataclass
class PageInfo:
    """页面信息"""
    page_name: str
    page_path: str
    module: str
    description: str
    skills: List[PageSkill] = field(default_factory=list)


class PageContext:
    """页面上下文管理器
    
    使用示例：
    ```python
    context = PageContext()
    
    # 进入页面
    page_info = context.enter_page("Detail.vue", skills)
    
    # 获取当前上下文
    context_str = context.get_context()
    
    # 添加消息
    context.add_message("user", "保存功能怎么实现的？")
    context.add_message("assistant", "保存功能的实现...")
    
    # 切换页面
    context.enter_page("Login.vue", new_skills)
    ```
    """
    
    def __init__(self):
        self.current_page: Optional[str] = None
        self.page_info: Optional[PageInfo] = None
        self.conversation_history: List[Message] = []
        self.max_history = 50  # 最多保留 50 条消息
    
    def enter_page(
        self,
        page_path: str,
        page_info: Dict[str, Any]
    ) -> PageInfo:
        """进入页面
        
        Args:
            page_path: 页面路径
            page_info: 页面信息（包含 Skills）
            
        Returns:
            PageInfo 对象
        """
        # 解析页面信息
        info = page_info.get("page_info", {})
        skills_data = page_info.get("skills", [])
        
        # 创建 PageSkill 对象
        skills = []
        for skill_data in skills_data:
            skill = PageSkill(
                skill_id=skill_data.get("skill_id", ""),
                skill_name=skill_data.get("skill_name", ""),
                skill_type=skill_data.get("skill_type", ""),
                business_description=skill_data.get("business_description", ""),
                trigger=skill_data.get("trigger", {}),
                implementation=skill_data.get("implementation", {}),
                data_flow=skill_data.get("data_flow", []),
                dependencies=skill_data.get("dependencies", []),
                side_effects=skill_data.get("side_effects", []),
                validations=skill_data.get("validations", {}),
                error_handling=skill_data.get("error_handling", {})
            )
            skills.append(skill)
        
        # 创建 PageInfo
        self.page_info = PageInfo(
            page_name=info.get("page_name", ""),
            page_path=info.get("page_path", page_path),
            module=info.get("module", ""),
            description=info.get("description", ""),
            skills=skills
        )
        
        self.current_page = page_path
        
        # 清空对话历史（新页面新对话）
        self.conversation_history = []
        
        return self.page_info
    
    def add_message(
        self,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict]] = None,
        tool_call_id: Optional[str] = None
    ):
        """添加消息到历史
        
        Args:
            role: 角色（user, assistant, tool）
            content: 内容
            tool_calls: 工具调用列表
            tool_call_id: 工具调用 ID
        """
        message = Message(
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id
        )
        
        self.conversation_history.append(message)
        
        # 限制历史长度
        if len(self.conversation_history) > self.max_history:
            self.conversation_history = self.conversation_history[-self.max_history:]
    
    def get_context(self, include_history: bool = True) -> str:
        """获取当前上下文字符串
        
        Args:
            include_history: 是否包含对话历史
            
        Returns:
            上下文字符串
        """
        if not self.page_info:
            return "当前没有加载任何页面"
        
        # 构建上下文
        context_parts = []
        
        # 1. 页面信息
        context_parts.append(f"# 当前页面: {self.page_info.page_name}")
        context_parts.append(f"路径: {self.page_info.page_path}")
        context_parts.append(f"模块: {self.page_info.module}")
        context_parts.append(f"描述: {self.page_info.description}")
        context_parts.append("")
        
        # 2. Skills 列表
        context_parts.append("## 可用功能 (Skills):")
        context_parts.append("")
        
        for i, skill in enumerate(self.page_info.skills, 1):
            context_parts.append(f"{i}. **{skill.skill_name}** ({skill.skill_type})")
            context_parts.append(f"   - ID: {skill.skill_id}")
            context_parts.append(f"   - 描述: {skill.business_description}")
            
            # 触发条件
            trigger = skill.trigger
            if trigger.get("type") == "lifecycle":
                context_parts.append(f"   - 触发: 生命周期 {trigger.get('event')}")
            elif trigger.get("type") == "user_action":
                context_parts.append(f"   - 触发: 用户点击 {trigger.get('element')}")
            
            # 依赖
            if skill.dependencies:
                context_parts.append(f"   - 依赖: {', '.join(skill.dependencies)}")
            
            # 副作用
            if skill.side_effects:
                context_parts.append(f"   - 副作用: {', '.join(skill.side_effects)}")
            
            context_parts.append("")
        
        # 3. 对话历史（可选）
        if include_history and self.conversation_history:
            context_parts.append("## 对话历史:")
            context_parts.append("")
            
            # 只显示最近 5 条
            recent_messages = self.conversation_history[-5:]
            for msg in recent_messages:
                if msg.role == "user":
                    context_parts.append(f"👤 用户: {msg.content}")
                elif msg.role == "assistant":
                    # 截断过长的回复
                    content = msg.content[:200] + "..." if len(msg.content) > 200 else msg.content
                    context_parts.append(f"🤖 助手: {content}")
                context_parts.append("")
        
        return "\n".join(context_parts)
    
    def get_skill_by_id(self, skill_id: str) -> Optional[PageSkill]:
        """根据 ID 获取 Skill
        
        Args:
            skill_id: Skill ID
            
        Returns:
            PageSkill 对象或 None
        """
        if not self.page_info:
            return None
        
        for skill in self.page_info.skills:
            if skill.skill_id == skill_id:
                return skill
        
        return None
    
    def get_skill_by_name(self, skill_name: str) -> Optional[PageSkill]:
        """根据名称获取 Skill（模糊匹配）
        
        Args:
            skill_name: Skill 名称（支持部分匹配）
            
        Returns:
            PageSkill 对象或 None
        """
        if not self.page_info:
            return None
        
        skill_name_lower = skill_name.lower()
        
        # 精确匹配
        for skill in self.page_info.skills:
            if skill.skill_name.lower() == skill_name_lower:
                return skill
        
        # 部分匹配
        for skill in self.page_info.skills:
            if skill_name_lower in skill.skill_name.lower():
                return skill
        
        return None
    
    def search_skills(self, keyword: str) -> List[PageSkill]:
        """搜索 Skills
        
        Args:
            keyword: 关键词
            
        Returns:
            匹配的 Skills 列表
        """
        if not self.page_info:
            return []
        
        keyword_lower = keyword.lower()
        results = []
        
        for skill in self.page_info.skills:
            # 在名称、描述、数据流中搜索
            if (keyword_lower in skill.skill_name.lower() or
                keyword_lower in skill.business_description.lower() or
                any(keyword_lower in step.lower() for step in skill.data_flow)):
                results.append(skill)
        
        return results
    
    def get_skills_summary(self) -> Dict[str, Any]:
        """获取 Skills 摘要
        
        Returns:
            Skills 摘要字典
        """
        if not self.page_info:
            return {}
        
        return {
            "page_name": self.page_info.page_name,
            "page_path": self.page_info.page_path,
            "total_skills": len(self.page_info.skills),
            "skills": [
                {
                    "id": skill.skill_id,
                    "name": skill.skill_name,
                    "type": skill.skill_type,
                    "description": skill.business_description
                }
                for skill in self.page_info.skills
            ]
        }
    
    def clear(self):
        """清空上下文"""
        self.current_page = None
        self.page_info = None
        self.conversation_history = []
