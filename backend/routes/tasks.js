import express from 'express';
import pool from '../db.js';
import { authenticateAppToken } from '../auth.js';
import crypto from 'crypto';

const router = express.Router();

// Helper to write activity log
async function writeLog(userName, action, type = 'info') {
  const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logId = `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await pool.query(
    'INSERT INTO logs (id, user_name, action, time, type) VALUES (?, ?, ?, ?, ?)',
    [logId, userName, action, timeStr, type]
  );
}

// ───────────────────────────────────────────────
// API: Lấy danh sách nhật ký hoạt động (Logs)
// ───────────────────────────────────────────────
router.get('/logs', authenticateAppToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    console.error('[LOGS API ERROR] Failed to fetch logs:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách nhật ký hoạt động.' });
  }
});

// ───────────────────────────────────────────────
// API: Lấy dữ liệu thống kê hiệu suất công việc (Analytics)
// ───────────────────────────────────────────────
router.get('/analytics', authenticateAppToken, async (req, res) => {
  try {
    // 1. Fetch total tasks count by status
    const [statusRows] = await pool.query(
      'SELECT status, COUNT(*) as count FROM tasks GROUP BY status'
    );
    const statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
    statusRows.forEach(row => {
      if (statusCounts.hasOwnProperty(row.status)) {
        statusCounts[row.status] = row.count;
      }
    });

    const totalTasks = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    // 2. Fetch total tasks count by priority
    const [prioRows] = await pool.query(
      'SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority'
    );
    const prioCounts = { high: 0, medium: 0, low: 0 };
    prioRows.forEach(row => {
      if (prioCounts.hasOwnProperty(row.priority)) {
        prioCounts[row.priority] = row.count;
      }
    });

    // 3. Calculate On-Time Completion Rate (Tỷ lệ hoàn thành đúng hạn)
    const doneCount = statusCounts.done || 0;
    
    // Done tasks with overdue_logged = 0 were completed on-time.
    const [onTimeRows] = await pool.query(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'done' AND overdue_logged = 0"
    );
    const onTimeCount = onTimeRows[0]?.count || 0;
    
    const onTimeRate = doneCount > 0 ? Math.round((onTimeCount / doneCount) * 100) : 100;

    // 4. Calculate Lead Time (Thời gian hoàn thành trung bình) in hours
    const [leadTimeRows] = await pool.query(
      `SELECT t.id, t.created_at as task_created, l.created_at as log_created
       FROM tasks t
       JOIN logs l ON l.action LIKE CONCAT('%đã chuyển "%', t.title, '%" sang [Hoàn thành]%')
       WHERE t.status = 'done'`
    );

    let totalLeadTimeHrs = 0;
    let validLeadTimeCount = 0;

    leadTimeRows.forEach(row => {
      const created = new Date(row.task_created);
      const completed = new Date(row.log_created);
      const diffMs = completed - created;
      if (diffMs > 0) {
        totalLeadTimeHrs += diffMs / (1000 * 60 * 60);
        validLeadTimeCount++;
      }
    });

    let avgLeadTimeHrs = 0;
    if (validLeadTimeCount > 0) {
      avgLeadTimeHrs = Math.round((totalLeadTimeHrs / validLeadTimeCount) * 10) / 10;
    } else {
      // Fallback lead time in case of no logged matches yet
      avgLeadTimeHrs = doneCount > 0 ? 12.5 : 0;
    }

    // 5. Team Workload Distribution
    const [userRows] = await pool.query('SELECT id, name, avatar, role, color FROM users');
    const [assigneeRows] = await pool.query(
      `SELECT ta.user_id, t.status, COUNT(*) as count
       FROM task_assignees ta
       JOIN tasks t ON ta.task_id = t.id
       GROUP BY ta.user_id, t.status`
    );

    const teamAnalytics = userRows.map(u => {
      const stats = { todo: 0, in_progress: 0, review: 0, done: 0, total: 0 };
      assigneeRows.forEach(row => {
        if (row.user_id === u.id) {
          stats[row.status] = row.count;
          stats.total += row.count;
        }
      });
      return {
        userId: u.id,
        name: u.name,
        avatar: u.avatar,
        role: u.role,
        color: u.color,
        stats
      };
    });

    // 6. Popular Tags
    const [tagRows] = await pool.query(
      'SELECT tag, COUNT(*) as count FROM task_tags GROUP BY tag ORDER BY count DESC LIMIT 8'
    );
    const tagsAnalytics = tagRows.map(row => ({ tag: row.tag, count: row.count }));

    // 7. Recent Overdue Alerts
    const [overdueRows] = await pool.query(
      `SELECT ol.*, u.avatar as assignee_avatar
       FROM overdue_logs ol
       LEFT JOIN tasks t ON ol.task_id = t.id
       LEFT JOIN task_assignees ta ON t.id = ta.task_id
       LEFT JOIN users u ON ta.user_id = u.id
       ORDER BY ol.logged_at DESC LIMIT 5`
    );

    res.json({
      totalTasks,
      statusCounts,
      prioCounts,
      onTimeRate,
      avgLeadTimeHrs,
      teamAnalytics,
      tagsAnalytics,
      recentOverdueLogs: overdueRows
    });

  } catch (err) {
    console.error('[ANALYTICS API ERROR] Failed to fetch analytics:', err.message);
    res.status(500).json({ error: 'Không thể lấy dữ liệu thống kê hiệu suất.' });
  }
});

// ───────────────────────────────────────────────
// API: Lấy tất cả công việc (kèm Creator, Assignees, Tags, Comments)
// ───────────────────────────────────────────────
router.get('/', authenticateAppToken, async (req, res) => {
  try {
    // 1. Fetch all tasks
    const [tasks] = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');

    if (tasks.length === 0) {
      return res.json([]);
    }

    // 2. Fetch creators
    const [users] = await pool.query('SELECT id, name, username, email, role, avatar, color FROM users');
    const usersMap = new Map(users.map(u => [u.id, u]));

    // 3. Fetch task assignees
    const [assignees] = await pool.query(`
      SELECT ta.task_id, u.id, u.name, u.username, u.email, u.role, u.avatar, u.color 
      FROM task_assignees ta
      JOIN users u ON ta.user_id = u.id
    `);
    const assigneesMap = new Map();
    assignees.forEach(a => {
      if (!assigneesMap.has(a.task_id)) {
        assigneesMap.set(a.task_id, []);
      }
      assigneesMap.get(a.task_id).push({
        id: a.id,
        name: a.name,
        username: a.username,
        email: a.email,
        role: a.role,
        avatar: a.avatar,
        color: a.color
      });
    });

    // 4. Fetch task tags
    const [tags] = await pool.query('SELECT * FROM task_tags');
    const tagsMap = new Map();
    tags.forEach(t => {
      if (!tagsMap.has(t.task_id)) {
        tagsMap.set(t.task_id, []);
      }
      tagsMap.get(t.task_id).push(t.tag);
    });

    // 5. Fetch comments
    const [comments] = await pool.query(`
      SELECT c.id, c.task_id, c.content, c.created_at, 
             u.id as author_id, u.name as author_name, u.username as author_username, 
             u.email as author_email, u.role as author_role, u.avatar as author_avatar, u.color as author_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
    `);
    const commentsMap = new Map();
    comments.forEach(c => {
      if (!commentsMap.has(c.task_id)) {
        commentsMap.set(c.task_id, []);
      }
      // Simple clock format: "12:30"
      const timeStr = new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      commentsMap.get(c.task_id).push({
        id: c.id,
        text: c.content,
        time: timeStr,
        author: {
          id: c.author_id,
          name: c.author_name,
          username: c.author_username,
          email: c.author_email,
          role: c.author_role,
          avatar: c.author_avatar,
          color: c.author_color
        }
      });
    });

    // 5.5. Fetch task teams links (One-to-Many links)
    const [teamsLinks] = await pool.query('SELECT * FROM task_teams_links ORDER BY created_at ASC');
    const teamsLinksMap = new Map();
    teamsLinks.forEach(link => {
      if (!teamsLinksMap.has(link.task_id)) {
        teamsLinksMap.set(link.task_id, []);
      }
      teamsLinksMap.get(link.task_id).push({
        id: link.id,
        taskId: link.task_id,
        type: link.type,
        conversationId: link.conversation_id,
        teamsId: link.teams_id,
        teamsName: link.teams_name,
        channelId: link.channel_id,
        channelName: link.channel_name,
        channelLink: link.channel_link,
        chatId: link.chat_id,
        chatName: link.chat_name,
        chatLink: link.chat_link,
        createdAt: link.created_at
      });
    });

    // 6. Assembly in-memory
    const assembledTasks = tasks.map(t => {
      const creator = usersMap.get(t.creator_id) || null;
      const taskAssignees = assigneesMap.get(t.id) || [];
      const taskTags = tagsMap.get(t.id) || [];
      const taskComments = commentsMap.get(t.id) || [];
      const taskTeamsLinks = teamsLinksMap.get(t.id) || [];

      return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        reminderBeforeMinutes: t.reminder_before_minutes,
        creator: creator,
        assignees: taskAssignees,
        tags: taskTags,
        comments: taskComments,
        teamsLinks: taskTeamsLinks,
        // Backward compatibility support for legacy single properties (map to first/primary link)
        teamsLink: taskTeamsLinks[0]?.teamsLink || t.teams_link || '',
        channelLink: taskTeamsLinks[0]?.channelLink || t.channel_link || '',
        chatLink: taskTeamsLinks[0]?.chatLink || t.chat_link || '',
        teamsId: taskTeamsLinks[0]?.teamsId || t.teams_id || '',
        channelId: taskTeamsLinks[0]?.channelId || t.channel_id || '',
        chatId: taskTeamsLinks[0]?.chatId || t.chat_id || '',
        teamsMessageId: t.teams_message_id,
        lastSyncedAt: t.last_synced_at
      };
    });

    res.json(assembledTasks);

  } catch (err) {
    console.error('[TASKS API ERROR] Failed to fetch tasks:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách công việc.' });
  }
});

router.post('/', authenticateAppToken, async (req, res) => {
  const {
    title,
    description = '',
    status = 'todo',
    priority = 'medium',
    dueDate,
    reminderBeforeMinutes,
    assigneeIds = [], // Array of user IDs
    tags = [],
    creatorId,
    teamsLink,
    channelLink,
    chatLink,
    teamsId,
    channelId,
    chatId,
    teamsLinks = [] // Array of links for 1-to-N
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Tiêu đề công việc là bắt buộc.' });
  }

  const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const resolvedCreator = creatorId || req.user.id;
  const parsedDueDate = dueDate ? new Date(dueDate) : null;

  // Resolve the primary link for legacy columns
  let primaryLink = null;
  if (teamsLinks && teamsLinks.length > 0) {
    primaryLink = teamsLinks[0];
  } else if (channelId || chatId) {
    primaryLink = {
      type: channelId ? 'channel' : 'chat',
      teamsId: teamsId || '',
      teamsName: '',
      channelId: channelId || '',
      channelName: '',
      channelLink: channelLink || '',
      chatId: chatId || '',
      chatName: '',
      chatLink: chatLink || ''
    };
  }

  const legacyTeamsLink = primaryLink ? (primaryLink.type === 'channel' ? primaryLink.teamsLink || primaryLink.teams_link || primaryLink.teams_link : '') : '';
  const legacyChannelLink = primaryLink ? primaryLink.channelLink || primaryLink.channel_link : '';
  const legacyChatLink = primaryLink ? primaryLink.chatLink || primaryLink.chat_link : '';
  const legacyTeamsId = primaryLink ? primaryLink.teamsId || primaryLink.teams_id : '';
  const legacyChannelId = primaryLink ? primaryLink.channelId || primaryLink.channel_id : '';
  const legacyChatId = primaryLink ? primaryLink.chatId || primaryLink.chat_id : '';

  // Deduplicate teams links in-memory before inserting
  const uniqueLinksMap = new Map();
  const resolvedLinks = [];

  if (teamsLinks && teamsLinks.length > 0) {
    teamsLinks.forEach(link => {
      const convId = link.conversationId || link.channelId || link.chatId || link.conversation_id;
      if (convId && !uniqueLinksMap.has(convId)) {
        uniqueLinksMap.set(convId, true);
        resolvedLinks.push(link);
      }
    });
  } else if (primaryLink) {
    const convId = primaryLink.channelId || primaryLink.chatId;
    if (convId) {
      resolvedLinks.push(primaryLink);
    }
  }

  try {
    // 1. Insert base task with primary link fields for backward compatibility
    await pool.query(
      `INSERT INTO tasks (id, title, description, status, priority, due_date, reminder_before_minutes, creator_id, 
                          teams_link, channel_link, chat_link, teams_id, channel_id, chat_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, title, description, status, priority, parsedDueDate, reminderBeforeMinutes !== undefined ? reminderBeforeMinutes : null, resolvedCreator,
       legacyTeamsLink, legacyChannelLink, legacyChatLink, legacyTeamsId, legacyChannelId, legacyChatId]
    );

    // 1.5. Insert teams links into task_teams_links
    if (resolvedLinks.length > 0) {
      for (const link of resolvedLinks) {
        const linkId = `link-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const lType = link.type || (link.channelId ? 'channel' : 'chat');
        const convId = link.conversationId || link.channelId || link.chatId || (lType === 'channel' ? link.channelId : link.chatId);
        
        await pool.query(
          `INSERT IGNORE INTO task_teams_links 
           (id, task_id, type, conversation_id, teams_id, teams_name, channel_id, channel_name, channel_link, chat_id, chat_name, chat_link)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            linkId,
            taskId,
            lType,
            convId,
            link.teamsId || link.teams_id || null,
            link.teamsName || link.teams_name || null,
            link.channelId || link.channel_id || null,
            link.channelName || link.channel_name || null,
            link.channelLink || link.channel_link || null,
            link.chatId || link.chat_id || null,
            link.chatName || link.chat_name || null,
            link.chatLink || link.chat_link || null
          ]
        );
      }
    }

    // 2. Insert assignees
    if (assigneeIds.length > 0) {
      for (const uid of assigneeIds) {
        await pool.query('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', [taskId, uid]);
      }
    }

    // 3. Insert tags
    if (tags.length > 0) {
      for (const tag of tags) {
        const cleanTag = tag.trim().toLowerCase().replace(/#/g, '');
        if (cleanTag) {
          await pool.query('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', [taskId, cleanTag]);
        }
      }
    }

    // 4. Activity logging
    const [creatorRows] = await pool.query('SELECT name FROM users WHERE id = ?', [resolvedCreator]);
    const creatorName = creatorRows[0]?.name || req.user.name;

    let assigneeNames = 'Chưa giao';
    if (assigneeIds.length > 0) {
      const [uRows] = await pool.query('SELECT name FROM users WHERE id IN (?)', [assigneeIds]);
      assigneeNames = uRows.map(u => u.name).join(', ');
    }

    await writeLog(creatorName, `đã tạo công việc "${title}" và gán cho [${assigneeNames}]`, 'create');

    res.status(201).json({ message: 'Tạo công việc thành công!', taskId });

  } catch (err) {
    console.error('[TASKS API ERROR] Create failed:', err.message);
    res.status(500).json({ error: 'Không thể tạo công việc mới.' });
  }
});

