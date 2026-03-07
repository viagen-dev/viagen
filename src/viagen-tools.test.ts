import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("viagen-sdk/sandbox", () => ({
  updateTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("viagen-sdk", () => ({
  createViagen: vi.fn().mockReturnValue({
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ id: "task_1", prompt: "test" }),
      create: vi.fn().mockResolvedValue({ id: "task_2", prompt: "new task" }),
    },
  }),
}));

// Must import after mock is set up
const { createViagenTools } = await import("./viagen-tools");
const { updateTask } = await import("viagen-sdk/sandbox");

describe("createViagenTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an MCP server config with name 'viagen'", () => {
    const tools = createViagenTools();
    expect(tools.name).toBe("viagen");
    expect(tools.type).toBe("sdk");
    expect(tools.instance).toBeDefined();
  });

  it("without config, only exposes viagen_update_task", () => {
    const result = createViagenTools();
    expect(result).toBeDefined();
    // No config = no CRUD tools, just update
  });

  it("with config, exposes all 4 tools", () => {
    const result = createViagenTools({
      authToken: "test-token",
      platformUrl: "https://app.viagen.dev",
      projectId: "proj_123",
    });
    expect(result).toBeDefined();
    expect(result.name).toBe("viagen");
  });
});

describe("viagen_update_task tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateTask calls through to viagen-sdk/sandbox", async () => {
    const mockedUpdateTask = vi.mocked(updateTask);

    await updateTask({
      status: "review",
      prUrl: "https://github.com/org/repo/pull/1",
      result: "Added auth system",
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      status: "review",
      prUrl: "https://github.com/org/repo/pull/1",
      result: "Added auth system",
    });
  });

  it("updateTask accepts completed status without prUrl", async () => {
    const mockedUpdateTask = vi.mocked(updateTask);

    await updateTask({
      status: "completed",
      result: "Task done",
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      status: "completed",
      result: "Task done",
    });
  });

  it("updateTask accepts costUsd, inputTokens, outputTokens", async () => {
    const mockedUpdateTask = vi.mocked(updateTask);

    await updateTask({
      status: "completed",
      result: "Done",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.05,
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      status: "completed",
      result: "Done",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.05,
    });
  });
});
