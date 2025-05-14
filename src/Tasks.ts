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
    try {
      const taskListsResponse = await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });

      // Better null checking
      const taskLists = taskListsResponse?.data?.items || [];
      
      // More defensive formatting with fallbacks
      const formattedLists = taskLists.map(list => 
        `List: ${list?.title || 'Unnamed'} - ID: ${list?.id || 'Unknown'} - Updated: ${list?.updated || 'Unknown'}`
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
    } catch (error) {
      console.error("Error listing task lists:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing task lists: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
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
      let originalTask;
      try {
        const taskResponse = await tasks.tasks.get({
          tasklist: sourceTaskListId,
          task: taskId,
        });
        
        originalTask = taskResponse?.data;
        
        if (!originalTask || !originalTask.title) {
          throw new Error(`Task not found or has invalid format`);
        }
      } catch (error) {
        throw new Error(`Could not get source task: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 2. Create the task in the target list
      let newTaskId;
      try {
        const newTask = {
          title: originalTask.title || "Untitled Task",
          notes: originalTask.notes || "",
          due: originalTask.due || undefined,
          status: originalTask.status || "needsAction",
        };
        
        const newTaskResponse = await tasks.tasks.insert({
          tasklist: targetTaskListId,
          requestBody: newTask,
        });
        
        newTaskId = newTaskResponse?.data?.id;
        
        if (!newTaskId) {
          throw new Error("Failed to create new task - no ID returned");
        }
      } catch (error) {
        throw new Error(`Could not create task in target list: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 3. Delete the task from the source list
      try {
        await tasks.tasks.delete({
          tasklist: sourceTaskListId,
          task: taskId,
        });
      } catch (error) {
        console.error(`Warning: Created task ${newTaskId} in ${targetTaskListId} but failed to delete original: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [
            {
              type: "text",
              text: `Task "${originalTask.title}" was copied to list "${targetTaskListId}" but could not be deleted from source list. You may need to delete it manually.`,
            },
          ],
          isError: false,
        };
      }
      
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
    
    if (!prefixMappings || Object.keys(prefixMappings).length === 0) {
      throw new Error("Prefix mappings are required and must not be empty");
    }
    
    try {
      const allTasks = await this._list(request, tasks);
      const taskListsResponse = await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });
      
      const taskLists = taskListsResponse?.data?.items || [];
      const listIdByTitle: Record<string, string> = {};
      const listIdByNormalizedTitle: Record<string, string> = {};
      
      // Create a mapping of list titles to IDs, including normalized versions for better matching
      taskLists.forEach(list => {
        if (list?.title && list?.id) {
          // Store by exact title
          listIdByTitle[list.title] = list.id;
          
          // Also store by normalized title (lowercase and trimmed)
          const normalizedTitle = list.title.toLowerCase().trim();
          listIdByNormalizedTitle[normalizedTitle] = list.id;
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
        if (!task?.title || !task?.taskListId || !task?.id) continue;
        
        for (const [prefix, targetListTitle] of Object.entries(prefixMappings)) {
          if (task.title.startsWith(`[${prefix}]`)) {
            // Try exact match first
            let targetListId = listIdByTitle[targetListTitle];
            
            // If not found, try normalized match
            if (!targetListId) {
              const normalizedTargetTitle = targetListTitle.toLowerCase().trim();
              targetListId = listIdByNormalizedTitle[normalizedTargetTitle];
            }
            
            if (!targetListId) {
              console.warn(`Target list "${targetListTitle}" not found. Available lists: ${Object.keys(listIdByTitle).join(", ")}`);
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
      let successCount = 0;
      let failureCount = 0;
      
      if (dryRun) {
        results.push(`Would move ${movePlans.length} tasks:`);
        
        for (const plan of movePlans) {
          results.push(`- "${plan.task.title}" from "${plan.task.taskListTitle || 'Unknown list'}" to "${plan.targetListTitle}"`);
        }
      } else {
        results.push(`Moving ${movePlans.length} tasks:`);
        
        for (const plan of movePlans) {
          try {
            if (!plan.task.title || !plan.task.id) {
              results.push(`- SKIPPED task with missing title or ID`);
              continue;
            }
            
            // Create new task
            const newTask = {
              title: plan.task.title,
              notes: plan.task.notes || "",
              due: plan.task.due || undefined,
              status: plan.task.status || "needsAction",
            };
            
            // Insert new task
            const newTaskResponse = await tasks.tasks.insert({
              tasklist: plan.targetListId,
              requestBody: newTask,
            });
            
            if (!newTaskResponse?.data?.id) {
              throw new Error("Failed to create new task - no ID returned");
            }
            
            // Delete original task
            await tasks.tasks.delete({
              tasklist: plan.task.taskListId,
              task: plan.task.id,
            });
            
            results.push(`- Moved "${plan.task.title}" from "${plan.task.taskListTitle || 'Unknown list'}" to "${plan.targetListTitle}"`);
            successCount++;
          } catch (error) {
            results.push(`- FAILED to move "${plan.task.title}": ${error instanceof Error ? error.message : String(error)}`);
            failureCount++;
          }
        }
        
        results.push(`\nSummary: ${successCount} tasks moved successfully, ${failureCount} failed.`);
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
    } catch (error) {
      console.error("Error reorganizing tasks:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error reorganizing tasks: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Batch operations
  static async batchCreateTasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskBatch = request.params.arguments?.tasks as Array<{
      taskListId?: string,
      title: string,
      notes?: string,
      due?: string,
      status?: string
    }>;
    
    if (!taskBatch || !Array.isArray(taskBatch) || taskBatch.length === 0) {
      throw new Error("tasks array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const taskData of taskBatch) {
      const taskListId = taskData.taskListId || "@default";
      
      if (!taskData.title) {
        errors.push({ error: "Task title is required", taskData });
        continue;
      }
      
      try {
        const task = {
          title: taskData.title,
          notes: taskData.notes || "",
          due: taskData.due,
          status: taskData.status || "needsAction",
        };
        
        const taskResponse = await tasks.tasks.insert({
          tasklist: taskListId,
          requestBody: task,
        });
        
        results.push({
          success: true,
          taskId: taskResponse.data.id,
          title: taskResponse.data.title,
          taskListId: taskListId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          taskData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task creation: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- Task "${r.title}" created in list "${r.taskListId}" with ID: ${r.taskId}`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to create task: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
  
  static async batchUpdateTasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskBatch = request.params.arguments?.tasks as Array<{
      taskListId: string,
      taskId: string,
      title?: string,
      notes?: string,
      due?: string,
      status?: string
    }>;
    
    if (!taskBatch || !Array.isArray(taskBatch) || taskBatch.length === 0) {
      throw new Error("tasks array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const taskData of taskBatch) {
      if (!taskData.taskListId || !taskData.taskId) {
        errors.push({ error: "Task list ID and task ID are required", taskData });
        continue;
      }
      
      try {
        // Create a task object with only the fields to update
        const task: any = {
          id: taskData.taskId
        };
        
        if (taskData.title !== undefined) task.title = taskData.title;
        if (taskData.notes !== undefined) task.notes = taskData.notes;
        if (taskData.due !== undefined) task.due = taskData.due;
        if (taskData.status !== undefined) task.status = taskData.status;
        
        const taskResponse = await tasks.tasks.patch({
          tasklist: taskData.taskListId,
          task: taskData.taskId,
          requestBody: task,
        });
        
        results.push({
          success: true,
          taskId: taskResponse.data.id,
          title: taskResponse.data.title,
          taskListId: taskData.taskListId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          taskData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task update: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- Task "${r.title}" updated in list "${r.taskListId}"`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to update task: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
  
  static async batchDeleteTasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskBatch = request.params.arguments?.tasks as Array<{
      taskListId: string,
      taskId: string
    }>;
    
    if (!taskBatch || !Array.isArray(taskBatch) || taskBatch.length === 0) {
      throw new Error("tasks array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const taskData of taskBatch) {
      if (!taskData.taskListId || !taskData.taskId) {
        errors.push({ error: "Task list ID and task ID are required", taskData });
        continue;
      }
      
      try {
        await tasks.tasks.delete({
          tasklist: taskData.taskListId,
          task: taskData.taskId,
        });
        
        results.push({
          success: true,
          taskId: taskData.taskId,
          taskListId: taskData.taskListId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          taskData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task deletion: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- Task ${r.taskId} deleted from list "${r.taskListId}"`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to delete task: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
  
  static async batchMoveTasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskBatch = request.params.arguments?.tasks as Array<{
      sourceTaskListId: string,
      targetTaskListId: string,
      taskId: string
    }>;
    
    if (!taskBatch || !Array.isArray(taskBatch) || taskBatch.length === 0) {
      throw new Error("tasks array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    const warnings = [];
    
    for (const moveData of taskBatch) {
      if (!moveData.sourceTaskListId || !moveData.targetTaskListId || !moveData.taskId) {
        errors.push({ error: "Source task list ID, target task list ID, and task ID are required", moveData });
        continue;
      }
      
      try {
        // 1. Get the task from source list
        let originalTask;
        try {
          const taskResponse = await tasks.tasks.get({
            tasklist: moveData.sourceTaskListId,
            task: moveData.taskId,
          });
          
          originalTask = taskResponse?.data;
          
          if (!originalTask || !originalTask.title) {
            throw new Error(`Task not found or has invalid format`);
          }
        } catch (error) {
          throw new Error(`Could not get source task: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 2. Create the task in the target list
        let newTaskId;
        try {
          const newTask = {
            title: originalTask.title || "Untitled Task",
            notes: originalTask.notes || "",
            due: originalTask.due || undefined,
            status: originalTask.status || "needsAction",
          };
          
          const newTaskResponse = await tasks.tasks.insert({
            tasklist: moveData.targetTaskListId,
            requestBody: newTask,
          });
          
          newTaskId = newTaskResponse?.data?.id;
          
          if (!newTaskId) {
            throw new Error("Failed to create new task - no ID returned");
          }
        } catch (error) {
          throw new Error(`Could not create task in target list: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 3. Delete the task from the source list
        try {
          await tasks.tasks.delete({
            tasklist: moveData.sourceTaskListId,
            task: moveData.taskId,
          });
        } catch (error) {
          const warning = `Created task ${newTaskId} in ${moveData.targetTaskListId} but failed to delete original: ${error instanceof Error ? error.message : String(error)}`;
          console.error(warning);
          warnings.push({
            warning,
            moveData,
            partialSuccess: true,
            originalTaskId: moveData.taskId,
            newTaskId: newTaskId,
            title: originalTask.title
          });
          continue;
        }
        
        results.push({
          success: true,
          originalTaskId: moveData.taskId,
          newTaskId: newTaskId,
          title: originalTask.title,
          sourceTaskListId: moveData.sourceTaskListId,
          targetTaskListId: moveData.targetTaskListId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          moveData
        });
      }
    }
    
    let summaryText = `Batch task move: ${results.length} succeeded, ${errors.length} failed`;
    if (warnings.length > 0) {
      summaryText += `, ${warnings.length} partial (created but not deleted)`;
    }
    
    let resultText = `\n\nSuccesses:\n${results.map(r => `- Task "${r.title}" moved from list "${r.sourceTaskListId}" to list "${r.targetTaskListId}"`).join('\n')}`;
    
    if (warnings.length > 0) {
      resultText += `\n\nPartial Successes (created but not deleted from source):\n${warnings.map(w => `- Task "${w.title}" copied to list "${w.moveData.targetTaskListId}" but not removed from "${w.moveData.sourceTaskListId}"`).join('\n')}`;
    }
    
    if (errors.length > 0) {
      resultText += `\n\nErrors:\n${errors.map(e => `- Failed to move task: ${e.error}`).join('\n')}`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: summaryText + resultText,
        },
      ],
      isError: false,
    };
  }
  
  static async batchCreateTaskLists(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const listBatch = request.params.arguments?.lists as Array<{
      title: string
    }>;
    
    if (!listBatch || !Array.isArray(listBatch) || listBatch.length === 0) {
      throw new Error("lists array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const listData of listBatch) {
      if (!listData.title) {
        errors.push({ error: "Task list title is required", listData });
        continue;
      }
      
      try {
        const taskListResponse = await tasks.tasklists.insert({
          requestBody: {
            title: listData.title
          }
        });
        
        results.push({
          success: true,
          listId: taskListResponse.data.id,
          title: taskListResponse.data.title
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          listData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task list creation: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- List "${r.title}" created with ID: ${r.listId}`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to create list: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
  
  static async batchUpdateTaskLists(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const listBatch = request.params.arguments?.lists as Array<{
      listId: string,
      title: string
    }>;
    
    if (!listBatch || !Array.isArray(listBatch) || listBatch.length === 0) {
      throw new Error("lists array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const listData of listBatch) {
      if (!listData.listId || !listData.title) {
        errors.push({ error: "Task list ID and title are required", listData });
        continue;
      }
      
      try {
        const taskListResponse = await tasks.tasklists.update({
          tasklist: listData.listId,
          requestBody: {
            id: listData.listId,
            title: listData.title
          }
        });
        
        results.push({
          success: true,
          listId: taskListResponse.data.id,
          title: taskListResponse.data.title
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          listData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task list update: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- List "${r.title}" updated with ID: ${r.listId}`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to update list: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
  
  static async batchDeleteTaskLists(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const listBatch = request.params.arguments?.lists as Array<{
      listId: string
    }>;
    
    if (!listBatch || !Array.isArray(listBatch) || listBatch.length === 0) {
      throw new Error("lists array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const listData of listBatch) {
      if (!listData.listId) {
        errors.push({ error: "Task list ID is required", listData });
        continue;
      }
      
      try {
        await tasks.tasklists.delete({
          tasklist: listData.listId
        });
        
        results.push({
          success: true,
          listId: listData.listId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          listData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch task list deletion: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- List ${r.listId} deleted`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to delete list: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }

  // Subtask operations
  static async makeSubtask(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.taskListId as string;
    const taskId = request.params.arguments?.taskId as string;
    const parentTaskId = request.params.arguments?.parentTaskId as string;
    
    if (!taskListId || !taskId || !parentTaskId) {
      throw new Error("Task list ID, task ID, and parent task ID are required");
    }
    
    try {
      // Verify both tasks exist in the specified list
      try {
        await tasks.tasks.get({
          tasklist: taskListId,
          task: taskId,
        });
        
        await tasks.tasks.get({
          tasklist: taskListId,
          task: parentTaskId,
        });
      } catch (error) {
        throw new Error(`Could not verify tasks: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Use the move method with parent parameter to make a task a subtask
      try {
        const taskResponse = await tasks.tasks.move({
          tasklist: taskListId,
          task: taskId,
          parent: parentTaskId
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Task "${taskResponse.data.title}" is now a subtask of task with ID ${parentTaskId}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        throw new Error(`Could not make subtask: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error("Error making subtask:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error making subtask: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  static async createSubtask(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.taskListId as string || "@default";
    const parentTaskId = request.params.arguments?.parentTaskId as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;
    
    if (!parentTaskId || !taskTitle) {
      throw new Error("Parent task ID and task title are required");
    }
    
    try {
      // Verify parent task exists
      try {
        await tasks.tasks.get({
          tasklist: taskListId,
          task: parentTaskId,
        });
      } catch (error) {
        throw new Error(`Could not verify parent task: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Create the subtask
      try {
        const task = {
          title: taskTitle,
          notes: taskNotes || "",
          due: taskDue,
          status: taskStatus || "needsAction"
          // parent should not be included in the requestBody
        };
        
        const taskResponse = await tasks.tasks.insert({
          tasklist: taskListId,
          requestBody: task,
          parent: parentTaskId // Pass parent as a parameter to the method
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Subtask "${taskResponse.data.title}" created under parent task with ID ${parentTaskId}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        throw new Error(`Could not create subtask: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error("Error creating subtask:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating subtask: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  static async listSubtasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId = request.params.arguments?.taskListId as string || "@default";
    const parentTaskId = request.params.arguments?.parentTaskId as string;
    
    if (!taskListId || !parentTaskId) {
      throw new Error("Task list ID and parent task ID are required");
    }
    
    try {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskListId,
        maxResults: MAX_TASK_RESULTS,
      });
      
      const items = tasksResponse.data.items || [];
      
      // Get the parent task for reference
      let parentTask;
      try {
        const parentResponse = await tasks.tasks.get({
          tasklist: taskListId,
          task: parentTaskId,
        });
        parentTask = parentResponse.data;
      } catch (error) {
        throw new Error(`Could not get parent task: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Filter for subtasks of the specified parent
      const subtasks = items.filter(task => task.parent === parentTaskId)
        .map(task => ({
          ...task,
          taskListId: taskListId,
          taskListTitle: "", // We don't have this info readily available
        }));
      
      const formattedTasks = this.formatTaskList(subtasks);
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${subtasks.length} subtasks for "${parentTask.title || 'Unknown task'}":\n${formattedTasks}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error("Error listing subtasks:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing subtasks: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  static async batchCreateSubtasks(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const subtaskBatch = request.params.arguments?.subtasks as Array<{
      taskListId?: string,
      parentTaskId: string,
      title: string,
      notes?: string,
      due?: string,
      status?: string
    }>;
    
    if (!subtaskBatch || !Array.isArray(subtaskBatch) || subtaskBatch.length === 0) {
      throw new Error("subtasks array is required and must not be empty");
    }
    
    const results = [];
    const errors = [];
    
    for (const subtaskData of subtaskBatch) {
      const taskListId = subtaskData.taskListId || "@default";
      
      if (!subtaskData.parentTaskId || !subtaskData.title) {
        errors.push({ error: "Parent task ID and title are required", subtaskData });
        continue;
      }
      
      try {
        // Verify parent task exists
        try {
          await tasks.tasks.get({
            tasklist: taskListId,
            task: subtaskData.parentTaskId,
          });
        } catch (error) {
          throw new Error(`Could not verify parent task: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Create the subtask
        const task = {
          title: subtaskData.title,
          notes: subtaskData.notes || "",
          due: subtaskData.due,
          status: subtaskData.status || "needsAction"
          // parent should not be included in the requestBody
        };
        
        const taskResponse = await tasks.tasks.insert({
          tasklist: taskListId,
          requestBody: task,
          parent: subtaskData.parentTaskId // Pass parent as a parameter to the method
        });
        
        results.push({
          success: true,
          taskId: taskResponse.data.id,
          title: taskResponse.data.title,
          parentTaskId: subtaskData.parentTaskId,
          taskListId: taskListId
        });
      } catch (error) {
        errors.push({
          error: error instanceof Error ? error.message : String(error),
          subtaskData
        });
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Batch subtask creation: ${results.length} succeeded, ${errors.length} failed\n\nSuccesses:\n${results.map(r => `- Subtask "${r.title}" created under parent task ${r.parentTaskId} with ID: ${r.taskId}`).join('\n')}${errors.length > 0 ? `\n\nErrors:\n${errors.map(e => `- Failed to create subtask: ${e.error}`).join('\n')}` : ''}`,
        },
      ],
      isError: false,
    };
  }
}
