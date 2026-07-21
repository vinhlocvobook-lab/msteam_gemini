import dotenv from 'dotenv';
dotenv.config();

import pool from './db.js';

async function resetTasksData() {
  console.log('=== [DATABASE RESET] Starting cleanup of tasks and log data ===');
  
  let connection;
  try {
    connection = await pool.getConnection();
    
    // 1. Disable checks temporarily to ensure clean truncate/delete
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Perform deletes
    console.log('[RESET] Deleting all tasks (and cascade dependencies)...');
    const [tasksResult] = await connection.query('DELETE FROM tasks');
    console.log(`[RESET] Deleted ${tasksResult.affectedRows} tasks.`);

    console.log('[RESET] Deleting all dependent table records to be absolutely clean...');
    await connection.query('DELETE FROM task_activities');
    await connection.query('DELETE FROM task_assignees');
    await connection.query('DELETE FROM task_teams_links');
    await connection.query('DELETE FROM task_tags');
    await connection.query('DELETE FROM comments');
    await connection.query('DELETE FROM overdue_logs');
    await connection.query('DELETE FROM notifications');
    await connection.query('DELETE FROM app_refresh_tokens');
    await connection.query('DELETE FROM microsoft_tokens');

    console.log('[RESET] Deleting test users (loc, lan, huy, binh / @synapse.com) while keeping locvv@minhphu.onmicrosoft.com...');
    const [usersResult] = await connection.query("DELETE FROM users WHERE id IN ('loc', 'lan', 'huy', 'binh') OR email LIKE '%@synapse.com'");
    console.log(`[RESET] Deleted ${usersResult.affectedRows} test users (kept real user locvv@minhphu.onmicrosoft.com).`);

    console.log('[RESET] Deleting all system and activity feed logs...');
    const [logsResult] = await connection.query('DELETE FROM logs');
    console.log(`[RESET] Deleted ${logsResult.affectedRows} general log entries.`);

    // 3. Re-enable checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('=== [DATABASE RESET] Successfully reset database state! ===');

  } catch (err) {
    console.error('[RESET ERROR] Reset failed:', err.message);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

resetTasksData();
