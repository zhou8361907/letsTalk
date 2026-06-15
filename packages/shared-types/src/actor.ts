/** 轻量工作区身份（非登录账号；部门内选人隔离会话） */
export interface Actor {
  id: string;
  displayName: string;
  kind: "anonymous" | "named";
  createdAt: string;
}

export const ANONYMOUS_ACTOR_ID = "anon";

export const ACTOR_ID_HEADER = "x-letstalk-actor-id";
export const ACTOR_NAME_HEADER = "x-letstalk-actor-name";
