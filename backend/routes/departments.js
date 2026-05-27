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
// API: Lấy danh sách phòng ban kèm số lượng thành viên (headcount)
// ───────────────────────────────────────────────
router.get('/', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.id, d.name, d.description, d.created_at, COUNT(u.id) as headcount 
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      GROUP BY d.id
      ORDER BY d.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[DEPARTMENTS API ERROR] Failed to fetch departments:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách phòng ban.' });
  }
});

// ───────────────────────────────────────────────
// API: Tạo phòng ban mới
// ───────────────────────────────────────────────
router.post('/', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const { name, description = '' } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên phòng ban là bắt buộc.' });
  }

  const deptId = `dept-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  try {
    // Check duplication
    const [dup] = await pool.query('SELECT id FROM departments WHERE name = ?', [name.trim()]);
    if (dup.length > 0) {
      return res.status(400).json({ error: 'Tên phòng ban này đã tồn tại.' });
    }

    await pool.query(
      'INSERT INTO departments (id, name, description) VALUES (?, ?, ?)',
      [deptId, name.trim(), description.trim()]
    );

    await writeLog(req.user.name, `đã tạo phòng ban mới "${name.trim()}"`, 'create');

    res.status(201).json({ message: 'Tạo phòng ban thành công!', departmentId: deptId });
  } catch (err) {
    console.error('[DEPARTMENTS API ERROR] Failed to create department:', err.message);
    res.status(500).json({ error: 'Không thể tạo phòng ban mới.' });
  }
});

// ───────────────────────────────────────────────
// API: Sửa phòng ban
// ───────────────────────────────────────────────
router.put('/:id', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const deptId = req.params.id;
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên phòng ban là bắt buộc.' });
  }

  try {
    // Check if department exists
    const [current] = await pool.query('SELECT name FROM departments WHERE id = ?', [deptId]);
    if (current.length === 0) {
      return res.status(404).json({ error: 'Phòng ban không tồn tại.' });
    }

    // Check duplication for different id
    const [dup] = await pool.query('SELECT id FROM departments WHERE name = ? AND id != ?', [name.trim(), deptId]);
    if (dup.length > 0) {
      return res.status(400).json({ error: 'Tên phòng ban này đã tồn tại ở phòng ban khác.' });
    }

    await pool.query(
      'UPDATE departments SET name = ?, description = ? WHERE id = ?',
      [name.trim(), description !== undefined ? description.trim() : '', deptId]
    );

    await writeLog(req.user.name, `đã cập nhật phòng ban "${current[0].name}" thành "${name.trim()}"`, 'update');

    res.json({ message: 'Cập nhật phòng ban thành công!' });
  } catch (err) {
    console.error('[DEPARTMENTS API ERROR] Failed to update department:', err.message);
    res.status(500).json({ error: 'Không thể cập nhật phòng ban.' });
  }
});

// ───────────────────────────────────────────────
// API: Xóa phòng ban
// ───────────────────────────────────────────────
router.delete('/:id', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const deptId = req.params.id;

  try {
    const [current] = await pool.query('SELECT name FROM departments WHERE id = ?', [deptId]);
    if (current.length === 0) {
      return res.status(404).json({ error: 'Phòng ban không tồn tại.' });
    }

    // Delete department (MySQL foreign keys handle ON DELETE SET NULL for users and tasks automatically!)
    await pool.query('DELETE FROM departments WHERE id = ?', [deptId]);

    await writeLog(req.user.name, `đã xóa phòng ban "${current[0].name}" khỏi hệ thống`, 'delete');

    res.json({ message: `Đã xóa thành công phòng ban "${current[0].name}". Nhân sự và công việc liên kết đã được đưa về trạng thái tự do.` });
  } catch (err) {
    console.error('[DEPARTMENTS API ERROR] Failed to delete department:', err.message);
    res.status(500).json({ error: 'Không thể xóa phòng ban.' });
  }
});

export default router;
