#!/usr/bin/env node

import { authenticate } from "@google-cloud/local-auth";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { google, tasks_v1 } from "googleapis";
import path from "path";
import { TaskActions, TaskResources } from "./Tasks.js";

const tasks = google.tasks("v1");

const server = new Server(
  {
    name: "example-servers/gtasks",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  const [allTasks, nextPageToken] = await TaskResources.list(request, tasks);
  return {
    resources: allTasks.map((task) => ({
      uri: `gtasks:///${task.id}`,
      mimeType: "text/plain",
      name: task.title,
    })),
    nextCursor: nextPageToken,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const task = await TaskResources.read(request, tasks);

  const taskDetails = [
    `Title: ${task.title || "No title"}`,
    `Status: ${task.status || "Unknown"}`,
    `Due: ${task.due || "Not set"}`,
    `Notes: ${task.notes || "No notes"}`,
    `Hidden: ${task.hidden || "Unknown"}`,
    `Parent: ${task.parent || "Unknown"}`,
    `Deleted?: ${task.deleted || "Unknown"}`,
    `Completed Date: ${task.completed || "Unknown"}`,
    `Position: ${task.position || "Unknown"}`,
    `ETag: ${task.etag || "Unknown"}`,
    `Links: ${task.links || "Unknown"}`,
    `Kind: ${task.kind || "Unknown"}`,
    `Status: ${task.status || "Unknown"}`,
    `Created: ${task.updated || "Unknown"}`,
    `Updated: ${task.updated || "Unknown"}`,
  ].join("\n");

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "text/plain",
        text: taskDetails,
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search for a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list",
        description: "List all tasks in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            cursor: {
              type: "string",
              description: "Cursor for pagination",
            },
          },
        },
      },
      {
        name: "create",
        description: "Create a new task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            title: {
              type: "string",
              description: "Task title",
            },
            notes: {
              type: "string",
              description: "Task notes",
            },
            due: {
              type: "string",
              description: "Due date",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "clear",
        description: "Clear completed tasks from a Google Tasks task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
          },
          required: ["taskListId"],
        },
      },
      {
        name: "delete",
        description: "Delete a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            id: {
              type: "string",
              description: "Task id",
            },
          },
          required: ["id", "taskListId"],
        },
      },
      {
        name: "update",
        description: "Update a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            id: {
              type: "string",
              description: "Task ID",
            },
            uri: {
              type: "string",
              description: "Task URI",
            },
            title: {
              type: "string",
              description: "Task title",
            },
            notes: {
              type: "string",
              description: "Task notes",
            },
            status: {
              type: "string",
              enum: ["needsAction", "completed"],
              description: "Task status (needsAction or completed)",
            },
            due: {
              type: "string",
              description: "Due date",
            },
          },
          required: ["id", "uri"],
        },
      },
      {
        name: "listTaskLists",
        description: "List all task lists in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "moveTask",
        description: "Move a task from one task list to another",
        inputSchema: {
          type: "object",
          properties: {
            sourceTaskListId: {
              type: "string", 
              description: "Source task list ID"
            },
            targetTaskListId: {
              type: "string",
              description: "Target task list ID"
            },
            taskId: {
              type: "string",
              description: "Task ID to move"
            }
          },
          required: ["sourceTaskListId", "targetTaskListId", "taskId"]
        }
      },
      {
        name: "reorganizeTasks",
        description: "Reorganize tasks to appropriate lists based on prefixes",
        inputSchema: {
          type: "object",
          properties: {
            prefixMappings: {
              type: "object",
              description: "Mapping of prefixes to task list titles, e.g. {\"ADMIN\": \"Admin Tasks\"}"
            },
            dryRun: {
              type: "boolean",
              description: "If true, only show what would be moved without making changes"
            }
          },
          required: ["prefixMappings"]
        }
      },
      {
        name: "batchCreateTasks",
        description: "Create multiple tasks at once, optionally in different lists",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              description: "Array of tasks to create",
              items: {
                type: "object",
                properties: {
                  taskListId: {
                    type: "string",
                    description: "Task list ID"
                  },
                  title: {
                    type: "string",
                    description: "Task title"
                  },
                  notes: {
                    type: "string",
                    description: "Task notes"
                  },
                  due: {
                    type: "string",
                    description: "Due date"
                  },
                  status: {
                    type: "string",
                    enum: ["needsAction", "completed"],
                    description: "Task status"
                  }
                },
                required: ["title"]
              }
            }
          },
          required: ["tasks"]
        }
      },
      {
        name: "batchUpdateTasks",
        description: "Update multiple tasks at once",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              description: "Array of tasks to update",
              items: {
                type: "object",
                properties: {
                  taskListId: {
                    type: "string",
                    description: "Task list ID"
                  },
                  taskId: {
                    type: "string",
                    description: "Task ID"
                  },
                  title: {
                    type: "string",
                    description: "Task title"
                  },
                  notes: {
                    type: "string",
                    description: "Task notes"
                  },
                  due: {
                    type: "string",
                    description: "Due date"
                  },
                  status: {
                    type: "string",
                    enum: ["needsAction", "completed"],
                    description: "Task status"
                  }
                },
                required: ["taskListId", "taskId"]
              }
            }
          },
          required: ["tasks"]
        }
      },
      {
        name: "batchDeleteTasks",
        description: "Delete multiple tasks at once",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              description: "Array of tasks to delete",
              items: {
                type: "object",
                properties: {
                  taskListId: {
                    type: "string",
                    description: "Task list ID"
                  },
                  taskId: {
                    type: "string",
                    description: "Task ID"
                  }
                },
                required: ["taskListId", "taskId"]
              }
            }
          },
          required: ["tasks"]
        }
      },
      {
        name: "batchMoveTasks",
        description: "Move multiple tasks between lists at once",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              description: "Array of tasks to move",
              items: {
                type: "object",
                properties: {
                  sourceTaskListId: {
                    type: "string",
                    description: "Source task list ID"
                  },
                  targetTaskListId: {
                    type: "string",
                    description: "Target task list ID"
                  },
                  taskId: {
                    type: "string",
                    description: "Task ID"
                  }
                },
                required: ["sourceTaskListId", "targetTaskListId", "taskId"]
              }
            }
          },
          required: ["tasks"]
        }
      },
      {
        name: "batchCreateTaskLists",
        description: "Create multiple task lists at once",
        inputSchema: {
          type: "object",
          properties: {
            lists: {
              type: "array",
              description: "Array of lists to create",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "List title"
                  }
                },
                required: ["title"]
              }
            }
          },
          required: ["lists"]
        }
      },
      {
        name: "batchUpdateTaskLists",
        description: "Update multiple task lists at once",
        inputSchema: {
          type: "object",
          properties: {
            lists: {
              type: "array",
              description: "Array of lists to update",
              items: {
                type: "object",
                properties: {
                  listId: {
                    type: "string",
                    description: "List ID"
                  },
                  title: {
                    type: "string",
                    description: "List title"
                  }
                },
                required: ["listId", "title"]
              }
            }
          },
          required: ["lists"]
        }
      },
      {
        name: "batchDeleteTaskLists",
        description: "Delete multiple task lists at once",
        inputSchema: {
          type: "object",
          properties: {
            lists: {
              type: "array",
              description: "Array of lists to delete",
              items: {
                type: "object",
                properties: {
                  listId: {
                    type: "string",
                    description: "List ID"
                  }
                },
                required: ["listId"]
              }
            }
          },
          required: ["lists"]
        }
      },
      {
        name: "makeSubtask",
        description: "Make an existing task a subtask of another task",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID containing both tasks"
            },
            taskId: {
              type: "string",
              description: "Task ID to make a subtask"
            },
            parentTaskId: {
              type: "string",
              description: "Parent task ID"
            }
          },
          required: ["taskListId", "taskId", "parentTaskId"]
        }
      },
      {
        name: "createSubtask",
        description: "Create a new task as a subtask of an existing task",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID"
            },
            parentTaskId: {
              type: "string",
              description: "Parent task ID"
            },
            title: {
              type: "string",
              description: "Task title"
            },
            notes: {
              type: "string",
              description: "Task notes"
            },
            due: {
              type: "string",
              description: "Due date"
            },
            status: {
              type: "string",
              enum: ["needsAction", "completed"],
              description: "Task status"
            }
          },
          required: ["parentTaskId", "title"]
        }
      },
      {
        name: "listSubtasks",
        description: "List all subtasks of a parent task",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID"
            },
            parentTaskId: {
              type: "string",
              description: "Parent task ID"
            }
          },
          required: ["taskListId", "parentTaskId"]
        }
      },
      {
        name: "batchCreateSubtasks",
        description: "Create multiple subtasks at once under different parent tasks",
        inputSchema: {
          type: "object",
          properties: {
            subtasks: {
              type: "array",
              description: "Array of subtasks to create",
              items: {
                type: "object",
                properties: {
                  taskListId: {
                    type: "string",
                    description: "Task list ID"
                  },
                  parentTaskId: {
                    type: "string",
                    description: "Parent task ID"
                  },
                  title: {
                    type: "string",
                    description: "Task title"
                  },
                  notes: {
                    type: "string",
                    description: "Task notes"
                  },
                  due: {
                    type: "string",
                    description: "Due date"
                  },
                  status: {
                    type: "string",
                    enum: ["needsAction", "completed"],
                    description: "Task status"
                  }
                },
                required: ["parentTaskId", "title"]
              }
            }
          },
          required: ["subtasks"]
        }
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const taskResult = await TaskActions.search(request, tasks);
    return taskResult;
  }
  if (request.params.name === "list") {
    const taskResult = await TaskActions.list(request, tasks);
    return taskResult;
  }
  if (request.params.name === "create") {
    const taskResult = await TaskActions.create(request, tasks);
    return taskResult;
  }
  if (request.params.name === "update") {
    const taskResult = await TaskActions.update(request, tasks);
    return taskResult;
  }
  if (request.params.name === "delete") {
    const taskResult = await TaskActions.delete(request, tasks);
    return taskResult;
  }
  if (request.params.name === "clear") {
    const taskResult = await TaskActions.clear(request, tasks);
    return taskResult;
  }
  if (request.params.name === "listTaskLists") {
    const taskResult = await TaskActions.listTaskLists(request, tasks);
    return taskResult;
  }
  if (request.params.name === "moveTask") {
    const taskResult = await TaskActions.moveTask(request, tasks);
    return taskResult;
  }
  if (request.params.name === "reorganizeTasks") {
    const taskResult = await TaskActions.reorganizeTasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchCreateTasks") {
    const taskResult = await TaskActions.batchCreateTasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchUpdateTasks") {
    const taskResult = await TaskActions.batchUpdateTasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchDeleteTasks") {
    const taskResult = await TaskActions.batchDeleteTasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchMoveTasks") {
    const taskResult = await TaskActions.batchMoveTasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchCreateTaskLists") {
    const taskResult = await TaskActions.batchCreateTaskLists(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchUpdateTaskLists") {
    const taskResult = await TaskActions.batchUpdateTaskLists(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchDeleteTaskLists") {
    const taskResult = await TaskActions.batchDeleteTaskLists(request, tasks);
    return taskResult;
  }
  if (request.params.name === "makeSubtask") {
    const taskResult = await TaskActions.makeSubtask(request, tasks);
    return taskResult;
  }
  if (request.params.name === "createSubtask") {
    const taskResult = await TaskActions.createSubtask(request, tasks);
    return taskResult;
  }
  if (request.params.name === "listSubtasks") {
    const taskResult = await TaskActions.listSubtasks(request, tasks);
    return taskResult;
  }
  if (request.params.name === "batchCreateSubtasks") {
    const taskResult = await TaskActions.batchCreateSubtasks(request, tasks);
    return taskResult;
  }
  throw new Error("Tool not found");
});

const credentialsPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../.gtasks-server-credentials.json",
);

async function authenticateAndSaveCredentials() {
  console.log("Launching auth flow…");
  const p = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../gcp-oauth.keys.json",
  );

  console.log(p);
  const auth = await authenticate({
    keyfilePath: p,
    scopes: ["https://www.googleapis.com/auth/tasks"],
  });
  fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log("Credentials saved. You can now run the server.");
}

async function loadCredentialsAndRunServer() {
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found. Please run with 'auth' argument first.",
    );
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  const auth = new google.auth.OAuth2();
  auth.setCredentials(credentials);
  google.options({ auth });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[2] === "auth") {
  authenticateAndSaveCredentials().catch(console.error);
} else {
  loadCredentialsAndRunServer().catch(console.error);
}
