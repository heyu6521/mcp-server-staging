import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors.js";
import { ForgejoProvider } from "../src/provider/forgejo.js";

const ref = { owner: "heyu", repo: "repo" };

afterEach(() => vi.unstubAllGlobals());

describe("Forgejo provider contracts", () => {
  it("discovers repositories for fixed-owner wildcard selectors", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify([
              { full_name: "heyu/alpha" },
              { full_name: "other/not-allowed" },
            ]),
            { status: 200 },
          ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(
      provider.searchRepositories("alpha", 1, 20, ["heyu/*"]),
    ).resolves.toEqual([{ full_name: "heyu/alpha" }]);
    await expect(
      provider.countAccessibleRepositories(["heyu/*"]),
    ).resolves.toBe(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/user/repos",
    );
  });

  it("returns pull-request diffs as text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("diff --git a/a b/a\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(
      provider.getPullRequestSubresource(ref, 4, "get_diff"),
    ).resolves.toBe("diff --git a/a b/a\n");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v1/repos/heyu/repo/pulls/4.diff",
    );
  });

  it("maps a non-JSON upstream error without treating it as invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("proxy exploded", { status: 500 })),
    );
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(provider.getRepository(ref)).rejects.toMatchObject({
      code: "upstream_error",
      message: "Forgejo request failed (500)",
    } satisfies Partial<AppError>);
  });

  it("resolves PR status from the current head commit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ head: { sha: "abc123" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: "success" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(provider.getPullRequestStatus(ref, 7)).resolves.toEqual({
      headSha: "abc123",
      status: { state: "success" },
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/v1/repos/heyu/repo/commits/abc123/status",
    );
  });

  it("uses the confirmed review-submit endpoint and merge field names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await provider.submitPullRequestReview(ref, 2, 9, {
      event: "APPROVE",
    });
    await provider.mergePullRequest(ref, 2, {
      Do: "squash",
      head_commit_id: "abc123",
      MergeTitleField: "title",
      MergeMessageField: "message",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/pulls/2/reviews/9",
    );
    const mergeInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(typeof mergeInit.body).toBe("string");
    expect(JSON.parse(mergeInit.body as string)).toEqual({
      Do: "squash",
      head_commit_id: "abc123",
      MergeTitleField: "title",
      MergeMessageField: "message",
    });
  });

  it("maps draft PR creation to Forgejo 15 WIP-title semantics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 3, draft: true }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 3, draft: true }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(
      provider.createPullRequest(ref, {
        owner: "ignored",
        repo: "ignored",
        title: "Compatibility fix",
        head: "chatgpt/fix",
        base: "main",
        body: "body",
        draft: true,
      }),
    ).resolves.toMatchObject({ draft: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      title: "WIP: Compatibility fix",
      head: "chatgpt/fix",
      base: "main",
      body: "body",
    });
  });

  it("fails closed when Forgejo returns the wrong PR draft state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 3, draft: false }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 3, draft: false }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 3, state: "closed" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ForgejoProvider("http://forgejo.test", "token", 1000);

    await expect(
      provider.createPullRequest(ref, {
        title: "Compatibility fix",
        head: "chatgpt/fix",
        base: "main",
        draft: true,
      }),
    ).rejects.toMatchObject({ code: "upstream_error" });
    expect(
      JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string),
    ).toEqual({
      state: "closed",
    });
  });
});
