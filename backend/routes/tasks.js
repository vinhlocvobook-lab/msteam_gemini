import express from 'express';
import pool from '../db.js';
import { authenticateAppToken, authorizeTask } from '../auth.js';
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

// Helper to write task-specific activity log
async function writeTaskActivity(taskId, userId, userName, actionType, fieldChanged = null, oldValue = null, newValue = null, description) {
  const activityId = `act-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    await pool.query(
      `INSERT INTO task_activities 
       (id, task_id, user_id, user_name, action_type, field_changed, old_value, new_value, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [activityId, taskId, userId || null, userName, actionType, fieldChanged, oldValue, newValue, description]
    );
  } catch (err) {
    console.error('[TASK ACTIVITY LOG ERROR] Failed to write task activity:', err.message);
  }
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
    const { role, id: userId, department_id: userDeptId } = req.user;
    
    // 1. Fetch total tasks count by status (respecting role-based department visibility)
    let statusSql = 'SELECT status, COUNT(*) as count FROM tasks WHERE is_deleted = 0';
    const statusParams = [];
    if (role !== 'Admin') {
      statusSql += ' AND (department_id = ? OR creator_id = ? OR id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      statusParams.push(userDeptId, userId, userId);
    }
    statusSql += ' GROUP BY status';
    
    const [statusRows] = await pool.query(statusSql, statusParams);
    const statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
    statusRows.forEach(row => {
      if (statusCounts.hasOwnProperty(row.status)) {
        statusCounts[row.status] = row.count;
      }
    });

    const totalTasks = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    // 2. Fetch total tasks count by priority (respecting role-based department visibility)
    let prioSql = 'SELECT priority, COUNT(*) as count FROM tasks WHERE is_deleted = 0';
    const prioParams = [];
    if (role !== 'Admin') {
      prioSql += ' AND (department_id = ? OR creator_id = ? OR id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      prioParams.push(userDeptId, userId, userId);
    }
    prioSql += ' GROUP BY priority';

    const [prioRows] = await pool.query(prioSql, prioParams);
    const prioCounts = { high: 0, medium: 0, low: 0 };
    prioRows.forEach(row => {
      if (prioCounts.hasOwnProperty(row.priority)) {
        prioCounts[row.priority] = row.count;
      }
    });

    // 3. Calculate On-Time Completion Rate (Tỷ lệ hoàn thành đúng hạn)
    const doneCount = statusCounts.done || 0;
    
    let onTimeSql = "SELECT COUNT(*) as count FROM tasks WHERE status = 'done' AND overdue_logged = 0 AND is_deleted = 0";
    const onTimeParams = [];
    if (role !== 'Admin') {
      onTimeSql += ' AND (department_id = ? OR creator_id = ? OR id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      onTimeParams.push(userDeptId, userId, userId);
    }
    const [onTimeRows] = await pool.query(onTimeSql, onTimeParams);
    const onTimeCount = onTimeRows[0]?.count || 0;
    
    const onTimeRate = doneCount > 0 ? Math.round((onTimeCount / doneCount) * 100) : 100;

    // 4. Calculate Lead Time (Thời gian hoàn thành trung bình) in hours
    let leadTimeSql = `SELECT t.id, t.created_at as task_created, l.created_at as log_created
       FROM tasks t
       JOIN logs l ON l.action LIKE CONCAT('%đã chuyển "%', t.title, '%" sang [Hoàn thành]%')
       WHERE t.status = 'done' AND t.is_deleted = 0`;
    const leadTimeParams = [];
    if (role !== 'Admin') {
      leadTimeSql += ' AND (t.department_id = ? OR t.creator_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      leadTimeParams.push(userDeptId, userId, userId);
    }
    const [leadTimeRows] = await pool.query(leadTimeSql, leadTimeParams);

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
      avgLeadTimeHrs = doneCount > 0 ? 12.5 : 0;
    }

    // 5. Team Workload Distribution
    let userSql = 'SELECT id, name, avatar, role, color FROM users';
    const userParams = [];
    if (role !== 'Admin') {
      // Leader/User only sees users in their own department
      userSql += ' WHERE department_id = ?';
      userParams.push(userDeptId);
    }
    const [userRows] = await pool.query(userSql, userParams);
    
    const [assigneeRows] = await pool.query(
      `SELECT ta.user_id, t.status, COUNT(*) as count
       FROM task_assignees ta
       JOIN tasks t ON ta.task_id = t.id
       WHERE t.is_deleted = 0
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
    let tagsSql = `SELECT tt.tag, COUNT(*) as count 
       FROM task_tags tt
       JOIN tasks t ON tt.task_id = t.id
       WHERE t.is_deleted = 0`;
    const tagsParams = [];
    if (role !== 'Admin') {
      tagsSql += ' AND (t.department_id = ? OR t.creator_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      tagsParams.push(userDeptId, userId, userId);
    }
    tagsSql += ' GROUP BY tt.tag ORDER BY count DESC LIMIT 8';
    
    const [tagRows] = await pool.query(tagsSql, tagsParams);
    const tagsAnalytics = tagRows.map(row => ({ tag: row.tag, count: row.count }));

    // 7. Recent Overdue Alerts
    let overdueSql = `SELECT ol.*, u.avatar as assignee_avatar
       FROM overdue_logs ol
       JOIN tasks t ON ol.task_id = t.id
       LEFT JOIN task_assignees ta ON t.id = ta.task_id
       LEFT JOIN users u ON ta.user_id = u.id
       WHERE t.is_deleted = 0`;
    const overdueParams = [];
    if (role !== 'Admin') {
      overdueSql += ' AND (t.department_id = ? OR t.creator_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))';
      overdueParams.push(userDeptId, userId, userId);
    }
    overdueSql += ' ORDER BY ol.logged_at DESC LIMIT 5';
    
    const [overdueRows] = await pool.query(overdueSql, overdueParams);

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
    const { q, priority, status, filterMode, assignee } = req.query;

    let query = 'SELECT DISTINCT t.* FROM tasks t';
    const joins = [];
    const where = ['t.is_deleted = 0'];
    const params = [];

    // --- BẮT ĐẦU: RÀNG BUỘC PHÒNG BAN & PHÂN QUYỀN (ABAC) ---
    if (req.user.role !== 'Admin') {
      where.push('(t.department_id = ? OR t.creator_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))');
      params.push(req.user.department_id, req.user.id, req.user.id);
    }
    // --- KẾT THÚC RÀNG BUỘC ---

    // 1. filterMode = 'mine' (Assigned to the current active user)
    if (filterMode === 'mine') {
      joins.push('JOIN task_assignees ta_mine ON t.id = ta_mine.task_id');
      where.push('ta_mine.user_id = ?');
      params.push(req.user.id);
    }

    // 1.5. assignee filter (supports multiple assignee user IDs as a comma-separated string)
    if (assignee) {
      const assigneeIds = assignee.split(',');
      joins.push('JOIN task_assignees ta_filter ON t.id = ta_filter.task_id');
      where.push(`ta_filter.user_id IN (${assigneeIds.map(() => '?').join(', ')})`);
      params.push(...assigneeIds);
    }

    // 2. priority filter (supports multiple priorities as a comma-separated string)
    if (priority) {
      const priorities = priority.split(',');
      where.push(`t.priority IN (${priorities.map(() => '?').join(', ')})`);
      params.push(...priorities);
    }

    // 3. status filter (supports multiple statuses as a comma-separated string)
    if (status) {
      const statuses = status.split(',');
      where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }

    // 4. search term q (searches title, description, tags, or assignees' names)
    if (q && q.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      const tagTerm = `%${q.trim().toLowerCase().replace('#', '')}%`;

      joins.push('LEFT JOIN task_assignees ta_search ON t.id = ta_search.task_id');
      joins.push('LEFT JOIN users u_search ON ta_search.user_id = u_search.id');
      joins.push('LEFT JOIN task_tags tt_search ON t.id = tt_search.task_id');

      where.push('(t.title LIKE ? OR t.description LIKE ? OR tt_search.tag LIKE ? OR u_search.name LIKE ?)');
      params.push(term, term, tagTerm, term);
    }

    const joinStr = joins.join(' ');
    const whereStr = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `${query} ${joinStr} ${whereStr} ORDER BY t.created_at DESC`;

    const [tasks] = await pool.query(sql, params);

    if (tasks.length === 0) {
      return res.json([]);
    }

    // 2. Fetch creators
    const [users] = await pool.query('SELECT id, name, username, email, role, avatar, color FROM users');
    const usersMap = new Map(users.map(u => [u.id, u]));

    // 3. Fetch task assignees
    const [assignees] = await pool.query(`
      SELECT ta.task_id, ta.permission, u.id, u.name, u.username, u.email, u.role, u.avatar, u.color 
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
        color: a.color,
        permission: a.permission || 'edit'
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
        startDate: t.start_date,
        actualStartDate: t.actual_start_date,
        createdAt: t.created_at,
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
        lastSyncedAt: t.last_synced_at,
        updatedAt: t.updated_at,
        department_id: t.department_id
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
    startDate,
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
  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  const actualStartDate = status === 'in_progress' ? new Date() : null;

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
      `INSERT INTO tasks (id, title, description, status, priority, start_date, actual_start_date, due_date, reminder_before_minutes, creator_id, 
                          teams_link, channel_link, chat_link, teams_id, channel_id, chat_id, department_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, title, description, status, priority, parsedStartDate, actualStartDate, parsedDueDate, reminderBeforeMinutes !== undefined ? reminderBeforeMinutes : null, resolvedCreator,
       legacyTeamsLink, legacyChannelLink, legacyChatLink, legacyTeamsId, legacyChannelId, legacyChatId, req.user.department_id]
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
    let resolvedAssignees = [];
    if (req.body.assignees && req.body.assignees.length > 0) {
      resolvedAssignees = req.body.assignees.map(a => ({
        id: a.id,
        permission: a.permission || 'edit'
      }));
    } else if (assigneeIds && assigneeIds.length > 0) {
      resolvedAssignees = assigneeIds.map(uid => ({
        id: uid,
        permission: 'edit'
      }));
    }

    if (resolvedAssignees.length > 0) {
      for (const a of resolvedAssignees) {
        await pool.query('INSERT INTO task_assignees (task_id, user_id, permission) VALUES (?, ?, ?)', [taskId, a.id, a.permission]);
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
    await writeTaskActivity(taskId, req.user.id, creatorName, 'create', null, null, null, `đã tạo công việc và gán cho [${assigneeNames}]`);

    res.status(201).json({ message: 'Tạo công việc thành công!', taskId });

  } catch (err) {
    console.error('[TASKS API ERROR] Create failed:', err.message);
    res.status(500).json({ error: 'Không thể tạo công việc mới.' });
  }
});

// ───────────────────────────────────────────────
// API: Cập nhật công việc
// ───────────────────────────────────────────────
router.put('/:id', authenticateAppToken, authorizeTask('edit'), async (req, res) => {
  const taskId = req.params.id;
  const updates = req.body;

  try {
    // 1. Fetch current task to compare changes for logging
    const [currentRows] = await pool.query('SELECT * FROM tasks WHERE id = ? AND is_deleted = 0', [taskId]);
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
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'title', current.title, updates.title, `đã đổi tiêu đề công việc thành "${updates.title}"`);
      }
    }
    if (updates.hasOwnProperty('description')) {
      fields.push('description = ?');
      values.push(updates.description);
      if (updates.description !== current.description) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'description', current.description, updates.description, 'đã cập nhật mô tả công việc');
      }
    }
    if (updates.hasOwnProperty('status')) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status !== current.status) {
        const colNames = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang review', done: 'Hoàn thành' };
        await writeLog(req.user.name, `đã chuyển "${current.title}" sang [${colNames[updates.status] || updates.status}]`, 'move');
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'status', colNames[current.status] || current.status, colNames[updates.status] || updates.status, `đã chuyển trạng thái sang [${colNames[updates.status] || updates.status}]`);

        // Tự động ghi nhận actual_start_date nếu chuyển sang in_progress và chưa được set
        if (updates.status === 'in_progress' && !current.actual_start_date) {
          fields.push('actual_start_date = ?');
          values.push(new Date());
        }
      }
    }
    if (updates.hasOwnProperty('priority')) {
      fields.push('priority = ?');
      values.push(updates.priority);
      if (updates.priority !== current.priority) {
        const prioNames = { high: 'Khẩn cấp', medium: 'Vừa', low: 'Thấp' };
        await writeLog(req.user.name, `đã đổi ưu tiên của "${current.title}" thành [${prioNames[updates.priority] || updates.priority}]`, 'priority');
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'priority', prioNames[current.priority] || current.priority, prioNames[updates.priority] || updates.priority, `đã đổi mức độ ưu tiên thành [${prioNames[updates.priority] || updates.priority}]`);
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
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'due_date', curDateStr, dateStr, `đã đổi hạn chót thành [${dateStr}]`);
        
        // Reset notification flags when deadline is moved to the future
        if (val && val > new Date()) {
          fields.push('reminder_sent = 0');
          fields.push('overdue_logged = 0');
        }
      }
    }

    if (updates.hasOwnProperty('startDate')) {
      fields.push('start_date = ?');
      const val = updates.startDate ? new Date(updates.startDate) : null;
      values.push(val);
      
      const startStr = val ? val.toLocaleString('vi-VN') : 'chưa thiết lập';
      const curStartStr = current.start_date ? new Date(current.start_date).toLocaleString('vi-VN') : 'chưa thiết lập';
      if (startStr !== curStartStr) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'start_date', curStartStr, startStr, `đã đổi ngày bắt đầu thành [${startStr}]`);
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
        const getReminderText = (min) => {
          if (min === null || min === undefined || min === -1) return 'Không nhắc nhở';
          if (min === 15) return 'Trước 15 phút';
          if (min === 30) return 'Trước 30 phút';
          if (min === 60) return 'Trước 1 giờ';
          if (min === 120) return 'Trước 2 giờ';
          if (min === 1440) return 'Trước 1 ngày';
          return `Trước ${min} phút`;
        };
        const curRemText = getReminderText(current.reminder_before_minutes);
        const newRemText = getReminderText(updates.reminderBeforeMinutes);
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'reminder', curRemText, newRemText, `đã cập nhật nhắc nhở từ [${curRemText}] sang [${newRemText}]`);
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

      // 1. Fetch current links
      const [curLinksRows] = await pool.query('SELECT type, conversation_id, teams_name, channel_name, chat_name FROM task_teams_links WHERE task_id = ?', [taskId]);
      const curLinks = curLinksRows.map(l => ({
        type: l.type,
        conversationId: l.conversation_id,
        name: l.type === 'channel' 
          ? `${l.teams_name || 'Nhóm'} > ${l.channel_name || 'Kênh'}` 
          : (l.chat_name || 'Cuộc trò chuyện')
      }));

      // Calculate new links
      const mappedNewLinks = resolvedLinks.map(link => {
        const lType = link.type || (link.channelId ? 'channel' : 'chat');
        const convId = link.conversationId || link.channelId || link.chatId || (lType === 'channel' ? link.channelId : link.chatId);
        const name = lType === 'channel'
          ? `${link.teamsName || link.teams_name || 'Nhóm'} > ${link.channelName || link.channel_name || 'Kênh'}`
          : (link.chatName || link.chat_name || 'Cuộc trò chuyện');
        return { type: lType, conversationId: convId, name };
      });

      // Find added and removed links
      const addedLinks = mappedNewLinks.filter(n => !curLinks.some(c => c.conversationId === n.conversationId));
      const removedLinks = curLinks.filter(c => !mappedNewLinks.some(n => n.conversationId === c.conversationId));

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

      // Log added/removed Teams links
      for (const link of addedLinks) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'add_link', null, null, link.name, `đã liên kết công việc với Microsoft Teams: [${link.name}]`);
      }
      for (const link of removedLinks) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'remove_link', null, link.name, null, `đã hủy liên kết công việc với Microsoft Teams: [${link.name}]`);
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
    if (updates.hasOwnProperty('assignees') || updates.hasOwnProperty('assigneeIds')) {
      let resolvedNewAssignees = [];
      if (updates.hasOwnProperty('assignees')) {
        resolvedNewAssignees = (updates.assignees || []).map(a => ({
          id: a.id,
          permission: a.permission || 'edit'
        }));
      } else {
        resolvedNewAssignees = (updates.assigneeIds || []).map(uid => ({
          id: uid,
          permission: 'edit'
        }));
      }

      const newAssIds = resolvedNewAssignees.map(a => a.id);

      // Fetch current assignees
      const [curAss] = await pool.query('SELECT user_id, permission FROM task_assignees WHERE task_id = ?', [taskId]);
      
      // Check if assignees or their permissions actually differ
      const isDifferent = curAss.length !== resolvedNewAssignees.length || 
                          curAss.some(c => {
                            const match = resolvedNewAssignees.find(n => n.id === c.user_id);
                            return !match || match.permission !== c.permission;
                          });

      if (isDifferent) {
        // Fetch current and new names to log added/removed
        const currentAssigneeIds = curAss.map(c => c.user_id);
        const newAssigneeIds = resolvedNewAssignees.map(a => a.id);
        
        // Find added assignees
        const addedIds = newAssigneeIds.filter(id => !currentAssigneeIds.includes(id));
        // Find removed assignees
        const removedIds = currentAssigneeIds.filter(id => !newAssigneeIds.includes(id));
        // Find permission changes
        const permChanges = resolvedNewAssignees.filter(n => {
          const match = curAss.find(c => c.user_id === n.id);
          return match && match.permission !== n.permission;
        });

        // Apply changes
        await pool.query('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
        if (resolvedNewAssignees.length > 0) {
          for (const a of resolvedNewAssignees) {
            await pool.query('INSERT INTO task_assignees (task_id, user_id, permission) VALUES (?, ?, ?)', [taskId, a.id, a.permission]);
          }
        }

        // Write log entries
        if (addedIds.length > 0) {
          const [uRows] = await pool.query('SELECT name FROM users WHERE id IN (?)', [addedIds]);
          const addedNames = uRows.map(u => u.name).join(', ');
          await writeLog(req.user.name, `đã gán "${current.title}" cho [${addedNames}]`, 'assign');
          await writeTaskActivity(taskId, req.user.id, req.user.name, 'add_assignee', null, null, addedNames, `đã gán công việc cho [${addedNames}]`);
        }
        if (removedIds.length > 0) {
          const [uRows] = await pool.query('SELECT name FROM users WHERE id IN (?)', [removedIds]);
          const removedNames = uRows.map(u => u.name).join(', ');
          await writeLog(req.user.name, `đã huỷ gán "${current.title}" đối với [${removedNames}]`, 'assign');
          await writeTaskActivity(taskId, req.user.id, req.user.name, 'remove_assignee', null, removedNames, null, `đã hủy gán công việc cho [${removedNames}]`);
        }
        if (permChanges.length > 0) {
          const [uRows] = await pool.query('SELECT id, name FROM users WHERE id IN (?)', [permChanges.map(p => p.id)]);
          const nameMap = new Map(uRows.map(u => [u.id, u.name]));
          for (const pc of permChanges) {
            const userName = nameMap.get(pc.id) || pc.id;
            const match = curAss.find(c => c.user_id === pc.id);
            const oldPermText = (match?.permission || 'edit') === 'edit' ? 'Được sửa' : 'Chỉ xem';
            const newPermText = pc.permission === 'edit' ? 'Được sửa' : 'Chỉ xem';
            await writeTaskActivity(taskId, req.user.id, req.user.name, 'update_field', 'permission', oldPermText, newPermText, `đã đổi quyền thực hiện của [${userName}] thành [${newPermText}]`);
          }
        }
      }
    }

    // 4. Update tags if supplied
    if (updates.hasOwnProperty('tags')) {
      const [curTagsRows] = await pool.query('SELECT tag FROM task_tags WHERE task_id = ?', [taskId]);
      const curTags = curTagsRows.map(r => r.tag);
      const newTags = (updates.tags || []).map(t => t.trim().toLowerCase().replace(/#/g, '')).filter(Boolean);

      const addedTags = newTags.filter(t => !curTags.includes(t));
      const removedTags = curTags.filter(t => !newTags.includes(t));

      await pool.query('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
      for (const t of newTags) {
        await pool.query('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', [taskId, t]);
      }

      for (const tag of addedTags) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'add_tag', null, null, tag, `đã thêm thẻ #[${tag}]`);
      }
      for (const tag of removedTags) {
        await writeTaskActivity(taskId, req.user.id, req.user.name, 'remove_tag', null, tag, null, `đã xóa thẻ #[${tag}]`);
      }
    }

    res.json({ message: 'Cập nhật công việc thành công!' });

  } catch (err) {
    console.error('[TASKS API ERROR] Update failed:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật công việc.' });
  }
});

