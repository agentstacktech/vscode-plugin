let chatParticipantRegistered = false;

export const CHAT_PARTICIPANT_ID = "agentstack-mcp.agentstack";

export function isChatParticipantRegistered(): boolean {
  return chatParticipantRegistered;
}

export function markChatParticipantRegistered(): void {
  chatParticipantRegistered = true;
}

export function resetChatLifecycle(): void {
  chatParticipantRegistered = false;
}
