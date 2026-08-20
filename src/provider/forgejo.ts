import { AppError, type ErrorCode } from "../errors.js";
import type { GitPlatformProvider, RepoRef } from "./types.js";

type Json =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export class ForgejoProvider implements GitPlatformProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
  ) {}
  private async request(path: string, init: RequestInit = {}): Promise<Json> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(new URL(`/api/v1${path}`, this.baseUrl), {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(this.token ? { Authorization: `token ${this.token}` } : {}),
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
      const text = await res.text();
      let data: Json = null;
      if (text) {
        try {
          data = JSON.parse(text) as Json;
        } catch {
          throw new AppError(
            "upstream_error",
            "Forgejo returned invalid JSON",
            502,
          );
        }
      }
      if (!res.ok) {
        const map: Partial<Record<number, [ErrorCode, number]>> = {
          401: ["unauthorized", 401],
          403: ["forbidden", 403],
          404: ["not_found", 404],
          409: ["conflict", 409],
          422: ["conflict", 409],
          429: ["rate_limited", 429],
        };
        const [code, status] = map[res.status] ?? ["upstream_error", 502];
        throw new AppError(
          code,
          `Forgejo request failed (${res.status})`,
          status,
        );
      }
      return data;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if ((e as Error).name === "AbortError")
        throw new AppError("upstream_error", "Forgejo request timed out", 504);
      throw new AppError("upstream_error", "Forgejo request failed", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  private r({ owner, repo }: RepoRef) {
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }
  async getMe(): Promise<{ login: string }> {
    const v = await this.request("/user");
    if (!v || Array.isArray(v) || typeof v !== "object")
      throw new AppError(
        "upstream_error",
        "Forgejo identity response missing login",
        502,
      );
    const login = v.login;
    if (typeof login !== "string")
      throw new AppError(
        "upstream_error",
        "Forgejo identity response missing login",
        502,
      );
    return { login };
  }
  async searchRepositories(
    query: string,
    page: number,
    perPage: number,
    allowlist: string[],
  ) {
    const out: unknown[] = [];
    for (const full of allowlist) {
      const [owner, repo] = full.split("/");
      if (owner && repo && full.toLowerCase().includes(query.toLowerCase()))
        out.push(await this.getRepository({ owner, repo }));
    }
    return out.slice((page - 1) * perPage, page * perPage);
  }
  getRepository(ref: RepoRef) {
    return this.request(this.r(ref));
  }
  getFileContents(ref: RepoRef, path: string, gitRef?: string) {
    const q = gitRef ? `?ref=${encodeURIComponent(gitRef)}` : "";
    return this.request(
      `${this.r(ref)}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}${q}`,
    );
  }
  listBranches(ref: RepoRef, page: number, perPage: number) {
    return this.request(`${this.r(ref)}/branches?page=${page}&limit=${perPage}`);
  }
  listTags(ref: RepoRef, page: number, perPage: number) {
    return this.request(`${this.r(ref)}/tags?page=${page}&limit=${perPage}`);
  }
  listCommits(
    ref: RepoRef,
    params: Record<string, string | number | undefined>,
  ) {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return this.request(`${this.r(ref)}/commits?${q}`);
  }
  getCommit(ref: RepoRef, sha: string) {
    return this.request(`${this.r(ref)}/git/commits/${encodeURIComponent(sha)}`);
  }
  searchCode(ref: RepoRef, query: string, page: number, perPage: number) {
    return this.request(
      `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/search/code?q=${encodeURIComponent(query)}&page=${page}&limit=${perPage}`,
    );
  }
  compareCommits(ref: RepoRef, base: string, head: string) {
    return this.request(
      `${this.r(ref)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    );
  }
  createBranch(ref: RepoRef, branch: string, from: string) {
    return this.request(`${this.r(ref)}/branches`, {
      method: "POST",
      body: JSON.stringify({
        new_branch_name: branch,
        old_branch_name: from,
      }),
    });
  }
  createOrUpdateFile(
    ref: RepoRef,
    branch: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
  ) {
    return this.request(
      `${this.r(ref)}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: sha ? "PUT" : "POST",
        body: JSON.stringify({
          branch,
          content: Buffer.from(content).toString("base64"),
          message,
          ...(sha ? { sha } : {}),
        }),
      },
    );
  }
  deleteFile(
    ref: RepoRef,
    branch: string,
    path: string,
    sha: string,
    message: string,
  ) {
    return this.request(
      `${this.r(ref)}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { method: "DELETE", body: JSON.stringify({ branch, sha, message }) },
    );
  }
  listIssues(
    ref: RepoRef,
    params: Record<string, string | number | undefined>,
  ) {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return this.request(`${this.r(ref)}/issues?${q}`);
  }
  searchIssues(ref: RepoRef, query: string, page: number, perPage: number) {
    return this.request(
      `${this.r(ref)}/issues?state=all&q=${encodeURIComponent(query)}&page=${page}&limit=${perPage}`,
    );
  }
  getIssue(ref: RepoRef, n: number) {
    return this.request(`${this.r(ref)}/issues/${n}`);
  }
  getIssueComments(ref: RepoRef, n: number) {
    return this.request(`${this.r(ref)}/issues/${n}/comments`);
  }
  createIssue(ref: RepoRef, input: Record<string, unknown>) {
    return this.request(`${this.r(ref)}/issues`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateIssue(ref: RepoRef, n: number, input: Record<string, unknown>) {
    return this.request(`${this.r(ref)}/issues/${n}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  addIssueComment(ref: RepoRef, n: number, body: string) {
    return this.request(`${this.r(ref)}/issues/${n}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
  listPullRequests(
    ref: RepoRef,
    params: Record<string, string | number | undefined>,
  ) {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return this.request(`${this.r(ref)}/pulls?${q}`);
  }
  getPullRequest(ref: RepoRef, n: number) {
    return this.request(`${this.r(ref)}/pulls/${n}`);
  }
  getPullRequestSubresource(ref: RepoRef, n: number, m: string) {
    const paths: Record<string, string> = {
      get_diff: `pulls/${n}.diff`,
      get_files: `pulls/${n}/files`,
      get_commits: `pulls/${n}/commits`,
      get_reviews: `pulls/${n}/reviews`,
      get_review_comments: `pulls/${n}/comments`,
      get_comments: `issues/${n}/comments`,
      get_status: `pulls/${n}`,
    };
    const p = paths[m];
    if (!p)
      throw new AppError(
        "invalid_input",
        "Unsupported pull request read method",
        400,
      );
    return this.request(`${this.r(ref)}/${p}`);
  }
  createPullRequest(ref: RepoRef, input: Record<string, unknown>) {
    return this.request(`${this.r(ref)}/pulls`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updatePullRequest(ref: RepoRef, n: number, input: Record<string, unknown>) {
    return this.request(`${this.r(ref)}/pulls/${n}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  addPullRequestComment(ref: RepoRef, n: number, body: string) {
    return this.request(`${this.r(ref)}/issues/${n}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
  createPullRequestReview(
    ref: RepoRef,
    n: number,
    input: Record<string, unknown>,
  ) {
    return this.request(`${this.r(ref)}/pulls/${n}/reviews`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  mergePullRequest(
    ref: RepoRef,
    n: number,
    input: Record<string, unknown>,
  ) {
    return this.request(`${this.r(ref)}/pulls/${n}/merge`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
