import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';
import pool from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const {
  APP_JWT_SECRET = 'default_app_jwt_secret_key_12345',
  APP_JWT_REFRESH_SECRET = 'default_app_refresh_secret_key_12345',
  ENCRYPTION_KEY, // must be exactly 32 bytes (256 bits)
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET
} = process.env;

// Key validation helper
function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    // Fallback key for dev safety if not set in environment yet
    return crypto.createHash('sha256').update('fallback_encryption_key_32_bytes_long').digest();
  }
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(); // Safe dynamic 32-byte key hashing
}

// ==========================================
// CRYPTOGRAPHY UTILITIES (AES-256-GCM)
// ==========================================
export function encrypt(text) {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedContent
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[CRYPTO ERROR] Encryption failed:', err);
    throw new Error('Encryption failed');
  }
}

export function decrypt(cipherText) {
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid cipher text format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('[CRYPTO ERROR] Decryption failed:', err);
    throw new Error('Decryption failed');
  }
}

// ==========================================
// AUTH MIDDLEWARE (JWT Verification & Revocation)
// ==========================================
export async function authenticateAppToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"
  
  if (!token) {
    return res.status(401).json({ error: 'Truy cập bị từ chối. Vui lòng cung cấp access token.' });
  }

  try {
    const decoded = jwt.verify(token, APP_JWT_SECRET);
    
    // Check database token version to handle instant revocation
    const [rows] = await pool.query('SELECT token_version FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Người dùng không tồn tại.' });
    }

    const dbVersion = rows[0].token_version;
    if (decoded.tokenVersion !== dbVersion) {
      console.log(`[AUTH] Access Token revoked due to version mismatch. User version: ${dbVersion}, Token: ${decoded.tokenVersion}`);
      return res.status(401).json({ error: 'Phiên làm việc đã bị thu hồi bởi Admin. Vui lòng đăng nhập lại.' });
    }

    req.user = decoded; // Attach user payload to request
    next();
  } catch (err) {
    console.error('[AUTH ERROR] JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Mã Access Token không hợp lệ hoặc đã hết hạn.' });
  }
}

// ==========================================
// AUTHORIZATION MIDDLEWARES (RBAC, ABAC & DAC)
// ==========================================

/**
 * Middleware kiểm tra vai trò người dùng (RBAC)
 * @param {Array<string>} allowedRoles Danh sách các role được phép truy cập
 */
export function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa được xác thực.' });
    }

    const { role } = req.user;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ 
        error: `Bạn không có quyền thực hiện hành động này.` 
      });
    }
    
    next();
  };
}

/**
 * Middleware kiểm tra quyền hạn chi tiết trên task (RBAC, ABAC & DAC)
 * @param {string} requiredAction Hành động cần kiểm tra: 'view' | 'edit' | 'delete'
 */
