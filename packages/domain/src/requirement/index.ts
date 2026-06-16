// Requirement Domain - 需求草稿领域模型

export {
  emptyDraft,
  getDraft,
  setDraft,
  ensureDraft,
  getDraftRevision,
  initDraftRevision,
  clearDraftRevision,
  validateDraftUpdateInput,
  applyDraftUpdate,
  buildAgentActions,
  type DraftItemInput,
  type ApplyDraftInput,
} from "./draft-store.js";

export {
  setDraftListener,
  notifyDraftUpdated,
} from "./draft-runtime.js";

export { createRequirementDraftTools } from "./tools.js";