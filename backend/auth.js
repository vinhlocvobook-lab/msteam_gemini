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