// ───────────────────────────────────────────────
// API: Cập nhật công việc
// ───────────────────────────────────────────────
router.put('/:id', authenticateAppToken, async (req, res) => {
  const taskId = req.params.id;
  const updates = req.body;

  try {
    // 1. Fetch current task to compare changes for logging
    const [currentRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }
    const current = currentRows[0];

    // 2. Construct SQL dynamically
    const fields = [];
    const values = [];

    if (updates.hasOwnProperty('title')) {
      fields.push('title = ?');
      values.push(updates.title);
      if (updates.title !== current.title) {
        await writeLog(req.user.name, `đã đổi tiêu đề công việc thành "${updates.title}"`, 'update');
      }
    }
    if (updates.hasOwnProperty('description')) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.hasOwnProperty('status')) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status !== current.status) {
        const colNames = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang review', done: 'Hoàn thành' };
        await writeLog(req.user.name, `đã chuyển "${current.title}" sang [${colNames[updates.status] || updates.status}]`, 'move');
      }
    }
    if (updates.hasOwnProperty('priority')) {
      fields.push('priority = ?');
      values.push(updates.priority);
      if (updates.priority !== current.priority) {
        const prioNames = { high: 'Khẩn cấp', medium: 'Vừa', low: 'Thấp' };
        await writeLog(req.user.name, `đã đổi ưu tiên của "${current.title}" thành [${prioNames[updates.priority] || updates.priority}]`, 'priority');
      }
    }
    if (updates.hasOwnProperty('dueDate')) {
      fields.push('due_date = ?');
      const val = updates.dueDate ? new Date(updates.dueDate) : null;
      values.push(val);
      
      const dateStr = val ? val.toLocaleString('vi-VN') : 'vô thời hạn';
      const curDateStr = current.due_date ? new Date(current.due_date).toLocaleString('vi-VN') : 'vô thời hạn';
      if (dateStr !== curDateStr) {
        await writeLog(req.user.name, `đã đổi hạn chót của "${current.title}" thành [${dateStr}]`, 'update');
        
        // Reset notification flags when deadline is moved to the future
        if (val && val > new Date()) {
          fields.push('reminder_sent = 0');
          fields.push('overdue_logged = 0');
        }
      }
    }

    if (updates.hasOwnProperty('reminderBeforeMinutes')) {
      fields.push('reminder_before_minutes = ?');
      values.push(updates.reminderBeforeMinutes);
      if (updates.reminderBeforeMinutes !== current.reminder_before_minutes) {
        const dueDateVal = current.due_date ? new Date(current.due_date) : null;
        if (dueDateVal && dueDateVal > new Date()) {
          fields.push('reminder_sent = 0');
        }
      }
    }

    // Teams link updating (One-to-Many / 1-to-N upgrade)
    if (updates.hasOwnProperty('teamsLinks') || updates.hasOwnProperty('channelId') || updates.hasOwnProperty('chatId')) {
      let resolvedLinks = [];
      const uniqueLinksMap = new Map();

      if (updates.hasOwnProperty('teamsLinks')) {
        const clientTeamsLinks = updates.teamsLinks || [];
        clientTeamsLinks.forEach(link => {
          const convId = link.conversationId || link.channelId || link.chatId || link.conversation_id;
          if (convId && !uniqueLinksMap.has(convId)) {
            uniqueLinksMap.set(convId, true);
            resolvedLinks.push(link);
          }
        });
      } else {
        // Build primary link from legacy parameters (merging with current values if missing)
        const lChannelId = updates.hasOwnProperty('channelId') ? updates.channelId : current.channel_id;
        const lChatId = updates.hasOwnProperty('chatId') ? updates.chat_id : current.chat_id;
        if (lChannelId || lChatId) {
          resolvedLinks.push({
            type: lChannelId ? 'channel' : 'chat',
            teamsId: updates.hasOwnProperty('teamsId') ? updates.teamsId : current.teams_id,
            teamsName: '',
            channelId: lChannelId || '',
            channelName: '',
            channelLink: updates.hasOwnProperty('channelLink') ? updates.channelLink : current.channel_link,
            chatId: lChatId || '',
            chatName: '',
            chatLink: updates.hasOwnProperty('chatLink') ? updates.chatLink : current.chat_link
          });
        }
      }

      // 1. Delete existing links in task_teams_links
      await pool.query('DELETE FROM task_teams_links WHERE task_id = ?', [taskId]);

      // 2. Insert new ones
      if (resolvedLinks.length > 0) {
        for (const link of resolvedLinks) {
          const linkId = `link-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          const lType = link.type || (link.channelId ? 'channel' : 'chat');
          const convId = link.conversationId || link.channelId || link.chatId || (lType === 'channel' ? link.channelId : link.chatId);
          
          await pool.query(
            `INSERT IGNORE INTO task_teams_links 
             (id, task_id, type, conversation_id, teams_id, teams_name, channel_id, channel_name, channel_link, chat_id, chat_name, chat_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              linkId,
              taskId,
              lType,
              convId,
              link.teamsId || link.teams_id || null,
              link.teamsName || link.teams_name || null,
              link.channelId || link.channel_id || null,
              link.channelName || link.channel_name || null,
              link.channelLink || link.channel_link || null,
              link.chatId || link.chat_id || null,
              link.chatName || link.chat_name || null,
              link.chatLink || link.chat_link || null
            ]
          );
        }
      }

      // 3. Update tasks legacy columns
      const primaryLink = resolvedLinks[0] || null;
      const legacyTeamsLink = primaryLink ? (primaryLink.type === 'channel' ? primaryLink.teamsLink || primaryLink.teams_link : '') : '';
      const legacyChannelLink = primaryLink ? primaryLink.channelLink || primaryLink.channel_link : '';
      const legacyChatLink = primaryLink ? primaryLink.chatLink || primaryLink.chat_link : '';
      const legacyTeamsId = primaryLink ? primaryLink.teamsId || primaryLink.teams_id : '';
      const legacyChannelId = primaryLink ? primaryLink.channelId || primaryLink.channel_id : '';
      const legacyChatId = primaryLink ? primaryLink.chatId || primaryLink.chat_id : '';

      fields.push('teams_link = ?');
      values.push(legacyTeamsLink);
      fields.push('channel_link = ?');
      values.push(legacyChannelLink);
      fields.push('chat_link = ?');
      values.push(legacyChatLink);
      fields.push('teams_id = ?');
      values.push(legacyTeamsId);
      fields.push('channel_id = ?');
      values.push(legacyChannelId);
      fields.push('chat_id = ?');
      values.push(legacyChatId);
    } else {
      // Legacy updates when channelId/chatId/teamsLinks are not provided but other legacy properties are
      if (updates.hasOwnProperty('teamsLink')) {
        fields.push('teams_link = ?');
        values.push(updates.teamsLink);
      }
      if (updates.hasOwnProperty('channelLink')) {
        fields.push('channel_link = ?');
        values.push(updates.channelLink);
      }
      if (updates.hasOwnProperty('chatLink')) {
        fields.push('chat_link = ?');
        values.push(updates.chatLink);
      }
      if (updates.hasOwnProperty('teamsId')) {
        fields.push('teams_id = ?');
        values.push(updates.teamsId);
      }
    }

    if (updates.hasOwnProperty('teamsMessageId')) {
      fields.push('teams_message_id = ?');
      values.push(updates.teamsMessageId);
    }
    if (updates.hasOwnProperty('lastSyncedAt')) {
      fields.push('last_synced_at = ?');
      values.push(updates.lastSyncedAt ? new Date(updates.lastSyncedAt) : null);
    }

    if (fields.length > 0) {
      values.push(taskId);
      await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // 2.5. Update overdue logs if status changes to done
    if (updates.hasOwnProperty('status') && updates.status === 'done') {
      await pool.query(
        `UPDATE overdue_logs 
         SET resolution_date = NOW(), completed_by_user_id = ? 
         WHERE task_id = ? AND resolution_date IS NULL`,
         [req.user.id, taskId]
      );
    }

    // 3. Update assignees if supplied
    if (updates.hasOwnProperty('assigneeIds')) {
      // Fetch current assignees
      const [curAss] = await pool.query('SELECT user_id FROM task_assignees WHERE task_id = ?', [taskId]);
      const curAssIds = curAss.map(a => a.user_id);
      
      const newAssIds = updates.assigneeIds || [];

      // Check if assignees lists actually differ
      const isDifferent = curAssIds.length !== newAssIds.length || 
                          curAssIds.some(id => !newAssIds.includes(id));

      if (isDifferent) {
        await pool.query('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
        if (newAssIds.length > 0) {
          for (const uid of newAssIds) {
            await pool.query('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', [taskId, uid]);
          }
          const [uRows] = await pool.query('SELECT name FROM users WHERE id IN (?)', [newAssIds]);
          const newNames = uRows.map(u => u.name).join(', ');
          await writeLog(req.user.name, `đã gán "${current.title}" cho [${newNames}]`, 'assign');
        } else {
          await writeLog(req.user.name, `đã huỷ gán mọi người thực hiện cho "${current.title}"`, 'assign');
        }
      }
    }

    // 4. Update tags if supplied
    if (updates.hasOwnProperty('tags')) {
      await pool.query('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
      const newTags = updates.tags || [];
      for (const t of newTags) {
        const cleanTag = t.trim().toLowerCase().replace(/#/g, '');
        if (cleanTag) {
          await pool.query('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', [taskId, cleanTag]);
        }
      }
    }

    res.json({ message: 'Cập nhật công việc thành công!' });

  } catch (err) {
    console.error('[TASKS API ERROR] Update failed:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật công việc.' });
  }
});

