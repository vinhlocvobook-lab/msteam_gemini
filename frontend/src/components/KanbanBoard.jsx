import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, ShieldAlert, User, UserCheck, Check, Clock, Edit2, ChevronLeft, ChevronRight, Plus, MessageSquare, ExternalLink, Link } from 'lucide-react';
import { USERS, PRIORITIES } from '../utils/nlpParser';

const COLUMNS = [
  { id: 'todo', title: 'Cần làm', color: '#8b5cf6' },
  { id: 'in_progress', title: 'Đang làm', color: '#06b6d4' },
  { id: 'review', title: 'Đang review', color: '#f59e0b' },
  { id: 'done', title: 'Hoàn thành', color: '#10b981' }
];

export default function KanbanBoard({ tasks, onUpdateTask, onDeleteTask, onOpenTaskEditor, teamMembers = USERS, activeUser }) {
  const canEditTask = (task) => {
    if (!activeUser) return false;
    if (activeUser.role === 'Admin') return true;
    const creatorId = task.creator?.id || task.creator_id || '';
    if (activeUser.role === 'Team_Leader') {
      return creatorId === activeUser.id || task.department_id === activeUser.department_id;
    }
    if (creatorId === activeUser.id) return true;
    
    // Check if current user is an assignee and has 'edit' permission
    const selfAssignee = task.assignees?.find(a => a.id === activeUser.id);
    return !!(selfAssignee && (selfAssignee.permission === 'edit' || !selfAssignee.permission));
  };

  const canDeleteTask = (task) => {
    if (!activeUser) return false;
    if (activeUser.role === 'Admin') return true;
    const creatorId = task.creator?.id || task.creator_id || '';
    if (activeUser.role === 'Team_Leader') {
      return creatorId === activeUser.id || task.department_id === activeUser.department_id;
    }
    return creatorId === activeUser.id;
  };
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumnId, setDragOverColumnId] = useState(null);
  const [activePopup, setActivePopup] = useState(null); // { taskId, type: 'assignee' | 'priority' }
  const [visibleDoneCount, setVisibleDoneCount] = useState(20);

  // Persisted collapse state for individual Kanban columns
  const [collapsedColumns, setCollapsedColumns] = useState(() => {
    const saved = localStorage.getItem('synapse_collapsed_columns');
    return saved ? JSON.parse(saved) : { todo: false, in_progress: false, review: false, done: false };
  });

  useEffect(() => {
    localStorage.setItem('synapse_collapsed_columns', JSON.stringify(collapsedColumns));
  }, [collapsedColumns]);

  const toggleColumn = (columnId) => {
    setCollapsedColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  // Drag and Drop handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    // Add transparent drag image or styling class in timeout
    setTimeout(() => {
      const card = document.getElementById(`card-${taskId}`);
      if (card) card.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (taskId) => {
    setDraggedTaskId(null);
    setDragOverColumnId(null);
    const card = document.getElementById(`card-${taskId}`);
    if (card) card.classList.remove('dragging');
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumnId(null);
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onUpdateTask(taskId, { status: columnId });
    }
    setDragOverColumnId(null);
  };

  // Inline edit handlers
  const handleTitleBlur = (taskId, e) => {
    const newTitle = e.target.innerText.trim();
    if (newTitle) {
      onUpdateTask(taskId, { title: newTitle });
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

  // Dropdown selectors
  const togglePopup = (taskId, type, e) => {
    e.stopPropagation();
    if (activePopup && activePopup.taskId === taskId && activePopup.type === type) {
      setActivePopup(null);
    } else {
      setActivePopup({ taskId, type });
    }
  };

  const handleSelectAssignee = (taskId, user) => {
    onUpdateTask(taskId, { assignee: user });
    setActivePopup(null);
  };

  const handleSelectPriority = (taskId, priorityId) => {
    onUpdateTask(taskId, { priority: priorityId });
    setActivePopup(null);
  };

  const handleSelectDate = (taskId, offsetDays) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    date.setHours(17, 0, 0, 0);
    onUpdateTask(taskId, { dueDate: date });
    setActivePopup(null);
  };

  const handleCustomDateChange = (taskId, e) => {
    const val = e.target.value;
    if (val) {
      const date = new Date(val);
      date.setHours(17, 0, 0, 0);
      onUpdateTask(taskId, { dueDate: date });
    } else {
      onUpdateTask(taskId, { dueDate: null });
    }
    setActivePopup(null);
  };

  // Helper date formatter
  const formatDateString = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  const isOverdue = (date, status) => {
    if (!date || status === 'done') return false;
    return new Date(date) < new Date();
  };

  // Build grid track template utilizing CSS variables
  const boardStyle = {
    '--col-todo': collapsedColumns['todo'] ? '60px' : 'minmax(250px, 1fr)',
    '--col-in_progress': collapsedColumns['in_progress'] ? '60px' : 'minmax(250px, 1fr)',
    '--col-review': collapsedColumns['review'] ? '60px' : 'minmax(250px, 1fr)',
    '--col-done': collapsedColumns['done'] ? '60px' : 'minmax(250px, 1fr)',
  };

  return (
    <div className="kanban-board" style={boardStyle} onClick={() => setActivePopup(null)}>
      {COLUMNS.map(col => {
        let colTasks = tasks.filter(t => t.status === col.id);
        if (col.id === 'done') {
          // Sort by updatedAt DESC or createdAt DESC
          colTasks = [...colTasks].sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt) : new Date(a.createdAt);
            const timeB = b.updatedAt ? new Date(b.updatedAt) : new Date(b.createdAt);
            return timeB - timeA;
          });
        }
        const displayedTasks = col.id === 'done' ? colTasks.slice(0, visibleDoneCount) : colTasks;
        const isColCollapsed = !!collapsedColumns[col.id];
        
        return (
          <div
            key={col.id}
            className={`kanban-column ${isColCollapsed ? 'collapsed' : ''} ${dragOverColumnId === col.id ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {isColCollapsed ? (
              <div className="collapsed-column-content">
                <button
                  className="column-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleColumn(col.id);
                  }}
                  title="Mở rộng cột"
                >
                  <ChevronRight size={14} />
                </button>
                <div className="collapsed-title-wrap">
                  <span className="column-dot" style={{ backgroundColor: col.color }} />
                  <h3 className="column-title rotated">{col.title}</h3>
                </div>
                <span className="column-count">{colTasks.length}</span>
              </div>
            ) : (
              <>
                {/* Column Header */}
                <div className="column-header">
                  <div className="column-title-wrap">
                    <span className="column-dot" style={{ backgroundColor: col.color }} />
                    <h3 className="column-title">{col.title}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="column-count">{colTasks.length}</span>
                    <button
                      className="column-toggle-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleColumn(col.id);
                      }}
                      title="Thu nhỏ cột"
                    >
                      <ChevronLeft size={14} />
                    </button>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="cards-container">
                  {displayedTasks.length === 0 ? (
                    <div className="empty-state">
                      <Clock size={16} />
                      <div className="empty-state-title">Chưa có việc</div>
                      <div className="empty-state-desc">Kéo việc vào hoặc gõ để tạo việc mới.</div>
                    </div>
                  ) : (
                    displayedTasks.map(task => {
                      const assignee = task.assignee;
                      const isTaskOverdue = isOverdue(task.dueDate, task.status);
                      
                      return (
                        <div
                          key={task.id}
                          id={`card-${task.id}`}
                          className={`task-card fade-in ${activePopup && activePopup.taskId === task.id ? 'active-popup' : ''}`}
                          draggable={canEditTask(task)}
                          onDragStart={(e) => {
                            if (!canEditTask(task)) {
                              e.preventDefault();
                              return;
                            }
                            handleDragStart(e, task.id);
                          }}
                          onDragEnd={() => handleDragEnd(task.id)}
                          onDoubleClick={() => onOpenTaskEditor(task)}
                        >
                          {/* Card Header Row */}
                          <div className="card-header-row">
                            <div
                              className="card-title"
                              contentEditable={canEditTask(task)}
                              suppressContentEditableWarning
                              onBlur={(e) => handleTitleBlur(task.id, e)}
                              onKeyDown={handleTitleKeyDown}
                              onClick={(e) => e.stopPropagation()} // Stop opening editor when clicking editable title
                            >
                              {task.title}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <button
                                className="card-edit-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenTaskEditor(task);
                                }}
                                title="Chỉnh sửa chi tiết"
                              >
                                <Edit2 size={11} />
                              </button>

                              {canDeleteTask(task) && (
                                <button
                                  className="card-delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteTask(task.id);
                                  }}
                                  title="Xóa công việc"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
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
                            {/* Creator Badge (Người giao việc) */}
                            {(() => {
                              const creator = task.creator || { 
                                name: task.creator_name || 'Hệ thống', 
                                avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&q=80',
                                role: ''
                              };
                              const lastName = creator.name ? creator.name.split(' ').pop() : 'N/A';

                              return (
                                <div 
                                  className="card-badge creator"
                                  style={{ 
                                    position: 'relative', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '2px 6px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)'
                                  }}
                                  title={`Người giao việc: ${creator.name}${creator.role ? ` (${creator.role})` : ''}`}
                                >
                                  <UserCheck size={10} style={{ color: '#a78bfa' }} />
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Giao:</span>
                                  {creator.avatar && (
                                    <img 
                                      src={creator.avatar} 
                                      alt={creator.name} 
                                      style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} 
                                    />
                                  )}
                                  <span style={{ fontSize: '10px', color: '#e4e4e7', fontWeight: '500' }}>{lastName}</span>
                                </div>
                              );
                            })()}

                            {/* Assignee Badge (Overlapping Stack) */}
                            <div 
                              className="card-badge assignee"
                              onClick={(e) => {
                                if (!canEditTask(task)) return;
                                togglePopup(task.id, 'assignee', e);
                              }}
                              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px' }}
                              title="Đổi người nhận"
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
        
                              {/* Assignee Selection Popup (Multi-Select) */}
                              {activePopup && activePopup.taskId === task.id && activePopup.type === 'assignee' && (
                                <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ minWidth: '180px' }}>
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
                                          onUpdateTask(task.id, { assignees: nextAssignees });
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px' }}
                                      >
                                        <input 
                                          type="checkbox" 
                                          checked={isAssigned} 
                                          readOnly 
                                          style={{ accentColor: '#8b5cf6', width: '12px', height: '12px', pointerEvents: 'none' }}
                                        />
                                        <img src={user.avatar} className="avatar" style={{ width: 18, height: 18, objectFit: 'cover' }} />
                                        <span style={{ flex: 1, textAlign: 'left' }}>{user.name}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Priority Badge */}
                            <div 
                              className={`card-badge priority-${task.priority}`}
                              onClick={(e) => {
                                if (!canEditTask(task)) return;
                                togglePopup(task.id, 'priority', e);
                              }}
                              style={{ position: 'relative' }}
                              title="Đổi độ ưu tiên"
                            >
                              <ShieldAlert size={10} />
                              <span>
                                {task.priority === 'high' ? 'Khẩn cấp' : task.priority === 'medium' ? 'Vừa' : 'Thấp'}
                              </span>

                              {/* Priority Selection Popup */}
                              {activePopup && activePopup.taskId === task.id && activePopup.type === 'priority' && (
                                <div className="inline-overlay" onClick={e => e.stopPropagation()}>
                                  <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>ĐỘ ƯU TIÊN</div>
                                  {PRIORITIES.map(prio => (
                                    <button
                                      key={prio.id}
                                      className={`inline-overlay-item ${task.priority === prio.id ? 'active' : ''}`}
                                      onClick={() => handleSelectPriority(task.id, prio.id)}
                                    >
                                      <span className="column-dot" style={{ backgroundColor: prio.color, width: 6, height: 6 }} />
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
                              onClick={(e) => {
                                if (!canEditTask(task)) return;
                                togglePopup(task.id, 'date', e);
                              }}
                              style={{ position: 'relative' }}
                              title="Đổi hạn chót"
                            >
                              <Calendar size={10} />
                              <span>
                                {task.dueDate ? formatDateString(task.dueDate) : 'Đặt hạn'}
                              </span>

                              {/* Date Selection Popup */}
                              {activePopup && activePopup.taskId === task.id && activePopup.type === 'date' && (
                                <div className="inline-overlay" onClick={e => e.stopPropagation()}>
                                  <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>CHỌN HẠN CHÓT</div>
                                  <button className="inline-overlay-item" onClick={() => handleSelectDate(task.id, 0)}>Hôm nay</button>
                                  <button className="inline-overlay-item" onClick={() => handleSelectDate(task.id, 1)}>Ngày mai</button>
                                  <button className="inline-overlay-item" onClick={() => handleSelectDate(task.id, 2)}>Sau 2 ngày</button>
                                  <button className="inline-overlay-item" onClick={() => handleSelectDate(task.id, 7)}>Tuần sau</button>
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

                            {/* Microsoft Teams Badge */}
                            {((task.teamsLinks && task.teamsLinks.length > 0) || task.teams_link) && (() => {
                              const linksList = (task.teamsLinks && task.teamsLinks.length > 0)
                                ? task.teamsLinks
                                : (task.teams_link ? [{ id: 'legacy', type: 'channel', teamsName: 'Kênh Teams', channelName: 'Microsoft Teams', channelLink: task.teams_link }] : []);

                              return (
                                <div 
                                  className="card-badge teams-badge"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePopup(task.id, 'teams', e);
                                  }}
                                  style={{
                                    position: 'relative',
                                    background: 'rgba(139, 92, 246, 0.12)',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    color: '#c084fc',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer'
                                  }}
                                  title="Xem & mở liên kết Microsoft Teams"
                                >
                                  <MessageSquare size={10} style={{ color: '#c084fc' }} />
                                  <span>Teams {linksList.length > 1 ? `(${linksList.length})` : ''}</span>

                                  {/* Teams Selection Popup */}
                                  {activePopup && activePopup.taskId === task.id && activePopup.type === 'teams' && (
                                    <div className="inline-overlay" onClick={e => e.stopPropagation()} style={{ minWidth: '220px', padding: '8px' }}>
                                      <div style={{ padding: '2px 4px 6px 4px', fontSize: '10px', color: '#a78bfa', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '6px' }}>
                                        LIÊN KẾT MICROSOFT TEAMS
                                      </div>
                                      {linksList.map(link => {
                                        const isChannel = link.type === 'channel';
                                        const titleText = isChannel 
                                          ? `${link.teamsName || 'Nhóm'} > ${link.channelName || 'Kênh'}` 
                                          : (link.chatName || 'Cuộc hội thoại');
                                        const linkUrl = isChannel ? (link.channelLink || task.teams_link) : (link.chatLink || task.teams_link);

                                        return (
                                          <div key={link.id || linkUrl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', marginBottom: '4px' }}>
                                            <span 
                                              style={{ fontSize: '11px', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}
                                              title={titleText}
                                            >
                                              {titleText}
                                            </span>
                                            {linkUrl ? (
                                              <a
                                                href={linkUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 8px', background: '#8b5cf6', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: '600', textDecoration: 'none' }}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <span>Mở</span>
                                                <ExternalLink size={9} />
                                              </a>
                                            ) : (
                                              <span style={{ fontSize: '10px', color: '#71717a' }}>Không có URL</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {col.id === 'done' && colTasks.length > visibleDoneCount && (
                    <button
                      className="load-more-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVisibleDoneCount(prev => prev + 20);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px dashed rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: 'var(--text-secondary)',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        marginTop: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <Plus size={14} style={{ color: 'var(--primary)' }} />
                      <span>Hiển thị thêm (+20)</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
