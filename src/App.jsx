import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ToggleLeft, ToggleRight, Radio, Filter, RefreshCw, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import SmartInput from './components/SmartInput';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import TaskEditorModal from './components/TaskEditorModal';
import { USERS, parseTaskText } from './utils/nlpParser';

const INITIAL_TASKS = [
  {
    id: 't1',
    title: 'Thiết kế giao diện Landing Page (Mobile & Desktop)',
    assignee: USERS.find(u => u.username === 'lan'),
    priority: 'high',
    status: 'in_progress',
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // in 2 days
    creator: USERS.find(u => u.username === 'loc')
  },
  {
    id: 't2',
    title: 'Tối ưu hóa API Core và kết nối database',
    assignee: USERS.find(u => u.username === 'binh'),
    priority: 'high',
    status: 'todo',
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // in 3 days
    creator: USERS.find(u => u.username === 'loc')
  },
  {
    id: 't3',
    title: 'Viết tài liệu tích hợp API cho đối tác',
    assignee: USERS.find(u => u.username === 'loc'),
    priority: 'medium',
    status: 'review',
    dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // tomorrow
    creator: USERS.find(u => u.username === 'binh')
  },
  {
    id: 't4',
    title: 'Cài đặt và thiết lập cấu hình Repo CI/CD',
    assignee: USERS.find(u => u.username === 'huy'),
    priority: 'low',
    status: 'done',
    dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // yesterday
    creator: USERS.find(u => u.username === 'loc')
  }
];

const INITIAL_LOGS = [
  { id: 'l1', userName: 'Võ Vĩnh Lộc', action: 'đã tạo dự án "Synapse Collaboration"', time: '10 phút trước', type: 'system' },
  { id: 'l2', userName: 'Nguyễn Mai Lan', action: 'đã chuyển "Thiết kế giao diện Landing Page" sang Đang làm', time: '5 phút trước', type: 'move' },
  { id: 'l3', userName: 'Phạm Thanh Bình', action: 'đã gán "Tối ưu hóa API Core" cho bản thân', time: '2 phút trước', type: 'assign' }
];

