import React, { useState, useEffect, useRef } from 'react';
import { X, User, Calendar, ShieldAlert, Tag, MessageSquare, ListTodo, Plus, HelpCircle, Link, Unlink, ExternalLink, MessageCircle, ChevronDown, Search, Check } from 'lucide-react';
import { USERS, PRIORITIES } from '../utils/nlpParser';
import { api } from '../utils/api';

const STATUS_OPTIONS = [
  { id: 'todo', label: 'Cần làm' },
  { id: 'in_progress', label: 'Đang làm' },
  { id: 'review', label: 'Đang review' },
  { id: 'done', label: 'Hoàn thành' }
];

// A beautiful, responsive custom searchable select component
function SearchableSelect({ value, onChange, options, placeholder = "Tìm kiếm...", emptyMessage = "Không tìm thấy kết quả" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  
  // Find current label
  const selectedOption = options.find(opt => opt.id === value);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || 'Chọn một tùy chọn...');

  // Toggle dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setSearchQuery('');
  };

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter options based on query (case-insensitive, accents-friendly Vietnamese search)
  const removeVietnameseTones = (str) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  };

  const filteredOptions = options.filter(opt => {
    if (!searchQuery) return true;
    const cleanLabel = removeVietnameseTones(opt.label.toLowerCase());
    const cleanQuery = removeVietnameseTones(searchQuery.toLowerCase());
    return cleanLabel.includes(cleanQuery);
  });

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <div 
        onClick={toggleDropdown}
        className="modal-select"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: isOpen ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: isOpen ? '0 0 10px rgba(139, 92, 246, 0.15)' : 'none',
          padding: '10px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          fontSize: '13px',
          color: selectedOption ? '#fff' : 'var(--text-muted)'
        }}
      >
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          flex: 1
        }}>
          {displayLabel}
        </span>
        <ChevronDown size={14} style={{ 
          color: 'var(--text-muted)',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          flexShrink: 0
        }} />
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: '#18181b', // solid matching select list background
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          borderRadius: '8px',
          zIndex: 1000,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          animation: 'slideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '6px 8px',
          }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input 
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nhập từ khóa tìm kiếm..."
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '11.5px',
                width: '100%',
                padding: 0
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '10px'
                }}
              >
                Xóa
              </button>
            )}
          </div>

          {/* Options List */}
          <div style={{
            maxHeight: '180px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent'
          }}>
            {filteredOptions.length === 0 ? (
              <div style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontStyle: 'italic'
              }}>
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.id === value;
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                      color: isSelected ? '#c084fc' : '#e4e4e7',
                      transition: 'all 0.15s ease',
                      fontWeight: isSelected ? '600' : 'normal'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1
                    }}>
                      {opt.label}
                    </span>
                    {isSelected && <Check size={12} style={{ color: '#c084fc', flexShrink: 0 }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskEditorModal({ task, onClose, onSave, activeUser, teamMembers = USERS }) {
  const [title, setTitle] = useState(task.title || '');
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status || 'todo');
  
  // Multi-assignees local state
  const [assigneeIds, setAssigneeIds] = useState(() => {
    if (task.assignees && Array.isArray(task.assignees)) {
      return task.assignees.map(a => a.id);
    }
    if (task.assignee) {
      return [task.assignee.id];
    }
    return [];
  });
  
  const [priority, setPriority] = useState(task.priority || 'medium');
  const formatDateTimeLocal = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [dueDate, setDueDate] = useState(() => formatDateTimeLocal(task.dueDate));
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(
    task.reminderBeforeMinutes !== undefined && task.reminderBeforeMinutes !== null
      ? task.reminderBeforeMinutes
      : 30
  );
  
  // Teams Integration local states (1-to-N upgrade)
  const [teamsLinks, setTeamsLinks] = useState(task.teamsLinks || []);

  // Teams Graph Picker UI local states
  const [showPicker, setShowPicker] = useState(false);
  const [pickerScope, setPickerScope] = useState('channel'); // 'channel' | 'chat'
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [pickerTeams, setPickerTeams] = useState([]);
  const [pickerChannels, setPickerChannels] = useState([]);
  const [pickerChats, setPickerChats] = useState([]);
  const [tempTeamId, setTempTeamId] = useState('');
  const [tempChannelId, setTempChannelId] = useState('');
  const [tempChatId, setTempChatId] = useState('');
  
  // Tags local state
  const [tags, setTags] = useState(task.tags || []);
  const [tagInput, setTagInput] = useState('');

  // Comments local state
  const [comments, setComments] = useState(task.comments || []);
  const [commentInput, setCommentInput] = useState('');

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase().replace(/#/g, '');
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    try {
      // Direct API persistence for comment
      const commentRes = await api.addTaskComment(task.id, commentInput.trim());
      const newComment = {
        id: commentRes.commentId || `comment-${Date.now()}`,
        author: activeUser,
        text: commentInput.trim(),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setComments([newComment, ...comments]);
      setCommentInput('');
    } catch (err) {
      alert('Không thể lưu bình luận: ' + err.message);
    }
  };

  const handleOpenPicker = async () => {
    setShowPicker(true);
    await loadPickerData(pickerScope);
  };

  const loadPickerData = async (scope) => {
    setPickerLoading(true);
    setPickerError('');
    try {
      if (scope === 'channel') {
        const teamsData = await api.getMsTeams();
        setPickerTeams(teamsData);
        if (teamsData.length > 0) {
          const firstTeamId = teamsData[0].id;
          setTempTeamId(firstTeamId);
          const channelsData = await api.getMsChannels(firstTeamId);
          setPickerChannels(channelsData);
          if (channelsData.length > 0) {
            setTempChannelId(channelsData[0].id);
          } else {
            setTempChannelId('');
          }
        } else {
          setTempTeamId('');
          setPickerChannels([]);
          setTempChannelId('');
        }
      } else {
        const chatsData = await api.getMsChats();
        setPickerChats(chatsData);
        if (chatsData.length > 0) {
          setTempChatId(chatsData[0].id);
        } else {
          setTempChatId('');
        }
      }
    } catch (err) {
      setPickerError(err.message || 'Không thể lấy dữ liệu từ Microsoft Graph.');
    } finally {
      setPickerLoading(false);
    }
  };

  const handleScopeChange = async (scope) => {
    setPickerScope(scope);
    await loadPickerData(scope);
  };

  const handleTeamChange = async (teamId) => {
    setTempTeamId(teamId);
    setPickerLoading(true);
    setPickerError('');
    try {
      const channelsData = await api.getMsChannels(teamId);
      setPickerChannels(channelsData);
      if (channelsData.length > 0) {
        setTempChannelId(channelsData[0].id);
      } else {
        setTempChannelId('');
      }
    } catch (err) {
      setPickerError('Không thể tải các Kênh cho nhóm này.');
    } finally {
      setPickerLoading(false);
    }
  };

  const handleConfirmPicker = () => {
    if (pickerScope === 'channel') {
      const selectedTeam = pickerTeams.find(t => t.id === tempTeamId);
      const selectedChannel = pickerChannels.find(c => c.id === tempChannelId);
      if (selectedChannel) {
        const convId = tempChannelId;
        // Anti-duplication check
        if (teamsLinks.some(link => link.conversationId === convId)) {
          alert('⚠️ Kênh Microsoft Teams này đã được liên kết với công việc này rồi!');
          return;
        }
        const newLink = {
          id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'channel',
          conversationId: convId,
          teamsId: tempTeamId || null,
          teamsName: selectedTeam ? selectedTeam.displayName : '',
          channelId: tempChannelId || null,
          channelName: selectedChannel.displayName || '',
          channelLink: selectedChannel.webUrl || '',
          chatId: null,
          chatName: null,
          chatLink: null
        };
        setTeamsLinks([...teamsLinks, newLink]);
      }
    } else {
      const selectedChat = pickerChats.find(c => c.id === tempChatId);
      if (selectedChat) {
        const convId = tempChatId;
        // Anti-duplication check
        if (teamsLinks.some(link => link.conversationId === convId)) {
          alert('⚠️ Cuộc trò chuyện này đã được liên kết với công việc này rồi!');
          return;
        }
        const newLink = {
          id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'chat',
          conversationId: convId,
          teamsId: null,
          teamsName: null,
          channelId: null,
          channelName: null,
          channelLink: null,
          chatId: tempChatId || null,
          chatName: selectedChat.topic || '',
          chatLink: selectedChat.webUrl || ''
        };
        setTeamsLinks([...teamsLinks, newLink]);
      }
    }
    setShowPicker(false);
  };

  const handleRemoveLink = (linkId) => {
    setTeamsLinks(teamsLinks.filter(l => l.id !== linkId));
  };

  const handleSave = () => {
    const selectedAssigneeObjects = teamMembers.filter(u => assigneeIds.includes(u.id));
    const parsedDate = dueDate ? new Date(dueDate) : null;

    onSave(task.id, {
      title: title.trim() || 'Nhiệm vụ không tên',
      description: description.trim(),
      status,
      assignees: selectedAssigneeObjects,
      priority,
      dueDate: parsedDate,
      reminderBeforeMinutes: reminderBeforeMinutes === -1 ? null : reminderBeforeMinutes,
      tags,
      comments,
      teamsLinks
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-wrapper glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px 10px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc' }}>
            <ListTodo size={18} />
            <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-title)' }}>Chi tiết công việc</span>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '50%' }}
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Grid Layout */}
        <div className="modal-grid">
          {/* Main content column (Left) */}
          <div className="modal-main">
            {/* Title */}
            <div className="modal-field">
              <input 
                type="text" 
                className="modal-title-input" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập tiêu đề công việc..."
              />
            </div>

            {/* Description */}
            <div className="modal-field">
              <label className="modal-label">Mô tả công việc</label>
              <textarea 
                className="modal-textarea" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Thêm mô tả chi tiết về nội dung công việc, yêu cầu hoặc ghi chú..."
              />
            </div>

            {/* Comments Stream */}
            <div className="comments-container">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={13} style={{ color: 'var(--primary)' }} />
                Thảo luận ({comments.length})
              </label>

              {/* Comment Input */}
              <form onSubmit={handlePostComment} className="comment-input-wrap">
                <input 
                  type="text" 
                  className="comment-input" 
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Viết bình luận, nhấn Enter để gửi..."
                />
                <button type="submit" className="comment-send-btn">Gửi</button>
              </form>

              {/* Comment List */}
              <div className="comments-list">
                {comments.length === 0 ? (
                  <div style={{ padding: '16px 0', textLight: 'center', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Chưa có thảo luận nào. Hãy bắt đầu cuộc trò chuyện!
                  </div>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="comment-card">
                      <img src={c.author?.avatar} alt={c.author?.name} className="comment-avatar" />
                      <div className="comment-body">
                        <div className="comment-meta">
                          <span className="comment-author">{c.author?.name}</span>
                          <span className="comment-time">{c.time}</span>
                        </div>
                        <div className="comment-text">{c.text}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar options column (Right) */}
          <div className="modal-sidebar">
            {/* Status */}
            <div className="modal-field">
              <label className="modal-label">Trạng thái</label>
              <select 
                className="modal-select" 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Assignee Checklist */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={12} />
                Người thực hiện ({assigneeIds.length})
              </label>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                scrollbarWidth: 'thin'
              }}>
                {teamMembers.map(u => {
                  const isChecked = assigneeIds.includes(u.id);
                  return (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: isChecked ? '#fff' : 'var(--text-secondary)', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssigneeIds([...assigneeIds, u.id]);
                          } else {
                            setAssigneeIds(assigneeIds.filter(id => id !== u.id));
                          }
                        }}
                        style={{
                          accentColor: '#8b5cf6',
                          width: '13px',
                          height: '13px',
                          cursor: 'pointer'
                        }}
                      />
                      <img src={u.avatar} alt={u.name} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.name} <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>({u.role})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldAlert size={12} />
                Độ ưu tiên
              </label>
              <select 
                className="modal-select" 
                value={priority} 
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} />
                Hạn chót
              </label>
              <input 
                type="datetime-local"
                className="modal-select"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Reminder Config */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldAlert size={12} />
                Nhắc nhở
              </label>
              <select 
                className="modal-select" 
                value={reminderBeforeMinutes !== null ? reminderBeforeMinutes : -1} 
                onChange={(e) => {
                  const val = e.target.value;
                  setReminderBeforeMinutes(val === '-1' ? null : Number(val));
                }}
              >
                <option value="-1">Không nhắc nhở</option>
                <option value="15">Trước 15 phút</option>
                <option value="30">Trước 30 phút (Mặc định)</option>
                <option value="60">Trước 1 giờ</option>
                <option value="120">Trước 2 giờ</option>
                <option value="1440">Trước 1 ngày</option>
              </select>
            </div>

            {/* Microsoft Teams Sync Integration (1-to-N upgraded) */}
            <div className="modal-field" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Link size={12} style={{ color: '#8b5cf6' }} />
                  Liên kết Teams ({teamsLinks.length})
                </label>
                {teamsLinks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#a78bfa',
                      fontSize: '10px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#c084fc'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#a78bfa'}
                  >
                    <Plus size={10} />
                    Thêm liên kết
                  </button>
                )}
              </div>

              {teamsLinks.length === 0 ? (
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(139, 92, 246, 0.06)',
                    border: '1px dashed rgba(139, 92, 246, 0.3)',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#c084fc',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
                    e.currentTarget.style.borderStyle = 'solid';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                    e.currentTarget.style.borderStyle = 'dashed';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <MessageCircle size={13} />
                  Liên kết Microsoft Teams
                </button>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(139, 92, 246, 0.3) rgba(255,255,255,0.02)'
                }}>
                  {teamsLinks.map(link => {
                    const isChannel = link.type === 'channel';
                    const titleText = isChannel 
                      ? `${link.teamsName || 'Nhóm'} > ${link.channelName || 'Kênh'}` 
                      : (link.chatName || 'Cuộc hội thoại');
                    const linkUrl = isChannel ? link.channelLink : link.chatLink;
                    const displayId = isChannel ? link.channelId : link.chatId;

                    return (
                      <div key={link.id} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px 12px',
                        background: 'rgba(139, 92, 246, 0.04)',
                        border: '1px solid rgba(139, 92, 246, 0.15)',
                        borderRadius: '10px',
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                          {isChannel ? (
                            <Link size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
                          ) : (
                            <MessageCircle size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
                          )}
                          <span 
                            style={{ 
                              fontSize: '11px', 
                              fontWeight: '600', 
                              color: '#fff',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1 
                            }}
                            title={titleText}
                          >
                            {titleText}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                            ID: {displayId}
                          </span>
                          
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {linkUrl && (
                              <a 
                                href={linkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '4px 8px',
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  borderRadius: '6px',
                                  fontSize: '10px',
                                  color: '#a78bfa',
                                  textDecoration: 'none',
                                  fontWeight: '500',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                              >
                                <ExternalLink size={10} style={{ marginRight: '3px' }} />
                                Mở
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveLink(link.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 8px',
                                background: 'rgba(239, 68, 68, 0.06)',
                                border: '1px solid rgba(239, 68, 68, 0.12)',
                                borderRadius: '6px',
                                fontSize: '10px',
                                color: '#fca5a5',
                                cursor: 'pointer',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.12)';
                              }}
                            >
                              <Unlink size={10} style={{ marginRight: '3px' }} />
                              Hủy
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tags list and editor */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Tag size={12} />
                Thẻ / Nhãn (#)
              </label>
              <div className="modal-tags-editor">
                {tags.map(tag => (
                  <span key={tag} className="modal-tag-badge">
                    #{tag}
                    <button 
                      type="button" 
                      className="modal-tag-remove" 
                      onClick={() => handleRemoveTag(tag)}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input 
                  type="text" 
                  className="modal-tag-input" 
                  placeholder="+ Thêm thẻ..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                />
              </div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>Gõ tên tag và nhấn Enter để thêm nhanh</span>
            </div>

            {/* Microsoft Teams Graph Picker Dialog Overlay */}
            {showPicker && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(9, 9, 11, 0.85)',
                backdropFilter: 'blur(8px)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                borderRadius: '24px',
                animation: 'fadeIn 0.2s ease'
              }}>
                <div className="glass-panel" style={{
                  width: '100%',
                  maxWidth: '380px',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <MessageCircle size={15} />
                      Microsoft Teams Picker
                    </h3>
                    <button 
                      type="button"
                      onClick={() => setShowPicker(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Scope Selector Tabs */}
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '8px', marginBottom: '16px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('channel')}
                      style={{
                        flex: 1,
                        background: pickerScope === 'channel' ? 'var(--primary)' : 'none',
                        border: 'none',
                        color: pickerScope === 'channel' ? 'white' : 'var(--text-secondary)',
                        fontSize: '11px',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Kênh Kênh Teams
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('chat')}
                      style={{
                        flex: 1,
                        background: pickerScope === 'chat' ? 'var(--primary)' : 'none',
                        border: 'none',
                        color: pickerScope === 'chat' ? 'white' : 'var(--text-secondary)',
                        fontSize: '11px',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Trò chuyện
                    </button>
                  </div>

                  {pickerLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '10px' }}>
                      <div style={{ border: '2px solid rgba(255,255,255,0.05)', borderRadius: '50%', borderTop: '2px solid #8b5cf6', width: '20px', height: '20px', animation: 'spin 1s linear infinite' }}></div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Đang tải thiết lập...</span>
                    </div>
                  ) : pickerError ? (
                    <div style={{ padding: '16px 0', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: '#fca5a5', marginBottom: '10px' }}>⚠️ {pickerError}</p>
                      <button 
                        type="button" 
                        onClick={() => loadPickerData(pickerScope)} 
                        className="btn-secondary" 
                        style={{ fontSize: '10px', padding: '6px 12px' }}
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {pickerScope === 'channel' ? (
                        <>
                          {/* Teams Select */}
                          <div className="modal-field">
                            <label className="modal-label">Chọn Nhóm (Team)</label>
                            {pickerTeams.length === 0 ? (
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Không tìm thấy nhóm nào.</p>
                            ) : (
                              <SearchableSelect
                                value={tempTeamId}
                                onChange={handleTeamChange}
                                options={pickerTeams.map(t => ({ id: t.id, label: t.displayName }))}
                                placeholder="Chọn Nhóm..."
                                emptyMessage="Không tìm thấy nhóm nào"
                              />
                            )}
                          </div>

                          {/* Channel Select */}
                          <div className="modal-field">
                            <label className="modal-label">Chọn Kênh (Channel)</label>
                            {pickerChannels.length === 0 ? (
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Không tìm thấy kênh nào.</p>
                            ) : (
                              <SearchableSelect
                                value={tempChannelId}
                                onChange={setTempChannelId}
                                options={pickerChannels.map(c => ({ id: c.id, label: c.displayName }))}
                                placeholder="Chọn Kênh..."
                                emptyMessage="Không tìm thấy kênh nào"
                              />
                            )}
                          </div>
                        </>
                      ) : (
                        /* Chats Select */
                        <div className="modal-field">
                          <label className="modal-label">Chọn Cuộc trò chuyện (Chat)</label>
                          {pickerChats.length === 0 ? (
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Không tìm thấy cuộc trò chuyện nào.</p>
                          ) : (
                            <SearchableSelect
                              value={tempChatId}
                              onChange={setTempChatId}
                              options={pickerChats.map(c => ({ id: c.id, label: c.topic }))}
                              placeholder="Chọn Cuộc trò chuyện..."
                              emptyMessage="Không tìm thấy cuộc trò chuyện nào"
                            />
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button 
                          type="button"
                          className="btn-secondary" 
                          style={{ flex: 1, padding: '8px', fontSize: '11px' }}
                          onClick={() => setShowPicker(false)}
                        >
                          Hủy
                        </button>
                        <button 
                          type="button"
                          className="btn-primary" 
                          style={{ flex: 1, padding: '8px', fontSize: '11px' }}
                          onClick={handleConfirmPicker}
                          disabled={pickerScope === 'channel' ? !tempChannelId : !tempChatId}
                        >
                          Liên kết ngay
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-primary" onClick={handleSave}>Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
}
