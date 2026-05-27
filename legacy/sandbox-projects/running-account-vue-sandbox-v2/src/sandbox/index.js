import { sandboxAdapter } from "./mockAdapter";
import { installPatchRuntime } from "./patchRuntime";
import sandboxState from "./state";

export const isSandboxMode = true;

export function installSandboxSession() {
  sessionStorage.setItem("username", sandboxState.currentUser.username);
  sessionStorage.setItem("groupId", sandboxState.currentUser.groupId);
  installPatchRuntime();
}

export function getSandboxAdapter() {
  return sandboxAdapter;
}
