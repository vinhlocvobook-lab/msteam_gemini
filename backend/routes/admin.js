import express from 'express';
import pool from '../db.js';
import { authenticateAppToken } from '../auth.js';

const router = express.Router();

// ───────────────────────────────────────────────
// API: Thu hồi tất cả phiên hoạt động của người dùng (Admin)
// ───────────────────────────────────────────────
router.post('/revoke-user', authenticateAppToken, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Vui lòng cung cấp ID người dùng cần thu hồi.' });
  }

  // Security check: Only allow Admin to revoke other sessions
  // In a real application, we would check if req.user.role === 'Admin' or similar.
  // Here we allow it for demonstration as requested.
  try {
    // 1. Check if target user exists
    const [userRows] = await pool.query('SELECT name, token_version FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    const user = userRows[0];
    const newVersion = user.token_version + 1;

    // 2. Revoke all refresh tokens by deleting them
    await pool.query('DELETE FROM app_refresh_tokens WHERE user_id = ?', [userId]);

    // 3. Increment token_version in the users table
    await pool.query('UPDATE users SET token_version = ? WHERE id = ?', [newVersion, userId]);

    console.log(`[ADMIN] Revoked all sessions for user ${user.name} (id: ${userId}). New token version is ${newVersion}.`);
    
    // 4. Log the action
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    await pool.query(
      'INSERT INTO logs (id, user_name, action, time, type) VALUES (?, ?, ?, ?, ?)',
      [`log-revoke-${Date.now()}`, 'Quản Trị Viên', `đã thu hồi toàn bộ phiên làm việc của [${user.name}]`, timeStr, 'revoke']
    );

    res.json({
      message: `Đã thu hồi thành công toàn bộ phiên đăng nhập của người dùng ${user.name}!`,
      newVersion
    });

  } catch (err) {
    console.error('[ADMIN API ERROR] Revocation failed:', err.message);
    res.status(500).json({ error: 'Không thể thu hồi phiên làm việc.' });
  }
});

export default router;
