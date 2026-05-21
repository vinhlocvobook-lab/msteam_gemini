import React, { useState } from 'react';
import { Calendar, Trash2, ShieldAlert, User, Check, Clock, Edit2 } from 'lucide-react';
import { USERS, PRIORITIES } from '../utils/nlpParser';

const COLUMNS = [
  { id: 'todo', title: 'Cần làm', color: '#8b5cf6' },
  { id: 'in_progress', title: 'Đang làm', color: '#06b6d4' },
  { id: 'review', title: 'Đang review', color: '#f59e0b' },
  { id: 'done', title: 'Hoàn thành', color: '#10b981' }
];

export default function KanbanBoard({ tasks, onUpdateTask, onDeleteTask, onOpenTaskEditor }) {
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumnId, setDragOverColumnId] = useState(null);
  const [activePopup, setActivePopup] = useState(null); // { taskId, type: 'assignee' | 'priority' }

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

  return (
    <div className="kanban-board" onClick={() => setActivePopup(null)}>
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        
        return (
          <div
            key={col.id}
            className={`kanban-column ${dragOverColumnId === col.id ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {/* Column Header */}
            <div className="column-header">
              <div className="column-title-wrap">
                <span className="column-dot" style={{ backgroundColor: col.color }} />
                <h3 className="column-title">{col.title}</h3>
              </div>
              <span className="column-count">{colTasks.length}</span>
            </div>

            {/* Cards Container */}
            <div className="cards-container">
              {colTasks.length === 0 ? (
                <div className="empty-state">
                  <Clock size={16} />
                  <div className="empty-state-title">Chưa có việc</div>
                  <div className="empty-state-desc">Kéo việc vào hoặc gõ để tạo việc mới.</div>
                </div>
              ) : (
                colTasks.map(task => {
                  const assignee = task.assignee;
                  const isTaskOverdue = isOverdue(task.dueDate, task.status);
                  
                  return (
                    <div
                      key={task.id}
                      id={`card-${task.id}`}
                      className={`task-card fade-in ${activePopup && activePopup.taskId === task.id ? 'active-popup' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={() => handleDragEnd(task.id)}
                      onDoubleClick={() => onOpenTaskEditor(task)}
                    >
                      {/* Card Header Row */}
                      <div className="card-header-row">
                        <div
                          className="card-title"
                          contentEditable
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
                        {/* Assignee Badge */}
                        <div 
                          className="card-badge assignee"
                          onClick={(e) => togglePopup(task.id, 'assignee', e)}
                          style={{ position: 'relative' }}
                          title="Đổi người nhận"
                        >
                          {assignee ? (
                            <>
                              <img src={assignee.avatar} alt={assignee.name} className="avatar" style={{ width: 16, height: 16 }} />
                              <span>{assignee.name.split(' ').pop()}</span>
                            </>
                          ) : (
                            <>
                              <User size={10} />
                              <span>Chưa giao</span>
                            </>
                          )}

                          {/* Assignee Selection Popup */}
                          {activePopup && activePopup.taskId === task.id && activePopup.type === 'assignee' && (
                            <div className="inline-overlay" onClick={e => e.stopPropagation()}>
                              <div style={{ padding: '4px 8px', fontSize: '10px', color: '#71717a', fontWeight: 'bold' }}>GÁN NGƯỜI THỰC HIỆN</div>
                              {USERS.map(user => (
                                <button
                                  key={user.id}
                                  className={`inline-overlay-item ${task.assignee?.id === user.id ? 'active' : ''}`}
                                  onClick={() => handleSelectAssignee(task.id, user)}
                                >
                                  <img src={user.avatar} className="avatar" style={{ width: 18, height: 18 }} />
                                  <span style={{ flex: 1 }}>{user.name}</span>
                                  {task.assignee?.id === user.id && <Check size={12} />}
                                </button>
                              ))}
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
                          onClick={(e) => togglePopup(task.id, 'date', e)}
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
  );
}
