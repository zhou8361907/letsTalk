"""代码复杂度分析工具"""

import re
from typing import Dict, List

from langchain.tools import tool
from pydantic import BaseModel, Field


class ComplexityReport(BaseModel):
    """复杂度报告"""

    score: int = Field(description="复杂度得分 (0-100)")
    lines_of_code: int = Field(description="代码行数")
    cyclomatic_complexity: int = Field(description="圈复杂度")
    nesting_depth: int = Field(description="嵌套深度")
    external_calls: List[str] = Field(default_factory=list, description="外部调用列表")
    has_database_ops: bool = Field(default=False, description="是否有数据库操作")
    has_rpc_calls: bool = Field(default=False, description="是否有 RPC 调用")
    has_complex_logic: bool = Field(default=False, description="是否有复杂逻辑")
    recommendation: str = Field(description="建议")


@tool
def calculate_method_complexity(source_code: str) -> ComplexityReport:
    """
    计算方法的复杂度

    Args:
        source_code: 方法源码

    Returns:
        复杂度报告
    """
    # 过滤空行和注释
    lines = []
    in_block_comment = False

    for line in source_code.split("\n"):
        stripped = line.strip()

        # 处理块注释
        if "/*" in stripped:
            in_block_comment = True
        if "*/" in stripped:
            in_block_comment = False
            continue

        # 跳过注释和空行
        if in_block_comment or not stripped or stripped.startswith("//"):
            continue

        lines.append(line)

    loc = len(lines)

    # 计算圈复杂度（简化版）
    decision_keywords = [
        r"\bif\b",
        r"\bfor\b",
        r"\bwhile\b",
        r"\bcase\b",
        r"\bcatch\b",
        r"\b\?\s*",  # 三元运算符
        r"\b&&\b",  # 逻辑与
        r"\b\|\|\b",  # 逻辑或
    ]

    decision_points = 0
    for keyword in decision_keywords:
        decision_points += len(re.findall(keyword, source_code))

    cyclomatic = decision_points + 1

    # 计算嵌套深度
    max_depth = 0
    current_depth = 0
    for line in lines:
        # 计算大括号
        open_braces = line.count("{")
        close_braces = line.count("}")

        current_depth += open_braces
        max_depth = max(max_depth, current_depth)
        current_depth -= close_braces

    # 检测外部调用
    external_calls = []

    # 数据库操作
    db_patterns = [
        r"@Autowired",
        r"@Resource",
        r"Mapper\.",
        r"\.select\(",
        r"\.insert\(",
        r"\.update\(",
        r"\.delete\(",
        r"jdbcTemplate\.",
        r"entityManager\.",
    ]
    has_db = False
    for pattern in db_patterns:
        if re.search(pattern, source_code):
            has_db = True
            external_calls.append("数据库操作")
            break

    # HTTP/RPC 调用
    rpc_patterns = [
        r"RestTemplate",
        r"@FeignClient",
        r"HttpClient",
        r"WebClient",
        r"OkHttp",
        r"\.getForObject\(",
        r"\.postForObject\(",
        r"\.exchange\(",
    ]
    has_rpc = False
    for pattern in rpc_patterns:
        if re.search(pattern, source_code):
            has_rpc = True
            external_calls.append("HTTP/RPC调用")
            break

    # 消息队列
    mq_patterns = [
        r"RabbitTemplate",
        r"KafkaTemplate",
        r"JmsTemplate",
        r"\.send\(",
        r"\.convertAndSend\(",
    ]
    for pattern in mq_patterns:
        if re.search(pattern, source_code):
            external_calls.append("消息队列")
            break

    # 缓存操作
    cache_patterns = [
        r"RedisTemplate",
        r"@Cacheable",
        r"@CachePut",
        r"@CacheEvict",
        r"Cache\.",
    ]
    for pattern in cache_patterns:
        if re.search(pattern, source_code):
            external_calls.append("缓存操作")
            break

    # 事务操作
    if re.search(r"@Transactional", source_code):
        external_calls.append("事务管理")

    # 计算综合得分
    # 基础分：代码行数
    score = min(50, loc // 2)

    # 圈复杂度加分
    score += min(30, cyclomatic * 3)

    # 嵌套深度加分
    score += min(20, max_depth * 5)

    # 外部调用加分
    score += len(external_calls) * 10

    # 限制在 0-100
    score = min(100, max(0, score))

    # 生成建议
    if score < 30:
        recommendation = "简单方法，可以直接分析"
    elif score < 60:
        recommendation = "中等复杂度，建议详细追踪"
    else:
        recommendation = "高复杂度，建议创建后台任务深度分析"

    return ComplexityReport(
        score=score,
        lines_of_code=loc,
        cyclomatic_complexity=cyclomatic,
        nesting_depth=max_depth,
        external_calls=external_calls,
        has_database_ops=has_db,
        has_rpc_calls=has_rpc,
        has_complex_logic=cyclomatic > 10,
        recommendation=recommendation,
    )


@tool
def detect_external_calls(source_code: str) -> Dict[str, List[str]]:
    """
    检测代码中的外部调用

    Args:
        source_code: 源码

    Returns:
        外部调用分类字典
    """
    result: Dict[str, List[str]] = {
        "database": [],
        "http": [],
        "mq": [],
        "cache": [],
        "other": [],
    }

    # 数据库调用
    db_patterns = [
        (r"(\w+Mapper)\.(\w+)\(", "database"),
        (r"jdbcTemplate\.(\w+)\(", "database"),
        (r"entityManager\.(\w+)\(", "database"),
    ]

    # HTTP 调用
    http_patterns = [
        (r"restTemplate\.(\w+)\(", "http"),
        (r"@FeignClient.*?(\w+)\(", "http"),
        (r"httpClient\.(\w+)\(", "http"),
    ]

    # 消息队列
    mq_patterns = [
        (r"rabbitTemplate\.(\w+)\(", "mq"),
        (r"kafkaTemplate\.(\w+)\(", "mq"),
    ]

    # 缓存
    cache_patterns = [
        (r"redisTemplate\.(\w+)\(", "cache"),
        (r"cacheManager\.(\w+)\(", "cache"),
    ]

    all_patterns = db_patterns + http_patterns + mq_patterns + cache_patterns

    for pattern, category in all_patterns:
        matches = re.finditer(pattern, source_code)
        for match in matches:
            call = match.group(0)
            if call not in result[category]:
                result[category].append(call)

    return result
