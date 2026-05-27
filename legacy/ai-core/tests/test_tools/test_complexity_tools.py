"""复杂度工具测试"""

import pytest

from ai_requirement_os.tools.complexity_tools import (
    calculate_method_complexity,
    detect_external_calls,
)


def test_simple_method_complexity():
    """测试简单方法"""
    code = """
    public String getUser(Long id) {
        return userMapper.selectById(id);
    }
    """

    report = calculate_method_complexity.invoke({"source_code": code})

    assert report.score < 40
    assert report.lines_of_code < 10
    assert report.cyclomatic_complexity < 5
    assert "简单方法" in report.recommendation or "中等复杂度" in report.recommendation


def test_complex_method_complexity():
    """测试复杂方法"""
    code = """
    @Transactional
    public void syncData() {
        List<User> users = userMapper.selectAll();
        for (User user : users) {
            if (user.isActive()) {
                try {
                    String result = restTemplate.getForObject(url, String.class);
                    if (result != null && result.contains("success")) {
                        user.setStatus("synced");
                        userMapper.update(user);
                        rabbitTemplate.send(queue, message);
                        redisTemplate.set(key, value);
                    } else {
                        log.warn("Sync failed for user: " + user.getId());
                    }
                } catch (Exception e) {
                    log.error("Error syncing user", e);
                    // 回滚操作
                    if (user.getOldStatus() != null) {
                        user.setStatus(user.getOldStatus());
                    }
                }
            }
        }
    }
    """

    report = calculate_method_complexity.invoke({"source_code": code})

    assert report.score >= 50  # 应该是高复杂度
    assert report.has_database_ops
    assert report.has_rpc_calls
    assert len(report.external_calls) >= 3  # 数据库、HTTP、MQ、缓存
    assert report.cyclomatic_complexity > 5


def test_medium_complexity():
    """测试中等复杂度"""
    code = """
    public List<User> getActiveUsers() {
        List<User> allUsers = userMapper.selectAll();
        List<User> activeUsers = new ArrayList<>();
        
        for (User user : allUsers) {
            if (user.isActive() && user.getStatus().equals("NORMAL")) {
                activeUsers.add(user);
            }
        }
        
        return activeUsers;
    }
    """

    report = calculate_method_complexity.invoke({"source_code": code})

    assert 20 <= report.score <= 70
    assert report.has_database_ops
    assert not report.has_rpc_calls


def test_detect_external_calls():
    """测试外部调用检测"""
    code = """
    userMapper.selectById(1);
    restTemplate.getForObject(url, String.class);
    rabbitTemplate.send(queue, msg);
    redisTemplate.get(key);
    """

    calls = detect_external_calls.invoke({"source_code": code})

    assert len(calls["database"]) > 0
    assert len(calls["http"]) > 0
    assert len(calls["mq"]) > 0
    assert len(calls["cache"]) > 0


def test_detect_no_external_calls():
    """测试无外部调用"""
    code = """
    public int add(int a, int b) {
        return a + b;
    }
    """

    calls = detect_external_calls.invoke({"source_code": code})

    assert len(calls["database"]) == 0
    assert len(calls["http"]) == 0
    assert len(calls["mq"]) == 0
    assert len(calls["cache"]) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
