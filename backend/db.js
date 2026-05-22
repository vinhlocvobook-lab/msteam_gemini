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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create task_assignees table (Many-to-Many join)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_assignees (
        task_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
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

    console.log('[DATABASE] All tables are bootstrapped successfully.');

    // 11. Seeding default users if database is empty
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      console.log('[DATABASE] Seeding initial users...');
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

    // 12. Seeding default tasks & logs if empty
    const [taskRows] = await connection.query('SELECT COUNT(*) as count FROM tasks');
    if (taskRows[0].count === 0) {
      console.log('[DATABASE] Seeding initial tasks & logs...');
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