export default function App() {
  const [activeUser, setActiveUser] = useState(USERS[0]); // Default to 'loc'
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('synapse_tasks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Restore dates and ensure all task IDs are unique to prevent key collision bugs
        const seenIds = new Set();
        return parsed.map(t => {
          let uniqueId = t.id;
          if (!uniqueId || seenIds.has(uniqueId)) {
            uniqueId = `${uniqueId || 'task'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          }
          seenIds.add(uniqueId);
          return {
            ...t,
            id: uniqueId,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            tags: t.tags || [],
            comments: t.comments || [],
            description: t.description || ''
          };
        });
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_TASKS;
  });

  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('synapse_logs');
    return saved ? JSON.parse(saved) : INITIAL_LOGS;
  });

  const [selectedTask, setSelectedTask] = useState(null);

  const [isSimulating, setIsSimulating] = useState(true);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mine'
  const [teamMembers, setTeamMembers] = useState(USERS);
  
  const simulationIntervalRef = useRef(null);

  // Persisted collapse state for AI Smart Input
  const [isSmartInputCollapsed, setIsSmartInputCollapsed] = useState(() => {
    return localStorage.getItem('synapse_smart_input_collapsed') === 'true';
  });

  // Persist Data
  useEffect(() => {
    localStorage.setItem('synapse_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('synapse_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('synapse_smart_input_collapsed', isSmartInputCollapsed);
  }, [isSmartInputCollapsed]);

  // Log action helper
  const addLog = (userName, action, type = 'info') => {
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      userName,
      action,
      time: timeStr,
      type
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]); // Cap at 50 logs
  };

  // Task operation functions
  const handleAddTask = (taskData) => {
    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title,
      assignee: taskData.assignee,
      priority: taskData.priority || 'medium',
      status: 'todo',
      dueDate: taskData.dueDate,
      tags: taskData.tags || [],
      description: '',
      comments: [],
      creator: taskData.creator
    };

    setTasks(prev => [newTask, ...prev]);
    addLog(taskData.creator.name, `đã tạo công việc "${taskData.title}" và gán cho ${taskData.assignee ? taskData.assignee.name : 'Chưa giao'}`, 'create');
  };

  const handleUpdateTask = (taskId, updates) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        // Compute what changed for logs
        if (updates.status && updates.status !== t.status) {
          const colNames = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang review', done: 'Hoàn thành' };
          addLog(activeUser.name, `đã chuyển "${t.title}" sang ${colNames[updates.status]}`, 'move');
        }
        if (updates.assignee && updates.assignee.id !== t.assignee?.id) {
          addLog(activeUser.name, `đã gán "${t.title}" cho ${updates.assignee.name}`, 'assign');
        }
        if (updates.priority && updates.priority !== t.priority) {
          const prioNames = { high: 'Khẩn cấp', medium: 'Vừa', low: 'Thấp' };
          addLog(activeUser.name, `đã đổi ưu tiên của "${t.title}" thành ${prioNames[updates.priority]}`, 'priority');
        }
        if (updates.title && updates.title !== t.title) {
          addLog(activeUser.name, `đã cập nhật tiêu đề công việc thành "${updates.title}"`, 'update');
        }
        if (updates.hasOwnProperty('dueDate')) {
          const dateStr = updates.dueDate ? updates.dueDate.toLocaleDateString('vi-VN') : 'vô thời hạn';
          addLog(activeUser.name, `đã đổi hạn chót của "${t.title}" thành ${dateStr}`, 'update');
        }

        const updatedTask = { ...t, ...updates };
        // Sync selected task in modal
        setSelectedTask(prevSelected => {
          if (prevSelected && prevSelected.id === taskId) {
            return updatedTask;
          }
          return prevSelected;
        });

        return updatedTask;
      }
      return t;
    }));
  };

  const handleDeleteTask = (taskId) => {
    const target = tasks.find(t => t.id === taskId);
    if (target) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      addLog(activeUser.name, `đã xóa công việc "${target.title}"`, 'delete');
    }
  };

  // Switch Active User Profile
  const handleSwitchUser = (userId) => {
    const user = USERS.find(u => u.id === userId);
    if (user) {
      setActiveUser(user);
      addLog(user.name, `đã đăng nhập vào hệ thống`, 'system');
    }
  };

  // Reset demo board
  const handleResetBoard = () => {
    setTasks(INITIAL_TASKS);
    setLogs(INITIAL_LOGS);
    localStorage.removeItem('synapse_tasks');
    localStorage.removeItem('synapse_logs');
    addLog(activeUser.name, `đã làm mới lại bảng công việc về mặc định`, 'system');
  };

  // ============================================
  // MULTI-USER REAL-TIME SIMULATION ENGINE
  // ============================================
  useEffect(() => {
    let timeoutId = null;

    if (!isSimulating) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      return;
    }

    // Set other team members online initially
    setTeamMembers(prev => prev.map(m => m.id !== activeUser.id ? { ...m, status: 'online' } : m));

    // Simulation loop
    simulationIntervalRef.current = setInterval(() => {
      // Pick a random simulated user (not the active logged-in user)
      const simulatedUsers = USERS.filter(u => u.id !== activeUser.id);
      if (simulatedUsers.length === 0) return;
      const simUser = simulatedUsers[Math.floor(Math.random() * simulatedUsers.length)];

      // 1. Simulate typing state first
      setTeamMembers(prev => prev.map(m => m.id === simUser.id ? { ...m, status: 'typing' } : m));

      // 2. Perform action after 3 seconds of typing
      timeoutId = setTimeout(() => {
        // Check if simulation is still active
        setIsSimulating(current => {
          if (!current) {
            setTeamMembers(prev => prev.map(m => m.id === simUser.id ? { ...m, status: 'online' } : m));
            return current;
          }

          // Return true to keep state, but perform side-effects
          // Pick one of three simulated actions:
          // A: Move an existing task assigned to them
          // B: Create a new task and assign to someone
          // C: Complete a task
          const randAction = Math.random();

          setTasks(currentTasks => {
            const userTasks = currentTasks.filter(t => t.assignee?.id === simUser.id && t.status !== 'done');
            
            if (randAction < 0.4 && userTasks.length > 0) {
              // Action A: Move a task
              const targetTask = userTasks[Math.floor(Math.random() * userTasks.length)];
              const nextStatusMap = { todo: 'in_progress', in_progress: 'review', review: 'done' };
              const newStatus = nextStatusMap[targetTask.status] || 'done';
              
              const colNames = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang review', done: 'Hoàn thành' };
              
              addLog(simUser.name, `đã chuyển "${targetTask.title}" sang ${colNames[newStatus]}`, 'move');
              
              return currentTasks.map(t => t.id === targetTask.id ? { ...t, status: newStatus } : t);
            } 
            else if (randAction < 0.8) {
              // Action B: Create a new task (NLP Simulation!)
              const taskPool = [
                `@binh #cao Kiểm tra lỗi bảo mật API`,
                `@lan #vua Thiết kế icon cho sidebar hôm nay`,
                `@loc #thap Xem qua kế hoạch phát triển mới`,
                `@huy #cao Sửa lỗi CSS trên giao diện Safari ngày mai`,
                `#vua Viết thêm Unit Test cho module login`
              ];

              const rawText = taskPool[Math.floor(Math.random() * taskPool.length)];
              const parsedSim = parseTaskText(rawText);

              const newSimTask = {
                id: `task-sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: parsedSim.cleanText,
                assignee: parsedSim.assignee || simUser,
                priority: parsedSim.priority,
                status: 'todo',
                dueDate: parsedSim.dueDate,
                creator: simUser
              };

              addLog(simUser.name, `đã tạo công việc "${parsedSim.cleanText}" và gán cho ${parsedSim.assignee ? parsedSim.assignee.name : simUser.name}`, 'create');
              return [newSimTask, ...currentTasks];
            }
            else {
              // Action C: Complete a review task
              const reviewTasks = currentTasks.filter(t => t.status === 'review');
              if (reviewTasks.length > 0) {
                const targetTask = reviewTasks[Math.floor(Math.random() * reviewTasks.length)];
                addLog(simUser.name, `đã xác nhận hoàn thành công việc "${targetTask.title}"`, 'move');
                return currentTasks.map(t => t.id === targetTask.id ? { ...t, status: 'done' } : t);
              }
            }

            return currentTasks; // No change if no matching condition met
          });

          // Reset user state to online
          setTeamMembers(prev => prev.map(m => m.id === simUser.id ? { ...m, status: 'online' } : m));
          return current;
        });

      }, 3000);

    }, 18000); // Trigger action every 18 seconds

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

  }, [isSimulating, activeUser]);

  // Filter tasks based on filter dropdown
  const filteredTasks = tasks.filter(task => {
    if (filterMode === 'mine') {
      return task.assignee?.id === activeUser.id;
    }
    return true;
  });

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
          {/* Simulation Toggle Switch */}
          <div className="sim-switch" title="Mô phỏng hoạt động làm việc của các thành viên khác để xem dòng cộng tác thời gian thực">
            <Radio size={14} className={isSimulating ? 'status-indicator typing' : ''} style={{ color: isSimulating ? '#10b981' : '#71717a' }} />
            <span>Mô phỏng cộng tác:</span>
            <button 
              className={`switch-btn ${isSimulating ? 'active' : ''}`}
              onClick={() => setIsSimulating(!isSimulating)}
            >
              <div className="switch-knob" />
            </button>
          </div>

          {/* User Account Switcher */}
          <div className="user-switcher-wrap">
            <span style={{ fontSize: '12px', color: '#a1a1aa', marginRight: '4px' }}>Vai trò:</span>
            <div className="user-selector">
              {USERS.map(user => (
                <button
                  key={user.id}
                  className="user-btn"
                  onClick={() => handleSwitchUser(user.id)}
                >
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className={`avatar ${activeUser.id === user.id ? 'active' : ''}`} 
                  />
                  <div className="tooltip">
                    <strong>{user.name}</strong>
                    <br />
                    <span>{user.role}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reset Board */}
          <button 
            onClick={handleResetBoard}
            className="user-switcher-wrap"
            style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', cursor: 'pointer', color: '#fca5a5' }}
            title="Làm sạch dữ liệu và khôi phục bảng mẫu"
          >
            <RefreshCw size={13} style={{ marginRight: '4px' }} />
            <span style={{ fontSize: '11px', fontWeight: '500' }}>Reset</span>
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
      <main className="dashboard-grid">
        {/* Board Canvas */}
        <section>
          <KanbanBoard 
            tasks={filteredTasks} 
            onUpdateTask={handleUpdateTask} 
            onDeleteTask={handleDeleteTask}
            onOpenTaskEditor={setSelectedTask}
          />
        </section>

        {/* Team Collaboration Sidebar */}
        <aside>
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
        />
      )}

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px 0 10px 0', fontSize: '11px', color: 'var(--text-muted)', borderTop: 'var(--glass-border)', marginTop: '20px' }}>
        Synapse Task Management Hub &copy; 2026. Phát triển bởi Antigravity AI Coding Assistant.
      </footer>
    </div>
  );
}
