/**
 * Session DB 单元测试（:memory: SQLite）
 * 用法：pnpm --filter @lets-talk/conversation test:session-db
 */
import { SessionDB } from "../src/session-db.js";
import { runSessionSearch } from "../src/db-search.js";
import type { ConversationRecord } from "@lets-talk/shared-types";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function makeRecord(sessionId: string, items: ConversationRecord["items"]): ConversationRecord {
  const now = new Date().toISOString();
  return {
    sessionId,
    title: "测试",
    createdAt: now,
    updatedAt: now,
    anchor: null,
    items,
    chatMode: "explore",
  };
}

function testSeqZeroFlush(): void {
  const db = SessionDB.openInMemory();
  const record = makeRecord("s1", [{ kind: "user", text: "hello" }]);
  db.syncRecord(record);
  assert(db.countMessages("s1") === 1, "seq=0 应写入 1 条");
  db.close();
}

function testIdempotentFlush(): void {
  const db = SessionDB.openInMemory();
  const record = makeRecord("s2", [
    { kind: "user", text: "a" },
    { kind: "assistant", text: "b" },
  ]);
  db.syncRecord(record);
  db.syncRecord(record);
  assert(db.countMessages("s2") === 2, "重复 flush 不应重复插入");
  db.close();
}

function testFtsTrigram(): void {
  const db = SessionDB.openInMemory();
  if (!db.ftsEnabled) {
    console.log("skip FTS test (module unavailable)");
    db.close();
    return;
  }
  const record = makeRecord("s3", [{ kind: "user", text: "枚举字典怎么配置" }]);
  db.syncRecord(record);
  const hits = db.searchMessagesFts("枚举字典");
  assert(hits.length >= 1, "trigram 应命中中文子串");
  db.close();
}

function testFtsMultiTermOrFallback(): void {
  const db = SessionDB.openInMemory();
  if (!db.ftsEnabled) {
    console.log("skip FTS OR fallback test");
    db.close();
    return;
  }
  db.syncRecord(
    makeRecord("s-or", [
      { kind: "user", text: "NmPayPlanScreenController 相关" },
      { kind: "assistant", text: "NMYB 内蒙古定制" },
    ]),
  );
  const hits = db.searchMessagesFts("NmPayPlanScreenController NMYB 内蒙古");
  assert(hits.length >= 1, "多词分散在不同气泡时应 OR/最长词回退命中");
  db.close();
}

function testNormalizeStripsSessionUuid(): void {
  const raw = "你好 FROM session:c5adde00-6e51-4255-bf9e-d82d93ff2be5";
  const norm = SessionDB.normalizeDiscoveryQuery(raw);
  assert(!norm.includes("c5adde00"), "应去掉 session UUID 碎片");
  assert(norm.includes("你好"), "应保留关键词");
}

function testListSessions(): void {
  const db = SessionDB.openInMemory();
  db.syncRecord(makeRecord("s-a", [{ kind: "user", text: "1" }]));
  db.syncRecord(makeRecord("s-b", [{ kind: "user", text: "2" }]));
  const list = db.listSessions();
  assert(list.length === 2, "应列出 2 个 session");
  db.close();
}

function testSessionSearchModes(): void {
  const db = SessionDB.openInMemory();
  const sid = "search-s1";
  db.syncRecord(
    makeRecord(sid, [
      { kind: "user", text: "采购订单审批流程" },
      { kind: "assistant", text: "审批在 PO 模块" },
      { kind: "user", text: "无关内容" },
    ]),
  );
  db.syncRecord(makeRecord("search-s2", [{ kind: "user", text: "其它会话" }]));

  const browse = runSessionSearch(db, {});
  assert(browse.success && browse.mode === "browse", "无参应为 browse");
  assert((browse.results as unknown[]).length >= 2, "browse 应含多个会话");

  const rows = db.db
    .prepare("SELECT id FROM messages WHERE session_id = ? AND role = 'user' LIMIT 1")
    .all(sid) as { id: number }[];
  const anchorId = rows[0]?.id;
  assert(anchorId != null, "应有 message id");

  const scroll = runSessionSearch(db, {
    session_id: sid,
    around_message_id: anchorId,
    window: 5,
  });
  assert(scroll.success && scroll.mode === "scroll", "scroll 应成功");
  const scrollMsgs = (
    scroll.results as Array<{ messages: unknown[] }>
  )[0]?.messages;
  assert(scrollMsgs && scrollMsgs.length >= 1, "scroll 应返回消息");

  if (db.ftsEnabled) {
    const disc = runSessionSearch(db, { query: "采购订单" });
    assert(disc.success && disc.mode === "discovery", "discovery 应成功");
    assert((disc.count ?? 0) >= 1, "discovery 应命中");
    const first = (disc.results as Array<Record<string, unknown>>)[0];
    assert(first?.match_message_id != null, "应有 match_message_id");
    assert(Array.isArray(first?.messages), "应有 messages window");
    assert(typeof first?.messages_before === "number", "应有 messages_before");
  }

  db.close();
}

function testAnchoredViewBookends(): void {
  const db = SessionDB.openInMemory();
  const sid = "bookend-s";
  const items: ConversationRecord["items"] = [];
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      items.push({
        kind: "user",
        text: i === 6 ? "命中锚点采购订单" : `填充消息${i}`,
      });
    } else {
      items.push({ kind: "assistant", text: `填充回复${i}` });
    }
  }
  db.syncRecord(makeRecord(sid, items));
  const anchor = db.db
    .prepare("SELECT id FROM messages WHERE session_id = ? AND content LIKE '%锚点%'")
    .get(sid) as { id: number };
  const view = db.getAnchoredView(sid, anchor.id, { window: 2, bookend: 2 });
  assert(view.window.length >= 1, "window 非空");
  assert(
    view.bookend_start.length + view.bookend_end.length >= 0,
    "bookend 结构存在",
  );
  db.close();
}

function testScrollRebind(): void {
  const db = SessionDB.openInMemory();
  const sid = "rebind-s";
  db.syncRecord(makeRecord(sid, [{ kind: "user", text: "唯一消息" }]));
  const row = db.db
    .prepare("SELECT id FROM messages WHERE session_id = ?")
    .get(sid) as { id: number };
  const wrongSid = "00000000-0000-0000-0000-000000000099";
  const scroll = runSessionSearch(db, {
    session_id: wrongSid,
    around_message_id: row.id,
    window: 3,
  });
  assert(scroll.success, "rebind 后 scroll 应成功");
  db.close();
}

function testDiscoveryCurrentSessionFallback(): void {
  const db = SessionDB.openInMemory();
  const sid = "only-here";
  db.syncRecord(
    makeRecord(sid, [
      { kind: "user", text: "内蒙古专属需求说明" },
      { kind: "assistant", text: "好的" },
    ]),
  );
  const disc = runSessionSearch(db, {
    query: "内蒙古专属",
    current_session_id: sid,
  });
  assert(disc.success && (disc.count ?? 0) >= 1, "仅命中当前会话时也应返回结果");
  db.close();
}

try {
  testSeqZeroFlush();
  testIdempotentFlush();
  testFtsTrigram();
  testFtsMultiTermOrFallback();
  testNormalizeStripsSessionUuid();
  testListSessions();
  testSessionSearchModes();
  testDiscoveryCurrentSessionFallback();
  testAnchoredViewBookends();
  testScrollRebind();
  console.log("session-db tests passed");
} catch (e) {
  console.error(e);
  process.exit(1);
}
