import express from 'express';
import pool from '../db.js';
import { authenticateAppToken } from '../auth.js';

const router = express.Router();

// ───────────────────────────────────────────────
// API: Lấy danh sách thành viên đội ngũ
// ───────────────────────────────────────────────
router.get('/', authenticateAppToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, email, role, avatar, color FROM users ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error('[USERS API ERROR] Failed to fetch users:', err.message);
    res.status(500).json({ error: 'Không thể lấy danh sách thành viên.' });
  }
});

export default router;
