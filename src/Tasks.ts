import {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { GaxiosResponse } from "gaxios";
import { tasks_v1 } from "googleapis";

const MAX_TASK_RESULTS = 100;

export class TaskResources {
  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    const taskId = request.params.uri.replace("gtasks:///", "");

    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });

    const taskLists = taskListsResponse.data.items || [];
    let task: tasks_v1.Schema$Task | null = null;

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const taskResponse: GaxiosResponse<tasks_v1.Schema$Task> =
            await tasks.tasks.get({
              tasklist: taskList.id,
              task: taskId,
            });
          task = taskResponse.data;
          break;
        } catch (error) {
          // Task not found in this list, continue to the next one
        }
      }
    }

    if (!task) {
      throw new Error("Task not found");
    }

    return task;
  }

  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<[tasks_v1.Schema$Task[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];

    let allTasks: tasks_v1.Schema$Task[] = [];
    let nextPageToken = null;

    for (const taskList of taskLists) {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        ...params,
      });

      const taskItems = tasksResponse.data.items || [];
      allTasks = allTasks.concat(taskItems);

      if (tasksResponse.data.nextPageToken) {
        nextPageToken = tasksResponse.data.nextPageToken;
      }
    }

    return [allTasks, nextPageToken];
  }
}

export class TaskActions {
  private static formatTask(task: tasks_v1.Schema$Task & { taskListId?: string, taskListTitle?: string }) {
    return `${task.title}\n (List: ${task.taskListTitle || 'Unknown'} [${task.taskListId || 'Unknown'}]) - (Due: ${task.due || "Not set"}) - Notes: ${task.notes} - ID: ${task.id} - Status: ${task.status} - URI: ${task.selfLink} - Hidden: ${task.hidden} - Parent: ${task.parent} - Deleted?: ${task.deleted} - Completed Date: ${task.completed} - Position: ${task.position} - Updated Date: ${task.updated} - ETag: ${task.etag} - Links: ${task.links} - Kind: ${task.kind}}`;
  }

  private static formatTaskList(taskList: (tasks_v1.Schema$Task & { taskListId?: string, taskListTitle?: string })[]) {
    return taskList.map((task) => this.formatTask(task)).join("\n");
  }

