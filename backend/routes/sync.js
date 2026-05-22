import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import pool from '../db.js';
import { getValidMicrosoftToken, authenticateAppToken } from '../auth.js';
import { analyzeTeamsMessage } from '../services/aiService.js';

const router = express.Router();

const MICROSOFT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// Helper to write activity log
async function writeLog(userName, action, type = 'info') {
  const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logId = `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    await pool.query(
      'INSERT INTO logs (id, user_name, action, time, type) VALUES (?, ?, ?, ?, ?)',
      [logId, userName, action, timeStr, type]
    );
  } catch (err) {
    console.error('[SYNC LOG ERROR] Failed to write activity log:', err.message);
  }
}

// ───────────────────────────────────────────────
// 1. WEBHOOK RECEIVER & VALIDATION
// ───────────────────────────────────────────────
router.post('/webhooks/teams', async (req, res) => {
  // A. Webhook Lifecycle Validation Check
  // MS Graph sends a POST request with validationToken query parameter
  if (req.query.validationToken) {
    console.log('[WEBHOOK] Received validation token request:', req.query.validationToken);
    return res
      .status(200)
      .set('Content-Type', 'text/plain')
      .send(req.query.validationToken);
  }

  // B. Process Webhook Notifications
  const notifications = req.body?.value;
  if (!notifications || !Array.isArray(notifications)) {
    return res.status(400).json({ error: 'Payload không hợp lệ.' });
  }

  console.log(`[WEBHOOK] Received ${notifications.length} notifications.`);

  const clientStateSecret = process.env.TEAMS_WEBHOOK_CLIENT_STATE || 'synapse_secret_client_state_xyz';

  for (const notification of notifications) {
    // Webhook Security Validation via clientState
    if (notification.clientState !== clientStateSecret) {
      console.warn(`[WEBHOOK WARNING] Unauthorized notification skipped. Client state mismatch: received [${notification.clientState}]`);
      continue;
    }

    const { subscriptionId, resource, resourceData } = notification;
    console.log(`[WEBHOOK] Verified notification for sub: ${subscriptionId}, resource: ${resource}`);

    // Process notification asynchronously so we can respond to MS Graph quickly (under 3s requirement)
    processWebhookNotification(subscriptionId, resource, resourceData).catch(err => {
      console.error('[WEBHOOK PROCESS ERROR] Background processing failed:', err.message);
    });
  }

  // Always return 202 Accepted quickly
  res.status(202).send('Accepted');
});

// Helper to asynchronously fetch message and perform AI sync
async function processWebhookNotification(subscriptionId, resource, resourceData) {
  // 1. Find subscription details in DB
  const [subs] = await pool.query('SELECT * FROM microsoft_subscriptions WHERE subscription_id = ?', [subscriptionId]);
  if (subs.length === 0) {
    console.log(`[WEBHOOK] Subscription ${subscriptionId} not found in DB. Skipping.`);
    return;
  }

  const sub = subs[0];
  const { creator_id, channel_or_chat_id } = sub;

  // 2. Obtain valid MS Graph Access Token for the subscription creator
  const accessToken = await getValidMicrosoftToken(creator_id);

  // 3. Fetch the actual message resource content from MS Graph
  const requestUrl = `${MICROSOFT_GRAPH_BASE_URL}/${resource}`;
  console.log(`[WEBHOOK] Fetching message details from: ${requestUrl}`);
  
  const msgResponse = await axios.get(requestUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const message = msgResponse.data;
  if (!message || !message.body || !message.body.content) {
    console.log('[WEBHOOK] Message has no body content. Skipping.');
    return;
  }

  const messageId = message.id;
  const rawContent = message.body.content;
  // Simple regex to strip HTML tags from message content if MS Graph returns HTML
  const messageText = rawContent.replace(/<[^>]*>/g, '').trim();
  const senderName = message.from?.user?.displayName || 'Thành viên Teams';

  console.log(`[WEBHOOK] Message from ${senderName}: "${messageText.substring(0, 60)}..."`);

  // 4. Find all tasks mapped to this channel or chat ID
  const [tasks] = await pool.query(
    'SELECT * FROM tasks WHERE channel_id = ? OR chat_id = ?',
    [channel_or_chat_id, channel_or_chat_id]
  );

  if (tasks.length === 0) {
    console.log(`[WEBHOOK] No tasks mapped to channel/chat ID: ${channel_or_chat_id}.`);
    return;
  }

  // 5. Evaluate and sync task updates
  await syncTasksWithMessage(tasks, messageId, messageText, senderName);
}

// ───────────────────────────────────────────────
// 2. DELTA QUERY POLLING ENDPOINT
// ───────────────────────────────────────────────
router.post('/sync/poll-teams', async (req, res) => {
  const { taskId } = req.body;

  try {
    let tasks = [];
    if (taskId) {
      const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Công việc không tồn tại.' });
      }
      tasks = rows;
    } else {
      // Poll all active tasks linked to MS Teams or Chats
      const [rows] = await pool.query(
        'SELECT * FROM tasks WHERE (channel_id IS NOT NULL AND channel_id != "") OR (chat_id IS NOT NULL AND chat_id != "")'
      );
      tasks = rows;
    }

    if (tasks.length === 0) {
      return res.json({ message: 'Không có công việc nào cần đồng bộ.', count: 0 });
    }

    let processedCount = 0;
    const errors = [];

    // Group tasks by channel/chat to optimize Graph API calls
    const targetMap = new Map();
    tasks.forEach(t => {
      const id = t.chat_id || t.channel_id;
      if (!targetMap.has(id)) {
        targetMap.set(id, {
          channelId: t.channel_id,
          chatId: t.chat_id,
          teamsId: t.teams_id,
          creatorId: t.creator_id,
          taskList: []
        });
      }
      targetMap.get(id).taskList.push(t);
    });

    for (const [targetId, info] of targetMap.entries()) {
      try {
        console.log(`[POLLING] Syncing target ID: ${targetId}`);
        const token = await getValidMicrosoftToken(info.creatorId);

        // A. Retrieve delta link if exists in database
        const [states] = await pool.query('SELECT delta_link FROM teams_sync_states WHERE channel_or_chat_id = ?', [targetId]);
        const dbDeltaLink = states[0]?.delta_link;

        let requestUrl;
        if (dbDeltaLink) {
          requestUrl = dbDeltaLink;
          console.log(`[POLLING] Using active deltaLink: ${requestUrl}`);
        } else {
          // Initialize fresh Delta query URL
          if (info.chatId) {
            requestUrl = `${MICROSOFT_GRAPH_BASE_URL}/chats/${info.chatId}/messages/delta`;
          } else {
            requestUrl = `${MICROSOFT_GRAPH_BASE_URL}/teams/${info.teamsId}/channels/${info.channelId}/messages/delta`;
          }
          console.log(`[POLLING] Initializing fresh delta query: ${requestUrl}`);
        }

        let messages = [];
        let nextDeltaLink = null;
        let queryError = false;

        try {
          const graphRes = await axios.get(requestUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          messages = graphRes.data?.value || [];
          nextDeltaLink = graphRes.data?.['@odata.deltaLink'];

          // Save next deltaLink to prevent reprocessing
          if (nextDeltaLink) {
            await pool.query(
              'INSERT INTO teams_sync_states (channel_or_chat_id, delta_link) VALUES (?, ?) ON DUPLICATE KEY UPDATE delta_link = VALUES(delta_link)',
              [targetId, nextDeltaLink]
            );
          }
        } catch (err) {
          console.warn(`[POLLING WARNING] Delta query failed for target ${targetId}. Falling back to standard messages retrieval.`, err.message);
          queryError = true;
        }

        // B. FALLBACK: Fetch regular messages if Delta query fails or is not supported
        if (queryError || messages.length === 0) {
          let fallbackUrl;
          if (info.chatId) {
            fallbackUrl = `${MICROSOFT_GRAPH_BASE_URL}/chats/${info.chatId}/messages?$top=10`;
          } else {
            fallbackUrl = `${MICROSOFT_GRAPH_BASE_URL}/teams/${info.teamsId}/channels/${info.channelId}/messages?$top=10`;
          }
          
          const fallbackRes = await axios.get(fallbackUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          messages = fallbackRes.data?.value || [];
          console.log(`[POLLING FALLBACK] Fetched latest ${messages.length} messages for target ${targetId}`);
        }

        // Process message list
        for (const message of messages) {
          if (!message.body || !message.body.content) continue;
          
          const messageId = message.id;
          const rawContent = message.body.content;
          const messageText = rawContent.replace(/<[^>]*>/g, '').trim();
          const senderName = message.from?.user?.displayName || 'Thành viên Teams';

          // Sync tasks mapped under this chat/channel
          const updateCount = await syncTasksWithMessage(info.taskList, messageId, messageText, senderName);
          processedCount += updateCount;
        }

      } catch (err) {
        console.error(`[POLLING ERROR] Failed syncing target ${targetId}:`, err.message);
        errors.push({ targetId, error: err.message });
      }
    }

    res.json({
      message: 'Hoàn tất quy trình đồng bộ thủ công qua Polling.',
      processedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[POLLING API ERROR] Sync handler failed:', err.message);
    res.status(500).json({ error: 'Lỗi đồng bộ qua polling.' });
  }
});

// Helper: Evaluates messages and triggers LLM updates on tasks
async function syncTasksWithMessage(tasks, messageId, messageText, senderName) {
  let matchedUpdates = 0;

  for (const task of tasks) {
    // 1. De-duplication check: Skip if this exact message has already been processed for this task
    if (task.teams_message_id === messageId) {
      continue;
    }

    console.log(`[AI SYNC] Processing message [${messageId}] against task: "${task.title}"`);

    // 2. Invoke Multi-LLM AI Factory Subsystem
    const aiResult = await analyzeTeamsMessage(messageText, task);

    // 3. If actionable, update task parameters
    if (aiResult.actionable) {
      console.log(`[AI SYNC] 🚀 Actionable message found for task "${task.title}":`, aiResult);

      const dbUpdates = [];
      const dbValues = [];
      const logDetails = [];

      // A. Check and update Status
      if (aiResult.status && aiResult.status !== task.status) {
        const colNames = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang review', done: 'Hoàn thành' };
        dbUpdates.push('status = ?');
        dbValues.push(aiResult.status);
        logDetails.push(`chuyển trạng thái sang [${colNames[aiResult.status] || aiResult.status}]`);
      }

      // B. Check and update Priority
      if (aiResult.priority && aiResult.priority !== task.priority) {
        const prioNames = { high: 'Khẩn cấp', medium: 'Vừa', low: 'Thấp' };
        dbUpdates.push('priority = ?');
        dbValues.push(aiResult.priority);
        logDetails.push(`cập nhật mức độ ưu tiên là [${prioNames[aiResult.priority] || aiResult.priority}]`);
      }

      // C. Update tracking metadata fields to avoid reprocessing
      dbUpdates.push('teams_message_id = ?');
      dbValues.push(messageId);

      dbUpdates.push('last_synced_at = NOW()');

      // Execute SQL update on task
      dbValues.push(task.id);
      await pool.query(
        `UPDATE tasks SET ${dbUpdates.join(', ')} WHERE id = ?`,
        dbValues
      );

      // D. Insert AI-generated system comments
      if (aiResult.comment) {
        const commentId = `comment-ai-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const cleanComment = `🤖 [Đồng bộ Teams] ${aiResult.comment}`;
        await pool.query(
          'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)',
          [commentId, task.id, task.creator_id, cleanComment]
        );
        logDetails.push('thêm bình luận đồng bộ mới');
      }

      // E. Append any newly mentioned tags
      if (aiResult.tags && Array.isArray(aiResult.tags) && aiResult.tags.length > 0) {
        for (const t of aiResult.tags) {
          const cleanTag = t.trim().toLowerCase().replace(/#/g, '');
          if (cleanTag) {
            await pool.query(
              'INSERT IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)',
              [task.id, cleanTag]
            );
          }
        }
        logDetails.push(`thêm nhãn dán [${aiResult.tags.join(', ')}]`);
      }

      // F. Commit logs
      if (logDetails.length > 0) {
        const logActionText = `được cập nhật qua MS Teams bởi ${senderName} (${logDetails.join(', ')})`;
        await writeLog('Trí Tuệ Nhân Tạo (Gemini)', `đã cập nhật công việc "${task.title}": ${logActionText}`, 'sync');
      }

      matchedUpdates++;
    } else {
      // Even if not actionable, we save the message ID to avoid querying Gemini repeatedly for it
      await pool.query(
        'UPDATE tasks SET teams_message_id = ?, last_synced_at = NOW() WHERE id = ?',
        [messageId, task.id]
      );
    }
  }

  return matchedUpdates;
}

