/** ClinePass headless loop tool approval — mirrors Cursor `autoReview: true` posture. */
export const CLINE_LOOP_TOOL_POLICIES = {
  read_files: { autoApprove: true },
  search_codebase: { autoApprove: true },
  fetch_web_content: { autoApprove: true },
  list_files: { autoApprove: true },
  run_commands: { autoApprove: true },
  editor: { autoApprove: true },
  apply_patch: { autoApprove: true },
} as const
