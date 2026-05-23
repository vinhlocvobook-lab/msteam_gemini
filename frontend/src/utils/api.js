export const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:5001';

let appAccessToken = sessionStorage.getItem('synapse_access_token') || null;
let authChangeCallback = null;

export function setAccessToken(token) {
  appAccessToken = token;
  if (token) {
    sessionStorage.setItem('synapse_access_token', token);
  } else {
    sessionStorage.removeItem('synapse_access_token');
  }
}

export function registerAuthChangeCallback(callback) {
  authChangeCallback = callback;
}

function notifyAuthFailed() {
  setAccessToken(null);
  if (authChangeCallback) {
    authChangeCallback(null);
  }
}

// ───────────────────────────────────────────────
// CUSTOM FETCH WRAPPER WITH RETRY & REFRESH LOGIC
// ───────────────────────────────────────────────
export async function apiFetch(endpoint, options = {}) {
  const url = `${BACKEND_BASE_URL}${endpoint}`;

  // Set default credentials and content-type headers
  options.credentials = 'include';
  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Attach access token if present
  if (appAccessToken) {
    options.headers['Authorization'] = `Bearer ${appAccessToken}`;
  }

  try {
    let response = await fetch(url, options);

    // If 401 Unauthorized, access token might be expired. Try to refresh.
    if (response.status === 401) {
      console.log('[API] Access token unauthorized (401). Attempting automatic refresh...');

      const refreshUrl = `${BACKEND_BASE_URL}/api/auth/refresh`;
      try {
        const refreshResponse = await fetch(refreshUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          const newAccessToken = refreshData.accessToken;

          console.log('[API] ✅ Session refreshed successfully.');
          setAccessToken(newAccessToken);

          // Retry the original request with the new access token
          options.headers['Authorization'] = `Bearer ${newAccessToken}`;
          response = await fetch(url, options);
        } else {
          console.warn('[API] Refresh token expired or revoked. User session invalid.');
          notifyAuthFailed();
          const errData = await refreshResponse.json().catch(() => ({}));
          throw new Error(errData.error || 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.');
        }
      } catch (refreshErr) {
        console.error('[API ERROR] Failed to perform automatic refresh:', refreshErr.message);
        notifyAuthFailed();
        throw refreshErr;
      }
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Yêu cầu thất bại với trạng thái ${response.status}`);
    }

    // Return parsed json or plain text depending on content type
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();

  } catch (err) {
    console.error(`[API ERROR] Request to ${endpoint} failed:`, err.message);
    throw err;
  }
}

// ───────────────────────────────────────────────
// INDIVIDUAL API CALLS
// ───────────────────────────────────────────────
export const api = {
  // Authentication
  getAuthConfig: () => apiFetch('/api/auth/config'),

  loginWithMs: (payload) => apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  mockLogin: (userId) => apiFetch('/api/auth/mock-login', {
    method: 'POST',
    body: JSON.stringify({ userId })
  }),

  logout: () => apiFetch('/api/auth/logout', {
    method: 'POST'
  }).then((res) => {
    setAccessToken(null);
    return res;
  }),

  // Users Directory
  getUsers: () => apiFetch('/api/users'),

  // Tasks CRUD
  getTasks: () => apiFetch('/api/tasks'),

  getLogs: () => apiFetch('/api/tasks/logs'),

  createTask: (taskData) => apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData)
  }),

  updateTask: (taskId, updates) => apiFetch(`/api/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }),

  deleteTask: (taskId) => apiFetch(`/api/tasks/${taskId}`, {
    method: 'DELETE'
  }),

  addTaskComment: (taskId, content) => apiFetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content })
  }),

  // AI & Polling Teams Sync
  pollTeamsSync: (taskId = null) => apiFetch('/api/sync/poll-teams', {
    method: 'POST',
    body: JSON.stringify({ taskId })
  }),

  // Mock MS Teams Sync Simulator
  simulateTeamsMessage: (taskId, messageText, senderName) => apiFetch('/api/simulator/teams-sync', {
    method: 'POST',
    body: JSON.stringify({ taskId, messageText, senderName })
  }),

  // Admin Revocation Action
  revokeUserSessions: (userId) => apiFetch('/api/admin/revoke-user', {
    method: 'POST',
    body: JSON.stringify({ userId })
  }),

  // MS Graph Picker APIs
  getMsTeams: () => apiFetch('/api/sync/ms-teams'),
  getMsChannels: (teamId) => apiFetch(`/api/sync/ms-teams/${teamId}/channels`),
  getMsChats: () => apiFetch('/api/sync/ms-chats'),

  // Notifications APIs
  getNotifications: (options = {}) => apiFetch('/api/notifications', options),
  markNotificationAsRead: (notificationId) => apiFetch(`/api/notifications/read/${notificationId}`, {
    method: 'PUT'
  }),
  markAllNotificationsAsRead: () => apiFetch('/api/notifications/read-all', {
    method: 'PUT'
  }),
  deleteNotification: (notificationId) => apiFetch(`/api/notifications/${notificationId}`, {
    method: 'DELETE'
  }),
  
  // Daily AI Morning Digest & Analytics
  triggerDailyDigest: () => apiFetch('/api/sync/trigger-daily-digest', {
    method: 'POST'
  }),
  getTasksAnalytics: () => apiFetch('/api/tasks/analytics')
};
