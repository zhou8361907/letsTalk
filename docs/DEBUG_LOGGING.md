# 调试日志（需求清单 + 每轮上下文）

## 开启

`.env`：

```bash
LETS_TALK_DEBUG=1
# 或仅清单：REQUIREMENT_DRAFT_DEBUG=1
```

重启 `pnpm dev`。

## 落盘位置

```text
.agent/debug/{sessionId}/
  manifest.jsonl          # 索引（每行一条事件）
  turn-001-..._request.md # 本轮：用户话 + 完整 agent_context + 清单 JSON
  turn-001-..._request.json
  turn-001-..._response.md # 本轮：助手全文 + 工具输出 + 回合末清单
  turn-001-..._response.json
  draft-..._request.md    # 每次 update_requirement_draft：入参 / 更新前 / 更新后
  draft-..._request.json
```

`sessionId` 与左侧会话一致（或浏览器 `sessionStorage` 里的会话 id）。

## 终端

同时打印：

```text
[letsTalk:debug:turn] ...
[letsTalk:debug:draft] ...
```

## 关闭

删掉或注释 `LETS_TALK_DEBUG`，重启服务。
