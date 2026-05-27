"""Vue 工具测试"""

import pytest
from pathlib import Path

from ai_requirement_os.tools.vue_tools import (
    parse_vue_ast,
    extract_api_calls,
    get_form_fields,
)


# 测试数据路径
TEST_FRONTEND_PATH = str(
    Path(__file__).parent.parent.parent / "examples" / "test_cases" / "frontend" / "UserList.vue"
)


def test_parse_vue_ast():
    """测试 Vue AST 解析"""
    result = parse_vue_ast.invoke({"file_path": TEST_FRONTEND_PATH})

    assert "template" in result
    assert "script" in result
    assert "style" in result
    assert len(result["template"]) > 0
    assert len(result["script"]) > 0
    assert "user-list" in result["template"]


def test_extract_api_calls():
    """测试 API 调用提取"""
    calls = extract_api_calls.invoke({"file_path": TEST_FRONTEND_PATH})

    assert len(calls) >= 2  # 至少有 GET /api/user/list 和 DELETE /api/user/{id}

    # 检查 GET 请求
    get_calls = [c for c in calls if c.method == "GET"]
    assert len(get_calls) >= 1
    assert any("/api/user/list" in c.url for c in get_calls)

    # 检查 DELETE 请求
    delete_calls = [c for c in calls if c.method == "DELETE"]
    assert len(delete_calls) >= 1


def test_extract_api_calls_empty_file():
    """测试空文件"""
    # 创建临时空文件
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".vue", delete=False) as f:
        f.write("<template></template><script></script>")
        temp_path = f.name

    calls = extract_api_calls.invoke({"file_path": temp_path})
    assert len(calls) == 0

    # 清理
    Path(temp_path).unlink()


def test_get_form_fields():
    """测试表单字段提取"""
    # UserList.vue 没有表单，所以应该返回空列表
    fields = get_form_fields.invoke({"file_path": TEST_FRONTEND_PATH})
    assert isinstance(fields, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