  private static async _list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    let allTasks: (tasks_v1.Schema$Task & { taskListId?: string, taskListTitle?: string })[] = [];

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id,
            maxResults: MAX_TASK_RESULTS,
          });

          const items = tasksResponse.data.items || [];
          // Add taskListId and taskListTitle to each task
          const tasksWithListInfo = items.map(task => ({
            ...task,
            taskListId: taskList.id || undefined,
            taskListTitle: taskList.title || undefined,
          }));
          
          allTasks = allTasks.concat(tasksWithListInfo as (tasks_v1.Schema$Task & { taskListId?: string, taskListTitle?: string })[]);
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
        }
      }
    }
    return allTasks;
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskTitle) {
      throw new Error("Task title is required");
    }

    const task = {
      title: taskTitle,
      notes: taskNotes,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.insert({
      tasklist: taskListId,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskUri = request.params.arguments?.uri as string;
    const taskId = request.params.arguments?.id as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskUri) {
      throw new Error("Task URI is required");
    }

    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const task = {
      id: taskId,
      title: taskTitle,
      notes: taskNotes,
      status: taskStatus,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.update({
      tasklist: taskListId,
      task: taskUri,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task updated: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const allTasks = await this._list(request, tasks);
    const taskList = this.formatTaskList(allTasks);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new Error("Task URI is required");
    }

    await tasks.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task ${taskId} deleted`,
        },
      ],
      isError: false,
    };
  }

  static async search(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const userQuery = request.params.arguments?.query as string;

    const allTasks = await this._list(request, tasks);
    const filteredItems = allTasks.filter(
      (task) =>
        task.title?.toLowerCase().includes(userQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(userQuery.toLowerCase()),
    );

    const taskList = this.formatTaskList(filteredItems);

    return {
      content: [
        {
          type: "text",
          text: `Found ${filteredItems.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async clear(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";

    await tasks.tasks.clear({
      tasklist: taskListId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Tasks from tasklist ${taskListId} cleared`,
        },
      ],
      isError: false,
    };
  }

  static async listTaskLists(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    const formattedLists = taskLists.map(list => 
      `List: ${list.title || 'Unnamed'} - ID: ${list.id} - Updated: ${list.updated}`
    ).join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Found ${taskLists.length} task lists:\n${formattedLists}`,
        },
      ],
      isError: false,
    };
  }
  
  static async moveTask(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const sourceTaskListId = request.params.arguments?.sourceTaskListId as string;
    const targetTaskListId = request.params.arguments?.targetTaskListId as string;
    const taskId = request.params.arguments?.taskId as string;
    
    if (!sourceTaskListId || !targetTaskListId || !taskId) {
      throw new Error("Source task list ID, target task list ID, and task ID are required");
    }
    
    try {
      // 1. Get the task from source list
      const taskResponse = await tasks.tasks.get({
        tasklist: sourceTaskListId,
        task: taskId,
      });
      
      const originalTask = taskResponse.data;
      
      // 2. Create the task in the target list
      const newTask = {
        title: originalTask.title,
        notes: originalTask.notes,
        due: originalTask.due,
        status: originalTask.status,
      };
      
      const newTaskResponse = await tasks.tasks.insert({
        tasklist: targetTaskListId,
        requestBody: newTask,
      });
      
      // 3. Delete the task from the source list
      await tasks.tasks.delete({
        tasklist: sourceTaskListId,
        task: taskId,
      });
      
      return {
        content: [
          {
            type: "text",
            text: `Task "${originalTask.title}" moved from list "${sourceTaskListId}" to list "${targetTaskListId}"`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error("Error moving task:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error moving task: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  static async reorganizeTasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const prefixMappings = request.params.arguments?.prefixMappings as Record<string, string>;
    const dryRun = request.params.arguments?.dryRun as boolean || false;
    
    if (!prefixMappings) {
      throw new Error("Prefix mappings are required");
    }
    
    const allTasks = await this._list(request, tasks);
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });
    
    const taskLists = taskListsResponse.data.items || [];
    const listIdByTitle: Record<string, string> = {};
    
    // Create a mapping of list titles to IDs
    taskLists.forEach(list => {
      if (list.title && list.id) {
        listIdByTitle[list.title] = list.id;
      }
    });
    
    const movePlans: Array<{
      task: tasks_v1.Schema$Task & { taskListId?: string, taskListTitle?: string },
      targetListId: string,
      targetListTitle: string,
      prefix: string
    }> = [];
    
    // Find tasks that need to be moved
    for (const task of allTasks) {
      if (!task.title || !task.taskListId) continue;
      
      for (const [prefix, targetListTitle] of Object.entries(prefixMappings)) {
        if (task.title.startsWith(`[${prefix}]`)) {
          const targetListId = listIdByTitle[targetListTitle];
          
          if (!targetListId) {
            console.warn(`Target list "${targetListTitle}" not found`);
            continue;
          }
          
          // Skip if task is already in the correct list
          if (task.taskListId === targetListId) continue;
          
          movePlans.push({
            task,
            targetListId,
            targetListTitle,
            prefix
          });
          
          break;
        }
      }
    }
    
    // Execute moves or just report in dry run mode
    const results: string[] = [];
    
    if (dryRun) {
      results.push(`Would move ${movePlans.length} tasks:`);
      
      for (const plan of movePlans) {
        results.push(`- "${plan.task.title}" from "${plan.task.taskListTitle}" to "${plan.targetListTitle}"`);
      }
    } else {
      results.push(`Moving ${movePlans.length} tasks:`);
      
      for (const plan of movePlans) {
        try {
          // Create new task
          const newTask = {
            title: plan.task.title,
            notes: plan.task.notes,
            due: plan.task.due,
            status: plan.task.status,
          };
          
          await tasks.tasks.insert({
            tasklist: plan.targetListId,
            requestBody: newTask,
          });
          
          // Delete original task
          await tasks.tasks.delete({
            tasklist: plan.task.taskListId!,
            task: plan.task.id!,
          });
          
          results.push(`- Moved "${plan.task.title}" from "${plan.task.taskListTitle}" to "${plan.targetListTitle}"`);
        } catch (error) {
          results.push(`- FAILED to move "${plan.task.title}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: results.join('\n'),
        },
      ],
      isError: false,
    };
  }
}
