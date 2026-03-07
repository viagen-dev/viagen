import { z } from "zod/v4";
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
  type CanUseTool,
} from "@anthropic-ai/claude-agent-sdk";
import { updateTask } from "viagen-sdk/sandbox";
import { createViagen, type ViagenClient } from "viagen-sdk";

export interface ViagenToolsConfig {
  authToken: string;
  platformUrl: string;
  projectId: string;
}

/**
 * Creates an in-process MCP tool server that exposes platform reporting tools.
 * Used when running inside a viagen sandbox (VIAGEN_CALLBACK_URL etc. are set).
 *
 * When `config` is provided, also exposes task CRUD tools (list, get, create).
 */
export function createViagenTools(
  config?: ViagenToolsConfig,
): McpSdkServerConfigWithInstance {
  let client: ViagenClient | undefined;
  let projectId: string | undefined;

  if (config) {
    client = createViagen({
      baseUrl: config.platformUrl,
      token: config.authToken,
    });
    projectId = config.projectId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [
    tool(
      "viagen_update_task",
      "Report task status back to the viagen platform. Use status 'review' after creating a PR (ready for human review) or 'completed' when the task is fully done.",
      {
        status: z.enum(["review", "completed"]).describe(
          "'review' = PR created, ready for review. 'completed' = task fully done.",
        ),
        prUrl: z
          .string()
          .optional()
          .describe("Full URL of the pull request, if one was created."),
        result: z
          .string()
          .describe("Brief one-line summary of what was done."),
        inputTokens: z.number().optional().describe("Total input tokens used."),
        outputTokens: z
          .number()
          .optional()
          .describe("Total output tokens used."),
        costUsd: z
          .number()
          .optional()
          .describe("Total cost in USD."),
      },
      async (args) => {
        await updateTask({
          status: args.status,
          prUrl: args.prUrl,
          result: args.result,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          costUsd: args.costUsd,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Task status updated to '${args.status}'.`,
            },
          ],
        };
      },
    ),
  ];

  // Add CRUD tools when SDK client is available
  if (client && projectId) {
    const c = client;
    const pid = projectId;

    tools.push(
      tool(
        "viagen_list_tasks",
        "List tasks in the current project. Optionally filter by status.",
        {
          status: z
            .enum(["ready", "running", "validating", "completed", "timed_out"])
            .optional()
            .describe("Filter tasks by status."),
        },
        async (args) => {
          const tasks = await c.tasks.list(pid, args.status);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(tasks, null, 2),
              },
            ],
          };
        },
      ),
    );

    tools.push(
      tool(
        "viagen_get_task",
        "Get full details of a specific task by ID.",
        {
          taskId: z.string().describe("The task ID to retrieve."),
        },
        async (args) => {
          const task = await c.tasks.get(pid, args.taskId);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(task, null, 2),
              },
            ],
          };
        },
      ),
    );

    tools.push(
      tool(
        "viagen_create_task",
        "Create a new task in the current project. Use this to create follow-up work.",
        {
          prompt: z
            .string()
            .describe("The task prompt / instructions."),
          branch: z
            .string()
            .optional()
            .describe("Git branch name for the task."),
          type: z
            .enum(["task", "plan"])
            .optional()
            .describe("Task type: 'task' for code changes, 'plan' for implementation plans."),
        },
        async (args) => {
          const task = await c.tasks.create(pid, {
            prompt: args.prompt,
            branch: args.branch,
            type: args.type,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(task, null, 2),
              },
            ],
          };
        },
      ),
    );
  }

  return createSdkMcpServer({ name: "viagen", tools });
}

/**
 * Plan mode tool restrictions.
 * Blocks Edit/NotebookEdit via disallowedTools; restricts Write to plans/ only.
 */
export const PLAN_MODE_DISALLOWED_TOOLS = ["Edit", "NotebookEdit"];

export const planModeCanUseTool: CanUseTool = async (toolName, input) => {
  if (toolName === "Write") {
    const filePath = (input as { file_path?: string }).file_path ?? "";
    if (!filePath.includes("/plans/") && !filePath.startsWith("plans/")) {
      return {
        behavior: "deny" as const,
        message:
          "In plan mode, you can only write files inside the plans/ directory.",
      };
    }
  }
  return { behavior: "allow" as const };
};

/**
 * System prompt for plan-mode tasks.
 * The agent explores the codebase and produces a markdown plan without
 * modifying existing code.
 */
export const PLAN_SYSTEM_PROMPT = `
You are running in PLAN mode. Your job is to explore the codebase and produce a detailed implementation plan — you must NOT modify any existing code.

Steps:
1. Use Read, Glob, and Grep to explore the codebase and understand the relevant architecture.
2. Write your plan as a markdown file to plans/<slug>.md (create the plans/ directory if needed). The slug should be a short kebab-case name derived from the task prompt.
3. Commit the plan file, push the branch, and create a pull request using the GitHub REST API (GITHUB_TOKEN is available in your environment).
4. Report back using the viagen_update_task tool with status "review" and include the PR URL.

Constraints:
- Do NOT edit, delete, or overwrite any existing files.
- Only create new files inside the plans/ directory.
- Your plan should include: context, proposed changes (with file paths and descriptions), implementation order, and potential risks.
`;

/**
 * System prompt addition for task-aware sandbox sessions.
 */
export const TASK_TOOLS_PROMPT = `
You have access to viagen platform tools for task management:
- viagen_list_tasks: List tasks in this project (optionally filter by status)
- viagen_get_task: Get full details of a specific task
- viagen_create_task: Create follow-up tasks for work you identify
- viagen_update_task: Report your current task status ('review' or 'completed')

Use these to understand project context and create follow-up work when appropriate.
`;
