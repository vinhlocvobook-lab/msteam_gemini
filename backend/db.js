import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} = process.env;

// Create MySQL connection pool
const pool = mysql.createPool({
  host: DB_HOST,
  port: parseInt(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Setup tables and seed data if not present
export async function initializeDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[DATABASE] Connected to MySQL successfully!');

    // 0. Create departments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed departments if empty
    const [deptCount] = await connection.query('SELECT COUNT(*) as count FROM departments');
    if (deptCount[0].count === 0) {
      console.log('[DATABASE] Seeding default departments...');
      await connection.query(`
        INSERT INTO departments (id, name, description) VALUES 
        ('dept-tech', 'Phòng Kỹ thuật & Công nghệ', 'Chịu trách nhiệm phát triển phần mềm và hạ tầng hệ thống'),
        ('dept-design', 'Phòng Thiết kế & UI/UX', 'Thiết kế trải nghiệm người dùng và thương hiệu'),
        ('dept-product', 'Ban Quản trị Sản phẩm', 'Quản lý roadmap và định hướng phát triển sản phẩm')
      `);
    }

    // 1. Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        avatar VARCHAR(500),
        color VARCHAR(50),
        microsoft_id VARCHAR(255) UNIQUE,
        ms_tenant_id VARCHAR(255),
        token_version INT DEFAULT 1,
        department_id VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Create microsoft_tokens table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS microsoft_tokens (
        user_id VARCHAR(255) PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        scopes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Create app_refresh_tokens table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS app_refresh_tokens (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create teams_sync_states table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS teams_sync_states (
        channel_or_chat_id VARCHAR(255) PRIMARY KEY,
        delta_link TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create microsoft_subscriptions table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS microsoft_subscriptions (
        subscription_id VARCHAR(255) PRIMARY KEY,
        resource VARCHAR(500) NOT NULL,
        channel_or_chat_id VARCHAR(255) NOT NULL,
        creator_id VARCHAR(255) NOT NULL,
        expiration_date_time DATETIME NOT NULL,
        client_state VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Create tasks table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'todo',
        priority VARCHAR(50) DEFAULT 'medium',
        start_date DATETIME DEFAULT NULL,
        actual_start_date DATETIME DEFAULT NULL,
        due_date DATETIME,
        creator_id VARCHAR(255) NOT NULL,
        teams_link VARCHAR(1000),
        channel_link VARCHAR(1000),
        chat_link VARCHAR(1000),
        teams_id VARCHAR(255),
        channel_id VARCHAR(255),
        chat_id VARCHAR(255),
        teams_message_id VARCHAR(255),
        last_synced_at DATETIME,
        department_id VARCHAR(255) DEFAULT NULL,
        dependencies TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6.5. Create task_teams_links table (One-to-Many Teams/Chats linkages)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_teams_links (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL, -- 'channel' hoặc 'chat'
        conversation_id VARCHAR(255) NOT NULL, -- channel_id hoặc chat_id làm định danh đồng bộ
        teams_id VARCHAR(255),
        teams_name VARCHAR(255),
        channel_id VARCHAR(255),
        channel_name VARCHAR(255),
        channel_link VARCHAR(1000),
        chat_id VARCHAR(255),
        chat_name VARCHAR(255),
        chat_link VARCHAR(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE KEY uq_task_conversation (task_id, conversation_id),
        INDEX idx_ttl_task_id (task_id),
        INDEX idx_ttl_conversation_id (conversation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create task_assignees table (Many-to-Many join)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_assignees (
        task_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        permission VARCHAR(50) DEFAULT 'edit',
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Create task_tags table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_tags (
        task_id VARCHAR(255) NOT NULL,
        tag VARCHAR(100) NOT NULL,
        PRIMARY KEY (task_id, tag),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Create comments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Create logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id VARCHAR(255) PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL,
        action VARCHAR(1000) NOT NULL,
        time VARCHAR(100) NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10.1. Create overdue_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS overdue_logs (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        task_title VARCHAR(500) NOT NULL,
        assignees VARCHAR(1000),
        due_date DATETIME NOT NULL,
        status_at_log VARCHAR(50) NOT NULL,
        resolution_date DATETIME DEFAULT NULL,
        completed_by_user_id VARCHAR(255) DEFAULT NULL,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ol_task_id (task_id),
        INDEX idx_ol_logged_at (logged_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10.1.1. Create task_activities table for detailed task change history
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_activities (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NULL,
        user_name VARCHAR(255) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        field_changed VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        description VARCHAR(1000) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ta_task_id (task_id),
        INDEX idx_ta_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10.2. Create notifications table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        task_id VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        type VARCHAR(50) DEFAULT 'reminder',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        INDEX idx_notif_user_read (user_id, is_read),
        INDEX idx_notif_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10.2.1. Create calendar_weekends table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS calendar_weekends (
        day_index INT PRIMARY KEY
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10.2.2. Create calendar_holidays table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS calendar_holidays (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        month INT NULL,
        day INT NULL,
        date_str VARCHAR(50) NULL,
        color VARCHAR(50) DEFAULT '#f43f5e'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed calendar_weekends with default [0, 6] (Sunday, Saturday) if empty
    const [weekendCount] = await connection.query('SELECT COUNT(*) as count FROM calendar_weekends');
    if (weekendCount[0].count === 0) {
      console.log('[DATABASE] Seeding default weekends...');
      await connection.query('INSERT INTO calendar_weekends (day_index) VALUES (0), (6)');
    }

    // Seed calendar_holidays with default Vietnamese holidays if empty
    const [holidayCount] = await connection.query('SELECT COUNT(*) as count FROM calendar_holidays');
    if (holidayCount[0].count === 0) {
      console.log('[DATABASE] Seeding default Vietnamese holidays...');
      const defaultHolidays = [
        ['h1', 'Tết Dương Lịch', 'solar', 1, 1, null, '#f43f5e'],
        ['h2', 'Ngày Chiến Thắng', 'solar', 4, 30, null, '#f43f5e'],
        ['h3', 'Ngày Quốc tế Lao động', 'solar', 5, 1, null, '#f43f5e'],
        ['h4', 'Ngày Quốc khánh', 'solar', 9, 2, null, '#f43f5e'],
        ['h5', 'Tết Nguyên Đán (Mùng 1)', 'lunar', 1, 1, null, '#e11d48'],
        ['h6', 'Tết Nguyên Đán (Mùng 2)', 'lunar', 1, 2, null, '#e11d48'],
        ['h7', 'Tết Nguyên Đán (Mùng 3)', 'lunar', 1, 3, null, '#e11d48'],
        ['h8', 'Giỗ Tổ Hùng Vương', 'lunar', 3, 10, null, '#d97706']
      ];
      for (const h of defaultHolidays) {
        await connection.query(
          'INSERT INTO calendar_holidays (id, name, type, month, day, date_str, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
          h
        );
      }
    }

    // 10.3. Migration: Add columns to tasks if not exists
    const [columns] = await connection.query("SHOW COLUMNS FROM tasks");
    const colNames = columns.map(c => c.Field);

    if (!colNames.includes('reminder_before_minutes')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN reminder_before_minutes INT DEFAULT NULL");
      console.log("[DATABASE MIGRATION] Added column reminder_before_minutes to tasks");
    }
    if (!colNames.includes('reminder_sent')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN reminder_sent TINYINT DEFAULT 0");
      console.log("[DATABASE MIGRATION] Added column reminder_sent to tasks");
    }
    if (!colNames.includes('overdue_logged')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN overdue_logged TINYINT DEFAULT 0");
      console.log("[DATABASE MIGRATION] Added column overdue_logged to tasks");
    }
    if (!colNames.includes('start_date')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN start_date DATETIME DEFAULT NULL");
      console.log("[DATABASE MIGRATION] Added column start_date to tasks");
    }
    if (!colNames.includes('actual_start_date')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN actual_start_date DATETIME DEFAULT NULL");
      console.log("[DATABASE MIGRATION] Added column actual_start_date to tasks");
    }
    if (!colNames.includes('is_deleted')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN is_deleted TINYINT DEFAULT 0");
      console.log("[DATABASE MIGRATION] Added column is_deleted to tasks");
    }
    if (!colNames.includes('deleted_at')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN deleted_at DATETIME DEFAULT NULL");
      console.log("[DATABASE MIGRATION] Added column deleted_at to tasks");
    }
    if (!colNames.includes('department_id')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN department_id VARCHAR(255) DEFAULT NULL");
      await connection.query("ALTER TABLE tasks ADD CONSTRAINT fk_tasks_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL");
      console.log("[DATABASE MIGRATION] Added column department_id to tasks");
    }
    if (!colNames.includes('dependencies')) {
      await connection.query("ALTER TABLE tasks ADD COLUMN dependencies TEXT DEFAULT NULL");
      console.log("[DATABASE MIGRATION] Added column dependencies to tasks");
    }

    // 10.3.1 Migration: Add department_id to users if not exists
    const [userColumns] = await connection.query("SHOW COLUMNS FROM users");
    const userColNames = userColumns.map(c => c.Field);
    if (!userColNames.includes('department_id')) {
      await connection.query("ALTER TABLE users ADD COLUMN department_id VARCHAR(255) DEFAULT NULL");
      await connection.query("ALTER TABLE users ADD CONSTRAINT fk_users_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL");
      console.log("[DATABASE MIGRATION] Added column department_id to users");
    }

    // 10.3.2 Migration: Add permission to task_assignees if not exists
    const [taColumns] = await connection.query("SHOW COLUMNS FROM task_assignees");
    const taColNames = taColumns.map(c => c.Field);
    if (!taColNames.includes('permission')) {
      await connection.query("ALTER TABLE task_assignees ADD COLUMN permission VARCHAR(50) DEFAULT 'edit'");
      console.log("[DATABASE MIGRATION] Added column permission to task_assignees");
    }

    // 10.3.3 Migration: Ensure index constraints for role, departments and permissions
    try {
      const [indexes] = await connection.query("SHOW INDEX FROM users");
      const idxNames = indexes.map(i => i.Key_name);
      if (!idxNames.includes('idx_users_role')) {
        await connection.query("CREATE INDEX idx_users_role ON users (role)");
      }
      if (!idxNames.includes('idx_users_dept')) {
        await connection.query("CREATE INDEX idx_users_dept ON users (department_id)");
      }
    } catch (e) {
      console.warn("[DATABASE MIGRATION] Users index creation bypassed:", e.message);
    }

    try {
      const [tIndexes] = await connection.query("SHOW INDEX FROM tasks");
      const tIdxNames = tIndexes.map(i => i.Key_name);
      if (!tIdxNames.includes('idx_tasks_dept')) {
        await connection.query("CREATE INDEX idx_tasks_dept ON tasks (department_id)");
      }
    } catch (e) {
      console.warn("[DATABASE MIGRATION] Tasks index creation bypassed:", e.message);
    }

    try {
      const [taIndexes] = await connection.query("SHOW INDEX FROM task_assignees");
      const taIdxNames = taIndexes.map(i => i.Key_name);
      if (!taIdxNames.includes('idx_ta_permission')) {
        await connection.query("CREATE INDEX idx_ta_permission ON task_assignees (permission)");
      }
    } catch (e) {
      console.warn("[DATABASE MIGRATION] Task assignees index creation bypassed:", e.message);
    }

    // 10.3.4 Migration: Seed and update role & departments for standard user profiles
    console.log("[DATABASE MIGRATION] Syncing role standardizations and departments...");
    await connection.query("UPDATE users SET role = 'Admin', department_id = 'dept-product' WHERE id = 'loc'");
    await connection.query("UPDATE users SET role = 'Team_Leader', department_id = 'dept-design' WHERE id = 'lan'");
    await connection.query("UPDATE users SET role = 'Normal_User', department_id = 'dept-tech' WHERE id = 'huy'");
    await connection.query("UPDATE users SET role = 'Normal_User', department_id = 'dept-tech' WHERE id = 'binh'");
    
    // Set tasks department based on creator's department
    await connection.query("UPDATE tasks t JOIN users u ON t.creator_id = u.id SET t.department_id = u.department_id WHERE t.department_id IS NULL");
    console.log("[DATABASE MIGRATION] ✅ Sync complete.");

    // 10.4. Migration: Add index to tasks if not exists
    const [indexes] = await connection.query("SHOW INDEX FROM tasks");
    const idxNames = indexes.map(i => i.Key_name);
    if (!idxNames.includes('idx_tasks_due_status_rem')) {
      await connection.query("CREATE INDEX idx_tasks_due_status_rem ON tasks (due_date, status, reminder_sent, overdue_logged)");
      console.log("[DATABASE MIGRATION] Created composite index idx_tasks_due_status_rem on tasks");
    }
    if (!idxNames.includes('idx_tasks_is_deleted')) {
      await connection.query("CREATE INDEX idx_tasks_is_deleted ON tasks (is_deleted)");
      console.log("[DATABASE MIGRATION] Created index idx_tasks_is_deleted on tasks");
    }

    if (!idxNames.includes('idx_tasks_created_at')) {
      await connection.query("CREATE INDEX idx_tasks_created_at ON tasks (created_at)");
      console.log("[DATABASE MIGRATION] Created index idx_tasks_created_at on tasks");
    }
    if (!idxNames.includes('idx_tasks_status')) {
      await connection.query("CREATE INDEX idx_tasks_status ON tasks (status)");
      console.log("[DATABASE MIGRATION] Created index idx_tasks_status on tasks");
    }
    if (!idxNames.includes('idx_tasks_priority')) {
      await connection.query("CREATE INDEX idx_tasks_priority ON tasks (priority)");
      console.log("[DATABASE MIGRATION] Created index idx_tasks_priority on tasks");
    }

    const [taIndexes] = await connection.query("SHOW INDEX FROM task_assignees");
    const taIdxNames = taIndexes.map(i => i.Key_name);
    if (!taIdxNames.includes('idx_ta_user_id')) {
      await connection.query("CREATE INDEX idx_ta_user_id ON task_assignees (user_id)");
      console.log("[DATABASE MIGRATION] Created index idx_ta_user_id on task_assignees");
    }

    const [ttIndexes] = await connection.query("SHOW INDEX FROM task_tags");
    const ttIdxNames = ttIndexes.map(i => i.Key_name);
    if (!ttIdxNames.includes('idx_tt_tag')) {
      await connection.query("CREATE INDEX idx_tt_tag ON task_tags (tag)");
      console.log("[DATABASE MIGRATION] Created index idx_tt_tag on task_tags");
    }

    console.log('[DATABASE] All tables are bootstrapped successfully.');

    // 11. Seeding default users if database is empty (Development mode only)
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0 && process.env.NODE_ENV !== 'production') {
      console.log('[DATABASE] Seeding initial users for development...');
      const defaultUsers = [
        ['loc', 'Võ Vĩnh Lộc', 'loc', 'loc@synapse.com', 'Product Owner', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80', '#ec4899'],
        ['lan', 'Nguyễn Mai Lan', 'lan', 'lan@synapse.com', 'UI/UX Designer', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80', '#10b981'],
        ['huy', 'Trần Thế Huy', 'huy', 'huy@synapse.com', 'Frontend Dev', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80', '#3b82f6'],
        ['binh', 'Phạm Thanh Bình', 'binh', 'binh@synapse.com', 'Backend Dev', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80', '#f59e0b']
      ];

      for (const u of defaultUsers) {
        await connection.query(
          'INSERT INTO users (id, name, username, email, role, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
          u
        );
      }
      console.log('[DATABASE] Seeded 4 default users.');
    }

    // 12. Seeding default tasks & logs if empty (Development mode only)
    const [taskRows] = await connection.query('SELECT COUNT(*) as count FROM tasks');
    if (taskRows[0].count === 0 && process.env.NODE_ENV !== 'production') {
      console.log('[DATABASE] Seeding initial tasks & logs for development...');
      const now = new Date();
      
      const defaultTasks = [
        ['t1', 'Thiết kế giao diện Landing Page (Mobile & Desktop)', 'Mockup hoàn chỉnh trên Figma', 'in_progress', 'high', new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), 'loc'],
        ['t2', 'Tối ưu hóa API Core và kết nối database', 'Sử dụng connection pool và indexing các bảng chính', 'todo', 'high', new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), 'loc'],
        ['t3', 'Viết tài liệu tích hợp API cho đối tác', 'Viết chi tiết các bước xác thực JWT', 'review', 'medium', new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), 'binh'],
        ['t4', 'Cài đặt và thiết lập cấu hình Repo CI/CD', 'Chạy test tự động trước khi deploy', 'done', 'low', new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), 'loc']
      ];

      for (const t of defaultTasks) {
        await connection.query(
          'INSERT INTO tasks (id, title, description, status, priority, due_date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          t
        );
      }

      // Seed task assignees (matching original config)
      await connection.query("INSERT INTO task_assignees (task_id, user_id) VALUES ('t1', 'lan')");
      await connection.query("INSERT INTO task_assignees (task_id, user_id) VALUES ('t2', 'binh')");
      await connection.query("INSERT INTO task_assignees (task_id, user_id) VALUES ('t3', 'loc')");
      await connection.query("INSERT INTO task_assignees (task_id, user_id) VALUES ('t4', 'huy')");

      // Seed default logs
      const defaultLogs = [
        ['l1', 'Võ Vĩnh Lộc', 'đã tạo dự án "Synapse Collaboration"', '10 phút trước', 'system'],
        ['l2', 'Nguyễn Mai Lan', 'đã chuyển "Thiết kế giao diện Landing Page" sang Đang làm', '5 phút trước', 'move'],
        ['l3', 'Phạm Thanh Bình', 'đã gán "Tối ưu hóa API Core" cho bản thân', '2 phút trước', 'assign']
      ];

      for (const l of defaultLogs) {
        await connection.query(
          'INSERT INTO logs (id, user_name, action, time, type) VALUES (?, ?, ?, ?, ?)',
          l
        );
      }
      console.log('[DATABASE] Seeded default tasks and logs successfully.');
    }

  } catch (error) {
    console.error('[DATABASE] Error initializing database:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

export default pool;
