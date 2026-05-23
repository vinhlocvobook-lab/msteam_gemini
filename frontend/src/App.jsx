import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ToggleLeft, ToggleRight, Radio, Filter, RefreshCw, Layers, ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, LogOut, Key, AlertTriangle, Users, User, Bell, Check, Trash2, BellOff, X, ShieldAlert, Tag, BarChart3, Calendar, ChevronLeft, ChevronRight, Clock, CalendarDays, Edit2, Settings } from 'lucide-react';
import SmartInput from './components/SmartInput';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import TaskEditorModal from './components/TaskEditorModal';
import { USERS, PRIORITIES, parseTaskText } from './utils/nlpParser';
import { api, setAccessToken, registerAuthChangeCallback, BACKEND_BASE_URL } from './utils/api';
import solarLunar from 'solarlunar';

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
  
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('synapse_active_tab') || 'board';
  }); // 'board' | 'analytics' | 'calendar'
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedTimeRange, setSelectedTimeRange] = useState('today');
  const [customSelectedDate, setCustomSelectedDate] = useState('');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [isCustomDateSectionCollapsed, setIsCustomDateSectionCollapsed] = useState(() => {
    return localStorage.getItem('synapse_custom_date_collapsed') === 'true';
  });
  const [isTimeframePanelMinimized, setIsTimeframePanelMinimized] = useState(() => {
    return localStorage.getItem('synapse_timeframe_minimized') === 'true';
  });
  const [isCalendarGridMinimized, setIsCalendarGridMinimized] = useState(() => {
    return localStorage.getItem('synapse_calendar_grid_minimized') === 'true';
  });
  const [calendarViewMode, setCalendarViewMode] = useState(() => {
    return localStorage.getItem('synapse_calendar_view_mode') || 'single_month';
  });
  const [infiniteScrollMinOffset, setInfiniteScrollMinOffset] = useState(-2);
  const [infiniteScrollMaxOffset, setInfiniteScrollMaxOffset] = useState(2);
  const [calendarListGroupingMode, setCalendarListGroupingMode] = useState(() => {
    return localStorage.getItem('synapse_calendar_list_grouping_mode') || 'priority';
  });
  const [calendarDraggedTaskId, setCalendarDraggedTaskId] = useState(null);
  const [calendarDragOverColumnId, setCalendarDragOverColumnId] = useState(null);
  const [calendarActivePopup, setCalendarActivePopup] = useState(null);
  const [digestContentModal, setDigestContentModal] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notifDropdownRef = useRef(null);

  const simulationIntervalRef = useRef(null);
  const microsoftPopupRef = useRef(null);

  const [weekendDays, setWeekendDays] = useState([0, 6]);
  const [holidays, setHolidays] = useState([]);
  const [isHolidaySettingsOpen, setIsHolidaySettingsOpen] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState('solar');
  const [newHolidayMonth, setNewHolidayMonth] = useState(1);
  const [newHolidayDay, setNewHolidayDay] = useState(1);
  const [newHolidayDateStr, setNewHolidayDateStr] = useState('');
  const [newHolidayColor, setNewHolidayColor] = useState('#f43f5e');

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

  // Hook for clicking outside of notification dropdown to close it
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Polling notifications loop with AbortController memory cleanup
  useEffect(() => {
    if (isLoggedIn) {
      const controller = new AbortController();
      
      const fetchNotifications = async (signal) => {
        try {
          const data = await api.getNotifications({ signal });
          setNotifications(data);
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('[NOTIF SYNC ERROR] Failed loading notifications:', err.message);
          }
        }
      };

      fetchNotifications(controller.signal);

      const intervalId = setInterval(() => {
        fetchNotifications(controller.signal);
      }, 30000);

      return () => {
        clearInterval(intervalId);
        controller.abort();
      };
    } else {
      setNotifications([]);
    }
  }, [isLoggedIn]);

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

  // Load calendar settings on login
  const fetchCalendarSettings = async () => {
    if (!isLoggedIn) return;
    try {
      const settings = await api.getCalendarSettings();
      if (settings) {
        if (settings.weekendDays) setWeekendDays(settings.weekendDays);
        if (settings.holidays) setHolidays(settings.holidays);
      }
    } catch (err) {
      console.error('[SYNC ERROR] Failed loading calendar settings:', err.message);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchCalendarSettings();
    }
  }, [isLoggedIn]);


  // Persist UI collapses
  useEffect(() => {
    localStorage.setItem('synapse_smart_input_collapsed', isSmartInputCollapsed);
  }, [isSmartInputCollapsed]);

  useEffect(() => {
    localStorage.setItem('synapse_sidebar_open', isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('synapse_custom_date_collapsed', isCustomDateSectionCollapsed);
  }, [isCustomDateSectionCollapsed]);

  useEffect(() => {
    localStorage.setItem('synapse_timeframe_minimized', isTimeframePanelMinimized);
  }, [isTimeframePanelMinimized]);

  useEffect(() => {
    localStorage.setItem('synapse_calendar_grid_minimized', isCalendarGridMinimized);
  }, [isCalendarGridMinimized]);

  useEffect(() => {
    localStorage.setItem('synapse_calendar_view_mode', calendarViewMode);
  }, [calendarViewMode]);

  useEffect(() => {
    localStorage.setItem('synapse_calendar_list_grouping_mode', calendarListGroupingMode);
  }, [calendarListGroupingMode]);

  useEffect(() => {
    localStorage.setItem('synapse_active_tab', activeTab);
  }, [activeTab]);

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
  // NOTIFICATION UTILITIES
  // ───────────────────────────────────────────────
  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationAsRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
      } catch (err) {
        console.error('Lỗi khi đánh dấu thông báo đã đọc:', err.message);
      }
    }

    if (notif.task_id) {
      const foundTask = tasks.find(t => t.id === notif.task_id);
      if (foundTask) {
        setSelectedTask(foundTask);
      } else {
        alert('Công việc này không tồn tại hoặc đã bị xóa.');
      }
    }

    setIsNotificationsOpen(false);
  };

  const handleMarkAllNotificationsAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      alert('Lỗi đánh dấu đọc tất cả thông báo: ' + err.message);
    }
  };

  const handleDeleteNotification = async (e, notifId) => {
    e.stopPropagation();
    try {
      await api.deleteNotification(notifId);
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      alert('Không thể xóa thông báo: ' + err.message);
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
  // PREMIUM DATE CALCULATIONS & TIME FRAME FILTERS
  // ───────────────────────────────────────────────
  const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const isSameDay = (d1, d2) => {
    return getStartOfDay(d1).getTime() === getStartOfDay(d2).getTime();
  };

  const getWeekRange = (offset = 0) => {
    const today = new Date();
    const currentDay = today.getDay();
    // Monday as start of week
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const start = new Date(today);
    start.setDate(today.getDate() + distanceToMonday + offset * 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const getMonthRange = (offset = 0) => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0, 23, 59, 59, 999);
    return { start, end };
  };

  const getYearRange = (offset = 0) => {
    const today = new Date();
    const start = new Date(today.getFullYear() + offset, 0, 1);
    const end = new Date(today.getFullYear() + offset, 11, 31, 23, 59, 59, 999);
    return { start, end };
  };

  // Filter dynamic tasks lists by ranges
  const getTasksInTimeRange = (rangeKey) => {
    const today = new Date();
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      const tDate = new Date(t.dueDate);

      switch (rangeKey) {
        case 'yesterday': {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return isSameDay(tDate, yesterday);
        }
        case 'today':
          return isSameDay(tDate, today);
        case 'tomorrow': {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return isSameDay(tDate, tomorrow);
        }
        case 'last_week': {
          const { start, end } = getWeekRange(-1);
          return tDate >= start && tDate <= end;
        }
        case 'this_week': {
          const { start, end } = getWeekRange(0);
          return tDate >= start && tDate <= end;
        }
        case 'next_week': {
          const { start, end } = getWeekRange(1);
          return tDate >= start && tDate <= end;
        }
        case 'last_month': {
          const { start, end } = getMonthRange(-1);
          return tDate >= start && tDate <= end;
        }
        case 'this_month': {
          const { start, end } = getMonthRange(0);
          return tDate >= start && tDate <= end;
        }
        case 'next_month': {
          const { start, end } = getMonthRange(1);
          return tDate >= start && tDate <= end;
        }
        case 'last_year': {
          const { start, end } = getYearRange(-1);
          return tDate >= start && tDate <= end;
        }
        case 'this_year': {
          const { start, end } = getYearRange(0);
          return tDate >= start && tDate <= end;
        }
        case 'next_year': {
          const { start, end } = getYearRange(1);
          return tDate >= start && tDate <= end;
        }
        case 'custom_date': {
          if (!customSelectedDate) return false;
          const [yr, mn, dy] = customSelectedDate.split('-').map(Number);
          const targetDate = new Date(yr, mn - 1, dy);
          return isSameDay(tDate, targetDate);
        }
        case 'custom_range': {
          if (!customRangeStart || !customRangeEnd) return false;
          const [sYr, sMn, sDy] = customRangeStart.split('-').map(Number);
          const [eYr, eMn, eDy] = customRangeEnd.split('-').map(Number);
          const start = new Date(sYr, sMn - 1, sDy);
          const end = new Date(eYr, eMn - 1, eDy, 23, 59, 59, 999);
          return tDate >= start && tDate <= end;
        }
        default:
          return false;
      }
    });
  };

  const isDateInTimeRange = (cellDate, rangeKey) => {
    const today = new Date();
    const cellTime = cellDate.getTime();
    switch (rangeKey) {
      case 'yesterday': {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return isSameDay(cellDate, yesterday);
      }
      case 'today':
        return isSameDay(cellDate, today);
      case 'tomorrow': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return isSameDay(cellDate, tomorrow);
      }
      case 'last_week': {
        const { start, end } = getWeekRange(-1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'this_week': {
        const { start, end } = getWeekRange(0);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'next_week': {
        const { start, end } = getWeekRange(1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'last_month': {
        const { start, end } = getMonthRange(-1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'this_month': {
        const { start, end } = getMonthRange(0);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'next_month': {
        const { start, end } = getMonthRange(1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'last_year': {
        const { start, end } = getYearRange(-1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'this_year': {
        const { start, end } = getYearRange(0);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'next_year': {
        const { start, end } = getYearRange(1);
        return cellTime >= start.getTime() && cellTime <= end.getTime();
      }
      case 'custom_date': {
        if (!customSelectedDate) return false;
        const [yr, mn, dy] = customSelectedDate.split('-').map(Number);
        const targetDate = new Date(yr, mn - 1, dy);
        return isSameDay(cellDate, targetDate);
      }
      case 'custom_range': {
        if (!customRangeStart || !customRangeEnd) return false;
        const [sYr, sMn, sDy] = customRangeStart.split('-').map(Number);
        const [eYr, eMn, eDy] = customRangeEnd.split('-').map(Number);
        const start = new Date(sYr, sMn - 1, sDy);
        const end = new Date(eYr, eMn - 1, eDy, 23, 59, 59, 999);
        return cellDate >= start && cellDate <= end;
      }
      default:
        return false;
    }
  };

  const handleCustomDateChange = (dateString) => {
    setCustomSelectedDate(dateString);
    if (dateString) {
      setSelectedTimeRange('custom_date');
      const [yr, mn, dy] = dateString.split('-').map(Number);
      setCalendarDate(new Date(yr, mn - 1, dy));
      
      // Smooth scroll down to the task list below the calendar
      setTimeout(() => {
        document.getElementById('filtered-tasks-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleCustomRangeChange = (type, val) => {
    let startVal = customRangeStart;
    let endVal = customRangeEnd;
    if (type === 'start') {
      setCustomRangeStart(val);
      startVal = val;
    } else {
      setCustomRangeEnd(val);
      endVal = val;
    }

    if (startVal && endVal) {
      setSelectedTimeRange('custom_range');
      const [yr, mn, dy] = startVal.split('-').map(Number);
      setCalendarDate(new Date(yr, mn - 1, dy));
      
      // Smooth scroll down to the task list below the calendar
      setTimeout(() => {
        document.getElementById('filtered-tasks-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleTimeRangeClick = (key) => {
    setSelectedTimeRange(key);
    
    const today = new Date();
    if (key === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setCalendarDate(yesterday);
    } else if (key === 'today') {
      setCalendarDate(new Date());
    } else if (key === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setCalendarDate(tomorrow);
    } else if (key === 'last_week') {
      const { start } = getWeekRange(-1);
      setCalendarDate(start);
    } else if (key === 'this_week') {
      const { start } = getWeekRange(0);
      setCalendarDate(start);
    } else if (key === 'next_week') {
      const { start } = getWeekRange(1);
      setCalendarDate(start);
    } else if (key === 'last_month') {
      setCalendarDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    } else if (key === 'this_month') {
      setCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (key === 'next_month') {
      setCalendarDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));
    } else if (key === 'last_year') {
      setCalendarDate(new Date(today.getFullYear() - 1, today.getMonth(), 1));
    } else if (key === 'this_year') {
      setCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (key === 'next_year') {
      setCalendarDate(new Date(today.getFullYear() + 1, today.getMonth(), 1));
    } else if (key === 'custom_date') {
      if (customSelectedDate) {
        const [yr, mn, dy] = customSelectedDate.split('-').map(Number);
        setCalendarDate(new Date(yr, mn - 1, dy));
      }
    } else if (key === 'custom_range') {
      if (customRangeStart) {
        const [yr, mn, dy] = customRangeStart.split('-').map(Number);
        setCalendarDate(new Date(yr, mn - 1, dy));
      }
    }

    // Smooth scroll down to the task list below the calendar
    setTimeout(() => {
      document.getElementById('filtered-tasks-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Helper functions for weekends & holidays
  const isWeekendDay = (date) => {
    return weekendDays.includes(date.getDay());
  };

  const getHolidayForDate = (date) => {
    const dDay = date.getDate();
    const dMonth = date.getMonth() + 1;

    const lunar = solarLunar.solar2lunar(
      date.getFullYear(),
      dMonth,
      dDay
    );
    const lDay = lunar.lDay;
    const lMonth = lunar.lMonth;

    return holidays.find(h => {
      if (h.type === 'solar') {
        return h.day === dDay && h.month === dMonth;
      } else if (h.type === 'lunar') {
        return h.day === lDay && h.month === lMonth;
      } else if (h.type === 'single') {
        return h.dateStr === `${date.getFullYear()}-${String(dMonth).padStart(2, '0')}-${String(dDay).padStart(2, '0')}`;
      }
    });
  };

  const handleToggleWeekendDay = async (dayIndex) => {
    let nextWeekends;
    if (weekendDays.includes(dayIndex)) {
      nextWeekends = weekendDays.filter(d => d !== dayIndex);
    } else {
      nextWeekends = [...weekendDays, dayIndex];
    }
    setWeekendDays(nextWeekends);
    try {
      await api.updateWeekendDays(nextWeekends);
    } catch (err) {
      console.error('Failed to update weekend days:', err.message);
      setWeekendDays(weekendDays);
    }
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!newHolidayName.trim()) return;

    const payload = {
      name: newHolidayName.trim(),
      type: newHolidayType,
      month: newHolidayType === 'single' ? null : parseInt(newHolidayMonth),
      day: newHolidayType === 'single' ? null : parseInt(newHolidayDay),
      dateStr: newHolidayType === 'single' ? newHolidayDateStr : null,
      color: newHolidayColor
    };

    try {
      const res = await api.createHoliday(payload);
      if (res && res.holiday) {
        setHolidays(prev => [...prev, res.holiday]);
        setNewHolidayName('');
        setNewHolidayDateStr('');
      }
    } catch (err) {
      console.error('Failed to create holiday:', err.message);
    }
  };

  const handleDeleteHoliday = async (holidayId) => {
    try {
      await api.deleteHoliday(holidayId);
      setHolidays(prev => prev.filter(h => h.id !== holidayId));
    } catch (err) {
      console.error('Failed to delete holiday:', err.message);
    }
  };

  // ───────────────────────────────────────────────
  // PREMIUM INTERACTIVE TASK CALENDAR RENDERER
  // ───────────────────────────────────────────────
  const renderCalendarView = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const activeRangeTasks = getTasksInTimeRange(selectedTimeRange);

    const handlePrevMonth = () => {
      setCalendarDate(new Date(year, month - 1, 1));
      setInfiniteScrollMinOffset(-2);
      setInfiniteScrollMaxOffset(2);
    };

    const handleNextMonth = () => {
      setCalendarDate(new Date(year, month + 1, 1));
      setInfiniteScrollMinOffset(-2);
      setInfiniteScrollMaxOffset(2);
    };

    const handleTodayClick = () => {
      setCalendarDate(new Date());
      setInfiniteScrollMinOffset(-2);
      setInfiniteScrollMaxOffset(2);
    };

    const handleInfiniteScroll = (e) => {
      const container = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Near bottom (less than 150px remaining)
      if (scrollHeight - scrollTop - clientHeight < 150) {
        setInfiniteScrollMaxOffset(prev => prev + 1);
      }

      // Near top (less than 150px from top)
      if (scrollTop < 150) {
        const oldScrollHeight = scrollHeight;
        const oldScrollTop = scrollTop;
        setInfiniteScrollMinOffset(prev => {
          const nextMin = prev - 1;
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
          });
          return nextMin;
        });
      }
    };

    // Drag and Drop handlers for calendar columns
    const handleDragStart = (e, taskId) => {
      setCalendarDraggedTaskId(taskId);
      e.dataTransfer.setData('text/plain', taskId);
      setTimeout(() => {
        const card = document.getElementById(`cal-card-${taskId}`);
        if (card) card.classList.add('dragging');
      }, 0);
    };

    const handleDragEnd = (taskId) => {
      setCalendarDraggedTaskId(null);
      setCalendarDragOverColumnId(null);
      const card = document.getElementById(`cal-card-${taskId}`);
      if (card) card.classList.remove('dragging');
    };

    const handleDragOver = (e, columnId) => {
      e.preventDefault();
      if (calendarDragOverColumnId !== columnId) {
        setCalendarDragOverColumnId(columnId);
      }
    };

    const handleDragLeave = () => {
      setCalendarDragOverColumnId(null);
    };

    const handleDrop = (e, columnId) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) {
        handleUpdateTask(taskId, { status: columnId });
      }
      setCalendarDragOverColumnId(null);
    };

    // Inline edit handlers for calendar card title
    const handleTitleBlur = (taskId, e) => {
      const newTitle = e.target.innerText.trim();
      if (newTitle) {
        handleUpdateTask(taskId, { title: newTitle });
      } else {
        e.target.innerText = tasks.find(t => t.id === taskId).title; // Reset
      }
    };

    const handleTitleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    };

    // Popups for quick updates in calendar view
    const togglePopup = (taskId, type, e) => {
      e.stopPropagation();
      if (calendarActivePopup && calendarActivePopup.taskId === taskId && calendarActivePopup.type === type) {
        setCalendarActivePopup(null);
      } else {
        setCalendarActivePopup({ taskId, type });
      }
    };

    const handleSelectAssignee = (taskId, user) => {
      handleUpdateTask(taskId, { assignee: user });
      setCalendarActivePopup(null);
    };

    const handleSelectPriority = (taskId, priorityId) => {
      handleUpdateTask(taskId, { priority: priorityId });
      setCalendarActivePopup(null);
    };

    const handleSelectDate = (taskId, offsetDays) => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      date.setHours(17, 0, 0, 0);
      handleUpdateTask(taskId, { dueDate: date });
      setCalendarActivePopup(null);
    };

    const handleCustomDateChange = (taskId, e) => {
      const val = e.target.value;
      if (val) {
        const date = new Date(val);
        date.setHours(17, 0, 0, 0);
        handleUpdateTask(taskId, { dueDate: date });
      } else {
        handleUpdateTask(taskId, { dueDate: null });
      }
      setCalendarActivePopup(null);
    };

    const formatDateString = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }).replace(/\//g, '-');
    };

    const isOverdue = (date, status) => {
      if (!date || status === 'done') return false;
      return new Date(date) < new Date();
    };

    const getPrioLabel = (p) => {
      if (p === 'high') return 'Khẩn cấp';
      if (p === 'low') return 'Thấp';
      return 'Vừa';
    };

    const renderMonthGrid = (offset) => {
      const targetDate = new Date(year, month + offset, 1);
      const gridYear = targetDate.getFullYear();
      const gridMonth = targetDate.getMonth();

      const firstDayOfMonth = new Date(gridYear, gridMonth, 1);
      const totalDaysInMonth = new Date(gridYear, gridMonth + 1, 0).getDate();

      let firstDayIndex = firstDayOfMonth.getDay() - 1; 
      if (firstDayIndex === -1) firstDayIndex = 6; 

      const dayCells = [];

      const prevMonthDaysTotal = new Date(gridYear, gridMonth, 0).getDate();
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthDaysTotal - i;
        const cellDate = new Date(gridYear, gridMonth - 1, dayNum);
        dayCells.push({
          date: cellDate,
          dayNum,
          isCurrentMonth: false
        });
      }

      for (let i = 1; i <= totalDaysInMonth; i++) {
        const cellDate = new Date(gridYear, gridMonth, i);
        dayCells.push({
          date: cellDate,
          dayNum: i,
          isCurrentMonth: true
        });
      }

      const totalCells = dayCells.length > 35 ? 42 : 35;
      const remainingCells = totalCells - dayCells.length;
      for (let i = 1; i <= remainingCells; i++) {
        const cellDate = new Date(gridYear, gridMonth + 1, i);
        dayCells.push({
          date: cellDate,
          dayNum: i,
          isCurrentMonth: false
        });
      }

      const weekdays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

      return (
        <div className="month-grid-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: '280px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Tháng {gridMonth + 1}, {gridYear}
            </span>
            <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>
              ({totalDaysInMonth} ngày)
            </span>
          </div>

          <div className="calendar-weekdays-grid">
            {weekdays.map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="calendar-days-grid" style={{ gap: '6px', gridAutoRows: calendarViewMode === 'three_months' ? 'minmax(70px, 1fr)' : 'minmax(110px, 1fr)' }}>
            {dayCells.map((cell, idx) => {
              const cellTasks = tasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), cell.date));
              const cellIsToday = isSameDay(cell.date, new Date());
              
              const isWeekend = isWeekendDay(cell.date);
              const holiday = getHolidayForDate(cell.date);

              const lunar = solarLunar.solar2lunar(
                cell.date.getFullYear(),
                cell.date.getMonth() + 1,
                cell.date.getDate()
              );
              const lunarText = lunar.lDay === 1
                ? `${lunar.lDay}/${lunar.lMonth}${lunar.isLeap ? 'n' : ''}`
                : lunar.lDay.toString();
              
              return (
                <div 
                  key={idx} 
                  className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${cellIsToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${isDateInTimeRange(cell.date, selectedTimeRange) ? 'active-range-highlight' : ''}`}
                  style={{ 
                    minHeight: calendarViewMode === 'three_months' ? '70px' : '110px',
                    padding: '6px',
                    gap: '4px'
                  }}
                  onDoubleClick={() => {
                    setSelectedTask({
                      id: 't-new-' + Date.now(),
                      title: '',
                      description: '',
                      status: 'todo',
                      priority: 'medium',
                      dueDate: cell.date,
                      assignees: [],
                      tags: [],
                      comments: []
                    });
                  }}
                  title={`Nhấp đúp chuột để tạo việc nhanh. Âm lịch: Ngày ${lunar.lDay} tháng ${lunar.lMonth}${lunar.isLeap ? ' (Nhuận)' : ''}, năm ${lunar.lYear}${holiday ? `. Ngày lễ: ${holiday.name}` : ''}`}
                >
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="calendar-day-number" style={{ fontSize: '11px' }}>{cell.dayNum}</div>
                    <div 
                      className="calendar-lunar-number" 
                      style={{ 
                        fontSize: '9.5px', 
                        fontWeight: '600', 
                        color: '#eab308', 
                        opacity: cell.isCurrentMonth ? 0.85 : 0.35,
                        letterSpacing: '-0.3px'
                      }}
                    >
                      {lunarText}
                    </div>
                  </div>
                  
                  <div className="calendar-task-list" style={{ gap: '2px' }}>
                    {cellTasks.map(t => (
                      <div
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTask(t);
                        }}
                        className={`calendar-task-item ${t.priority}`}
                        style={{ fontSize: '8.5px', padding: '2px 4px', borderRadius: '3px' }}
                        title={`[${getPrioLabel(t.priority)}] ${t.title}`}
                      >
                        {t.title}
                      </div>
                    ))}
                  </div>
                  {holiday && (
                    <div 
                      className="calendar-holiday-tag" 
                      title={holiday.name}
                      style={{ backgroundColor: `${holiday.color}22`, color: holiday.color, borderColor: `${holiday.color}45` }}
                    >
                      {holiday.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const timeFilters = [
      { section: 'Tùy chọn', items: [
        { key: 'custom_date', label: 'Chọn ngày cụ thể', icon: <Calendar size={12} /> },
        { key: 'custom_range', label: 'Chọn khoảng ngày', icon: <CalendarDays size={12} /> }
      ]},
      { section: 'Ngày', items: [
        { key: 'yesterday', label: 'Hôm qua', icon: <Clock size={12} /> },
        { key: 'today', label: 'Hôm nay', icon: <Clock size={12} /> },
        { key: 'tomorrow', label: 'Ngày mai', icon: <Clock size={12} /> }
      ]},
      { section: 'Tuần', items: [
        { key: 'last_week', label: 'Tuần trước', icon: <CalendarDays size={12} /> },
        { key: 'this_week', label: 'Tuần này', icon: <CalendarDays size={12} /> },
        { key: 'next_week', label: 'Tuần tới', icon: <CalendarDays size={12} /> }
      ]},
      { section: 'Tháng', items: [
        { key: 'last_month', label: 'Tháng trước', icon: <Calendar size={12} /> },
        { key: 'this_month', label: 'Tháng này', icon: <Calendar size={12} /> },
        { key: 'next_month', label: 'Tháng tới', icon: <Calendar size={12} /> }
      ]},
      { section: 'Năm', items: [
        { key: 'last_year', label: 'Năm trước', icon: <Layers size={12} /> },
        { key: 'this_year', label: 'Năm nay', icon: <Layers size={12} /> },
        { key: 'next_year', label: 'Năm tới', icon: <Layers size={12} /> }
      ]}
    ];

    return (
      <div 
        className="calendar-dashboard" 
        style={{ 
          gridTemplateColumns: isTimeframePanelMinimized ? '60px 1fr' : '280px 1fr',
          transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Left Side: Time Filters */}
        <div 
          className="time-filter-panel glass-panel"
          style={{
            padding: isTimeframePanelMinimized ? '20px 8px' : '24px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: isTimeframePanelMinimized ? '12px' : '20px',
            alignItems: isTimeframePanelMinimized ? 'center' : 'stretch',
            overflow: 'hidden'
          }}
        >
          <h3 
            onClick={() => setIsTimeframePanelMinimized(prev => !prev)}
            style={{ 
              fontFamily: 'var(--font-title)', 
              fontSize: '15px', 
              fontWeight: '700', 
              color: '#fff', 
              borderBottom: isTimeframePanelMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.05)', 
              paddingBottom: isTimeframePanelMinimized ? '0' : '12px', 
              margin: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: isTimeframePanelMinimized ? 'center' : 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              width: '100%'
            }}
            title={isTimeframePanelMinimized ? "Mở rộng Mốc Thời Gian" : "Thu hẹp Mốc Thời Gian"}
          >
            {isTimeframePanelMinimized ? (
              <Filter size={18} style={{ color: 'var(--primary)' }} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={15} style={{ color: 'var(--primary)' }} />
                  <span>Mốc Thời Gian</span>
                </div>
                <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
              </>
            )}
          </h3>

          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: isTimeframePanelMinimized ? '10px' : '16px', 
            maxHeight: '420px', 
            overflowY: 'auto', 
            paddingRight: '4px',
            width: '100%'
          }}>
            {timeFilters.map((sec, secIdx) => (
              <div key={sec.section} className="time-filter-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {isTimeframePanelMinimized ? (
                  secIdx > 0 && <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.05)', margin: '4px 0', width: '100%' }} />
                ) : (
                  <div 
                    className="time-filter-sec-title"
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: sec.section === 'Tùy chọn' ? 'pointer' : 'default',
                      userSelect: 'none'
                    }}
                    onClick={() => {
                      if (sec.section === 'Tùy chọn') {
                        setIsCustomDateSectionCollapsed(prev => !prev);
                      }
                    }}
                  >
                    <span>{sec.section}</span>
                    {sec.section === 'Tùy chọn' && (
                      isCustomDateSectionCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />
                    )}
                  </div>
                )}

                {(!isCustomDateSectionCollapsed || sec.section !== 'Tùy chọn' || isTimeframePanelMinimized) && sec.items.map(item => {
                  if (item.key === 'custom_date') {
                    const cnt = getTasksInTimeRange('custom_date').length;
                    
                    if (isTimeframePanelMinimized) {
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleTimeRangeClick('custom_date')}
                          className={`time-filter-btn ${selectedTimeRange === 'custom_date' ? 'active' : ''}`}
                          style={{ padding: '10px', justifyContent: 'center', width: '100%' }}
                          title={`Chọn ngày cụ thể: ${customSelectedDate ? new Date(customSelectedDate).toLocaleDateString('vi-VN') : 'Chưa chọn'} (${cnt} việc)`}
                        >
                          {item.icon}
                        </button>
                      );
                    }

                    return (
                      <div key={item.key} className="custom-date-filter-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button
                          onClick={() => {
                            if (customSelectedDate) {
                              handleTimeRangeClick('custom_date');
                            } else {
                              document.getElementById('custom-date-picker')?.showPicker();
                            }
                          }}
                          className={`time-filter-btn ${selectedTimeRange === 'custom_date' ? 'active' : ''}`}
                          style={{ width: '100%' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.icon}
                            <span>{customSelectedDate ? new Date(customSelectedDate).toLocaleDateString('vi-VN') : 'Chọn ngày cụ thể...'}</span>
                          </div>
                          {customSelectedDate && <span className="time-filter-count">{cnt}</span>}
                        </button>
                        <input
                          id="custom-date-picker"
                          type="date"
                          value={customSelectedDate}
                          onChange={(e) => handleCustomDateChange(e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '11.5px',
                            padding: '8px 12px',
                            outline: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            width: '100%',
                            transition: 'all 0.2s ease'
                          }}
                        />
                      </div>
                    );
                  }

                  if (item.key === 'custom_range') {
                    const cnt = getTasksInTimeRange('custom_range').length;
                    
                    if (isTimeframePanelMinimized) {
                      const rangeStr = (customRangeStart && customRangeEnd)
                        ? `${new Date(customRangeStart).toLocaleDateString('vi-VN')} - ${new Date(customRangeEnd).toLocaleDateString('vi-VN')}`
                        : 'Chưa chọn';
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleTimeRangeClick('custom_range')}
                          className={`time-filter-btn ${selectedTimeRange === 'custom_range' ? 'active' : ''}`}
                          style={{ padding: '10px', justifyContent: 'center', width: '100%' }}
                          title={`Chọn khoảng ngày: ${rangeStr} (${cnt} việc)`}
                        >
                          {item.icon}
                        </button>
                      );
                    }

                    const displayLabel = (customRangeStart && customRangeEnd)
                      ? `${new Date(customRangeStart).toLocaleDateString('vi-VN')} - ${new Date(customRangeEnd).toLocaleDateString('vi-VN')}`
                      : 'Chọn khoảng ngày...';
                    return (
                      <div key={item.key} className="custom-range-filter-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button
                          onClick={() => {
                            if (customRangeStart && customRangeEnd) {
                              handleTimeRangeClick('custom_range');
                            }
                          }}
                          className={`time-filter-btn ${selectedTimeRange === 'custom_range' ? 'active' : ''}`}
                          style={{ width: '100%' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.icon}
                            <span>{displayLabel}</span>
                          </div>
                          {(customRangeStart && customRangeEnd) && <span className="time-filter-count">{cnt}</span>}
                        </button>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', fontWeight: 'bold', paddingLeft: '2px' }}>TỪ NGÀY</span>
                            <input
                              type="date"
                              value={customRangeStart}
                              onChange={(e) => handleCustomRangeChange('start', e.target.value)}
                              className="custom-range-input"
                              style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '10px',
                                padding: '6px 8px',
                                outline: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                width: '100%',
                                transition: 'all 0.2s ease'
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', fontWeight: 'bold', paddingLeft: '2px' }}>ĐẾN NGÀY</span>
                            <input
                              type="date"
                              value={customRangeEnd}
                              onChange={(e) => handleCustomRangeChange('end', e.target.value)}
                              className="custom-range-input"
                              style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '10px',
                                padding: '6px 8px',
                                outline: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                width: '100%',
                                transition: 'all 0.2s ease'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const cnt = getTasksInTimeRange(item.key).length;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleTimeRangeClick(item.key)}
                      className={`time-filter-btn ${selectedTimeRange === item.key ? 'active' : ''}`}
                      style={isTimeframePanelMinimized ? { padding: '10px', justifyContent: 'center', width: '100%' } : {}}
                      title={isTimeframePanelMinimized ? `${item.label} (${cnt} việc)` : undefined}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: isTimeframePanelMinimized ? 'center' : 'flex-start' }}>
                        {item.icon}
                        {!isTimeframePanelMinimized && <span>{item.label}</span>}
                      </div>
                      {!isTimeframePanelMinimized && <span className="time-filter-count">{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Monthly Calendar Grid & List view */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minWidth: 0 }}>
          
          {/* Calendar Grid panel */}
          <div className="calendar-panel glass-panel">
            
            {/* Header navigator */}
            <div className="calendar-header" style={{ borderBottom: isCalendarGridMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap', gap: '12px' }}>
              <div 
                className="calendar-month-title"
                onClick={() => setIsCalendarGridMinimized(prev => !prev)}
                style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Calendar size={18} style={{ color: '#06b6d4' }} />
                <span>Tháng {month + 1}, {year}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '4px' }}>
                  {isCalendarGridMinimized ? '(Nhấp để mở rộng)' : '(Nhấp để thu nhỏ)'}
                </span>
              </div>

              {!isCalendarGridMinimized && (
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '2px' }}>
                  <button 
                    onClick={() => setCalendarViewMode('single_month')}
                    className="calendar-nav-btn"
                    style={{ fontSize: '11px', fontWeight: '600', width: 'auto', padding: '4px 12px', height: '26px', background: calendarViewMode === 'single_month' ? 'rgba(139, 92, 246, 0.15)' : 'transparent', borderColor: calendarViewMode === 'single_month' ? 'rgba(139, 92, 246, 0.25)' : 'transparent', color: calendarViewMode === 'single_month' ? '#c084fc' : 'var(--text-secondary)' }}
                  >
                    1 Tháng
                  </button>
                  <button 
                    onClick={() => setCalendarViewMode('three_months')}
                    className="calendar-nav-btn"
                    style={{ fontSize: '11px', fontWeight: '600', width: 'auto', padding: '4px 12px', height: '26px', background: calendarViewMode === 'three_months' ? 'rgba(139, 92, 246, 0.15)' : 'transparent', borderColor: calendarViewMode === 'three_months' ? 'rgba(139, 92, 246, 0.25)' : 'transparent', color: calendarViewMode === 'three_months' ? '#c084fc' : 'var(--text-secondary)' }}
                  >
                    3 Tháng
                  </button>
                  <button 
                    onClick={() => setCalendarViewMode('infinite_scroll')}
                    className="calendar-nav-btn"
                    style={{ fontSize: '11px', fontWeight: '600', width: 'auto', padding: '4px 12px', height: '26px', background: calendarViewMode === 'infinite_scroll' ? 'rgba(139, 92, 246, 0.15)' : 'transparent', borderColor: calendarViewMode === 'infinite_scroll' ? 'rgba(139, 92, 246, 0.25)' : 'transparent', color: calendarViewMode === 'infinite_scroll' ? '#c084fc' : 'var(--text-secondary)' }}
                  >
                    Cuộn vô tận
                  </button>
                </div>
              )}

              <div className="calendar-nav-group">
                <button 
                  onClick={() => setIsHolidaySettingsOpen(true)} 
                  className="calendar-nav-btn" 
                  title="Cài đặt ngày nghỉ & ngày lễ"
                  style={{ 
                    width: 'auto', 
                    padding: '0 12px', 
                    display: 'flex', 
                    gap: '6px', 
                    alignItems: 'center', 
                    borderColor: 'rgba(244, 63, 94, 0.25)', 
                    color: '#f43f5e', 
                    background: 'rgba(244, 63, 94, 0.06)',
                    marginRight: '6px'
                  }}
                >
                  <Settings size={13} />
                  <span style={{ fontSize: '11px', fontWeight: '600' }}>Cài đặt ngày nghỉ</span>
                </button>
                <button onClick={handleTodayClick} className="calendar-nav-btn" style={{ fontSize: '11px', fontWeight: '600', width: 'auto', padding: '0 12px' }}>
                  Hôm nay
                </button>
                <button onClick={handlePrevMonth} className="calendar-nav-btn" title="Tháng trước">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={handleNextMonth} className="calendar-nav-btn" title="Tháng sau">
                  <ChevronRight size={16} />
                </button>
                <button 
                  onClick={() => setIsCalendarGridMinimized(prev => !prev)} 
                  className="calendar-nav-btn" 
                  title={isCalendarGridMinimized ? "Hiển thị lịch" : "Thu nhỏ lịch"}
                  style={{ marginLeft: '8px', color: 'var(--primary)' }}
                >
                  {isCalendarGridMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
            </div>

            {!isCalendarGridMinimized && (
              <div 
                className="calendar-body-content"
                style={{ 
                  padding: '20px 0 0 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px',
                  width: '100%',
                  minWidth: 0
                }}
              >
                {calendarViewMode === 'single_month' && (
                  renderMonthGrid(0)
                )}

                {calendarViewMode === 'three_months' && (
                  <div 
                    className="calendar-three-months-container"
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                      gap: '24px',
                      width: '100%'
                    }}
                  >
                    {renderMonthGrid(-1)}
                    {renderMonthGrid(0)}
                    {renderMonthGrid(1)}
                  </div>
                )}

                {calendarViewMode === 'infinite_scroll' && (
                  <div 
                    onScroll={handleInfiniteScroll}
                    className="calendar-infinite-scroll-container"
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '32px', 
                      maxHeight: '650px', 
                      overflowY: 'auto',
                      paddingRight: '8px',
                      width: '100%',
                      scrollBehavior: 'auto'
                    }}
                  >
                    {Array.from(
                      { length: infiniteScrollMaxOffset - infiniteScrollMinOffset + 1 },
                      (_, i) => infiniteScrollMinOffset + i
                    ).map(offset => (
                      <div key={offset}>
                        {renderMonthGrid(offset)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* List display under selection */}
          <div 
            id="filtered-tasks-section" 
            className="chart-panel glass-panel" 
            style={{ padding: '24px' }}
            onClick={() => setCalendarActivePopup(null)}
          >
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                paddingBottom: '14px', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <h3 className="chart-panel-title" style={{ margin: 0, border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: '#fbbf24' }} />
                <span>Danh sách công việc: {timeFilters.flatMap(f => f.items).find(i => i.key === selectedTimeRange)?.label || selectedTimeRange} ({activeRangeTasks.length})</span>
              </h3>

              {/* Segmented Controller Switcher */}
              <div 
                style={{ 
                  display: 'flex', 
                  gap: '4px', 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid rgba(255, 255, 255, 0.06)', 
                  borderRadius: '10px', 
                  padding: '2px' 
                }}
              >
                <button 
                  onClick={() => setCalendarListGroupingMode('priority')}
                  className="calendar-nav-btn"
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: '600', 
                    width: 'auto', 
                    padding: '4px 12px', 
                    height: '26px', 
                    background: calendarListGroupingMode === 'priority' ? 'rgba(139, 92, 246, 0.15)' : 'transparent', 
                    borderColor: calendarListGroupingMode === 'priority' ? 'rgba(139, 92, 246, 0.25)' : 'transparent', 
                    color: calendarListGroupingMode === 'priority' ? '#c084fc' : 'var(--text-secondary)' 
                  }}
                >
                  Độ ưu tiên
                </button>
                <button 
                  onClick={() => setCalendarListGroupingMode('status')}
                  className="calendar-nav-btn"
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: '600', 
                    width: 'auto', 
                    padding: '4px 12px', 
                    height: '26px', 
                    background: calendarListGroupingMode === 'status' ? 'rgba(139, 92, 246, 0.15)' : 'transparent', 
                    borderColor: calendarListGroupingMode === 'status' ? 'rgba(139, 92, 246, 0.25)' : 'transparent', 
                    color: calendarListGroupingMode === 'status' ? '#c084fc' : 'var(--text-secondary)' 
                  }}
                >
                  Tiến độ công việc
                </button>
              </div>
            </div>

            {activeRangeTasks.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', fontStyle: 'italic' }}>
                Không có công việc nào trong mốc thời gian này.
              </div>
            ) : (
              calendarListGroupingMode === 'priority' ? (
                <div className="filtered-tasks-grid" style={{ marginTop: '16px' }}>
                  {activeRangeTasks.map(task => {
                    const dueStr = task.dueDate ? (new Date(task.dueDate).toLocaleDateString('vi-VN') + ' ' + new Date(task.dueDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })) : 'Chưa đặt';
                    
                    return (
                      <div
                        key={task.id}
                        id={`cal-card-priority-${task.id}`}
                        onDoubleClick={() => setSelectedTask(task)}
                        className={`task-card glass-panel fade-in ${calendarActivePopup && calendarActivePopup.taskId === task.id ? 'active-popup' : ''}`}
                        style={{
                          padding: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '10px',
                          borderLeft: `4px solid ${task.priority === 'high' ? 'var(--danger)' : (task.priority === 'low' ? 'var(--success)' : 'var(--warning)')}`
                        }}
                      >
                        {/* Top row: Priority & Status */}
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                          
                          {/* Interactive Priority Badge */}
                          <div 
                            onClick={(e) => togglePopup(task.id, 'priority', e)}
                            style={{ position: 'relative', cursor: 'pointer' }}
                            title="Đổi độ ưu tiên"
                          >
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold', color: task.priority === 'high' ? 'var(--danger)' : (task.priority === 'low' ? 'var(--success)' : 'var(--warning)') }}>
                              {getPrioLabel(task.priority)}
                            </span>

                            {/* Priority Selection Popup */}
                            {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'priority' && (
                              <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ top: '100%', left: 0, zIndex: 100 }}>
                                <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>ĐỘ ƯU TIÊN</div>
                                {PRIORITIES.map(prio => (
                                  <button
                                    key={prio.id}
                                    className={`inline-overlay-item ${task.priority === prio.id ? 'active' : ''}`}
                                    onClick={() => handleSelectPriority(task.id, prio.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                                  >
                                    <span className="column-dot" style={{ backgroundColor: prio.color, width: 6, height: 6, borderRadius: '50%' }} />
                                    <span style={{ flex: 1 }}>{prio.label}</span>
                                    {task.priority === prio.id && <Check size={12} />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Interactive Status Badge & Hover Delete Button */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div 
                              onClick={(e) => togglePopup(task.id, 'status', e)}
                              style={{ position: 'relative', cursor: 'pointer' }}
                              title="Đổi trạng thái"
                            >
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500' }}>
                                Trạng thái: {task.status === 'done' ? 'Hoàn thành' : (task.status === 'review' ? 'Đang review' : (task.status === 'in_progress' ? 'Đang làm' : 'Cần làm'))}
                              </span>

                              {/* Status Selection Popup */}
                              {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'status' && (
                                <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ top: '100%', right: 0, left: 'auto', zIndex: 100, minWidth: '130px' }}>
                                  <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>TRẠNG THÁI</div>
                                  {[
                                    { key: 'todo', label: 'Cần làm', color: 'var(--text-muted)' },
                                    { key: 'in_progress', label: 'Đang làm', color: 'var(--primary)' },
                                    { key: 'review', label: 'Đang review', color: 'var(--info)' },
                                    { key: 'done', label: 'Hoàn thành', color: 'var(--success)' }
                                  ].map(st => (
                                    <button
                                      key={st.key}
                                      className={`inline-overlay-item ${task.status === st.key ? 'active' : ''}`}
                                      onClick={() => {
                                        handleUpdateTask(task.id, { status: st.key });
                                        setCalendarActivePopup(null);
                                      }}
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                      <span className="column-dot" style={{ backgroundColor: st.color, width: 6, height: 6, borderRadius: '50%' }} />
                                      <span style={{ flex: 1 }}>{st.label}</span>
                                      {task.status === st.key && <Check size={12} />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* subtle hover delete button */}
                            <button
                              className="card-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
                              title="Xóa công việc"
                              style={{ padding: '2px', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                        </div>

                        {/* Middle: Content Editable Title */}
                        <div 
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => handleTitleBlur(task.id, e)}
                          onKeyDown={handleTitleKeyDown}
                          onClick={(e) => e.stopPropagation()} // Stop opening editor
                          style={{ 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#fff', 
                            lineHeight: 1.4, 
                            width: '100%', 
                            outline: 'none',
                            cursor: 'text'
                          }}
                        >
                          {task.title}
                        </div>

                        {/* Bottom row: Due Date & Assignees */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          
                          {/* Interactive Due Date Badge */}
                          <div 
                            onClick={(e) => togglePopup(task.id, 'date', e)}
                            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                            title="Đổi hạn chót"
                          >
                            <Clock size={11} />
                            <span>Hạn: {dueStr}</span>

                            {/* Date Selection Popup */}
                            {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'date' && (
                              <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ top: '100%', left: 0, zIndex: 100, minWidth: '150px' }}>
                                <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>CHỌN HẠN CHÓT</div>
                                <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 0)}>Hôm nay</button>
                                <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 1)}>Ngày mai</button>
                                <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 2)}>Sau 2 ngày</button>
                                <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 7)}>Tuần sau</button>
                                <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
                                  <label style={{ display: 'block', fontSize: '9px', color: '#71717a', marginBottom: '4px' }}>CHỌN NGÀY CỤ THỂ</label>
                                  <input
                                    type="date"
                                    className="custom-date-input"
                                    style={{
                                      width: '100%',
                                      background: '#09090b',
                                      border: '1px solid rgba(255,255,255,0.1)',
                                      borderRadius: '4px',
                                      color: 'white',
                                      padding: '4px',
                                      fontSize: '11px',
                                      outline: 'none'
                                    }}
                                    onChange={(e) => handleCustomDateChange(task.id, e)}
                                    value={task.dueDate ? new Date(task.dueDate).toISOString().substr(0, 10) : ''}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Interactive Assignees Stack */}
                          <div 
                            onClick={(e) => togglePopup(task.id, 'assignee', e)}
                            style={{ position: 'relative', display: 'flex', gap: '-4px', cursor: 'pointer', alignItems: 'center', minWidth: '20px', minHeight: '20px' }}
                            title="Đổi người thực hiện"
                          >
                            {task.assignees && task.assignees.length > 0 ? (
                              task.assignees.map(a => (
                                <img 
                                  key={a.id} 
                                  src={a.avatar} 
                                  alt={a.name} 
                                  style={{ 
                                    width: '20px', 
                                    height: '20px', 
                                    borderRadius: '50%', 
                                    border: '2px solid rgba(0,0,0,0.2)',
                                    objectFit: 'cover' 
                                  }} 
                                  title={a.name} 
                                />
                              ))
                            ) : (
                              <User size={14} style={{ color: 'var(--text-muted)' }} />
                            )}

                            {/* Assignee Selection Popup */}
                            {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'assignee' && (
                              <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ minWidth: '180px', top: '100%', right: 0, left: 'auto', zIndex: 100 }}>
                                <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>GÁN NGƯỜI THỰC HIỆN</div>
                                {teamMembers.map(user => {
                                  const isAssigned = task.assignees && task.assignees.some(a => a.id === user.id);
                                  return (
                                    <button
                                      key={user.id}
                                      type="button"
                                      className={`inline-overlay-item ${isAssigned ? 'active' : ''}`}
                                      onClick={() => {
                                        let nextAssigneeIds;
                                        const currentIds = task.assignees ? task.assignees.map(a => a.id) : [];
                                        if (isAssigned) {
                                          nextAssigneeIds = currentIds.filter(id => id !== user.id);
                                        } else {
                                          nextAssigneeIds = [...currentIds, user.id];
                                        }
                                        const nextAssignees = teamMembers.filter(u => nextAssigneeIds.includes(u.id));
                                        handleUpdateTask(task.id, { assignees: nextAssignees });
                                      }}
                                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                      <input 
                                        type="checkbox" 
                                        checked={isAssigned} 
                                        readOnly 
                                        style={{ accentColor: '#8b5cf6', width: '12px', height: '12px', pointerEvents: 'none' }}
                                      />
                                      <img src={user.avatar} className="avatar" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                                      <span style={{ flex: 1 }}>{user.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div 
                  className="calendar-status-columns" 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
                    gap: '16px', 
                    marginTop: '16px',
                    width: '100%',
                    alignItems: 'start'
                  }}
                >
                  {[
                    { key: 'todo', label: 'Cần làm', color: 'var(--text-muted)' },
                    { key: 'in_progress', label: 'Đang làm', color: 'var(--primary)' },
                    { key: 'review', label: 'Đang review', color: 'var(--info)' },
                    { key: 'done', label: 'Hoàn thành', color: 'var(--success)' }
                  ].map(col => {
                    const colTasks = activeRangeTasks.filter(t => t.status === col.key);
                    return (
                      <div 
                        key={col.key} 
                        className={`status-column-panel ${calendarDragOverColumnId === col.key ? 'drag-over' : ''}`}
                        onDragOver={(e) => handleDragOver(e, col.key)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, col.key)}
                        style={{ 
                          background: calendarDragOverColumnId === col.key ? 'rgba(139, 92, 246, 0.04)' : 'rgba(255, 255, 255, 0.01)', 
                          border: calendarDragOverColumnId === col.key ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.03)', 
                          borderRadius: '12px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          minHeight: '220px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {/* Column Header */}
                        <div 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            paddingBottom: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span 
                              style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: col.color 
                              }} 
                            />
                            <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#fff' }}>
                              {col.label}
                            </span>
                          </div>
                          <span 
                            style={{ 
                              fontSize: '10px', 
                              background: 'rgba(255, 255, 255, 0.04)', 
                              padding: '2px 6px', 
                              borderRadius: '6px',
                              color: 'var(--text-secondary)',
                              fontWeight: '600'
                            }}
                          >
                            {colTasks.length}
                          </span>
                        </div>

                        {/* Column Tasks Body */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                          {colTasks.length === 0 ? (
                            <div 
                              style={{ 
                                padding: '30px 0', 
                                textAlign: 'center', 
                                color: 'var(--text-muted)', 
                                fontSize: '11px', 
                                fontStyle: 'italic' 
                              }}
                            >
                              Không có công việc
                            </div>
                          ) : (
                            colTasks.map(task => {
                              const isTaskOverdue = isOverdue(task.dueDate, task.status);
                              
                              return (
                                <div
                                  key={task.id}
                                  id={`cal-card-${task.id}`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, task.id)}
                                  onDragEnd={() => handleDragEnd(task.id)}
                                  onDoubleClick={() => setSelectedTask(task)}
                                  className={`task-card fade-in ${calendarActivePopup && calendarActivePopup.taskId === task.id ? 'active-popup' : ''}`}
                                >
                                  {/* Card Header Row */}
                                  <div className="card-header-row">
                                    <div
                                      className="card-title"
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => handleTitleBlur(task.id, e)}
                                      onKeyDown={handleTitleKeyDown}
                                      onClick={(e) => e.stopPropagation()} // Stop opening editor
                                    >
                                      {task.title}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      <button
                                        className="card-edit-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTask(task);
                                        }}
                                        title="Chỉnh sửa chi tiết"
                                      >
                                        <Edit2 size={11} />
                                      </button>

                                      <button
                                        className="card-delete-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteTask(task.id);
                                        }}
                                        title="Xóa công việc"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Card Tags Row */}
                                  {task.tags && task.tags.length > 0 && (
                                    <div className="card-tags">
                                      {task.tags.map(tag => (
                                        <span key={tag} className="card-tag">#{tag}</span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Card Badges Row */}
                                  <div className="card-badges">
                                    {/* Assignees Badge */}
                                    <div 
                                      className="card-badge assignee"
                                      onClick={(e) => togglePopup(task.id, 'assignee', e)}
                                      style={{ position: 'relative' }}
                                      title="Đổi người thực hiện"
                                    >
                                      {task.assignees && task.assignees.length > 0 ? (
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                          <div style={{ display: 'flex', marginRight: '4px' }}>
                                            {task.assignees.slice(0, 3).map((ass, i) => (
                                              <img 
                                                key={ass.id} 
                                                src={ass.avatar} 
                                                alt={ass.name} 
                                                className="avatar" 
                                                style={{ 
                                                  width: 15, 
                                                  height: 15, 
                                                  borderRadius: '50%',
                                                  marginLeft: i > 0 ? '-5px' : '0px',
                                                  border: '1px solid #18181b',
                                                  objectFit: 'cover',
                                                  zIndex: 10 - i
                                                }} 
                                              />
                                            ))}
                                          </div>
                                          <span style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                                            {task.assignees.length > 3 
                                              ? `+${task.assignees.length - 3}` 
                                              : task.assignees.map(a => a.name.split(' ').pop()).join(', ')
                                            }
                                          </span>
                                        </div>
                                      ) : (
                                        <>
                                          <User size={10} />
                                          <span>Chưa giao</span>
                                        </>
                                      )}

                                      {/* Assignee Selection Popup */}
                                      {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'assignee' && (
                                        <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ minWidth: '180px', top: '100%', zIndex: 100 }}>
                                          <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>GÁN NGƯỜI THỰC HIỆN</div>
                                          {teamMembers.map(user => {
                                            const isAssigned = task.assignees && task.assignees.some(a => a.id === user.id);
                                            return (
                                              <button
                                                key={user.id}
                                                type="button"
                                                className={`inline-overlay-item ${isAssigned ? 'active' : ''}`}
                                                onClick={() => {
                                                  let nextAssigneeIds;
                                                  const currentIds = task.assignees ? task.assignees.map(a => a.id) : [];
                                                  if (isAssigned) {
                                                    nextAssigneeIds = currentIds.filter(id => id !== user.id);
                                                  } else {
                                                    nextAssigneeIds = [...currentIds, user.id];
                                                  }
                                                  const nextAssignees = teamMembers.filter(u => nextAssigneeIds.includes(u.id));
                                                  handleUpdateTask(task.id, { assignees: nextAssignees });
                                                }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                                              >
                                                <input 
                                                  type="checkbox" 
                                                  checked={isAssigned} 
                                                  readOnly 
                                                  style={{ accentColor: '#8b5cf6', width: '12px', height: '12px', pointerEvents: 'none' }}
                                                />
                                                <img src={user.avatar} className="avatar" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                                                <span style={{ flex: 1 }}>{user.name}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    {/* Priority Badge */}
                                    <div 
                                      className={`card-badge priority-${task.priority}`}
                                      onClick={(e) => togglePopup(task.id, 'priority', e)}
                                      style={{ position: 'relative' }}
                                      title="Đổi độ ưu tiên"
                                    >
                                      <ShieldAlert size={10} />
                                      <span>
                                        {task.priority === 'high' ? 'Khẩn cấp' : task.priority === 'medium' ? 'Vừa' : 'Thấp'}
                                      </span>

                                      {/* Priority Selection Popup */}
                                      {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'priority' && (
                                        <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ top: '100%', zIndex: 100 }}>
                                          <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>ĐỘ ƯU TIÊN</div>
                                          {PRIORITIES.map(prio => (
                                            <button
                                              key={prio.id}
                                              className={`inline-overlay-item ${task.priority === prio.id ? 'active' : ''}`}
                                              onClick={() => handleSelectPriority(task.id, prio.id)}
                                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }}
                                            >
                                              <span className="column-dot" style={{ backgroundColor: prio.color, width: 6, height: 6, borderRadius: '50%' }} />
                                              <span style={{ flex: 1 }}>{prio.label}</span>
                                              {task.priority === prio.id && <Check size={12} />}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Due Date Badge */}
                                    <div 
                                      className={`card-badge date ${isTaskOverdue ? 'overdue' : ''}`}
                                      onClick={(e) => togglePopup(task.id, 'date', e)}
                                      style={{ position: 'relative' }}
                                      title="Đổi hạn chót"
                                    >
                                      <Calendar size={10} />
                                      <span>
                                        {task.dueDate ? formatDateString(task.dueDate) : 'Đặt hạn'}
                                      </span>

                                      {/* Date Selection Popup */}
                                      {calendarActivePopup && calendarActivePopup.taskId === task.id && calendarActivePopup.type === 'date' && (
                                        <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ top: '100%', zIndex: 100, minWidth: '150px' }}>
                                          <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>CHỌN HẠN CHÓT</div>
                                          <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 0)}>Hôm nay</button>
                                          <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 1)}>Ngày mai</button>
                                          <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 2)}>Sau 2 ngày</button>
                                          <button className="inline-overlay-item" style={{ display: 'block', width: '100%', padding: '6px 8px', background: 'none', border: 'none', color: '#fff', fontSize: '11px', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectDate(task.id, 7)}>Tuần sau</button>
                                          <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
                                            <label style={{ display: 'block', fontSize: '9px', color: '#71717a', marginBottom: '4px' }}>CHỌN NGÀY CỤ THỂ</label>
                                            <input
                                              type="date"
                                              className="custom-date-input"
                                              style={{
                                                width: '100%',
                                                background: '#09090b',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '4px',
                                                color: 'white',
                                                padding: '4px',
                                                fontSize: '11px',
                                                outline: 'none'
                                              }}
                                              onChange={(e) => handleCustomDateChange(task.id, e)}
                                              value={task.dueDate ? new Date(task.dueDate).toISOString().substr(0, 10) : ''}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

        </div>
      </div>
    );
  };

  // ───────────────────────────────────────────────
  // 1. LOADING SCREEN
  // ───────────────────────────────────────────────

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await api.getTasksAnalytics();
      setAnalyticsData(data);
    } catch (err) {
      console.error('Không thể lấy dữ liệu thống kê:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleTriggerDailyDigest = async () => {
    setDigestLoading(true);
    try {
      console.log('[DAILY DIGEST UI] Kích hoạt gửi bản tin sáng...');
      const res = await api.triggerDailyDigest();
      setDigestContentModal(res.digestContent);
      const notifs = await api.getNotifications();
      setNotifications(notifs);
    } catch (err) {
      console.error('[DAILY DIGEST UI ERROR] Không thể kích hoạt bản tin:', err);
      alert('Không thể tạo và gửi bản tin sáng. Chi tiết: ' + err.message);
    } finally {
      setDigestLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn && activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, isLoggedIn]);


    const renderAnalytics = () => {
    if (analyticsLoading || !analyticsData) {
      return (
        <div className="glass-panel" style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '400px' }}>
          <div className="loader" style={{ border: '3px solid rgba(255,255,255,0.05)', borderRadius: '50%', borderTop: '3px solid #8b5cf6', width: '45px', height: '45px', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-title)', fontWeight: '500' }}>
            Đang tổng hợp dữ liệu hiệu suất và phân tích AI...
          </p>
        </div>
      );
    }

    const {
      totalTasks,
      statusCounts,
      prioCounts,
      onTimeRate,
      avgLeadTimeHrs,
      teamAnalytics,
      tagsAnalytics,
      recentOverdueLogs
    } = analyticsData;

    // SVG Progress ring math
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (onTimeRate / 100) * circumference;

    return (
      <div className="analytics-dashboard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
            Hiệu Suất & Thống Kê AI
          </h2>
          <button
            onClick={handleTriggerDailyDigest}
            disabled={digestLoading}
            className="user-switcher-wrap"
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              color: '#8b5cf6',
              borderColor: 'rgba(139, 92, 246, 0.3)',
              background: 'rgba(139, 92, 246, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <Sparkles size={13} style={{ color: '#8b5cf6' }} />
            <span>{digestLoading ? 'Đang tạo...' : '☀️ Gửi bản tin sáng AI (Teams)'}</span>
          </button>
        </div>
        {/* KPI Cards Row */}
        <div className="kpi-grid">
          {/* Card 1: Total */}
          <div className="kpi-card glass-panel">
            <div className="kpi-icon-box total">
              <Layers size={20} />
            </div>
            <div className="kpi-meta">
              <span className="kpi-title">Tổng công việc</span>
              <span className="kpi-value">{totalTasks}</span>
            </div>
          </div>

          {/* Card 2: Completed */}
          <div className="kpi-card glass-panel">
            <div className="kpi-icon-box ontime">
              <Check size={20} />
            </div>
            <div className="kpi-meta">
              <span className="kpi-title">Hoàn thành</span>
              <span className="kpi-value">{statusCounts.done}</span>
            </div>
          </div>

          {/* Card 3: On-Time Rate */}
          <div className="kpi-card glass-panel" title="Tỷ lệ công việc hoàn thành trước hoặc đúng hạn chót">
            <div className={`kpi-icon-box ${onTimeRate >= 80 ? 'ontime' : 'pending'}`}>
              <Sparkles size={20} />
            </div>
            <div className="kpi-meta">
              <span className="kpi-title">Tỷ lệ đúng hạn</span>
              <span className="kpi-value" style={{ color: onTimeRate >= 80 ? '#34d399' : '#fbbf24' }}>{onTimeRate}%</span>
            </div>
          </div>

          {/* Card 4: Average Lead Time */}
          <div className="kpi-card glass-panel" title="Thời gian trung bình từ khi tạo đến khi hoàn thành công việc">
            <div className="kpi-icon-box leadtime">
              <RefreshCw size={20} />
            </div>
            <div className="kpi-meta">
              <span className="kpi-title">Lead Time trung bình</span>
              <span className="kpi-value">{avgLeadTimeHrs}h</span>
            </div>
          </div>
        </div>

        {/* Row 2: Charts Grid */}
        <div className="charts-grid">
          {/* Workload stacked bar chart */}
          <div className="chart-panel glass-panel">
            <h3 className="chart-panel-title">
              <Users size={16} style={{ color: '#8b5cf6' }} />
              Tải Công Việc & Tiến Độ Nhóm (Team Workload)
            </h3>
            <div className="team-workload-list">
              {teamAnalytics.map(member => {
                const total = member.stats.total || 1;
                const todoPct = (member.stats.todo / total) * 100;
                const progressPct = (member.stats.in_progress / total) * 100;
                const reviewPct = (member.stats.review / total) * 100;
                const donePct = (member.stats.done / total) * 100;

                return (
                  <div key={member.userId} className="team-member-row">
                    <div className="team-member-info">
                      <img src={member.avatar} alt={member.name} className="team-member-avatar" />
                      <div>
                        <div className="team-member-name">{member.name}</div>
                        <div className="team-member-role">{member.role}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <div className="stacked-bar-container">
                        {member.stats.todo > 0 && <div className="stacked-bar-segment todo" style={{ width: `${todoPct}%` }} title={`Cần làm: ${member.stats.todo}`} />}
                        {member.stats.in_progress > 0 && <div className="stacked-bar-segment in_progress" style={{ width: `${progressPct}%` }} title={`Đang làm: ${member.stats.in_progress}`} />}
                        {member.stats.review > 0 && <div className="stacked-bar-segment review" style={{ width: `${reviewPct}%` }} title={`Review: ${member.stats.review}`} />}
                        {member.stats.done > 0 && <div className="stacked-bar-segment done" style={{ width: `${donePct}%` }} title={`Hoàn thành: ${member.stats.done}`} />}
                      </div>
                    </div>

                    <div className="workload-numbers">
                      <span className="workload-total">{member.stats.total}</span> việc 
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        ({member.stats.done} xong)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Chart Legend */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="status-color-dot todo" /> Cần làm
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="status-color-dot in_progress" /> Đang làm
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="status-color-dot review" /> Đang review
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="status-color-dot done" /> Hoàn thành
              </div>
            </div>
          </div>

          {/* Radial Gauge for On-Time Rate */}
          <div className="chart-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h3 className="chart-panel-title" style={{ width: '100%' }}>
              <Sparkles size={16} style={{ color: '#10b981' }} />
              Chất Lượng Đúng Hạn
            </h3>
            
            <div className="progress-ring-box">
              <svg width="128" height="128">
                <defs>
                  <linearGradient id="gradient-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                {/* Background Ring */}
                <circle
                  stroke="rgba(255, 255, 255, 0.04)"
                  fill="transparent"
                  strokeWidth="8"
                  r={radius}
                  cx="64"
                  cy="64"
                />
                {/* Progress Ring */}
                <circle
                  className="progress-ring-circle"
                  stroke="url(#gradient-glow)"
                  fill="transparent"
                  strokeWidth="8"
                  strokeDasharray={`${circumference} ${circumference}`}
                  style={{ strokeDashoffset }}
                  strokeLinecap="round"
                  r={radius}
                  cx="64"
                  cy="64"
                />
              </svg>
              <div className="progress-ring-text">{onTimeRate}%</div>
            </div>
            
            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              <strong style={{ color: onTimeRate >= 80 ? 'var(--success)' : 'var(--warning)' }}>
                {onTimeRate >= 80 ? '🔥 Rất tuyệt vời!' : '⚠️ Cần cải thiện'}
              </strong>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Tỷ lệ hoàn thành công việc trước hoặc đúng hạn chót.
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Grid Row 2 */}
        <div className="charts-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Priorities breakdown */}
          <div className="chart-panel glass-panel">
            <h3 className="chart-panel-title">
              <ShieldAlert size={16} style={{ color: '#ef4444' }} />
              Mức Độ Ưu Tiên
            </h3>
            <div className="priority-breakdown-box">
              {[
                { key: 'high', label: 'Khẩn cấp', count: prioCounts.high, max: totalTasks || 1 },
                { key: 'medium', label: 'Vừa', count: prioCounts.medium, max: totalTasks || 1 },
                { key: 'low', label: 'Thấp', count: prioCounts.low, max: totalTasks || 1 }
              ].map(item => {
                const pct = (item.count / item.max) * 100;
                return (
                  <div key={item.key} className="priority-bar-row">
                    <div className="priority-bar-label">
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </div>
                    <div className="priority-bar-wrap">
                      <div className={`priority-bar-fill ${item.key}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Breakdown & Popular Tags */}
          <div className="chart-panel glass-panel">
            <h3 className="chart-panel-title">
              <Tag size={16} style={{ color: '#06b6d4' }} />
              Nhãn Dán Phổ Biến (Tags)
            </h3>
            {tagsAnalytics.length === 0 ? (
              <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Chưa có nhãn dán nào được sử dụng.
              </div>
            ) : (
              <div className="tags-cloud">
                {tagsAnalytics.map(t => (
                  <div key={t.tag} className="tag-cloud-item">
                    <span>#{t.tag}</span>
                    <span className="tag-cloud-count">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overdue Feeds list */}
          <div className="chart-panel glass-panel">
            <h3 className="chart-panel-title">
              <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
              Cảnh Báo Quá Hạn Gần Đây
            </h3>
            {recentOverdueLogs.length === 0 ? (
              <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--success)', fontStyle: 'italic', gap: '6px' }}>
                <Check size={14} /> Không có cảnh báo quá hạn nào!
              </div>
            ) : (
              <div className="recent-overdue-list">
                {recentOverdueLogs.map(log => {
                  const formattedDue = new Date(log.due_date).toLocaleDateString('vi-VN');
                  return (
                    <div key={log.id} className="recent-overdue-item">
                      <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                      <div className="recent-overdue-title" title={log.task_title}>
                        {log.task_title}
                      </div>
                      <div className="recent-overdue-meta">
                        <span className="recent-overdue-date">{formattedDue}</span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{log.assignees || 'Chưa gán'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: 'var(--glass-border)', marginLeft: '16px' }}>
        <button
          onClick={() => setActiveTab('board')}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'board' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'board' ? '#fff' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <Layers size={13} />
          Bảng Công Việc
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'analytics' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'analytics' ? '#fff' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <BarChart3 size={13} style={{ color: '#a78bfa' }} />
          Thống Kê & AI
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'calendar' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'calendar' ? '#fff' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <Calendar size={13} style={{ color: '#06b6d4' }} />
          Lịch Công Việc
        </button>
      </div>


        {/* Header Actions */}
        <div className="header-actions">

          {/* Notification Bell Component */}
          <div className="notif-container" ref={notifDropdownRef}>
            <button
              className={`notif-bell-btn ${isNotificationsOpen ? 'active' : ''}`}
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              title="Thông báo nhắc nhở & quá hạn"
            >
              <Bell size={16} />
              {notifications.filter(n => !n.is_read).length > 0 && (
                <span className="notif-badge">
                  {notifications.filter(n => !n.is_read).length}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="notif-dropdown">
                <div className="notif-header">
                  <h3>Thông báo</h3>
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <button onClick={handleMarkAllNotificationsAsRead} className="notif-clear-btn">
                      <Check size={12} />
                      Đọc tất cả
                    </button>
                  )}
                </div>

                <div className="notif-list">
                  {notifications.length === 0 ? (
                    <div className="notif-empty">
                      <BellOff size={24} style={{ color: 'var(--text-muted)' }} />
                      <span>Không có thông báo nào dành cho bạn.</span>
                    </div>
                  ) : (
                    notifications.map(notif => {
                      const isOverdue = notif.type === 'overdue';
                      const formattedTime = new Date(notif.created_at).toLocaleString('vi-VN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <div
                          key={notif.id}
                          className={`notif-item ${notif.is_read ? '' : 'unread'}`}
                          onClick={() => handleNotificationClick(notif)}
                        >
                          <div className={`notif-icon-box ${isOverdue ? 'overdue' : 'reminder'}`}>
                            <AlertTriangle size={14} />
                          </div>

                          <div className="notif-content">
                            <div className="notif-title">
                              {isOverdue ? '⚠️ Quá hạn công việc' : '⏰ Nhắc nhở hạn chót'}
                            </div>
                            <div className="notif-text">
                              {notif.message}
                            </div>
                            <span className="notif-time">{formattedTime}</span>
                          </div>

                          <button
                            className="notif-delete-btn"
                            onClick={(e) => handleDeleteNotification(e, notif.id)}
                            title="Xóa thông báo"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

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

      {activeTab === 'calendar' ? (
        renderCalendarView()
      ) : activeTab === 'analytics' ? (
        renderAnalytics()
      ) : (
        <>
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
                    💡 Gõ <span style={{ color: '#c084fc', fontWeight: 'bold' }}>@tên</span> để gán người, <span style={{ color: '#ef4444', fontWeight: 'bold' }}>#cao/#trungbinh/#thap</span> để đặt ưu tiên, <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>ngày mai/thứ sáu</span> để đặt hạn chót.
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
        </>
      )}


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

      {/* Glassmorphic AI Daily Digest Modal */}
      {digestContentModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '600px', padding: '30px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button 
              onClick={() => setDigestContentModal(null)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={22} style={{ color: '#a78bfa' }} />
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0, fontFamily: 'var(--font-title)' }}>Bản tin chào buổi sáng AI</h3>
            </div>
            <div 
              style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '8px', fontSize: '13.5px', lineHeight: 1.6, color: '#e4e4e7' }}
              dangerouslySetInnerHTML={{ __html: digestContentModal }}
            />
            <button 
              onClick={() => setDigestContentModal(null)}
              className="user-switcher-wrap"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', marginTop: '10px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
            >
              Đóng Bản Tin
            </button>
          </div>
        </div>
      )}

      {/* Holiday & Weekend Settings Modal */}
      {isHolidaySettingsOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '650px', padding: '30px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh', overflowY: 'auto' }}>
            <button 
              onClick={() => setIsHolidaySettingsOpen(false)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <Settings size={22} style={{ color: '#f43f5e' }} />
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0, fontFamily: 'var(--font-title)' }}>Cấu hình Ngày Nghỉ & Ngày Lễ</h3>
            </div>

            {/* Weekend settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>1. Chọn Ngày Nghỉ Cuối Tuần</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { index: 1, label: 'Thứ 2' },
                  { index: 2, label: 'Thứ 3' },
                  { index: 3, label: 'Thứ 4' },
                  { index: 4, label: 'Thứ 5' },
                  { index: 5, label: 'Thứ 6' },
                  { index: 6, label: 'Thứ 7' },
                  { index: 0, label: 'Chủ Nhật' }
                ].map(day => {
                  const isChecked = weekendDays.includes(day.index);
                  return (
                    <button
                      key={day.index}
                      type="button"
                      onClick={() => handleToggleWeekendDay(day.index)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: isChecked ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                        background: isChecked ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        color: isChecked ? '#ef4444' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        readOnly 
                        style={{ accentColor: '#ef4444', pointerEvents: 'none', margin: 0, width: '12px', height: '12px' }}
                      />
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Holidays List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>2. Danh sách ngày nghỉ lễ ({holidays.length})</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.1)' }}>
                {holidays.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>Chưa cấu hình ngày nghỉ lễ nào.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {holidays.map(h => {
                      let dateDesc = '';
                      if (h.type === 'solar') {
                        dateDesc = `${String(h.day).padStart(2, '0')}/${String(h.month).padStart(2, '0')} (Dương lịch)`;
                      } else if (h.type === 'lunar') {
                        dateDesc = `${String(h.day).padStart(2, '0')}/${String(h.month).padStart(2, '0')} (Âm lịch)`;
                      } else if (h.type === 'single') {
                        const parts = h.dateStr.split('-');
                        dateDesc = `${parts[2]}/${parts[1]}/${parts[0]} (Ngày cụ thể)`;
                      }
                      return (
                        <div 
                          key={h.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '8px 12px', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                            fontSize: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: h.color }} />
                            <span style={{ fontWeight: '600', color: '#fff' }}>{h.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>— {dateDesc}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(h.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            title="Xóa ngày nghỉ"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Add Holiday Form */}
            <form onSubmit={handleAddHoliday} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', background: 'rgba(255, 255, 255, 0.01)' }}>
              <h4 style={{ fontSize: '12.5px', fontWeight: '700', color: '#fff', margin: 0 }}>Thêm Ngày Nghỉ Lễ Mới</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>TÊN NGÀY LỄ</label>
                  <input 
                    type="text"
                    required
                    value={newHolidayName}
                    onChange={e => setNewHolidayName(e.target.value)}
                    placeholder="Ví dụ: Giáng Sinh..."
                    style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', padding: '8px 12px', fontSize: '12px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>LOẠI NGÀY LỄ</label>
                  <select 
                    value={newHolidayType}
                    onChange={e => setNewHolidayType(e.target.value)}
                    style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', padding: '8px 12px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="solar" style={{ background: '#09090b' }}>Dương lịch hàng năm</option>
                    <option value="lunar" style={{ background: '#09090b' }}>Âm lịch hàng năm</option>
                    <option value="single" style={{ background: '#09090b' }}>Ngày cụ thể (Chỉ một năm)</option>
                  </select>
                </div>
              </div>

              {newHolidayType === 'single' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>CHỌN NGÀY CỤ THỂ</label>
                  <input 
                    type="date"
                    required
                    value={newHolidayDateStr}
                    onChange={e => setNewHolidayDateStr(e.target.value)}
                    style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', padding: '8px 12px', fontSize: '12px', outline: 'none', width: '100%' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>CHỌN NGÀY</label>
                    <select
                      value={newHolidayDay}
                      onChange={e => setNewHolidayDay(parseInt(e.target.value))}
                      style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', padding: '8px 12px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d} style={{ background: '#09090b' }}>Ngày {d}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>CHỌN THÁNG</label>
                    <select
                      value={newHolidayMonth}
                      onChange={e => setNewHolidayMonth(parseInt(e.target.value))}
                      style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', padding: '8px 12px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m} style={{ background: '#09090b' }}>Tháng {m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>MÀU SẮC NHÃN</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      '#f43f5e', // Rose
                      '#d97706', // Amber
                      '#10b981', // Emerald
                      '#8b5cf6', // Purple
                      '#06b6d4', // Cyan
                      '#3b82f6'  // Blue
                    ].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewHolidayColor(c)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: newHolidayColor === c ? '2px solid #fff' : '2px solid transparent',
                          boxShadow: newHolidayColor === c ? '0 0 8px ' + c : 'none',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'all 0.2s ease'
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="user-switcher-wrap"
                  style={{ padding: '8px 20px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '12px' }}
                >
                  Thêm Ngày Nghỉ
                </button>
              </div>
            </form>

            <button 
              type="button"
              onClick={() => setIsHolidaySettingsOpen(false)}
              className="user-switcher-wrap"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', marginTop: '10px', background: 'rgba(255, 255, 255, 0.05)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.08)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', textAlign: 'center' }}
            >
              Đóng Cài Đặt
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px 0 10px 0', fontSize: '11px', color: 'var(--text-muted)', borderTop: 'var(--glass-border)', marginTop: '20px' }}>
        Synapse Task Management Hub &copy; 2026. Phát triển bởi Antigravity AI Coding Assistant.
      </footer>
    </div>
  );
}