// ───────────────────────────────────────────────
// 3. WEBHOOK SUBSCRIPTION RENEWAL ENDPOINT
// ───────────────────────────────────────────────
router.post('/sync/renew-subscriptions', async (req, res) => {
  try {
    // Find all subscriptions expiring within next 24 hours
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const checkTime = new Date(Date.now() + oneDayInMs);

    const [subs] = await pool.query(
      'SELECT * FROM microsoft_subscriptions WHERE expiration_date_time < ?',
      [checkTime]
    );

    if (subs.length === 0) {
      return res.json({ message: 'Không có subscription nào cần gia hạn.', count: 0 });
    }

    console.log(`[RENEW] Found ${subs.length} expiring webhook subscriptions.`);
    const renewed = [];
    const failed = [];

    for (const sub of subs) {
      try {
        const token = await getValidMicrosoftToken(sub.creator_id);

        // Extend expiration time by 72 hours (max allowed by Graph is usually 4230 minutes)
        const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
        const graphUrl = `${MICROSOFT_GRAPH_BASE_URL}/subscriptions/${sub.subscription_id}`;

        console.log(`[RENEW] Renewing sub ${sub.subscription_id} until ${newExpiry.toISOString()}`);

        await axios.patch(
          graphUrl,
          { expirationDateTime: newExpiry.toISOString() },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Update expiration in local DB
        await pool.query(
          'UPDATE microsoft_subscriptions SET expiration_date_time = ? WHERE subscription_id = ?',
          [newExpiry, sub.subscription_id]
        );

        renewed.push(sub.subscription_id);
        await writeLog('Hệ thống', `đã gia hạn thành công webhook Teams ID: ${sub.subscription_id}`, 'system');

      } catch (err) {
        console.error(`[RENEW ERROR] Failed to renew subscription ${sub.subscription_id}:`, err.message);

        // If Microsoft returned 404 (subscription not found / expired and deleted by MS)
        if (err.response?.status === 404) {
          console.log(`[RENEW] Webhook expired on Microsoft side. Attempting to recreate...`);
          try {
            const token = await getValidMicrosoftToken(sub.creator_id);
            const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
            
            const recreateRes = await axios.post(
              `${MICROSOFT_GRAPH_BASE_URL}/subscriptions`,
              {
                changeType: 'created,updated',
                notificationUrl: process.env.MICROSOFT_WEBHOOK_NOTIFICATION_URL || 'https://synapse.ngrok-free.app/api/webhooks/teams',
                resource: sub.resource,
                expirationDateTime: newExpiry.toISOString(),
                clientState: sub.client_state
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            const newSubId = recreateRes.data.id;

            // Update database record with new ID
            await pool.query(
              `UPDATE microsoft_subscriptions 
               SET subscription_id = ?, expiration_date_time = ? 
               WHERE subscription_id = ?`,
              [newSubId, newExpiry, sub.subscription_id]
            );

            console.log(`[RENEW] ✅ Successfully recreated subscription! Old ID: ${sub.subscription_id}, New ID: ${newSubId}`);
            renewed.push(newSubId);
            await writeLog('Hệ thống', `đã tái tạo lại subscription đã hết hạn thành công. ID mới: ${newSubId}`, 'system');
          } catch (recreateErr) {
            console.error('[RENEW ERROR] Recreation failed:', recreateErr.message);
            failed.push({ id: sub.subscription_id, error: recreateErr.message });
          }
        } else {
          failed.push({ id: sub.subscription_id, error: err.message });
        }
      }
    }

    res.json({
      message: 'Quy trình gia hạn hoàn tất.',
      renewedCount: renewed.length,
      failedCount: failed.length,
      details: { renewed, failed }
    });

  } catch (err) {
    console.error('[RENEW API ERROR] Webhook renewal flow failed:', err.message);
    res.status(500).json({ error: 'Lỗi gia hạn subscription.' });
  }
});

// ───────────────────────────────────────────────
// 4. SIMULATION ENDPOINT (FOR TESTING)
// ───────────────────────────────────────────────
router.post('/simulator/teams-sync', async (req, res) => {
  const { taskId, messageText, senderName = 'Lộc Võ (Mock)' } = req.body;

  if (!taskId || !messageText) {
    return res.status(400).json({ error: 'Thiếu taskId hoặc messageText.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }

    const task = rows[0];
    const mockMessageId = `mock-msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    console.log(`[SIMULATOR] Simulating MS Teams message for task "${task.title}": "${messageText}"`);

    const updateCount = await syncTasksWithMessage([task], mockMessageId, messageText, senderName);

    // Fetch the updated task to return to the client
    const [updatedRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    const updatedTask = updatedRows[0];

    res.json({
      message: 'Giả lập đồng bộ Teams thành công!',
      actionable: updateCount > 0,
      updatedTask
    });

  } catch (err) {
    console.error('[SIMULATOR ERROR] Simulation failed:', err.message);
    res.status(500).json({ error: 'Không thể giả lập đồng bộ.', details: err.message });
  }
});

// ───────────────────────────────────────────────
// MS GRAPH PICKER ENDPOINTS (WITH MOCK FALLBACK)
// ───────────────────────────────────────────────

router.get('/ms-teams', authenticateAppToken, async (req, res) => {
  console.log(`[DEBUG PICKER] GET /ms-teams - Requesting user: ${req.user?.id} (${req.user?.name})`);
  try {
    let accessToken;
    try {
      accessToken = await getValidMicrosoftToken(req.user.id);
      console.log(`[DEBUG PICKER] Successfully retrieved Microsoft token for user ${req.user.id}`);
    } catch (err) {
      console.log(`[DEBUG PICKER] No Microsoft token found or token invalid for user ${req.user.id}: ${err.message}. Returning mock teams.`);
      return res.json([
        { id: 'mock-team-1', displayName: 'Synapse Project Team' },
        { id: 'mock-team-2', displayName: 'Ban Giám Đốc Synapse' }
      ]);
    }

    const url = `${MICROSOFT_GRAPH_BASE_URL}/me/joinedTeams`;
    console.log(`[DEBUG PICKER] Fetching MS Teams from URL: ${url}`);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const teams = response.data?.value || [];
    console.log(`[DEBUG PICKER] Successfully fetched ${teams.length} teams from MS Graph`);
    res.json(teams.map(t => ({ id: t.id, displayName: t.displayName })));
  } catch (err) {
    console.error('[DEBUG PICKER ERROR] Failed to fetch MS Teams:', err.message);
    if (err.response) {
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Status: ${err.response.status}`);
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Data:`, JSON.stringify(err.response.data));
    }
    res.status(500).json({ error: `Không thể tải danh sách Teams từ Microsoft. Chi tiết: ${err.message}` });
  }
});

router.get('/ms-teams/:teamId/channels', authenticateAppToken, async (req, res) => {
  const { teamId } = req.params;
  console.log(`[DEBUG PICKER] GET /ms-teams/${teamId}/channels - Requesting user: ${req.user?.id}`);
  try {
    if (teamId.startsWith('mock-')) {
      console.log(`[DEBUG PICKER] Team ID starts with mock-, returning mock channels for: ${teamId}`);
      const mockChannels = {
        'mock-team-1': [
          { id: 'mock-chan-1-1', displayName: 'Chung (General)', webUrl: 'https://teams.microsoft.com/l/channel/mock-chan-1-1' },
          { id: 'mock-chan-1-2', displayName: 'Thiết kế UI/UX', webUrl: 'https://teams.microsoft.com/l/channel/mock-chan-1-2' },
          { id: 'mock-chan-1-3', displayName: 'Phát triển Backend', webUrl: 'https://teams.microsoft.com/l/channel/mock-chan-1-3' }
        ],
        'mock-team-2': [
          { id: 'mock-chan-2-1', displayName: 'Chiến lược 2026', webUrl: 'https://teams.microsoft.com/l/channel/mock-chan-2-1' },
          { id: 'mock-chan-2-2', displayName: 'Đóng góp Ý kiến', webUrl: 'https://teams.microsoft.com/l/channel/mock-chan-2-2' }
        ]
      };
      return res.json(mockChannels[teamId] || []);
    }

    const accessToken = await getValidMicrosoftToken(req.user.id);
    const url = `${MICROSOFT_GRAPH_BASE_URL}/teams/${teamId}/channels`;
    console.log(`[DEBUG PICKER] Fetching MS Channels from URL: ${url}`);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const channels = response.data?.value || [];
    console.log(`[DEBUG PICKER] Successfully fetched ${channels.length} channels for team ${teamId}`);
    res.json(channels.map(c => ({
      id: c.id,
      displayName: c.displayName,
      webUrl: c.webUrl || `https://teams.microsoft.com/l/channel/${c.id}`
    })));
  } catch (err) {
    console.error(`[DEBUG PICKER ERROR] Failed to fetch channels for team ${teamId}:`, err.message);
    if (err.response) {
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Status: ${err.response.status}`);
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Data:`, JSON.stringify(err.response.data));
    }
    res.status(500).json({ error: `Không thể tải danh sách Kênh. Chi tiết: ${err.message}` });
  }
});

