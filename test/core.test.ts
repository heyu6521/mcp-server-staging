import { describe, expect, it } from "vitest";
import { ConfirmationService } from "../src/confirmation/service.js";
import {
  PolicyService,
  assertSafeRepoPath,
} from "../src/policy/repositoryPolicy.js";
import { resolveTools } from "../src/tooling/inventory.js";

const policy = {
  repositories: {
    "heyu/repo": {
      access: "write" as const,
      allowed_work_branch_patterns: ["chatgpt/*"],
      protected_branches: ["main"],
      allow_direct_push: false,
      allow_issue_write: true,
      allow_pull_request_write: true,
      allow_merge: true,
    },
  },
};

describe("tool inventory", () => {
  it("removes all writes in read-only mode", () => {
    const t = resolveTools(["all"], [], [], true);
    expect(t).toContain("get_me");
    expect(t).not.toContain("delete_file");
    expect(t).not.toContain("create_issue");
  });
  it("exclude wins", () =>
    expect(
      resolveTools(["default"], [], ["get_repository"], false),
    ).not.toContain("get_repository"));
  it("fails closed on unknown set", () =>
    expect(() => resolveTools(["oops"], [], [], false)).toThrow());
});

describe("policy", () => {
  it("allows only work branches", () => {
    const p = new PolicyService(policy);
    const r = p.assertWrite("heyu", "repo");
    expect(() => p.assertWorkBranch(r, "main")).toThrow();
    expect(() => p.assertWorkBranch(r, "chatgpt/x")).not.toThrow();
  });
  it("enforces protected branch direct-push policy", () => {
    const p = new PolicyService(policy);
    const r = p.assertWrite("heyu", "repo");
    expect(() => p.assertWritableBranch(r, "main")).toThrow();
    expect(() => p.assertWritableBranch(r, "chatgpt/x")).not.toThrow();
    expect(() =>
      p.assertWritableBranch({ ...r, allow_direct_push: true }, "main"),
    ).not.toThrow();
  });
  it("supports a fixed-owner wildcard and keeps exact rules authoritative", () => {
    const ownerRule = {
      ...policy.repositories["heyu/repo"],
      access: "read" as const,
    };
    const p = new PolicyService({
      repositories: {
        "heyu/*": ownerRule,
        "heyu/repo": policy.repositories["heyu/repo"],
      },
    });
    expect(p.assertRead("heyu", "future-repo")).toBe(ownerRule);
    expect(p.assertWrite("heyu", "repo")).toBe(
      policy.repositories["heyu/repo"],
    );
    expect(() => p.assertRead("other", "repo")).toThrow();
  });
  it("blocks sensitive and traversal paths", () => {
    expect(() => assertSafeRepoPath("../x")).toThrow();
    expect(() => assertSafeRepoPath(".env")).toThrow();
    expect(() => assertSafeRepoPath(".env.example")).not.toThrow();
  });
});

describe("confirmation", () => {
  it("binds state and is single-use", () => {
    const c = new ConfirmationService("x".repeat(32));
    const s = { repo: "a", sha: "1" };
    const t = c.prepare("p", "delete", s);
    expect(() => c.consume(t, "p", "delete", s)).not.toThrow();
    expect(() => c.consume(t, "p", "delete", s)).toThrow();
  });
  it("rejects tampering", () => {
    const c = new ConfirmationService("x".repeat(32));
    const t = c.prepare("p", "delete", { a: 1 });
    expect(() => c.consume(`${t}x`, "p", "delete", { a: 1 })).toThrow();
  });
});
