import express from 'express';
import pool from '../db.js';
import { authenticateAppToken, authorize } from '../auth.js';
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
// API: Lấy danh sách thành viên đội ngũ (kèm vai trò và phòng ban)
// ───────────────────────────────────────────────
router.get('/', authenticateAppToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, email, role, avatar, color, department_id FROM users ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error('[USERS API ERROR] Failed to fetch users:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách thành viên.' });
  }
});

// ───────────────────────────────────────────────
// API: Cập nhật vai trò & phòng ban của thành viên (Admin only)
// ───────────────────────────────────────────────
router.put('/:id', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const userId = req.params.id;
  const { role, departmentId } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'Vai trò là bắt buộc.' });
  }

  const validRoles = ['Admin', 'Team_Leader', 'Normal_User'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  }

  try {
    // 1. Check if user exists
    const [userRows] = await pool.query('SELECT name, role, department_id, token_version FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Thành viên không tồn tại.' });
    }

    const user = userRows[0];
    const resolvedDeptId = departmentId || null;

    // Check if role or department is changed to trigger session revocation
    const isChanged = user.role !== role || user.department_id !== resolvedDeptId;

    if (isChanged) {
      const newVersion = user.token_version + 1;
      
      // Delete active refresh tokens
      await pool.query('DELETE FROM app_refresh_tokens WHERE user_id = ?', [userId]);
      
      // Update profile and increment token version
      await pool.query(
        'UPDATE users SET role = ?, department_id = ?, token_version = ? WHERE id = ?',
        [role, resolvedDeptId, newVersion, userId]
      );
      
      const roleNames = { Admin: 'Quản trị viên', Team_Leader: 'Trưởng nhóm', Normal_User: 'Thành viên' };
      await writeLog(
        req.user.name, 
        `đã cập nhật vai trò của [${user.name}] thành [${roleNames[role] || role}] và thu hồi phiên hoạt động cũ`, 
        'update'
      );
    } else {
      // Standard update if nothing changed
      await pool.query(
        'UPDATE users SET role = ?, department_id = ? WHERE id = ?',
        [role, resolvedDeptId, userId]
      );
    }

    res.json({ 
      message: `Cập nhật thông tin thành viên ${user.name} thành công!`, 
      sessionRevoked: isChanged 
    });

  } catch (err) {
    console.error('[USERS API ERROR] Failed to update user profile:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật thông tin thành viên.' });
  }
});

export default router;