export function authorizeTask(requiredAction) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa được xác thực.' });
    }

    const taskId = req.params.id || req.body.taskId || req.query.taskId;
    const { id: userId, role, department_id: userDeptId } = req.user;

    if (!taskId) {
      return res.status(400).json({ error: 'Không tìm thấy thông tin ID công việc để phân quyền.' });
    }

    try {
      // 1. Lấy thông tin cơ bản của task
      const [taskRows] = await pool.query(
        'SELECT creator_id, department_id FROM tasks WHERE id = ? AND is_deleted = 0',
        [taskId]
      );

      if (taskRows.length === 0) {
        return res.status(404).json({ error: 'Công việc không tồn tại hoặc đã bị xóa.' });
      }

      const task = taskRows[0];

      // 2. Xác định xem người dùng hiện tại có quyền SỞ HỮU (Full Control) hay không
      let hasFullControl = false;

      if (role === 'Admin') {
        hasFullControl = true;
      } else if (role === 'Team_Leader') {
        // Có quyền sở hữu nếu task thuộc phòng ban của Leader, HOẶC do Leader tự tạo
        if (task.department_id === userDeptId || task.creator_id === userId) {
          hasFullControl = true;
        }
      } else if (role === 'Normal_User') {
        // Chỉ có quyền sở hữu nếu task do chính User này tạo
        if (task.creator_id === userId) {
          hasFullControl = true;
        }
      }

      // Xử lý hành động XÓA (Soft Delete) - Chỉ duy nhất người có Full Control mới được thực hiện
      if (requiredAction === 'delete') {
        if (hasFullControl) {
          return next();
        }
        return res.status(403).json({ error: 'Bạn không có quyền xóa công việc này. Quyền xóa chỉ thuộc về chủ sở hữu hoặc quản trị viên.' });
      }

      // Nếu có Full Control, chắc chắn có quyền Edit và View
      if (hasFullControl) {
        return next();
      }

      // 3. Nếu không có Full Control, kiểm tra xem có được gán (Assignee) vào task hay không
      const [assigneeRows] = await pool.query(
        'SELECT permission FROM task_assignees WHERE task_id = ? AND user_id = ?',
        [taskId, userId]
      );

      const isAssigned = assigneeRows.length > 0;
      const assigneePermission = isAssigned ? assigneeRows[0].permission : null; // 'edit' hoặc 'view'

      // Xử lý hành động CHỈNH SỬA (Edit)
      if (requiredAction === 'edit') {
        if (isAssigned && assigneePermission === 'edit') {
          return next();
        }
        return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa công việc này. Yêu cầu quyền sửa đổi từ chủ sở hữu.' });
      }

      // Xử lý hành động XEM (View)
      if (requiredAction === 'view') {
        // Xem được nếu: được gán (dù quyền là edit hay view) HOẶC cùng phòng ban (để theo dõi chéo trong team)
        const isSameDept = task.department_id === userDeptId;
        if (isAssigned || isSameDept) {
          return next();
        }
        return res.status(403).json({ error: 'Bạn không có quyền xem công việc này (không cùng nhóm và không được gán).' });
      }

      return res.status(403).json({ error: 'Hành động phân quyền không hợp lệ.' });

    } catch (err) {
      console.error('[AUTH ERROR] Task permission verification failed:', err);
      res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra phân quyền công việc.' });
    }
  };
}

// ==========================================
// MICROSOFT TOKEN AUTO-REFRESH ENGINE
// ==========================================
export async function getValidMicrosoftToken(userId) {
  const [rows] = await pool.query(`
    SELECT t.access_token, t.refresh_token, t.expires_at, u.ms_tenant_id 
    FROM microsoft_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.user_id = ?
  `, [userId]);

  if (rows.length === 0) {
    throw new Error(`Microsoft tokens not found for user: ${userId}`);
  }

  const { access_token: cipherAccess, refresh_token: cipherRefresh, expires_at, ms_tenant_id } = rows[0];

  const accessToken = decrypt(cipherAccess);
  const refreshToken = decrypt(cipherRefresh);

  const fiveMinutes = 5 * 60 * 1000;
  const isExpired = new Date(expires_at).getTime() - Date.now() < fiveMinutes;

  if (!isExpired) {
    return accessToken; // Token is still valid!
  }

  console.log(`[MS-TOKEN] Microsoft access token expired or expiring soon for user ${userId}. Refreshing...`);

  try {
    const tenantId = ms_tenant_id || 'common';
    const response = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token: newAccess, refresh_token: newRefresh, expires_in } = response.data;
    
    // Always store the latest refresh token if returned, fallback to current otherwise
    const finalRefresh = newRefresh || refreshToken;
    const newExpiresAt = new Date(Date.now() + expires_in * 1000);

    const encAccess = encrypt(newAccess);
    const encRefresh = encrypt(finalRefresh);

    // Save back to DB
    await pool.query(`
      UPDATE microsoft_tokens 
      SET access_token = ?, refresh_token = ?, expires_at = ? 
      WHERE user_id = ?
    `, [encAccess, encRefresh, newExpiresAt, userId]);

    console.log(`[MS-TOKEN] ✅ Successfully refreshed Microsoft tokens in DB for user: ${userId}`);
    return newAccess;

  } catch (err) {
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`[MS-TOKEN ERROR] Failed to refresh Microsoft token for user ${userId}:`, errMsg);
    throw new Error('Microsoft authentication session expired. Please sign in again.');
  }
}
