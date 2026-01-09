/**
 * 任务清理服务
 * 
 * 定期清理已完成的任务
 */

import { Env } from '../index';

/**
 * 清理已完成的任务
 * 
 * @param env - Cloudflare Workers 环境
 * @param maxAgeSecs - 任务最大保留时间（秒）
 * @returns 清理的任务数量
 */
export async function cleanupCompletedTasks(env: Env, maxAgeSecs: number = 86400): Promise<number> {
  const now = Date.now();
  const cutoffTime = now - (maxAgeSecs * 1000);

  try {
    // 删除已完成且超过保留时间的任务
    const result = await env.DB.prepare(`
      DELETE FROM tasks 
      WHERE desired_state IN ('succeeded', 'failed', 'canceled')
      AND updated_at < ?
    `).bind(cutoffTime).run();

    const deletedCount = result.meta?.changes || 0;

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} completed tasks older than ${maxAgeSecs}s`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Failed to cleanup completed tasks:', error);
    return 0;
  }
}

/**
 * 清理孤立的任务状态和日志
 * 
 * @param env - Cloudflare Workers 环境
 * @returns 清理的记录数量
 */
export async function cleanupOrphanedTaskData(env: Env): Promise<number> {
  try {
    let totalCleaned = 0;

    // 清理孤立的任务状态
    const statesResult = await env.DB.prepare(`
      DELETE FROM task_states 
      WHERE task_id NOT IN (SELECT id FROM tasks)
    `).run();

    totalCleaned += statesResult.meta?.changes || 0;

    // 清理孤立的任务日志
    const logsResult = await env.DB.prepare(`
      DELETE FROM task_logs 
      WHERE task_id NOT IN (SELECT id FROM tasks)
    `).run();

    totalCleaned += logsResult.meta?.changes || 0;

    if (totalCleaned > 0) {
      console.log(`Cleaned up ${totalCleaned} orphaned task records`);
    }

    return totalCleaned;
  } catch (error) {
    console.error('Failed to cleanup orphaned task data:', error);
    return 0;
  }
}

/**
 * 执行完整的任务清理
 * 
 * @param env - Cloudflare Workers 环境
 * @param maxAgeSecs - 任务最大保留时间（秒）
 */
export async function performTaskCleanup(env: Env, maxAgeSecs: number = 86400): Promise<void> {
  console.log('Starting task cleanup...');

  const tasksDeleted = await cleanupCompletedTasks(env, maxAgeSecs);
  const orphansDeleted = await cleanupOrphanedTaskData(env);

  console.log(`Task cleanup completed: ${tasksDeleted} tasks, ${orphansDeleted} orphaned records`);
}
