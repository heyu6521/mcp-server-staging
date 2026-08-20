export interface RepoRef { owner: string; repo: string; }
export interface GitPlatformProvider {
  getMe(): Promise<{ login: string }>;
  searchRepositories(query: string, page: number, perPage: number, allowlist: string[]): Promise<unknown>;
  getRepository(ref: RepoRef): Promise<unknown>;
  getFileContents(ref: RepoRef, path: string, gitRef?: string): Promise<unknown>;
  listBranches(ref: RepoRef, page: number, perPage: number): Promise<unknown>;
  listTags(ref: RepoRef, page: number, perPage: number): Promise<unknown>;
  listCommits(ref: RepoRef, params: Record<string, string | number | undefined>): Promise<unknown>;
  getCommit(ref: RepoRef, sha: string): Promise<unknown>;
  searchCode(ref: RepoRef, query: string, page: number, perPage: number): Promise<unknown>;
  compareCommits(ref: RepoRef, base: string, head: string): Promise<unknown>;
  createBranch(ref: RepoRef, branch: string, from: string): Promise<unknown>;
  createOrUpdateFile(ref: RepoRef, branch: string, path: string, content: string, message: string, sha?: string): Promise<unknown>;
  deleteFile(ref: RepoRef, branch: string, path: string, sha: string, message: string): Promise<unknown>;
  listIssues(ref: RepoRef, params: Record<string, string | number | undefined>): Promise<unknown>;
  searchIssues(ref: RepoRef, query: string, page: number, perPage: number): Promise<unknown>;
  getIssue(ref: RepoRef, issueNumber: number): Promise<unknown>;
  getIssueComments(ref: RepoRef, issueNumber: number): Promise<unknown>;
  createIssue(ref: RepoRef, input: Record<string, unknown>): Promise<unknown>;
  updateIssue(ref: RepoRef, issueNumber: number, input: Record<string, unknown>): Promise<unknown>;
  addIssueComment(ref: RepoRef, issueNumber: number, body: string): Promise<unknown>;
  listPullRequests(ref: RepoRef, params: Record<string, string | number | undefined>): Promise<unknown>;
  getPullRequest(ref: RepoRef, pullNumber: number): Promise<unknown>;
  getPullRequestSubresource(ref: RepoRef, pullNumber: number, method: string): Promise<unknown>;
  createPullRequest(ref: RepoRef, input: Record<string, unknown>): Promise<unknown>;
  updatePullRequest(ref: RepoRef, pullNumber: number, input: Record<string, unknown>): Promise<unknown>;
  addPullRequestComment(ref: RepoRef, pullNumber: number, body: string): Promise<unknown>;
  createPullRequestReview(ref: RepoRef, pullNumber: number, input: Record<string, unknown>): Promise<unknown>;
  mergePullRequest(ref: RepoRef, pullNumber: number, input: Record<string, unknown>): Promise<unknown>;
}