// ───────────────────────────────────────────────
// API: Xóa công việc (Xóa mềm - Soft Delete)
// ───────────────────────────────────────────────
router.delete('/:id', authenticateAppToken, authorizeTask('delete'), async (req, res) => {
  const taskId = req.params.id;

  try {
    const [rows] = await pool.query('SELECT title, is_deleted FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }
    const task = rows[0];
    if (task.is_deleted) {
      return res.status(400).json({ error: 'Công việc này đã bị xóa rồi.' });
    }

    await pool.query('UPDATE tasks SET is_deleted = 1, deleted_at = NOW() WHERE id = ?', [taskId]);
    await writeLog(req.user.name, `đã xóa công việc "${task.title}"`, 'delete');
    await writeTaskActivity(taskId, req.user.id, req.user.name, 'delete', null, null, null, 'đã xóa công việc này (Xóa mềm)');

    res.json({ message: 'Xóa công việc thành công!' });

  } catch (err) {
    console.error('[TASKS API ERROR] Delete failed:', err.message);
    res.status(500).json({ error: 'Không thể xóa công việc.' });
  }
});

// ───────────────────────────────────────────────
// API: Khôi phục công việc đã xóa (Undo Soft Delete)
// ───────────────────────────────────────────────
router.post('/:id/restore', authenticateAppToken, async (req, res) => {
  const taskId = req.params.id;

  try {
    const [rows] = await pool.query('SELECT title, is_deleted FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại.' });
    }
    const task = rows[0];
    if (!task.is_deleted) {
      return res.status(400).json({ error: 'Công việc này đang hoạt động, không cần khôi phục.' });
    }

    await pool.query('UPDATE tasks SET is_deleted = 0, deleted_at = NULL WHERE id = ?', [taskId]);
    await writeLog(req.user.name, `đã khôi phục công việc "${task.title}"`, 'restore');
    await writeTaskActivity(taskId, req.user.id, req.user.name, 'restore', null, null, null, 'đã khôi phục công việc này');

    res.json({ message: 'Khôi phục công việc thành công!' });

  } catch (err) {
    console.error('[TASKS API ERROR] Restore failed:', err.message);
    res.status(500).json({ error: 'Không thể khôi phục công việc.' });
  }
});