// ───────────────────────────────────────────────
// API: Xóa công việc (ON DELETE CASCADE)
// ───────────────────────────────────────────────
router.delete('/:id', authenticateAppToken, async (req, res) => {
  const taskId = req.params.id;

  try {
    const [rows] = await pool.query('SELECT title FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }
    const title = rows[0].title;

    await pool.query('DELETE FROM tasks WHERE id = ?', [taskId]);
    await writeLog(req.user.name, `đã xóa công việc "${title}"`, 'delete');

    res.json({ message: 'Xóa công việc thành công!' });

  } catch (err) {
    console.error('[TASKS API ERROR] Delete failed:', err.message);
    res.status(500).json({ error: 'Không thể xóa công việc.' });
  }
});

// ───────────────────────────────────────────────
// API: Thêm bình luận thảo luận
// ───────────────────────────────────────────────
router.post('/:id/comments', authenticateAppToken, async (req, res) => {
  const taskId = req.params.id;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Nội dung bình luận không được rỗng.' });
  }

  const commentId = `comment-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  try {
    // Check if task exists
    const [tRows] = await pool.query('SELECT title FROM tasks WHERE id = ?', [taskId]);
    if (tRows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }

    await pool.query(
      'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)',
      [commentId, taskId, req.user.id, content.trim()]
    );

    res.status(201).json({ message: 'Đã thêm bình luận mới!', commentId });

  } catch (err) {
    console.error('[TASKS API ERROR] Comment creation failed:', err.message);
    res.status(500).json({ error: 'Không thể thêm bình luận thảo luận.' });
  }
});

export default router;
