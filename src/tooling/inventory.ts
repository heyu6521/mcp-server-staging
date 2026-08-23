export const TOOLSETS = {
  context: ["get_me"],
  repos: [
    "search_repositories",
    "get_repository",
    "get_file_contents",
    "list_branches",
    "list_tags",
    "list_commits",
    "get_commit",
    "search_code",
    "compare_commits",
    "create_branch",
    "create_or_update_file",
    "push_files",
    "prepare_delete_file",
    "delete_file",
  ],
  issues: [
    "list_issues",
    "search_issues",
    "issue_read",
    "create_issue",
    "update_issue",
    "add_issue_comment",
  ],
  pull_requests: [
    "list_pull_requests",
    "search_pull_requests",
    "pull_request_read",
    "create_pull_request",
    "update_pull_request",
    "add_pull_request_comment",
    "pull_request_review_write",
    "prepare_merge_pull_request",
    "merge_pull_request",
  ],
  git: [],
} as const;

export const WRITE_TOOLS = new Set([
  "create_branch",
  "create_or_update_file",
  "push_files",
  "prepare_delete_file",
  "delete_file",
  "create_issue",
  "update_issue",
  "add_issue_comment",
  "create_pull_request",
  "update_pull_request",
  "add_pull_request_comment",
  "pull_request_review_write",
  "prepare_merge_pull_request",
  "merge_pull_request",
]);
export type ToolName = (typeof TOOLSETS)[keyof typeof TOOLSETS][number];

export function resolveTools(
  toolsets: string[],
  explicit: string[],
  excluded: string[],
  readOnly: boolean,
): string[] {
  const names = new Set<string>();
  const validSets = new Set(Object.keys(TOOLSETS));
  const all = new Set<string>(Object.values(TOOLSETS).flat());
  const expanded = toolsets.flatMap((s) =>
    s === "default"
      ? ["context", "repos", "issues", "pull_requests"]
      : s === "all"
        ? [...validSets]
        : [s],
  );
  for (const s of expanded) {
    if (!validSets.has(s)) throw new Error(`Invalid MCP toolset: ${s}`);
    for (const n of TOOLSETS[s as keyof typeof TOOLSETS]) names.add(n);
  }
  for (const n of explicit) {
    if (!all.has(n)) throw new Error(`Invalid MCP tool: ${n}`);
    names.add(n);
  }
  for (const n of excluded) {
    if (!all.has(n)) throw new Error(`Invalid excluded MCP tool: ${n}`);
    names.delete(n);
  }
  if (readOnly) for (const n of WRITE_TOOLS) names.delete(n);
  return [...names].sort();
}
