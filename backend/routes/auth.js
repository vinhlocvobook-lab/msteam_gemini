import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';
import { encrypt, decrypt } from '../auth.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const {
  MICROSOFT_TENANT_ID,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0',
  MICROSOFT_GRAPH_SCOPES = 'Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send Chat.ReadWrite offline_access User.Read',
  MICROSOFT_REDIRECT_URI,
  APP_JWT_SECRET = 'default_app_jwt_secret_key_12345',
  APP_JWT_REFRESH_SECRET = 'default_app_refresh_secret_key_12345'
} = process.env;

// Helper to SHA-256 hash a refresh token for DB storage
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ───────────────────────────────────────────────
// API: Lấy cấu hình Microsoft OAuth công khai
// ───────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    clientId: MICROSOFT_CLIENT_ID,
    tenantId: MICROSOFT_TENANT_ID || 'common',
    redirectUri: MICROSOFT_REDIRECT_URI,
    scopes: MICROSOFT_GRAPH_SCOPES
  });
});

// ───────────────────────────────────────────────
// API: Đổi Access Token/Code của Microsoft lấy JWT ứng dụng
// ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  let { msAccessToken, msRefreshToken, msExpiresIn, msTenantId, code } = req.body;

  try {
    if (code) {
      console.log('[AUTH] Exchanging authorization code for Microsoft tokens...');
      const tenant = msTenantId || MICROSOFT_TENANT_ID || 'common';
      const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code: code,
          redirect_uri: MICROSOFT_REDIRECT_URI,
          grant_type: 'authorization_code',
          scope: MICROSOFT_GRAPH_SCOPES
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      msAccessToken = tokenResponse.data.access_token;
      msRefreshToken = tokenResponse.data.refresh_token;
      msExpiresIn = tokenResponse.data.expires_in;
      msTenantId = tenant;
    }

    if (!msAccessToken) {
      return res.status(400).json({ error: 'Thiếu Microsoft Access Token hoặc Authorization Code.' });
    }

    console.log('[AUTH] Verifying Microsoft token with Graph API...');
    
    // Call Microsoft Graph to get authentic user profile details
    const graphResponse = await axios.get(`${MICROSOFT_GRAPH_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${msAccessToken}` }
    });

    const msUser = graphResponse.data;
    const msUserId = msUser.id;
    const email = msUser.mail || msUser.userPrincipalName;
    const name = msUser.displayName;

    console.log(`[AUTH] Authenticated as MS User: ${name} (${email})`);

    // 1. Check if user already exists in our users table
    const [userRows] = await pool.query('SELECT * FROM users WHERE microsoft_id = ? OR email = ?', [msUserId, email]);
    
    let user;
    if (userRows.length === 0) {
      // Register new user
      // Pick a random beautiful avatar and hex color
      const username = email.split('@')[0];
      const colors = ['#ec4899', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${randomColor.replace('#', '')}&color=fff&size=150`;

      user = {
        id: `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        name,
        username,
        email,
        role: 'Normal_User',
        avatar: avatarUrl,
        color: randomColor,
        microsoft_id: msUserId,
        ms_tenant_id: msTenantId || MICROSOFT_TENANT_ID || 'common',
        token_version: 1,
        department_id: null
      };

      await pool.query(
        'INSERT INTO users (id, name, username, email, role, avatar, color, microsoft_id, ms_tenant_id, token_version, department_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.username, user.email, user.role, user.avatar, user.color, user.microsoft_id, user.ms_tenant_id, user.token_version, user.department_id]
      );
      console.log(`[AUTH] Created new local user account: ${user.id}`);
    } else {
      user = userRows[0];
      // Update tenant id or credentials if needed
      await pool.query('UPDATE users SET ms_tenant_id = ? WHERE id = ?', [msTenantId || MICROSOFT_TENANT_ID || 'common', user.id]);
    }

    // 2. Encrypt and save Microsoft Tokens in microsoft_tokens
    const encAccess = encrypt(msAccessToken);
    const encRefresh = encrypt(msRefreshToken || '');
    const expiry = new Date(Date.now() + (msExpiresIn || 3600) * 1000);

    // Upsert Microsoft tokens
    await pool.query(`
      INSERT INTO microsoft_tokens (user_id, access_token, refresh_token, expires_at, scopes) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        access_token = VALUES(access_token), 
        refresh_token = VALUES(refresh_token), 
        expires_at = VALUES(expires_at),
        scopes = VALUES(scopes)
    `, [user.id, encAccess, encRefresh, expiry, MICROSOFT_GRAPH_SCOPES]);

    console.log('[AUTH] Microsoft tokens saved/updated securely in DB.');

    // 3. Issue short-lived App JWT Access Token (expires in 15 minutes)
    const appAccessToken = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        avatar: user.avatar,
        color: user.color,
        tokenVersion: user.token_version
      },
      APP_JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 4. Issue long-lived App Custom Refresh Token
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefresh = hashToken(rawRefreshToken);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      'INSERT INTO app_refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [`ref-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, user.id, hashedRefresh, refreshExpiry]
    );

    // Set Refresh Token in secure httpOnly cookie
    res.cookie('appRefreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log(`[AUTH] Issued session tokens for user: ${user.name}`);

    // Return the user and access token in body
    res.json({
      accessToken: appAccessToken,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        avatar: user.avatar,
        color: user.color
      }
    });

  } catch (err) {
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[AUTH ERROR] Login handler failed:', errMsg);
    res.status(500).json({ error: 'Đăng nhập thất bại.', details: errMsg });
  }
});

