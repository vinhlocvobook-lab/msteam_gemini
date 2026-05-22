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

    // 6. Assembly in-memory
    const assembledTasks = tasks.map(t => {
      const creator = usersMap.get(t.creator_id) || null;
      const taskAssignees = assigneesMap.get(t.id) || [];
      const taskTags = tagsMap.get(t.id) || [];
      const taskComments = commentsMap.get(t.id) || [];

      return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        creator: creator,
        assignees: taskAssignees,
        tags: taskTags,
        comments: taskComments,
        teamsLink: t.teams_link,
        channelLink: t.channel_link,
        chatLink: t.chat_link,
        teamsId: t.teams_id,
        channelId: t.channel_id,
        chatId: t.chat_id,
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

// ───────────────────────────────────────────────
// API: Tạo công việc mới
// ───────────────────────────────────────────────
router.post('/', authenticateAppToken, async (req, res) => {
  const {
    title,
    description = '',
    status = 'todo',
    priority = 'medium',
    dueDate,
    assigneeIds = [], // Array of user IDs
    tags = [],
    creatorId,
    teamsLink,
    channelLink,
    chatLink,
    teamsId,
    channelId,
    chatId
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Tiêu đề công việc là bắt buộc.' });
  }

  const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const resolvedCreator = creatorId || req.user.id;
  const parsedDueDate = dueDate ? new Date(dueDate) : null;

  try {
    // 1. Insert base task
    await pool.query(
      `INSERT INTO tasks (id, title, description, status, priority, due_date, creator_id, 
                          teams_link, channel_link, chat_link, teams_id, channel_id, chatId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, title, description, status, priority, parsedDueDate, resolvedCreator,
       teamsLink, channelLink, chatLink, teamsId, channelId, chatId]
    );

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
      
      const dateStr = val ? val.toLocaleDateString('vi-VN') : 'vô thời hạn';
      // Compare dates safely
      const curDateStr = current.due_date ? new Date(current.due_date).toLocaleDateString('vi-VN') : 'vô thời hạn';
      if (dateStr !== curDateStr) {
        await writeLog(req.user.name, `đã đổi hạn chót của "${current.title}" thành [${dateStr}]`, 'update');
      }
    }

    // Teams link updating
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
    if (updates.hasOwnProperty('channelId')) {
      fields.push('channel_id = ?');
      values.push(updates.channelId);
    }
    if (updates.hasOwnProperty('chatId')) {
      fields.push('chat_id = ?');
      values.push(updates.chatId);
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
