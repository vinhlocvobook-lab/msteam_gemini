import pool from '../db.js';
import axios from 'axios';
import crypto from 'crypto';
import { getValidMicrosoftToken } from '../auth.js';
import { generateDailyMorningDigest } from './aiService.js';

const MICROSOFT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// Delay helper for throttling Graph API requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Send notification message to Microsoft Teams channel or chat
export async function sendTeamsNotification(creatorId, link, subject, content) {
  if (!creatorId || !link) return;

  // Graceful fallback for mock environments
  if (creatorId.startsWith('mock-') || (link.conversation_id && link.conversation_id.startsWith('mock-'))) {
    console.log(`[TEAMS NOTIFICATION MOCK fallback] Channel/Chat simulated notification for ${link.type} (${link.conversation_id}): [${subject}] - ${content}`);
    return;
  }

  try {
    const accessToken = await getValidMicrosoftToken(creatorId);
    let url = '';
    if (link.type === 'chat' && link.chat_id) {
      url = `${MICROSOFT_GRAPH_BASE_URL}/chats/${link.chat_id}/messages`;
    } else if (link.type === 'channel' && link.teams_id && link.channel_id) {
      url = `${MICROSOFT_GRAPH_BASE_URL}/teams/${link.teams_id}/channels/${link.channel_id}/messages`;
    } else {
      return;
    }

    const payload = {
      body: {
        contentType: 'html',
        content: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 16px; border-left: 4px solid #8b5cf6; background-color: #f5f3ff; border-radius: 4px;">
            <h3 style="color: #6d28d9; margin-top: 0; font-size: 16px; display: flex; align-items: center;">🔔 ${subject}</h3>
            <p style="font-size: 14px; color: #1f2937; line-height: 1.5;">${content}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0;" />
            <p style="font-size: 11px; color: #9ca3af; margin-bottom: 0; font-style: italic;">Được gửi tự động từ hệ thống quản lý công việc Synapse.</p>
          </div>
        `
      }
    };

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[TEAMS NOTIFICATION] Sent successfully to ${link.type} (${link.conversation_id})`);
  } catch (err) {
    if (err.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers['retry-after']) || 2;
      console.warn(`[TEAMS NOTIFICATION WARNING] Rate limited (429). Waiting ${retryAfter}s before retry.`);
      await delay(retryAfter * 1000);
      return sendTeamsNotification(creatorId, link, subject, content);
    }
    console.error(`[TEAMS NOTIFICATION ERROR] Failed to send to ${link.type}:`, err.message);
  }
}

