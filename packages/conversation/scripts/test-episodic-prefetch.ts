/**
 * episodic prefetch 单元测试
 */
import {
  shouldEpisodicPrefetch,
  extractEpisodicQuery,
} from "../src/episodic-prefetch.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(shouldEpisodicPrefetch("还记得内蒙古需求吗"), "应触发");
assert(!shouldEpisodicPrefetch("你好"), "短句不触发");
assert(extractEpisodicQuery("还记得内蒙古需求吗").includes("内蒙古"), "应提取关键词");
assert(extractEpisodicQuery("上次聊过的支付计划").includes("支付"), "应保留业务词");

console.log("episodic-prefetch tests passed");
