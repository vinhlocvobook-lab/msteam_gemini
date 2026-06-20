import pool from '../db.js';
import crypto from 'crypto';
import { sendRealtimeNotification } from '../socket.js';

/**
 * Creates an in-app notification in database and pushes it in real-time via Socket.io
 * @param {string} userId - Recipient User ID
 * @param {string|null} taskId - Optional associated Task ID
 * @param {string} title - Notification Title
 * @param {string} content - Notification Body HTML/Text
 * @param {string} type - 'reminder' | 'overdue' | 'assign' | 'comment' | 'permission' | 'status' | 'priority' | 'due_date' | 'add_link'
 * @param {object} [connection] - Optional active database connection for transactions
 */
export async function createInAppNotification(userId, taskId, title, content, type = 'reminder', connection = null) {
  const notifId = `notif-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const db = connection || pool;
  
  await db.query(
    `INSERT INTO notifications (id, user_id, task_id, title, content, type) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [notifId, userId, taskId || null, title, content, type]
  );

  // Payload for socket
  const notificationPayload = {
    id: notifId,
    user_id: userId,
    task_id: taskId,
    title,
    content,
    is_read: 0,
    type,
    created_at: new Date()
  };

  // If taskId is provided, fetch the task title to match database join structure
  if (taskId) {
    try {
      const [taskRows] = await db.query('SELECT title FROM tasks WHERE id = ?', [taskId]);
      if (taskRows.length > 0) {
        notificationPayload.task_title = taskRows[0].title;
      }
    } catch (err) {
      console.error('[NOTIFIER WARNING] Failed to fetch task title for socket payload:', err.message);
    }
  }

  // Send real-time
  sendRealtimeNotification(userId, notificationPayload);
  return notificationPayload;
}