// Helper: Send a Direct Message (DM) via 1:1 Teams chat between active user and recipient
export async function sendDirectTeamsMessage(senderId, recipientMsId, subject, content) {
  if (!senderId || !recipientMsId) return;

  // Graceful fallback for mock environments
  if (senderId.startsWith('mock-') || recipientMsId.startsWith('mock-')) {
    console.log(`[TEAMS DM MOCK fallback] DM simulated from user ${senderId} to user MS-ID ${recipientMsId}: [${subject}] - ${content}`);
    return;
  }

  try {
    const accessToken = await getValidMicrosoftToken(senderId);

    // Resolve sender's actual Microsoft AAD ID (or use 'me' as fallback shortcut)
    const [senderRows] = await pool.query('SELECT microsoft_id FROM users WHERE id = ?', [senderId]);
    const senderMsId = senderRows[0]?.microsoft_id || 'me';

    // 1. Create or fetch a 1:1 chat conversation between sender and recipient
    const chatPayload = {
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `${MICROSOFT_GRAPH_BASE_URL}/users('${senderMsId}')`
        },
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `${MICROSOFT_GRAPH_BASE_URL}/users('${recipientMsId}')`
        }
      ]
    };

    const chatRes = await axios.post(`${MICROSOFT_GRAPH_BASE_URL}/chats`, chatPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const chatId = chatRes.data.id;

    // 2. Post the notification message to the retrieved chatId
    const url = `${MICROSOFT_GRAPH_BASE_URL}/chats/${chatId}/messages`;
    const payload = {
      body: {
        contentType: 'html',
        content: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 16px; border-left: 4px solid #10b981; background-color: #f0fdf4; border-radius: 4px;">
            <h3 style="color: #047857; margin-top: 0; font-size: 16px; display: flex; align-items: center;">💬 ${subject}</h3>
            <p style="font-size: 14px; color: #1f2937; line-height: 1.5;">${content}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0;" />
            <p style="font-size: 11px; color: #9ca3af; margin-bottom: 0; font-style: italic;">Được gửi tự động từ hệ thống quản lý công việc Synapse.</p>
          </div>
        `
      }
    };

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[TEAMS DM] DM sent successfully to user MS-ID ${recipientMsId}`);
  } catch (err) {
    if (err.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers['retry-after']) || 2;
      console.warn(`[TEAMS DM WARNING] Rate limited (429). Waiting ${retryAfter}s before retry.`);
      await delay(retryAfter * 1000);
      return sendDirectTeamsMessage(senderId, recipientMsId, subject, content);
    }
    console.error(`[TEAMS DM ERROR] Failed to send DM to user ${recipientMsId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. RUN REMINDER SCANNER
// ─────────────────────────────────────────────────────────────
async function checkUpcomingDeadlines() {
  let connection;
  try {
    connection = await pool.getConnection();

    // Query tasks approaching deadlines (where status != 'done', reminder_sent = 0)
    // using TIMESTAMPDIFF in minutes to match reminder_before_minutes (default to 30 mins)
    const [tasks] = await connection.query(
      `SELECT t.*, 
              COALESCE(t.reminder_before_minutes, 30) AS remind_before
       FROM tasks t
       WHERE t.status != 'done'
         AND t.is_deleted = 0
         AND t.due_date IS NOT NULL
         AND t.due_date > NOW()
         AND t.reminder_sent = 0
         AND TIMESTAMPDIFF(MINUTE, NOW(), t.due_date) <= COALESCE(t.reminder_before_minutes, 30)`
    );

    if (tasks.length === 0) return;

    console.log(`[SCHEDULER] Found ${tasks.length} task(s) approaching deadline.`);

    for (const task of tasks) {
      // 1. Start Database Transaction to guarantee consistency
      await connection.beginTransaction();
      try {
        // Find assignees for this task to notify them
        const [assignees] = await connection.query(
          `SELECT u.id, u.name FROM users u 
           JOIN task_assignees ta ON u.id = ta.user_id 
           WHERE ta.task_id = ?`,
          [task.id]
        );

        // Build list of target user IDs to notify (creator + assignees)
        const recipientIds = new Set();
        recipientIds.add(task.creator_id);
        assignees.forEach(a => recipientIds.add(a.id));

        const dueFormatted = new Date(task.due_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(task.due_date).toLocaleDateString('vi-VN');
        const notifTitle = `Công việc sắp đến hạn: "${task.title}"`;
        const notifContent = `Công việc được giao cho bạn sắp hết hạn vào lúc <strong>${dueFormatted}</strong> (Nhắc nhở trước ${task.remind_before} phút). Vui lòng hoàn thành đúng tiến độ.`;

        // Insert notification records for all recipients in Transaction
        for (const userId of recipientIds) {
          const notifId = `notif-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          await connection.query(
            `INSERT INTO notifications (id, user_id, task_id, title, content, type) 
             VALUES (?, ?, ?, ?, ?, 'reminder')`,
            [notifId, userId, task.id, notifTitle, notifContent]
          );
        }

        // Update task reminder_sent flag
        await connection.query(
          `UPDATE tasks SET reminder_sent = 1 WHERE id = ?`,
          [task.id]
        );

        await connection.commit();
        console.log(`[SCHEDULER] Reminders created successfully in DB for task: ${task.title}`);

        // 2. Fetch MS Teams links & Send Throttled notifications (Out of Transaction)
        const [links] = await connection.query(
          `SELECT * FROM task_teams_links WHERE task_id = ?`,
          [task.id]
        );

        if (links.length > 0) {
          const subject = `⚠️ Nhắc nhở hạn chót công việc`;
          const teamsContent = `Công việc <strong>"${task.title}"</strong> liên kết với kênh này sắp đến hạn chót vào lúc <strong>${dueFormatted}</strong>.<br/>Vui lòng kiểm tra và cập nhật tiến độ công việc.`;
          
          // Throttled serial delivery to prevent Teams Rate Limiting
          for (const link of links) {
            await sendTeamsNotification(task.creator_id, link, subject, teamsContent);
            await delay(500); // Throttling: 500ms delay between deliveries
          }
        }

      } catch (transErr) {
        await connection.rollback();
        console.error(`[SCHEDULER TRANSACTION ERROR] Failed to process reminder transaction for task ${task.id}:`, transErr.message);
      }
    }

  } catch (err) {
    console.error(`[SCHEDULER ERROR] checkUpcomingDeadlines runner failed:`, err.message);
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// 2. RUN OVERDUE DETECTOR SCANNER
// ─────────────────────────────────────────────────────────────
async function checkOverdueTasks() {
  let connection;
  try {
    connection = await pool.getConnection();

    // Query tasks already past deadline (where status != 'done', overdue_logged = 0)
    const [tasks] = await connection.query(
      `SELECT t.* 
       FROM tasks t
       WHERE t.status != 'done'
         AND t.is_deleted = 0
         AND t.due_date IS NOT NULL
         AND t.due_date <= NOW()
         AND t.overdue_logged = 0`
    );

    if (tasks.length === 0) return;

    console.log(`[SCHEDULER] Detected ${tasks.length} overdue task(s).`);

    for (const task of tasks) {
      await connection.beginTransaction();
      try {
        // Find assignees names & IDs
        const [assignees] = await connection.query(
          `SELECT u.id, u.name FROM users u 
           JOIN task_assignees ta ON u.id = ta.user_id 
           WHERE ta.task_id = ?`,
          [task.id]
        );

        const assigneeNames = assignees.map(a => a.name).join(', ') || 'Chưa giao';
        const recipientIds = new Set();
        recipientIds.add(task.creator_id);
        assignees.forEach(a => recipientIds.add(a.id));

        const dueFormatted = new Date(task.due_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(task.due_date).toLocaleDateString('vi-VN');

        // A. Insert into overdue_logs
        const logId = `overdue-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        await connection.query(
          `INSERT INTO overdue_logs (id, task_id, task_title, assignees, due_date, status_at_log) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [logId, task.id, task.title, assigneeNames, task.due_date, task.status]
        );

        // B. Insert Activity Log into logs table (type='overdue') for activity feed display
        const activityLogId = `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        await connection.query(
          `INSERT INTO logs (id, user_name, action, time, type) 
           VALUES (?, 'Hệ Thống', ?, ?, 'overdue')`,
          [activityLogId, `cảnh báo: công việc "${task.title}" phụ trách bởi [${assigneeNames}] đã trễ hạn (Hạn chót: ${dueFormatted})`, timeStr]
        );

        // C. Insert Notifications for all recipients
        const notifTitle = `🚨 Cảnh báo quá hạn: "${task.title}"`;
        const notifContent = `Công việc <strong>"${task.title}"</strong> được giao đã trễ hạn từ lúc <strong>${dueFormatted}</strong>. Vui lòng cập nhật ngay!`;
        
        for (const userId of recipientIds) {
          const notifId = `notif-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          await connection.query(
            `INSERT INTO notifications (id, user_id, task_id, title, content, type) 
             VALUES (?, ?, ?, ?, ?, 'overdue')`,
            [notifId, userId, task.id, notifTitle, notifContent]
          );
        }

        // D. Update overdue_logged flag
        await connection.query(
          `UPDATE tasks SET overdue_logged = 1 WHERE id = ?`,
          [task.id]
        );

        await connection.commit();
        console.log(`[SCHEDULER] Overdue logged successfully for task: ${task.title}`);

        // E. Fetch MS Teams links & Send Throttled Overdue Alerts (Out of Transaction)
        const [links] = await connection.query(
          `SELECT * FROM task_teams_links WHERE task_id = ?`,
          [task.id]
        );

        if (links.length > 0) {
          const subject = `🚨 Cảnh báo: Công việc đã trễ hạn!`;
          const teamsContent = `🔥 Cảnh báo khẩn cấp: Công việc <strong>"${task.title}"</strong> phụ trách bởi <strong>[${assigneeNames}]</strong> đã trễ hạn chót (Hạn: <strong>${dueFormatted}</strong>).<br/>Vui lòng thực hiện và báo cáo tiến độ gấp!`;
          
          for (const link of links) {
            await sendTeamsNotification(task.creator_id, link, subject, teamsContent);
            await delay(500); // Throttling: 500ms delay between Graph API requests
          }
        }

      } catch (transErr) {
        await connection.rollback();
        console.error(`[SCHEDULER TRANSACTION ERROR] Failed to process overdue transaction for task ${task.id}:`, transErr.message);
      }
    }

  } catch (err) {
    console.error(`[SCHEDULER ERROR] checkOverdueTasks runner failed:`, err.message);
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// 3. DAILY MORNING DIGEST SCANNER & SENDER
// ─────────────────────────────────────────────────────────────
export async function sendDailyMorningDigestForUser(userId) {
  let connection;
  try {
    connection = await pool.getConnection();

    // 1. Get user details including microsoft_id
    const [users] = await connection.query('SELECT name, id, microsoft_id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }
    const user = users[0];

    // 2. Fetch all active/unfinished tasks assigned to or created by this user
    const [tasks] = await connection.query(
      `SELECT DISTINCT t.* 
       FROM tasks t
       LEFT JOIN task_assignees ta ON t.id = ta.task_id
       WHERE t.status != 'done' AND t.is_deleted = 0 AND (t.creator_id = ? OR ta.user_id = ?)`,
      [userId, userId]
    );

    // 3. Generate AI Daily Digest content
    const digestContent = await generateDailyMorningDigest(user.name, tasks);

    let delivered = false;
    let deliveredCount = 0;
    
    // 4. Send digest directly to the user's private Teams 1:1 chat (Direct Message - DM)
    if (user.microsoft_id) {
      const subject = `☀️ Bản tin chào buổi sáng Synapse AI`;

      // Find an active sender with a Microsoft token (different from the recipient) to deliver the DM
      const [adminRows] = await connection.query(
        `SELECT u.id 
         FROM users u
         JOIN microsoft_tokens mt ON u.id = mt.user_id
         WHERE u.id != ? AND mt.expires_at > NOW()
         ORDER BY CASE WHEN u.role = 'Admin' THEN 0 ELSE 1 END
         LIMIT 1`,
        [userId]
      );

      let senderIdToUse = null;
      if (adminRows.length > 0) {
        senderIdToUse = adminRows[0].id;
      } else {
        // Fallback: search for any user with a Microsoft token
        const [anyRows] = await connection.query(
          `SELECT u.id 
           FROM users u
           JOIN microsoft_tokens mt ON u.id = mt.user_id
           WHERE u.id != ?
           LIMIT 1`,
          [userId]
        );
        if (anyRows.length > 0) {
          senderIdToUse = anyRows[0].id;
        }
      }

      // If in mock environment, always simulate using a mock sender ID
      if (userId.startsWith('mock-') || user.microsoft_id.startsWith('mock-')) {
        senderIdToUse = senderIdToUse || 'usr-system-admin';
      }

      if (senderIdToUse) {
        try {
          await sendDirectTeamsMessage(senderIdToUse, user.microsoft_id, subject, digestContent);
          delivered = true;
          deliveredCount = 1;
          console.log(`[DAILY DIGEST] Sent DM successfully to user ${user.name} via sender ${senderIdToUse}`);
        } catch (dmErr) {
          console.warn(`[DAILY DIGEST WARNING] Failed to send DM to user ${user.name}:`, dmErr.message);
        }
      }
    }

    // 5. Fallback: If not delivered via Teams DM, create an in-app system notification
    if (!delivered) {
      console.log(`[DAILY DIGEST] Could not deliver via Teams DM for ${user.name}. Creating system log/notification fallback.`);
      
      const notifId = `notif-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const notifTitle = `☀️ Bản tin chào buổi sáng Synapse AI`;
      await connection.query(
        `INSERT INTO notifications (id, user_id, title, content, type) 
         VALUES (?, ?, ?, ?, 'reminder')`,
        [notifId, userId, notifTitle, digestContent, 'reminder']
      );
    }

    return { success: true, deliveredCount, digestContent };

  } catch (err) {
    console.error(`[DAILY DIGEST ERROR] Failed to send digest for user ${userId}:`, err.message);
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

export async function sendAllDailyMorningDigests() {
  let connection;
  try {
    connection = await pool.getConnection();
    const [users] = await connection.query('SELECT id FROM users');
    
    console.log(`[SCHEDULER] Starting automated Daily Morning Digests for ${users.length} users...`);
    for (const user of users) {
      try {
        await sendDailyMorningDigestForUser(user.id);
        await delay(1000);
      } catch (err) {
        console.error(`[SCHEDULER ERROR] Failed to send automated digest for user ${user.id}:`, err.message);
      }
    }
    console.log('[SCHEDULER] Automated Daily Morning Digests completed.');
  } catch (err) {
    console.error('[SCHEDULER ERROR] sendAllDailyMorningDigests master runner failed:', err.message);
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// 4. SCHEDULER BOOTSTRAPPER
// ─────────────────────────────────────────────────────────────
let schedulerIntervalId = null;
let lastDigestSentDateStr = null;

export function startScheduler() {
  if (schedulerIntervalId) {
    console.log('[SCHEDULER] Background scheduler is already running.');
    return;
  }

  console.log('[SCHEDULER] ⏳ Launching background scheduler daemon (Scanning interval: 60s)...');
  
  // Run scan immediately on startup
  checkUpcomingDeadlines();
  checkOverdueTasks();

  // Schedule task scanning execution every 60 seconds
  schedulerIntervalId = setInterval(async () => {
    console.log('[SCHEDULER] Scanning deadlines and overdue states...');
    await checkUpcomingDeadlines();
    await checkOverdueTasks();

    // Check if it's 8:00 AM to send morning digest
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const hour = now.getHours();
    
    if (hour === 8 && lastDigestSentDateStr !== dateStr) {
      lastDigestSentDateStr = dateStr;
      console.log(`[SCHEDULER] Triggering automated Daily Morning Digests for date: ${dateStr}...`);
      sendAllDailyMorningDigests().catch(err => {
        console.error('[SCHEDULER ERROR] Automated daily digest failed:', err.message);
      });
    }
  }, 60000);
}

export function stopScheduler() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    console.log('[SCHEDULER] Background scheduler stopped successfully.');
  }
}
