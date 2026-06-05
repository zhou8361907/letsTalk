/**
 * 对 WORKSPACE_ROOT/.agent/state.db 做冒烟（可选）
 * 用法：WORKSPACE_ROOT=/path/to/root pnpm --filter @lets-talk/conversation test:session-db:real
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { SessionDB } from "../src/session-db.js";
import { runSessionSearch } from "../src/db-search.js";

config({ path: resolve(process.cwd(), "../../.env") });

const root = process.env.WORKSPACE_ROOT?.trim() || resolve(process.cwd(), "../..");
const db = SessionDB.open(root);

const sid = "c5adde00-6e51-4255-bf9e-d82d93ff2be5";
const cases: Array<{ label: string; args: Parameters<typeof runSessionSearch>[1] }> = [
  { label: "内蒙古", args: { query: "内蒙古" } },
  {
    label: "多词+FROM session",
    args: {
      query: "NmPayPlanScreenController NMYB 内蒙古 FROM session:c5adde00-6e51-4255-bf9e-d82d93ff2be5",
    },
  },
  {
    label: "当前会话+内蒙古",
    args: { query: "内蒙古", current_session_id: sid },
  },
  {
    label: "scroll 真 id",
    args: { session_id: sid, around_message_id: 1017 },
  },
  {
    label: "scroll 猜错 id",
    args: { session_id: sid, around_message_id: 100 },
  },
];

const total = db.db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number };
console.log(`state.db @ ${root} | messages=${total.c}`);
for (const c of cases) {
  const r = runSessionSearch(db, c.args);
  const extra =
    r.mode === "scroll" && !r.success ? ` error=${r.error?.slice(0, 80)}` : "";
  let bookendHint = "";
  if (r.mode === "discovery" && r.success && r.results?.length) {
    const first = r.results[0] as {
      bookend_start?: unknown[];
      messages?: unknown[];
      match_message_id?: number;
    };
    bookendHint = ` bookends=${first.bookend_start?.length ?? 0} msgs=${first.messages?.length ?? 0} mid=${first.match_message_id}`;
  }
  console.log(
    `[${c.label}] mode=${r.mode} success=${r.success} count=${r.count ?? 0}${bookendHint}${extra}`,
  );
}

const nm = runSessionSearch(db, {
  query: "NmPayPlanScreenController NMYB 内蒙古 FROM session:c5adde00-6e51-4255-bf9e-d82d93ff2be5",
});
if (!nm.success || (nm.count ?? 0) < 1) {
  throw new Error("多词+FROM session 应命中");
}

db.close();
console.log("real-db smoke done");
