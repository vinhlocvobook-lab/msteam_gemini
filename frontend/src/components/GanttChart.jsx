import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, User, Clock, CheckCircle2, MoreHorizontal, Link as LinkIcon, Plus, Eye, Sparkles, ChevronDown } from 'lucide-react';

const ZOOM_LEVELS = [
  { id: 'day', label: 'Ngày', colWidth: 100, labelFormat: 'DD/MM' },
  { id: 'week', label: 'Tuần', colWidth: 140, labelFormat: 'W/YYYY' },
  { id: 'month', label: 'Tháng', colWidth: 180, labelFormat: 'MM/YYYY' }
];

export default function GanttChart({ tasks, onUpdateTask, onOpenTaskEditor, teamMembers, activeUser }) {
  const [zoom, setZoom] = useState('day');
  const [filterQuery, setFilterQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssignees, setFilterAssignees] = useState([]);
  const [userFilterMode, setUserFilterMode] = useState('pills'); // 'pills' | 'dropdown'
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [connections, setConnections] = useState([]);
  
  const filteredTeamMembers = useMemo(() => {
    if (!userSearchQuery) return teamMembers;
    const q = userSearchQuery.toLowerCase();
    return teamMembers.filter(member => 
      member.name.toLowerCase().includes(q) || 
      (member.role && member.role.toLowerCase().includes(q)) ||
      (member.username && member.username.toLowerCase().includes(q))
    );
  }, [teamMembers, userSearchQuery]);

  const timelineRef = useRef(null);
  const containerRef = useRef(null);
  
  const currentZoom = useMemo(() => ZOOM_LEVELS.find(z => z.id === zoom), [zoom]);

  // Normalize task dates and identify range
  const { processedTasks, minDate, maxDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let min = new Date(today);
    let max = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks default

    const processed = tasks.map(t => {
      let start = t.startDate ? new Date(t.startDate) : null;
      let due = t.dueDate ? new Date(t.dueDate) : null;
      let isUnscheduled = false;

      if (!start && !due) {
        // Fallback: start today, due tomorrow
        start = new Date(today);
        due = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        isUnscheduled = true;
      } else if (!start) {
        start = new Date(due.getTime() - 24 * 60 * 60 * 1000);
        isUnscheduled = true;
      } else if (!due) {
        due = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        isUnscheduled = true;
      }

      start.setHours(0, 0, 0, 0);
      due.setHours(23, 59, 59, 999);

      if (start.getTime() < min.getTime()) min = new Date(start);
      if (due.getTime() > max.getTime()) max = new Date(due);

      return {
        ...t,
        start,
        due,
        isUnscheduled
      };
    });

    // Add padding to range depending on zoom
    if (zoom === 'day') {
      min.setDate(min.getDate() - 3);
      max.setDate(max.getDate() + 5);
    } else if (zoom === 'week') {
      min.setDate(min.getDate() - 14);
      max.setDate(max.getDate() + 21);
    } else {
      min.setMonth(min.getMonth() - 1);
      max.setMonth(max.getMonth() + 2);
    }

    return { processedTasks: processed, minDate: min, maxDate: max };
  }, [tasks, zoom]);

  // Generate grid columns
  const columns = useMemo(() => {
    const cols = [];
    const curr = new Date(minDate);

    if (zoom === 'day') {
      while (curr <= maxDate) {
        cols.push({
          date: new Date(curr),
          label: curr.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' }),
          subLabel: curr.toLocaleDateString('vi-VN', { weekday: 'short' })
        });
        curr.setDate(curr.getDate() + 1);
      }
    } else if (zoom === 'week') {
      // Align to start of week (Monday)
      const day = curr.getDay();
      const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
      curr.setDate(diff);

      while (curr <= maxDate) {
        const endOfWeek = new Date(curr.getTime() + 6 * 24 * 60 * 60 * 1000);
        cols.push({
          date: new Date(curr),
          label: `T${curr.toLocaleDateString('vi-VN', { week: 'numeric' }) || ''}`,
          subLabel: `${curr.getDate()}/${curr.getMonth() + 1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}`
        });
        curr.setDate(curr.getDate() + 7);
      }
    } else {
      // Month
      curr.setDate(1);
      while (curr <= maxDate) {
        cols.push({
          date: new Date(curr),
          label: `Tháng ${curr.getMonth() + 1}`,
          subLabel: curr.getFullYear().toString()
        });
        curr.setMonth(curr.getMonth() + 1);
      }
    }
    return cols;
  }, [minDate, maxDate, zoom]);

  const timelineWidth = columns.length * currentZoom.colWidth;

  // Calculate pixel positioning factors
  const pxPerMs = useMemo(() => {
    const totalMs = maxDate.getTime() - minDate.getTime();
    return timelineWidth / totalMs;
  }, [minDate, maxDate, timelineWidth]);

  // Apply filters
  const filteredTasks = useMemo(() => {
    return processedTasks.filter(t => {
      const matchQuery = t.title.toLowerCase().includes(filterQuery.toLowerCase());
      const matchPrio = filterPriority === 'all' || t.priority === filterPriority;
      const matchStatus = filterStatus === 'all' || t.status === filterStatus;
      const matchAssignee = filterAssignees.length === 0 || (t.assignees && t.assignees.some(a => filterAssignees.includes(a.id)));
      return matchQuery && matchPrio && matchStatus && matchAssignee;
    });
  }, [processedTasks, filterQuery, filterPriority, filterStatus, filterAssignees]);

  // Draw dependencies SVG
  const calculatePaths = () => {
    const paths = [];
    filteredTasks.forEach(task => {
      if (task.dependencies) {
        const predecessorIds = task.dependencies.split(',').map(id => id.trim());
        predecessorIds.forEach(pId => {
          const predTask = processedTasks.find(t => t.id === pId);
          if (!predTask) return;

          const elPred = document.getElementById(`gantt-bar-${pId}`);
          const elSucc = document.getElementById(`gantt-bar-${task.id}`);

          if (elPred && elSucc && timelineRef.current) {
            const rectTimeline = timelineRef.current.getBoundingClientRect();
            const rectPred = elPred.getBoundingClientRect();
            const rectSucc = elSucc.getBoundingClientRect();

            // Calculate coordinates relative to timeline element
            const x1 = rectPred.right - rectTimeline.left + timelineRef.current.scrollLeft;
            const y1 = rectPred.top - rectTimeline.top + timelineRef.current.scrollTop + rectPred.height / 2;

            const x2 = rectSucc.left - rectTimeline.left + timelineRef.current.scrollLeft;
            const y2 = rectSucc.top - rectTimeline.top + timelineRef.current.scrollTop + rectSucc.height / 2;

            // Generate stepped connection line
            const midX = x1 + (x2 - x1) / 2;
            const path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;

            paths.push({
              id: `${pId}-${task.id}`,
              path,
              fromTitle: predTask.title,
              toTitle: task.title
            });
          }
        });
      }
    });
    setConnections(paths);
  };

  // Recalculate paths on render, zoom change, scroll, filter updates
  useLayoutEffect(() => {
    // Small delay to let DOM elements render and resolve layouts
    const timer = setTimeout(calculatePaths, 150);
    return () => clearTimeout(timer);
  }, [filteredTasks, zoom, timelineWidth]);

  // Re-calculate paths on timeline horizontal scrolling
  const handleScroll = () => {
    calculatePaths();
  };

  // Progress mapping helper
  const getProgressInfo = (status) => {
    switch (status) {
      case 'todo': return { percent: 15, text: 'Mới tạo', color: '#a78bfa' };
      case 'in_progress': return { percent: 50, text: 'Đang làm', color: '#06b6d4' };
      case 'review': return { percent: 80, text: 'Review', color: '#f59e0b' };
      case 'done': return { percent: 100, text: 'Hoàn thành', color: '#10b981' };
      default: return { percent: 0, text: 'Trống', color: '#71717a' };
    }
  };

  // Priority styling helper
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#3b82f6';
    }
  };

  return (
    <div className="glass-panel" ref={containerRef} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '600px', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={18} style={{ color: '#c084fc' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, fontFamily: 'var(--font-title)' }}>
            Biểu Đồ Gantt Dự Án
          </h2>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(192, 132, 252, 0.1)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.15)' }}>
            {filteredTasks.length} tác vụ
          </span>
        </div>

        {/* Filters and Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Quick text filter */}
          <input
            type="text"
            placeholder="Tìm nhanh..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'white',
              fontSize: '12px',
              outline: 'none',
              width: '150px',
              transition: 'all 0.2s'
            }}
          />

          {/* Priority filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'white',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">Mọi độ ưu tiên</option>
            <option value="high">Khẩn cấp</option>
            <option value="medium">Vừa</option>
            <option value="low">Thấp</option>
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'white',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">Mọi trạng thái</option>
            <option value="todo">Cần làm</option>
            <option value="in_progress">Đang làm</option>
            <option value="review">Review</option>
            <option value="done">Hoàn thành</option>
          </select>

          {/* User Filter Mode Switcher (Segmented Control) */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setUserFilterMode('pills');
                setIsUserDropdownOpen(false);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                background: userFilterMode === 'pills' ? 'var(--primary)' : 'transparent',
                color: userFilterMode === 'pills' ? 'white' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Lọc nhanh bằng danh sách Avatar"
            >
              <User size={12} />
              <span>Nhanh</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUserFilterMode('dropdown');
              }}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                background: userFilterMode === 'dropdown' ? 'var(--primary)' : 'transparent',
                color: userFilterMode === 'dropdown' ? 'white' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Lọc chi tiết bằng Dropdown checklist"
            >
              <ChevronDown size={12} />
              <span>Chi tiết</span>
            </button>
          </div>

          {/* User Filter Mode: Pills or Dropdown */}
          {userFilterMode === 'pills' ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px', flexShrink: 0 }}>Giao cho:</span>
              <div 
                className="no-scrollbar"
                style={{ 
                  display: 'flex', 
                  gap: '6px', 
                  overflowX: 'auto', 
                  maxWidth: '240px', 
                  padding: '2px 0', 
                  scrollbarWidth: 'none', 
                  msOverflowStyle: 'none' 
                }}
              >
                {teamMembers.map(member => {
                  const isActive = filterAssignees.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setFilterAssignees(prev =>
                          isActive ? prev.filter(id => id !== member.id) : [...prev, member.id]
                        );
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        borderRadius: '50%',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title={`Lọc theo ${member.name} (${member.role || 'Thành viên'})`}
                    >
                      <img
                        src={member.avatar}
                        alt={member.name}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: isActive ? `2px solid var(--primary)` : '2px solid transparent',
                          boxShadow: isActive ? '0 0 8px var(--primary-glow)' : 'none',
                          transition: 'all 0.2s ease',
                          opacity: isActive ? 1 : 0.4
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              {filterAssignees.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterAssignees([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f43f5e',
                    fontSize: '10px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginLeft: '8px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  Xóa
                </button>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setIsUserDropdownOpen(!isUserDropdownOpen);
                  setUserSearchQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              >
                <User size={12} style={{ color: '#c084fc' }} />
                <span>
                  {filterAssignees.length === 0 ? 'Mọi người thực hiện' : `Đã chọn (${filterAssignees.length})`}
                </span>
                <ChevronDown size={10} style={{ opacity: 0.6 }} />
              </button>

              {isUserDropdownOpen && (
                <>
                  <div 
                    onClick={() => {
                      setIsUserDropdownOpen(false);
                      setUserSearchQuery('');
                    }} 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                  />
                  <div 
                    className="glass-panel custom-scrollbar"
                    style={{
                      position: 'absolute',
                      top: '32px',
                      left: 0,
                      width: '290px',
                      maxHeight: '340px',
                      overflowY: 'auto',
                      zIndex: 999,
                      padding: '12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    {/* Search box inside dropdown */}
                    <input
                      type="text"
                      placeholder="Tìm thành viên..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: '11px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        marginBottom: '6px',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />

                    {/* Actions and Status Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '6px' }}>
                      <span>Thành viên ({filteredTeamMembers.length})</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                          type="button"
                          onClick={() => {
                            const visibleIds = filteredTeamMembers.map(m => m.id);
                            setFilterAssignees(prev => {
                              const next = [...prev];
                              visibleIds.forEach(id => {
                                if (!next.includes(id)) next.push(id);
                              });
                              return next;
                            });
                          }} 
                          style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '9px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
                        >
                          Chọn hết
                        </button>
                        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
                        <button 
                          type="button"
                          onClick={() => setFilterAssignees([])} 
                          style={{ background: 'none', border: 'none', color: '#f43f5e', fontSize: '9px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>

                    {/* Members checklist container */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '200px' }} className="custom-scrollbar">
                      {filteredTeamMembers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                          Không tìm thấy thành viên.
                        </div>
                      ) : (
                        filteredTeamMembers.map(member => {
                          const isChecked = filterAssignees.includes(member.id);
                          const isOnline = member.status !== 'offline';
                          const isTyping = member.status === 'typing';

                          return (
                            <label 
                              key={member.id} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                padding: '6px 8px', 
                                borderRadius: '8px', 
                                cursor: 'pointer',
                                background: isChecked ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (!isChecked) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isChecked) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setFilterAssignees(prev =>
                                    isChecked ? prev.filter(id => id !== member.id) : [...prev, member.id]
                                  );
                                }}
                                style={{ accentColor: '#8b5cf6', cursor: 'pointer' }}
                              />

                              {/* Avatar with Status indicator */}
                              <div style={{ position: 'relative', width: '22px', height: '22px', flexShrink: 0 }}>
                                <img 
                                  src={member.avatar} 
                                  alt={member.name} 
                                  style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
                                />
                                <span 
                                  className={`status-indicator ${isTyping ? 'typing' : isOnline ? 'online' : ''}`}
                                  style={{
                                    position: 'absolute',
                                    bottom: '-1px',
                                    right: '-1px',
                                    border: '1.5px solid #121214',
                                    width: '8px',
                                    height: '8px'
                                  }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {member.name}
                                  </span>
                                  {member.username && (
                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                      @{member.username}
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {member.role || 'Thành viên'}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />

          {/* Zoom Scales Selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {ZOOM_LEVELS.map(level => (
              <button
                key={level.id}
                onClick={() => setZoom(level.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: zoom === level.id ? 'var(--primary)' : 'transparent',
                  color: zoom === level.id ? 'white' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Gantt Container */}
      <div className="gantt-board-wrapper" style={{
        display: 'flex',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.01)',
        position: 'relative'
      }}>
        
        {/* Left Column: Tasks List (Sticky) */}
        <div style={{
          width: '320px',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9, 9, 11, 0.4)',
          zIndex: 10,
          boxShadow: '4px 0 12px rgba(0,0,0,0.1)'
        }}>
          {/* Header row */}
          <div style={{
            height: '52px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: '11px',
            fontWeight: '700',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Tên Công Việc / Người Thực Hiện
          </div>

          {/* Tasks Rows */}
          {filteredTasks.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
              Không có công việc nào.
            </div>
          ) : (
            filteredTasks.map(task => {
              const prioColor = getPriorityColor(task.priority);
              const progress = getProgressInfo(task.status);
              
              return (
                <div 
                  key={task.id} 
                  onDoubleClick={() => onOpenTaskEditor(task)}
                  style={{
                    height: '56px',
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                    const bar = document.getElementById(`gantt-bar-${task.id}`);
                    if (bar) bar.style.boxShadow = '0 0 12px var(--primary-glow)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    const bar = document.getElementById(`gantt-bar-${task.id}`);
                    if (bar) bar.style.boxShadow = 'none';
                  }}
                  title="Double-click để mở chi tiết công việc"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    {/* Priority dot indicator */}
                    <span style={{ 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%', 
                      backgroundColor: prioColor,
                      flexShrink: 0
                    }} />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        color: task.status === 'done' ? 'var(--text-muted)' : '#fff',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {task.title}
                      </span>
                      <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                        {task.startDate ? new Date(task.startDate).toLocaleDateString('vi-VN', {day: 'numeric', month: 'numeric'}) : '?'}{' - '}
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN', {day: 'numeric', month: 'numeric'}) : '?'}
                      </span>
                    </div>
                  </div>

                  {/* Assignees avatars list */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '8px', flexShrink: 0 }}>
                    {task.assignees && task.assignees.length > 0 ? (
                      task.assignees.slice(0, 2).map(ass => (
                        <img 
                          key={ass.id} 
                          src={ass.avatar} 
                          alt={ass.name} 
                          title={ass.name}
                          style={{ 
                            width: '20px', 
                            height: '20px', 
                            borderRadius: '50%', 
                            border: '1.5px solid rgba(255,255,255,0.1)', 
                            objectFit: 'cover' 
                          }} 
                        />
                      ))
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                        <User size={10} />
                      </span>
                    )}
                    {task.assignees && task.assignees.length > 2 && (
                      <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                        +{task.assignees.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Timeline Canvas (Scrollable) */}
        <div 
          ref={timelineRef}
          onScroll={handleScroll}
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            background: 'rgba(9, 9, 11, 0.25)',
            position: 'relative'
          }}
        >
          {/* SVG Connector overlay (draws connection paths) */}
          <svg style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${timelineWidth}px`,
            height: `${52 + filteredTasks.length * 56}px`,
            pointerEvents: 'none',
            zIndex: 4
          }}>
            <defs>
              <marker
                id="gantt-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(192, 132, 252, 0.45)" />
              </marker>
            </defs>
            {connections.map(conn => (
              <path
                key={conn.id}
                d={conn.path}
                fill="none"
                stroke="rgba(192, 132, 252, 0.3)"
                strokeWidth="1.5"
                markerEnd="url(#gantt-arrow)"
                strokeDasharray="4 2"
                style={{ transition: 'stroke 0.2s' }}
                title={`Công việc "${conn.fromTitle}" dẫn tới "${conn.toTitle}"`}
              />
            ))}
          </svg>

          <div style={{ width: `${timelineWidth}px` }}>
            
            {/* Timeline Header Row */}
            <div style={{
              height: '52px',
              display: 'flex',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: 'rgba(15, 15, 20, 0.9)',
              backdropFilter: 'blur(10px)'
            }}>
              {columns.map((col, idx) => {
                // Highlight today's column if in day mode
                const isToday = zoom === 'day' && col.date.toDateString() === new Date().toDateString();
                
                return (
                  <div 
                    key={idx} 
                    style={{
                      width: `${currentZoom.colWidth}px`,
                      flexShrink: 0,
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isToday ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: '700', color: isToday ? '#c084fc' : '#fafafa' }}>
                      {col.label}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      {col.subLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Timeline Rows */}
            {filteredTasks.map(task => {
              const prioColor = getPriorityColor(task.priority);
              const progress = getProgressInfo(task.status);
              
              // Calculate start and length in pixels
              const taskStartMs = task.start.getTime();
              const taskDueMs = task.due.getTime();
              
              const timelineStartMs = minDate.getTime();
              
              const leftPx = (taskStartMs - timelineStartMs) * pxPerMs;
              const widthPx = Math.max((taskDueMs - taskStartMs) * pxPerMs, 25); // Min 25px width so it is always visible

              return (
                <div 
                  key={task.id}
                  style={{
                    height: '56px',
                    position: 'relative',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={() => {
                    const rowText = document.getElementById(`gantt-bar-${task.id}`);
                    if (rowText) rowText.style.boxShadow = '0 0 12px var(--primary-glow)';
                  }}
                  onMouseLeave={() => {
                    const rowText = document.getElementById(`gantt-bar-${task.id}`);
                    if (rowText) rowText.style.boxShadow = 'none';
                  }}
                >
                  {/* Background Grid columns (just borders) */}
                  <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, bottom: 0, pointerEvents: 'none' }}>
                    {columns.map((_, idx) => (
                      <div key={idx} style={{ width: `${currentZoom.colWidth}px`, height: '100%', borderRight: '1px solid rgba(255,255,255,0.02)' }} />
                    ))}
                  </div>

                  {/* Gantt Bar Element */}
                  <div 
                    id={`gantt-bar-${task.id}`}
                    onDoubleClick={() => onOpenTaskEditor(task)}
                    style={{
                      position: 'absolute',
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                      height: '28px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: task.isUnscheduled 
                        ? '1px dashed rgba(239, 68, 68, 0.4)' 
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      cursor: 'pointer',
                      zIndex: 3,
                      transition: 'box-shadow 0.2s, transform 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scaleY(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {/* Inner progress fill bar */}
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${progress.percent}%`,
                      background: `linear-gradient(90deg, ${prioColor}22, ${prioColor}77)`,
                      borderRight: `2px solid ${prioColor}`,
                      zIndex: 1,
                      pointerEvents: 'none'
                    }} />

                    {/* Content inside Gantt bar */}
                    <div style={{
                      position: 'relative',
                      zIndex: 2,
                      width: '100%',
                      padding: '0 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: '600',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden'
                    }}>
                      <span style={{ 
                        textOverflow: 'ellipsis', 
                        overflow: 'hidden', 
                        whiteSpace: 'nowrap',
                        color: task.isUnscheduled ? '#fca5a5' : '#fff'
                      }}>
                        {task.isUnscheduled ? `⚠️ ${task.title} (Lên lịch tạm)` : task.title}
                      </span>
                      
                      {/* Percent text indicator */}
                      <span style={{ 
                        fontSize: '9px', 
                        color: 'rgba(255,255,255,0.7)',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '1px 4px',
                        borderRadius: '4px' 
                      }}>
                        {progress.percent}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Footer Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        fontSize: '11px',
        color: 'var(--text-muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            <span>Khẩn cấp</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
            <span>Ưu tiên vừa</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            <span>Ưu tiên thấp</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '16px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '6px', border: '1px dashed #ef4444', borderRadius: '2px' }}></span>
            <span>Tác vụ chưa lên lịch (Ước lượng tự động)</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={12} />
          <span>Double-click vào công việc bất kỳ để cập nhật thời hạn hoặc cấu hình mối liên hệ phụ thuộc.</span>
        </div>
      </div>

    </div>
  );
}
