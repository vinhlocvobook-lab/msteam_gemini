import express from 'express';
import pool from '../db.js';
import { authenticateAppToken } from '../auth.js';

const router = express.Router();

// 1. GET /api/notifications - Get all notifications for current logged in user (sorted newest first)
router.get('/', authenticateAppToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch notifications matching this user
    const [rows] = await pool.query(
      `SELECT n.*, t.title AS task_title
       FROM notifications n
       LEFT JOIN tasks t ON n.task_id = t.id
       WHERE n.user_id = ?
         AND (t.is_deleted = 0 OR n.task_id IS NULL OR t.id IS NULL)
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error('[NOTIFICATIONS API ERROR] GET / failed:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách thông báo.' });
  }
});

// 2. PUT /api/notifications/read/:id - Mark a single notification as read
router.put('/read/:id', authenticateAppToken, async (req, res) => {
  const notifId = req.params.id;
  const userId = req.user.id;

  try {
    const [result] = await pool.query(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE id = ? AND user_id = ?`,
      [notifId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Thông báo không tồn tại hoặc không thuộc quyền sở hữu của bạn.' });
    }

    res.json({ message: 'Đã đánh dấu thông báo đã đọc thành công.' });
  } catch (err) {
    console.error('[NOTIFICATIONS API ERROR] PUT /read/:id failed:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật trạng thái thông báo.' });
  }
});

// 3. PUT /api/notifications/read-all - Mark all notifications as read for current user
router.put('/read-all', authenticateAppToken, async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
  } catch (err) {
    console.error('[NOTIFICATIONS API ERROR] PUT /read-all failed:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật tất cả thông báo.' });
  }
});

// 4. DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', authenticateAppToken, async (req, res) => {
  const notifId = req.params.id;
  const userId = req.user.id;

  try {
    const [result] = await pool.query(
      `DELETE FROM notifications 
       WHERE id = ? AND user_id = ?`,
      [notifId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Thông báo không tồn tại hoặc không có quyền xóa.' });
    }

    res.json({ message: 'Đã xóa thông báo thành công.' });
  } catch (err) {
    console.error('[NOTIFICATIONS API ERROR] DELETE /:id failed:', err.message);
    res.status(500).json({ error: 'Không thể xóa thông báo.' });
  }
});

export default router;
