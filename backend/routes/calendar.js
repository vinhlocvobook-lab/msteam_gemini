import express from 'express';
import pool from '../db.js';
import { authenticateAppToken, authorize } from '../auth.js';

const router = express.Router();

// GET /api/calendar/settings
router.get('/settings', authenticateAppToken, async (req, res) => {
  try {
    const [weekends] = await pool.query('SELECT day_index FROM calendar_weekends');
    const weekendDays = weekends.map(w => w.day_index);

    const [holidays] = await pool.query('SELECT * FROM calendar_holidays');
    
    res.json({
      weekendDays,
      holidays: holidays.map(h => ({
        id: h.id,
        name: h.name,
        type: h.type,
        month: h.month,
        day: h.day,
        dateStr: h.date_str,
        color: h.color
      }))
    });
  } catch (error) {
    console.error('Error fetching calendar settings:', error);
    res.status(500).json({ error: 'Không thể tải cấu hình ngày nghỉ.' });
  }
});

// POST /api/calendar/weekends
router.post('/weekends', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const { weekendDays } = req.body; // Array of numbers e.g. [0, 6]
  if (!Array.isArray(weekendDays)) {
    return res.status(400).json({ error: 'Dữ liệu ngày cuối tuần không hợp lệ.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Clear existing weekends
    await connection.query('DELETE FROM calendar_weekends');

    // Insert new weekends
    for (const d of weekendDays) {
      const dayNum = parseInt(d);
      if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
        await connection.query('INSERT INTO calendar_weekends (day_index) VALUES (?)', [dayNum]);
      }
    }

    await connection.commit();
    res.json({ success: true, weekendDays });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error updating weekend settings:', error);
    res.status(500).json({ error: 'Không thể cập nhật ngày cuối tuần.' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/calendar/holidays
router.post('/holidays', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const { name, type, month, day, dateStr, color } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Tên và loại ngày lễ là bắt buộc.' });
  }

  const id = 'h-' + Date.now() + Math.random().toString(36).substr(2, 5);
  const holidayColor = color || '#f43f5e';

  try {
    await pool.query(
      'INSERT INTO calendar_holidays (id, name, type, month, day, date_str, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id, 
        name, 
        type, 
        type === 'single' ? null : parseInt(month), 
        type === 'single' ? null : parseInt(day), 
        type === 'single' ? dateStr : null, 
        holidayColor
      ]
    );

    res.json({
      success: true,
      holiday: {
        id,
        name,
        type,
        month: type === 'single' ? null : parseInt(month),
        day: type === 'single' ? null : parseInt(day),
        dateStr: type === 'single' ? dateStr : null,
        color: holidayColor
      }
    });
  } catch (error) {
    console.error('Error adding holiday:', error);
    res.status(500).json({ error: 'Không thể thêm ngày nghỉ lễ mới.' });
  }
});

// DELETE /api/calendar/holidays/:id
router.delete('/holidays/:id', authenticateAppToken, authorize(['Admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM calendar_holidays WHERE id = ?', [id]);
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: 'Không thể xóa ngày nghỉ lễ.' });
  }
});

export default router;