// ───────────────────────────────────────────────
// API: Đổi Refresh Token lấy Access Token mới
// ───────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const rawRefreshToken = req.cookies.appRefreshToken;

  if (!rawRefreshToken) {
    return res.status(401).json({ error: 'Chưa đăng nhập (Thiếu refresh token cookie).' });
  }

  try {
    const hashedRefresh = hashToken(rawRefreshToken);
    
    // Find active token
    const [tokenRows] = await pool.query(
      'SELECT * FROM app_refresh_tokens WHERE token = ? AND revoked = 0 AND expires_at > NOW()',
      [hashedRefresh]
    );

    if (tokenRows.length === 0) {
      return res.status(401).json({ error: 'Refresh token đã hết hạn hoặc không hợp lệ.' });
    }

    const activeTokenRow = tokenRows[0];
    const userId = activeTokenRow.user_id;

    // Fetch user details
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Người dùng không tồn tại.' });
    }

    const user = userRows[0];

    // Issue a fresh App JWT Access Token (expires in 15 mins)
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        avatar: user.avatar,
        color: user.color,
        tokenVersion: user.token_version
      },
      APP_JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Rotate refresh token (revoke current, create new one) - Sliding Window Session
    await pool.query('UPDATE app_refresh_tokens SET revoked = 1 WHERE id = ?', [activeTokenRow.id]);

    const newRawRefresh = crypto.randomBytes(40).toString('hex');
    const newHashedRefresh = hashToken(newRawRefresh);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      'INSERT INTO app_refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [`ref-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, user.id, newHashedRefresh, refreshExpiry]
    );

    // Reset secure cookie
    res.cookie('appRefreshToken', newRawRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log(`[AUTH] Rotated session tokens for user: ${user.name}`);
    res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.error('[AUTH ERROR] Token refresh handler failed:', err.message);
    res.status(500).json({ error: 'Gia hạn phiên thất bại.' });
  }
});

// ───────────────────────────────────────────────
// API: Đăng xuất hệ thống (Huỷ Refresh Token)
// ───────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const rawRefreshToken = req.cookies.appRefreshToken;

  if (rawRefreshToken) {
    try {
      const hashedRefresh = hashToken(rawRefreshToken);
      // Revoke the token in DB
      await pool.query('UPDATE app_refresh_tokens SET revoked = 1 WHERE token = ?', [hashedRefresh]);
    } catch (err) {
      console.error('[AUTH ERROR] Logout DB revoke failed:', err.message);
    }
  }

  // Clear cookie
  res.clearCookie('appRefreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  console.log('[AUTH] User logged out successfully.');
  res.json({ message: 'Đăng xuất thành công!' });
});

// ───────────────────────────────────────────────
// API: Đăng nhập nhanh bằng tài khoản thử nghiệm (Mock Login)
// ───────────────────────────────────────────────
router.post('/mock-login', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Thiếu ID người dùng.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Người dùng thử nghiệm không tồn tại.' });
    }

    const user = rows[0];

    // Issue short-lived App JWT Access Token (expires in 15 minutes)
    const appAccessToken = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        avatar: user.avatar,
        color: user.color,
        tokenVersion: user.token_version
      },
      APP_JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Issue long-lived App Custom Refresh Token
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefresh = hashToken(rawRefreshToken);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      'INSERT INTO app_refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [`ref-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, user.id, hashedRefresh, refreshExpiry]
    );

    // Set Refresh Token in secure httpOnly cookie
    res.cookie('appRefreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log(`[AUTH-MOCK] Issued mock session tokens for user: ${user.name}`);

    res.json({
      accessToken: appAccessToken,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        avatar: user.avatar,
        color: user.color
      }
    });

  } catch (err) {
    console.error('[AUTH ERROR] Mock login handler failed:', err.message);
    res.status(500).json({ error: 'Đăng nhập thử nghiệm thất bại.' });
  }
});

export default router;