// ───────────────────────────────────────────────
// API: Lấy chi tiết lịch sử hoạt động của một công việc (Task Activity History)
// ───────────────────────────────────────────────
router.get('/:id/activities', authenticateAppToken, authorizeTask('view'), async (req, res) => {
  const taskId = req.params.id;

  try {
    const [rows] = await pool.query(
      `SELECT ta.*, u.avatar as user_avatar, u.color as user_color 
       FROM task_activities ta
       LEFT JOIN users u ON ta.user_id = u.id
       WHERE ta.task_id = ?
       ORDER BY ta.created_at DESC`,
      [taskId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[TASK ACTIVITIES API ERROR] Failed to fetch task activities:', err.message);
    res.status(500).json({ error: 'Không thể lấy lịch sử hoạt động của công việc.' });
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
    // Check if task exists and is not soft-deleted
    const [tRows] = await pool.query('SELECT title FROM tasks WHERE id = ? AND is_deleted = 0', [taskId]);
    if (tRows.length === 0) {
      return res.status(404).json({ error: 'Công việc không tồn tại hoặc đã bị xóa.' });
    }

    await pool.query(
      'INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)',
      [commentId, taskId, req.user.id, content.trim()]
    );

    await writeTaskActivity(taskId, req.user.id, req.user.name, 'add_comment', null, null, content.trim(), 'đã bình luận về công việc');

    res.status(201).json({ message: 'Đã thêm bình luận mới!', commentId });

  } catch (err) {
    console.error('[TASKS API ERROR] Comment creation failed:', err.message);
    res.status(500).json({ error: 'Không thể thêm bình luận thảo luận.' });
  }
});

export default router;
