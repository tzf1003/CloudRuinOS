/**
 * 任务管理器
 * 
 * 负责：
 * 1. 任务创建和队列管理
 * 2. 任务状态追踪
 * 3. 任务分发和取消
 */

export interface Task {
  task_id: string;
  revision: number;
  type: TaskType;
  desired_state: DesiredState;
  payload: any;
  created_at: number;
  updated_at: number;
  device_id: string;
  agent_state?: TaskState;
  agent_progress?: number;
  agent_output?: string;
  agent_error?: string;
}

export type TaskType = 'config_update' | 'cmd_exec';

export type DesiredState = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type TaskState = 'received' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface TaskReport {
  task_id: string;
  state: TaskState;
  progress?: number;
  output_chunk?: string;
  output_cursor?: number;
  error?: string;
}

export interface CancelItem {
  task_id: string;
  revision: number;
  desired_state: 'canceled';
}

/**
 * 任务管理器类
 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private deviceTasks: Map<string, Set<string>> = new Map();
  private outputCursors: Map<string, number> = new Map();

  /**
   * 为设备创建任务
   */
  createTask(deviceId: string, type: TaskType, payload: any): Task {
    const task: Task = {
      task_id: this.generateTaskId(),
      revision: 1,
      type,
      desired_state: 'pending',
      payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      device_id: deviceId,
    };

    this.tasks.set(task.task_id, task);

    if (!this.deviceTasks.has(deviceId)) {
      this.deviceTasks.set(deviceId, new Set());
    }
    this.deviceTasks.get(deviceId)!.add(task.task_id);

    console.log(`Created task ${task.task_id} for device ${deviceId}`);
    return task;
  }

  /**
   * 获取设备的待下发任务
   */
  getPendingTasks(deviceId: string): Task[] {
    const taskIds = this.deviceTasks.get(deviceId) || new Set();
    const pendingTasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task && task.desired_state === 'pending') {
        pendingTasks.push(task);
      }
    }

    return pendingTasks;
  }

  /**
   * 获取设备的所有任务
   */
  getDeviceTasks(deviceId: string): Task[] {
    const taskIds = this.deviceTasks.get(deviceId) || new Set();
    const tasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 处理 Agent 上报的状态
   */
  processReport(report: TaskReport): void {
    const task = this.tasks.get(report.task_id);
    if (!task) {
      console.warn(`Received report for unknown task ${report.task_id}`);
      return;
    }

    // 更新任务状态
    task.agent_state = report.state;
    task.updated_at = Date.now();

    if (report.progress !== undefined) {
      task.agent_progress = report.progress;
    }

    if (report.error !== undefined) {
      task.agent_error = report.error;
    }

    // 处理输出增量
    if (report.output_chunk !== undefined && report.output_cursor !== undefined) {
      const lastCursor = this.outputCursors.get(report.task_id) || 0;
      
      // 只接受新的输出
      if (report.output_cursor > lastCursor) {
        if (!task.agent_output) {
          task.agent_output = '';
        }
        task.agent_output += report.output_chunk;
        this.outputCursors.set(report.task_id, report.output_cursor);
      }
    }

    // 如果任务完成，更新 desired_state
    if (report.state === 'succeeded' || report.state === 'failed' || report.state === 'canceled') {
      task.desired_state = report.state;
      console.log(`Task ${report.task_id} completed with state: ${report.state}`);
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): CancelItem | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`Attempted to cancel unknown task ${taskId}`);
      return null;
    }

    // 增加 revision
    task.revision += 1;
    task.desired_state = 'canceled';
    task.updated_at = Date.now();

    console.log(`Canceled task ${taskId} (revision ${task.revision})`);

    return {
      task_id: taskId,
      revision: task.revision,
      desired_state: 'canceled',
    };
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompletedTasks(maxAgeSecs: number): number {
    const now = Date.now();
    let removed = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const isCompleted = 
        task.desired_state === 'succeeded' ||
        task.desired_state === 'failed' ||
        task.desired_state === 'canceled';

      const isOld = (now - task.updated_at) / 1000 > maxAgeSecs;

      if (isCompleted && isOld) {
        this.tasks.delete(taskId);
        this.outputCursors.delete(taskId);

        // 从设备任务列表中移除
        const deviceTaskSet = this.deviceTasks.get(task.device_id);
        if (deviceTaskSet) {
          deviceTaskSet.delete(taskId);
        }

        removed++;
      }
    }

    if (removed > 0) {
      console.log(`Cleaned up ${removed} completed tasks`);
    }

    return removed;
  }

  /**
   * 获取任务统计信息
   */
  getStats(): TaskStats {
    const stats: TaskStats = {
      total: this.tasks.size,
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      canceled: 0,
    };

    for (const task of this.tasks.values()) {
      switch (task.agent_state || task.desired_state) {
        case 'pending':
        case 'received':
          stats.pending++;
          break;
        case 'running':
          stats.running++;
          break;
        case 'succeeded':
          stats.succeeded++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'canceled':
          stats.canceled++;
          break;
      }
    }

    return stats;
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface TaskStats {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
}

/**
 * 全局任务管理器实例（用于测试和简单场景）
 * 生产环境应该使用 Durable Object 持久化
 */
export const globalTaskManager = new TaskManager();
