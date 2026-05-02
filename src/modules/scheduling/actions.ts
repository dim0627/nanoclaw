/**
 * Delivery action handlers for scheduling.
 *
 * The container can't write to inbound.db (host-owned). When the agent calls
 * schedule_task / cancel_task / etc. via MCP, the container writes a
 * `kind='system'` outbound message with an `action` field. The delivery path
 * reaches into this module via the delivery-action registry and we apply the
 * change to inbound.db here.
 */
import fs from 'fs';
import type Database from 'better-sqlite3';

import { wakeContainer } from '../../container-runner.js';
import { getSession, getSessionsByAgentGroup } from '../../db/sessions.js';
import { log } from '../../log.js';
import { inboundDbPath, openInboundDb, writeSessionMessage } from '../../session-manager.js';
import type { Session } from '../../types.js';
import { cancelTask, insertTask, pauseTask, resumeTask, updateTask, type TaskUpdate } from './db.js';

/**
 * Apply a task mutation across every session in the agent group.
 *
 * Tasks are stored per-session in messages_in but users think of them as
 * belonging to the agent ("Koko's reminders"), not the thread that created
 * them. When a cancel/pause/resume/update arrives it should match the task
 * wherever it lives — usually a sibling session.
 *
 * Skips the current session's DB if the caller has already operated on it
 * (passed via `currentInDb`) so we don't double-count rows.
 */
function applyAcrossGroup(
  agentGroupId: string,
  currentSessionId: string,
  currentInDb: Database.Database,
  fn: (db: Database.Database) => number,
): number {
  let total = fn(currentInDb);
  for (const sibling of getSessionsByAgentGroup(agentGroupId)) {
    if (sibling.id === currentSessionId) continue;
    const dbPath = inboundDbPath(agentGroupId, sibling.id);
    if (!fs.existsSync(dbPath)) continue;
    let db: Database.Database;
    try {
      db = openInboundDb(agentGroupId, sibling.id);
    } catch (err) {
      log.warn('applyAcrossGroup: failed to open sibling inbound DB', {
        agentGroupId,
        siblingSessionId: sibling.id,
        err,
      });
      continue;
    }
    try {
      total += fn(db);
    } finally {
      db.close();
    }
  }
  return total;
}

export async function handleScheduleTask(
  content: Record<string, unknown>,
  _session: Session,
  inDb: Database.Database,
): Promise<void> {
  const taskId = content.taskId as string;
  const prompt = content.prompt as string;
  const script = content.script as string | null;
  const processAfter = content.processAfter as string;
  const recurrence = (content.recurrence as string) || null;

  insertTask(inDb, {
    id: taskId,
    processAfter,
    recurrence,
    platformId: (content.platformId as string) ?? null,
    channelType: (content.channelType as string) ?? null,
    threadId: (content.threadId as string) ?? null,
    content: JSON.stringify({ prompt, script }),
  });
  log.info('Scheduled task created', { taskId, processAfter, recurrence });
}

export async function handleCancelTask(
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
): Promise<void> {
  const taskId = content.taskId as string;
  const touched = applyAcrossGroup(session.agent_group_id, session.id, inDb, (db) => cancelTask(db, taskId));
  log.info('Task cancelled', { taskId, touched });
}

export async function handlePauseTask(
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
): Promise<void> {
  const taskId = content.taskId as string;
  const touched = applyAcrossGroup(session.agent_group_id, session.id, inDb, (db) => pauseTask(db, taskId));
  log.info('Task paused', { taskId, touched });
}

export async function handleResumeTask(
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
): Promise<void> {
  const taskId = content.taskId as string;
  const touched = applyAcrossGroup(session.agent_group_id, session.id, inDb, (db) => resumeTask(db, taskId));
  log.info('Task resumed', { taskId, touched });
}

export async function handleUpdateTask(
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
): Promise<void> {
  const taskId = content.taskId as string;
  const update: TaskUpdate = {};
  if (typeof content.prompt === 'string') update.prompt = content.prompt;
  if (typeof content.processAfter === 'string') update.processAfter = content.processAfter;
  if (content.recurrence === null || typeof content.recurrence === 'string') {
    update.recurrence = content.recurrence as string | null;
  }
  if (content.script === null || typeof content.script === 'string') {
    update.script = content.script as string | null;
  }
  const touched = applyAcrossGroup(session.agent_group_id, session.id, inDb, (db) => updateTask(db, taskId, update));
  log.info('Task updated', { taskId, touched, fields: Object.keys(update) });
  if (touched === 0) {
    // Notify the agent that update_task matched nothing. Replicates the
    // old notifyAgent helper that used to live in delivery.ts — inlined
    // here so scheduling doesn't depend on delivery's private helpers.
    writeSessionMessage(session.agent_group_id, session.id, {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'chat',
      timestamp: new Date().toISOString(),
      platformId: session.agent_group_id,
      channelType: 'agent',
      threadId: null,
      content: JSON.stringify({
        text: `update_task: no live task matched id "${taskId}".`,
        sender: 'system',
        senderId: 'system',
      }),
    });
    const fresh = getSession(session.id);
    if (fresh) {
      wakeContainer(fresh).catch((err) =>
        log.error('Failed to wake container after update_task notification', { err }),
      );
    }
  }
}
