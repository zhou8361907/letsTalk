/**
 * QA 事件总线 — 用于录制器向 SSE 通道推送实时事件
 * 简单的事件发布/订阅机制
 */
import { EventEmitter } from "node:events";
import type { QaRecordEvent } from "@lets-talk/shared-types";

const bus = new EventEmitter();
bus.setMaxListeners(200);

const QA_EVENT = "qa_event";

/** 发布录制事件 */
export function publishEvent(sessionId: string, event: QaRecordEvent): void {
  bus.emit(QA_EVENT, sessionId, event);
}

/** 订阅录制事件，返回取消订阅函数 */
export function subscribeEvents(
  sessionId: string,
  callback: (event: QaRecordEvent) => void,
): () => void {
  const handler = (sid: string, event: QaRecordEvent) => {
    if (sid === sessionId) {
      callback(event);
    }
  };
  bus.on(QA_EVENT, handler);
  return () => {
    bus.off(QA_EVENT, handler);
  };
}
