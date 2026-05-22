import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ToggleLeft, ToggleRight, Radio, Filter, RefreshCw, Layers, ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, LogOut, Key, AlertTriangle, Users } from 'lucide-react';
import SmartInput from './components/SmartInput';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import TaskEditorModal from './components/TaskEditorModal';
import { USERS, parseTaskText } from './utils/nlpParser';
import { api, setAccessToken, registerAuthChangeCallback, BACKEND_BASE_URL } from './utils/api';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [teamMembers, setTeamMembers] = useState(USERS);

  const [selectedTask, setSelectedTask] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false); // Turn off simulation by default for DB sync stability
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mine'

  const simulationIntervalRef = useRef(null);
  const microsoftPopupRef = useRef(null);

  // Persisted collapse state for AI Smart Input
  const [isSmartInputCollapsed, setIsSmartInputCollapsed] = useState(() => {
    return localStorage.getItem('synapse_smart_input_collapsed') === 'true';
  });

  // Persisted Right Sidebar visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('synapse_sidebar_open');
    return saved !== 'false'; // defaults to true
  });

  // ───────────────────────────────────────────────
  // SILENT LOGIN & INITIALIZATION
  // ───────────────────────────────────────────────
  useEffect(() => {
    // 1. Force logout handler on JWT refresh expiration
    registerAuthChangeCallback((user) => {
      if (!user) {
        setIsLoggedIn(false);
        setActiveUser(null);
      }
    });

    // 2. Perform silent check on mount using httpOnly refresh token cookie
    const verifySession = async () => {
      try {
        const refreshUrl = `${BACKEND_BASE_URL}/api/auth/refresh`;
        const res = await fetch(refreshUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          const base64Url = data.accessToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = JSON.parse(decodeURIComponent(escape(window.atob(base64))));
          setActiveUser(decoded);
          setIsLoggedIn(true);
          console.log('[SESSION] Silent auto-login succeeded.');
        }
      } catch (err) {
        console.log('[SESSION] Silent login check bypassed (offline/no-cookie).');
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  // ───────────────────────────────────────────────
  // DATA POLLING LOOP
  // ───────────────────────────────────────────────
  const fetchDbData = async () => {
    if (!isLoggedIn) return;
    try {
      const [fetchedTasks, fetchedUsers, fetchedLogs] = await Promise.all([
        api.getTasks(),
        api.getUsers(),
        api.getLogs()
      ]);
      setTasks(fetchedTasks);
      setTeamMembers(fetchedUsers);
      setLogs(fetchedLogs);
    } catch (err) {
      console.error('[SYNC ERROR] Failed loading DB datasets:', err.message);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchDbData();

      // Auto polling every 10 seconds to sync Teams & background message updates instantly!
      const timer = setInterval(fetchDbData, 10000);
      return () => clearInterval(timer);
    }
  }, [isLoggedIn]);

  // Persist UI collapses
  useEffect(() => {
    localStorage.setItem('synapse_smart_input_collapsed', isSmartInputCollapsed);
  }, [isSmartInputCollapsed]);

  useEffect(() => {
    localStorage.setItem('synapse_sidebar_open', isSidebarOpen);
  }, [isSidebarOpen]);

  // ───────────────────────────────────────────────
  // LOGIN METHODS
  // ───────────────────────────────────────────────
  const handleMicrosoftLogin = async () => {
    // Nếu popup đã tồn tại và chưa bị đóng, chỉ cần đưa nó lên trên cùng (focus)
    if (microsoftPopupRef.current && !microsoftPopupRef.current.closed) {
      microsoftPopupRef.current.focus();
      return;
    }

    try {
      const config = await api.getAuthConfig();

      const authUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
        new URLSearchParams({
          client_id: config.clientId,
          response_type: 'code',
          redirect_uri: config.redirectUri,
          response_mode: 'query',
          scope: config.scopes,
          prompt: 'select_account',
          state: Math.random().toString(36).substring(2, 15)
        });

      const width = 600;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        authUrl,
        'microsoft-sso',
        `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
      );

      if (!popup) {
        alert('Vui lòng cấp quyền mở popup để đăng nhập với Microsoft.');
        return;
      }

      microsoftPopupRef.current = popup;
      popup.focus();

      const handleAuthMessage = async (event) => {
        if (event.origin !== window.location.origin) return;

        const { type, code, error, errorDescription } = event.data;

        if (type === 'MS_AUTH_CODE') {
          window.removeEventListener('message', handleAuthMessage);
          try {
            setLoading(true);
            const loginData = await api.loginWithMs({ code, msTenantId: config.tenantId });
            setAccessToken(loginData.accessToken);
            setActiveUser(loginData.user);
            setIsLoggedIn(true);
          } catch (loginErr) {
            alert('Đăng nhập Microsoft thất bại: ' + loginErr.message);
          } finally {
            setLoading(false);
          }
        } else if (type === 'MS_AUTH_ERROR') {
          window.removeEventListener('message', handleAuthMessage);
          alert(`Lỗi Microsoft: ${error}\n${errorDescription}`);
          setLoading(false);
        }
      };

      window.addEventListener('message', handleAuthMessage);

    } catch (err) {
      console.error(err);
      alert('Không kết nối được dịch vụ Microsoft OAuth. Vui lòng thử lại.');
      setLoading(false);
    }
  };

  const handleMockLogin = async (userId) => {
    try {
      setLoading(true);
      const loginData = await api.mockLogin(userId);
      setAccessToken(loginData.accessToken);
      setActiveUser(loginData.user);
      setIsLoggedIn(true);
    } catch (err) {
      alert('Đăng nhập thử nghiệm thất bại: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await api.logout();
      setIsLoggedIn(false);
      setActiveUser(null);
    } catch (err) {
      console.error('Logout error:', err.message);
      setIsLoggedIn(false);
      setActiveUser(null);
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────
  // ADMIN REVOCATION CONTROLLER
  // ───────────────────────────────────────────────
  const handleAdminRevokeSession = async (targetUserId) => {
    const target = teamMembers.find(m => m.id === targetUserId);
    if (!target) return;

    if (!confirm(`Bạn có chắc chắn muốn thu hồi NGAY LẬP TỨC toàn bộ phiên đăng nhập của [${target.name}] không? Hành động này sẽ vô hiệu hóa tất cả JWT và Cookie đang hoạt động của người dùng.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.revokeUserSessions(targetUserId);
      alert(res.message);

      // If we revoked our own session, force log out immediately
      if (targetUserId === activeUser.id) {
        setIsLoggedIn(false);
        setActiveUser(null);
      } else {
        fetchDbData();
      }
    } catch (err) {
      alert('Lỗi thu hồi phiên: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────
  // CRUD TASK ACTIONS
  // ───────────────────────────────────────────────
  const handleAddTask = async (taskData) => {
    try {
      const assigneeIds = taskData.assignees
        ? taskData.assignees.map(a => a.id)
        : (taskData.assignee ? [taskData.assignee.id] : []);

      await api.createTask({
        title: taskData.title,
        description: '',
        dueDate: taskData.dueDate,
        priority: taskData.priority || 'medium',
        status: 'todo',
        assigneeIds,
        tags: taskData.tags || [],
        creatorId: activeUser.id
      });
      fetchDbData();
    } catch (err) {
      alert('Lỗi thêm công việc: ' + err.message);
    }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      const backendUpdates = { ...updates };

      // Map assignees fields to correct assigneeIds array
      if (updates.assignees) {
        backendUpdates.assigneeIds = updates.assignees.map(a => a.id);
      } else if (updates.assignee) {
        backendUpdates.assigneeIds = [updates.assignee.id];
      }

      await api.updateTask(taskId, backendUpdates);

      // Optimistic in-memory update for modal responsiveness
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const updated = { ...t, ...updates };
          setSelectedTask(prevSel => {
            if (prevSel && prevSel.id === taskId) {
              return updated;
            }
            return prevSel;
          });
          return updated;
        }
        return t;
      }));

      fetchDbData();
    } catch (err) {
      alert('Lỗi cập nhật công việc: ' + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      fetchDbData();
    } catch (err) {
      alert('Lỗi xóa công việc: ' + err.message);
    }
  };

  // Trigger manual polling sync
  const handleTriggerPollSync = async () => {
    try {
      setLoading(true);
      const res = await api.pollTeamsSync();
      fetchDbData();
      alert(`${res.message} Đã cập nhật ${res.processedCount} thay đổi.`);
    } catch (err) {
      alert('Lỗi đồng bộ Polling: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────
  // COLLABORATION SIMULATOR
  // ───────────────────────────────────────────────
  useEffect(() => {
    let timeoutId = null;

    if (!isSimulating || !isLoggedIn) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      return;
    }

    simulationIntervalRef.current = setInterval(() => {
      const simCandidates = teamMembers.filter(u => u.id !== activeUser.id);
      if (simCandidates.length === 0) return;
      const simUser = simCandidates[Math.floor(Math.random() * simCandidates.length)];

      setTeamMembers(prev => prev.map(m => m.id === simUser.id ? { ...m, status: 'typing' } : m));

      timeoutId = setTimeout(async () => {
        if (!isSimulating) return;

        const rand = Math.random();

        try {
          if (rand < 0.4 && tasks.length > 0) {
            // Simulate random task movement by triggering a mock update
            const inProgressTasks = tasks.filter(t => t.status !== 'done');
            if (inProgressTasks.length > 0) {
              const target = inProgressTasks[Math.floor(Math.random() * inProgressTasks.length)];
              const nextStatusMap = { todo: 'in_progress', in_progress: 'review', review: 'done' };
              const nextStatus = nextStatusMap[target.status] || 'done';

              await api.updateTask(target.id, { status: nextStatus, assigneeIds: target.assignees.map(a => a.id) });
              fetchDbData();
            }
          } else if (rand < 0.8) {
            // Simulate AI sync incoming Teams chat message using mock sync simulator!
            const myTasks = tasks.filter(t => t.status !== 'done');
            if (myTasks.length > 0) {
              const target = myTasks[Math.floor(Math.random() * myTasks.length)];
              const texts = [
                `Mình đã hoàn thành và xong việc "${target.title}" rồi nhé!`,
                `Độ ưu tiên của công việc "${target.title}" cần chuyển sang khẩn cấp #cao ngay lập tức`,
                `Đang bắt tay triển khai làm "${target.title}" nhé @binh`
              ];
              const mockText = texts[Math.floor(Math.random() * texts.length)];
              await api.simulateTeamsMessage(target.id, mockText, simUser.name);
              fetchDbData();
            }
          }
        } catch (err) {
          console.warn('[SIMULATOR] Action failed:', err.message);
        }

        setTeamMembers(prev => prev.map(m => m.id === simUser.id ? { ...m, status: 'online' } : m));
      }, 3000);

    }, 20000);

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      if (timeoutId) clearTimeout(timeoutId);
    };

  }, [isSimulating, isLoggedIn, tasks, teamMembers]);

  // Filter tasks based on filter dropdown
  const filteredTasks = tasks.filter(task => {
    if (filterMode === 'mine') {
      return task.assignees && task.assignees.some(a => a.id === activeUser?.id);
    }
    return true;
  });

  // ───────────────────────────────────────────────
  // 1. LOADING SCREEN
  // ───────────────────────────────────────────────
  if (loading && !isLoggedIn) {
    return (
      <div className="login-screen" style={{ background: '#09090b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fafafa' }}>
        <div className="loader" style={{ border: '3px solid rgba(255,255,255,0.05)', borderRadius: '50%', borderTop: '3px solid #8b5cf6', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '20px' }}></div>
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Đang tải thiết lập phiên làm việc...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ───────────────────────────────────────────────
  // 2. PREMIUM LOGIN SCREEN
  // ───────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="login-screen-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at top left, #120b29, #09090b, #030303)', padding: '20px' }}>
        <div className="glass-panel fade-in" style={{ maxWidth: '420px', width: '100%', padding: '40px 30px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>

          <div className="app-logo" style={{ display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '26px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '8px', color: '#fff' }}>
            <Layers size={30} style={{ color: '#c084fc', strokeWidth: 2.5 }} />
            <span>SYNAPSE</span>
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '32px' }}>
            Hệ thống quản trị và đồng bộ công tác thời gian thực tích hợp Microsoft Teams AI.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* MICROSOFT SSO LOGIN BUTTON */}
            <button
              onClick={handleMicrosoftLogin}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                width: '100%',
                padding: '14px 20px',
                background: '#ffffff',
                color: '#18181b',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(255,255,255,0.05)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Microsoft Color Grid Logo */}
              <svg width="18" height="18" viewBox="0 0 23 23">
                <path fill="#f35325" d="M0 0h11v11H0z" />
                <path fill="#81bc06" d="M12 0h11v11H12z" />
                <path fill="#05a6f0" d="M0 12h11v11H0z" />
                <path fill="#ffba08" d="M12 12h11v11H12z" />
              </svg>
              Đăng nhập với Microsoft Account
            </button>

            {/* DIVIDER */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
              <span style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px' }}>Hoặc dùng tài khoản thử nghiệm</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
            </div>

            {/* MOCK ACCOUNTS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { id: 'loc', name: 'Lộc Võ', role: 'PO', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&h=80&q=80' },
                { id: 'lan', name: 'Mai Lan', role: 'UX', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80' },
                { id: 'huy', name: 'Thế Huy', role: 'Frontend', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&h=80&q=80' },
                { id: 'binh', name: 'Thanh Bình', role: 'Backend', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&h=80&q=80' }
              ].map(u => (
                <button
                  key={u.id}
                  onClick={() => handleMockLogin(u.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                  }}
                >
                  <img src={u.avatar} alt={u.name} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#fafafa' }}>{u.name}</div>
                    <div style={{ fontSize: '9px', color: '#a1a1aa' }}>{u.role}</div>
                  </div>
                </button>
              ))}
            </div>

          </div>

          <div style={{ marginTop: '30px', fontSize: '10px', color: '#71717a' }}>
            🔒 Dữ liệu được bảo mật và mã hóa AES-256-GCM tại cơ sở dữ liệu.
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────
  // 3. MAIN DASHBOARD APPLICATION
  // ───────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Premium Header */}
      <header className="app-header glass-panel" style={{ borderRadius: '16px', marginBottom: '8px' }}>
        <div className="app-logo">
          <Layers size={24} style={{ strokeWidth: 2.5 }} />
          <span>SYNAPSE</span>
          <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: '#a78bfa', marginLeft: '6px', fontWeight: '500' }}>COLLAB v1.0</span>
        </div>

        {/* Header Actions */}
        <div className="header-actions">

          {/* Synchronize Manual Polling Trigger */}
          <button
            onClick={handleTriggerPollSync}
            className="user-switcher-wrap"
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: '#34d399',
              borderColor: 'rgba(52, 211, 153, 0.2)',
              background: 'rgba(52, 211, 153, 0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Đồng bộ thủ công các tin nhắn Teams bằng Polling DeltaLink"
          >
            <RefreshCw size={13} />
            <span style={{ fontSize: '11px', fontWeight: '600' }}>Đồng bộ Teams</span>
          </button>

          {/* Simulation Toggle Switch */}
          <div className="sim-switch" title="Mô phỏng hoạt động làm việc của các thành viên khác để xem dòng cộng tác thời gian thực">
            <Radio size={14} className={isSimulating ? 'status-indicator typing' : ''} style={{ color: isSimulating ? '#10b981' : '#71717a' }} />
            <span>Mô phỏng:</span>
            <button
              className={`switch-btn ${isSimulating ? 'active' : ''}`}
              onClick={() => setIsSimulating(!isSimulating)}
            >
              <div className="switch-knob" />
            </button>
          </div>

          {/* Active Logged User Profile card with Revoke Session Trigger */}
          <div className="user-switcher-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
            <img src={activeUser.avatar} alt={activeUser.name} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff', lineHeight: 1.2 }}>{activeUser.name}</span>
              <span style={{ fontSize: '9px', color: '#a1a1aa' }}>{activeUser.role}</span>
            </div>

            {/* Quick action to revoke sessions / test JWT validation */}
            <button
              onClick={() => handleAdminRevokeSession(activeUser.id)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', marginLeft: '6px' }}
              title="Khẩn cấp: Thu hồi toàn bộ Token phiên này (Test Admin Revocation)"
            >
              <Key size={12} />
            </button>
          </div>

          {/* Sidebar Expand/Collapse Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="user-switcher-wrap"
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: isSidebarOpen ? '#c084fc' : '#a1a1aa',
              borderColor: isSidebarOpen ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.08)',
              background: isSidebarOpen ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            title={isSidebarOpen ? "Ẩn thanh bên" : "Hiện thanh bên"}
          >
            {isSidebarOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            <span style={{ fontSize: '11px', fontWeight: '500' }}>
              {isSidebarOpen ? "Ẩn Sidebar" : "Hiện Sidebar"}
            </span>
          </button>

          {/* Log out */}
          <button
            onClick={handleLogout}
            className="user-switcher-wrap"
            style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', cursor: 'pointer', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut size={13} />
            <span style={{ fontSize: '11px', fontWeight: '600' }}>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Interactive NLP Smart Input Area */}
      <section className="glass-panel" style={{ padding: isSmartInputCollapsed ? '14px 24px' : '24px', display: 'flex', flexDirection: 'column', gap: isSmartInputCollapsed ? '0px' : '14px', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: '#c084fc' }} />
            <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '17px', fontWeight: '600' }}>Tạo công việc siêu tốc bằng Trí Tuệ Nhân Tạo</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isSmartInputCollapsed && (
              <span className="smart-input-tip" style={{ fontSize: '12px', color: '#71717a' }}>
                💡 Gõ <span style={{ color: '#c084fc', fontWeight: 'bold' }}>@tên</span> để gán người, <span style={{ color: '#ef4444', fontWeight: 'bold' }}>#cao/#trungbinh/#thap</span> để đặt ưu tiên, <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>ngày mai/thứ sáu</span> để đặt hạn.
              </span>
            )}
            <button
              onClick={() => setIsSmartInputCollapsed(!isSmartInputCollapsed)}
              className="column-toggle-btn"
              style={{ padding: '4px', borderRadius: '6px' }}
              title={isSmartInputCollapsed ? 'Mở rộng bảng nhập' : 'Thu nhỏ bảng nhập'}
            >
              {isSmartInputCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>
        </div>

        {!isSmartInputCollapsed && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <SmartInput onAddTask={handleAddTask} activeUser={activeUser} />
          </div>
        )}
      </section>

      {/* Admin Session Inspector panel */}
      <section className="glass-panel" style={{ padding: '12px 24px', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'rgba(239, 68, 68, 0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5' }}>
          <AlertTriangle size={15} />
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Hệ Thống Thu Hồi Phiên Trực Tiếp (Admin Session Invalidation Panel)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {teamMembers.map(member => (
            <button
              key={member.id}
              onClick={() => handleAdminRevokeSession(member.id)}
              style={{
                padding: '4px 10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '6px',
                fontSize: '10px',
                color: '#fca5a5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              <Key size={10} />
              Vô hiệu {member.name.split(' ').pop()}
            </button>
          ))}
        </div>
      </section>

      {/* Dashboard Filter and Board Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px' }}>
          Bảng Tiến độ Công việc
        </h2>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: 'var(--glass-border)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
          <button
            onClick={() => setFilterMode('all')}
            style={{
              background: filterMode === 'all' ? 'var(--primary)' : 'none',
              border: 'none',
              color: filterMode === 'all' ? 'white' : 'var(--text-secondary)',
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: filterMode === 'all' ? '600' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <Layers size={12} />
            Tất cả công việc
          </button>
          <button
            onClick={() => setFilterMode('mine')}
            style={{
              background: filterMode === 'mine' ? 'var(--primary)' : 'none',
              border: 'none',
              color: filterMode === 'mine' ? 'white' : 'var(--text-secondary)',
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: filterMode === 'mine' ? '600' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <Filter size={12} />
            Chỉ việc của tôi
          </button>
        </div>
      </div>

      {/* Main Kanban & Sidebar Grid */}
      <main className={`dashboard-grid ${isSidebarOpen ? 'sidebar-visible' : 'sidebar-hidden'}`}>
        {/* Board Canvas */}
        <section>
          <KanbanBoard
            tasks={filteredTasks}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onOpenTaskEditor={setSelectedTask}
            teamMembers={teamMembers}
          />
        </section>

        {/* Team Collaboration Sidebar Container */}
        <aside className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>
          <Sidebar
            tasks={tasks}
            logs={logs}
            onUpdateTask={handleUpdateTask}
            teamMembers={teamMembers}
          />
        </aside>
      </main>

      {/* Task Details Editor Modal */}
      {selectedTask && (
        <TaskEditorModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleUpdateTask}
          activeUser={activeUser}
          teamMembers={teamMembers}
        />
      )}

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px 0 10px 0', fontSize: '11px', color: 'var(--text-muted)', borderTop: 'var(--glass-border)', marginTop: '20px' }}>
        Synapse Task Management Hub &copy; 2026. Phát triển bởi Antigravity AI Coding Assistant.
      </footer>
    </div>
  );
}
