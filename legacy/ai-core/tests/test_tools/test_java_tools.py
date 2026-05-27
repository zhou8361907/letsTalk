"""Java 工具测试"""

import pytest
from pathlib import Path

from ai_requirement_os.tools.java_tools import (
    search_controller_by_url,
    get_method_source,
    get_class_fields,
)


# 测试数据路径
TEST_BACKEND_PATH = str(Path(__file__).parent.parent.parent / "examples" / "test_cases" / "backend")


def test_search_controller_simple_route():
    """测试简单路由查找"""
    result = search_controller_by_url.invoke({
        "method": "GET",
        "url": "/api/user/list",
        "backend_path": TEST_BACKEND_PATH
    })

    assert result is not None
    assert result.class_name == "UserController"
    assert result.method_name == "getUserList"
    assert result.http_method == "GET"
    assert "/api/user/list" in result.url_pattern


def test_search_controller_path_variable():
    """测试路径变量"""
    result = search_controller_by_url.invoke({
        "method": "GET",
        "url": "/api/user/123",
        "backend_path": TEST_BACKEND_PATH
    })

    assert result is not None
    assert result.class_name == "UserController"
    assert result.method_name == "getUserById"


def test_search_controller_not_found():
    """测试找不到的路由"""
    result = search_controller_by_url.invoke({
        "method": "GET",
        "url": "/api/nonexistent",
        "backend_path": TEST_BACKEND_PATH
    })

    assert result is None


def test_get_method_source():
    """测试获取方法源码"""
    source = get_method_source.invoke({
        "class_name": "UserController",
        "method_name": "getUserList",
        "backend_path": TEST_BACKEND_PATH
    })

    assert source is not None
    assert "getUserList" in source
    assert "userService.list()" in source
    # 确保只返回方法，不是整个类
    assert "class UserController" not in source or source.count("public") <= 2


def test_get_method_source_not_found():
    """测试获取不存在的方法"""
    source = get_method_source.invoke({
        "class_name": "UserController",
        "method_name": "nonexistentMethod",
        "backend_path": TEST_BACKEND_PATH
    })

    assert source is None


def test_get_class_fields():
    """测试获取类字段"""
    # 这个测试需要一个有字段的类，我们先跳过
    # 或者创建一个 User 实体类
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