router.get('/ms-chats', authenticateAppToken, async (req, res) => {
  console.log(`[DEBUG PICKER] GET /ms-chats - Requesting user: ${req.user?.id}`);
  try {
    let accessToken;
    try {
      accessToken = await getValidMicrosoftToken(req.user.id);
      console.log(`[DEBUG PICKER] Successfully retrieved Microsoft token for user ${req.user.id}`);
    } catch (err) {
      console.log(`[DEBUG PICKER] No Microsoft token found or token invalid for user ${req.user.id}: ${err.message}. Returning mock chats.`);
      return res.json([
        { id: 'mock-chat-1', topic: 'Thảo luận PO & UI/UX (Lộc & Lan)', chatType: 'group', webUrl: 'https://teams.microsoft.com/l/chat/mock-chat-1' },
        { id: 'mock-chat-2', topic: 'Nhóm Dev Frontend & Backend (Huy & Bình)', chatType: 'group', webUrl: 'https://teams.microsoft.com/l/chat/mock-chat-2' },
        { id: 'mock-chat-3', topic: 'Kênh Chat Kỹ Thuật Synapse', chatType: 'group', webUrl: 'https://teams.microsoft.com/l/chat/mock-chat-3' }
      ]);
    }

    const url = `${MICROSOFT_GRAPH_BASE_URL}/me/chats?$top=50`;
    console.log(`[DEBUG PICKER] Fetching MS Chats from URL: ${url}`);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const chats = response.data?.value || [];
    console.log(`[DEBUG PICKER] Successfully fetched ${chats.length} chats from MS Graph`);
    res.json(chats.map(c => ({
      id: c.id,
      topic: c.topic || `Cuộc hội thoại (${c.chatType})`,
      chatType: c.chatType,
      webUrl: c.webUrl || `https://teams.microsoft.com/l/chat/${c.id}`
    })));
  } catch (err) {
    console.error('[DEBUG PICKER ERROR] Failed to fetch MS Chats:', err.message);
    if (err.response) {
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Status: ${err.response.status}`);
      console.error(`[DEBUG PICKER ERROR] MS Graph Response Data:`, JSON.stringify(err.response.data));
    }
    res.status(500).json({ error: `Không thể tải danh sách các Cuộc trò chuyện. Chi tiết: ${err.message}` });
  }
});

export default router;
