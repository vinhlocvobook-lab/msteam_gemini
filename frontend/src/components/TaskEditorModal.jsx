import React, { useState, useEffect, useRef } from 'react';
import { X, User, Calendar, ShieldAlert, Tag, MessageSquare, ListTodo, Plus, HelpCircle, Link, Unlink, ExternalLink, MessageCircle, ChevronDown, Search, Check, UserPlus, UserMinus, FileText, ArrowRight, Clock } from 'lucide-react';
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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
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

  // Reset highlight index when query or open state changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, isOpen]);

  // Handle keyboard events for premium navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        onChange(filteredOptions[highlightedIndex].id);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

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
              onKeyDown={handleKeyDown}
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
              filteredOptions.map((opt, index) => {
                const isSelected = opt.id === value;
                const isHighlighted = index === highlightedIndex;
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
                      background: isSelected 
                        ? 'rgba(139, 92, 246, 0.15)' 
                        : (isHighlighted ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
                      color: isSelected ? '#c084fc' : (isHighlighted ? '#fff' : '#e4e4e7'),
                      transition: 'all 0.15s ease',
                      fontWeight: isSelected ? '600' : 'normal'
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
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

export default function TaskEditorModal({ task, onClose, onSave, activeUser, teamMembers = USERS, tasks = [] }) {
  const hasFullControl = (() => {
    if (!activeUser) return false;
    if (activeUser.role === 'Admin') return true;
    const creatorId = task.creator?.id || task.creator_id || '';
    if (activeUser.role === 'Team_Leader') {
      return creatorId === activeUser.id || task.department_id === activeUser.department_id;
    }
    return creatorId === activeUser.id;
  })();

  const canEdit = (() => {
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
  })();

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
  const [assigneePermissions, setAssigneePermissions] = useState(() => {
    const perms = {};
    if (task.assignees && Array.isArray(task.assignees)) {
      task.assignees.forEach(a => {
        perms[a.id] = a.permission || 'edit';
      });
    }
    return perms;
  });
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  
  const [priority, setPriority] = useState(task.priority || 'medium');
  const formatDateTimeLocal = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startDate, setStartDate] = useState(() => formatDateTimeLocal(task.startDate));
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
  
  // Dependencies local state
  const [dependencies, setDependencies] = useState(task.dependencies || '');

  // Circular dependency check helper
  const isCircularDependency = (candidateId) => {
    let currentId = candidateId;
    const visited = new Set();
    while (currentId) {
      if (currentId === task.id) return true;
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const parentTask = tasks.find(t => t.id === currentId);
      currentId = parentTask ? parentTask.dependencies : null;
    }
    return false;
  };

  // Tags local state
  const [tags, setTags] = useState(task.tags || []);
  const [tagInput, setTagInput] = useState('');

  // Comments local state
  const [comments, setComments] = useState(task.comments || []);
  const [commentInput, setCommentInput] = useState('');

  // Task Activities local state (Change logs timeline)
  const [activeTab, setActiveTab] = useState('discussion'); // 'discussion' | 'activities'
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const loadActivities = async () => {
    if (!task.id) return;
    setActivitiesLoading(true);
    try {
      const data = await api.getTaskActivities(task.id);
      setActivities(data);
    } catch (err) {
      console.error('Failed to fetch task activities:', err.message);
    } finally {
      setActivitiesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activities') {
      loadActivities();
    }
  }, [task.id, activeTab]);

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
      
      // Auto refresh activities if currently active
      if (activeTab === 'activities') {
        loadActivities();
      }
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

  const handleConfirmPicker = async () => {
    let newLink = null;
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
        newLink = {
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
        newLink = {
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
      }
    }

    if (newLink) {
      const updatedLinks = [...teamsLinks, newLink];
      setTeamsLinks(updatedLinks);
      try {
        await api.updateTask(task.id, { teamsLinks: updatedLinks });
        // Auto refresh activities if currently active
        if (activeTab === 'activities') {
          loadActivities();
        }
      } catch (err) {
        alert('Không thể lưu liên kết Microsoft Teams: ' + err.message);
      }
    }
    setShowPicker(false);
  };

  const handleRemoveLink = async (linkId) => {
    const updatedLinks = teamsLinks.filter(l => l.id !== linkId);
    setTeamsLinks(updatedLinks);
    try {
      await api.updateTask(task.id, { teamsLinks: updatedLinks });
      // Auto refresh activities if currently active
      if (activeTab === 'activities') {
        loadActivities();
      }
    } catch (err) {
      alert('Không thể cập nhật liên kết Microsoft Teams: ' + err.message);
    }
  };

  const handleSave = () => {
    const selectedAssigneeObjects = teamMembers
      .filter(u => assigneeIds.includes(u.id))
      .map(u => ({
        ...u,
        permission: assigneePermissions[u.id] || 'edit'
      }));
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedDate = dueDate ? new Date(dueDate) : null;

    onSave(task.id, {
      title: title.trim() || 'Nhiệm vụ không tên',
      description: description.trim(),
      status,
      assignees: selectedAssigneeObjects,
      priority,
      startDate: parsedStartDate,
      dueDate: parsedDate,
      reminderBeforeMinutes: reminderBeforeMinutes === -1 ? null : reminderBeforeMinutes,
      tags,
      comments,
      teamsLinks,
      dependencies
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
                disabled={!canEdit}
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
                disabled={!canEdit}
              />
            </div>

            {/* Tab Switched Header */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '16px',
              gap: '24px',
              paddingBottom: '2px'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('discussion')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'discussion' ? '2px solid #a78bfa' : '2px solid transparent',
                  color: activeTab === 'discussion' ? '#c084fc' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '8px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
              >
                <MessageSquare size={13} style={{ color: activeTab === 'discussion' ? '#c084fc' : 'var(--text-muted)' }} />
                Thảo luận ({comments.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('activities')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'activities' ? '2px solid #a78bfa' : '2px solid transparent',
                  color: activeTab === 'activities' ? '#c084fc' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '8px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
              >
                <ListTodo size={13} style={{ color: activeTab === 'activities' ? '#c084fc' : 'var(--text-muted)' }} />
                Nhật ký hoạt động
              </button>
            </div>

            {activeTab === 'discussion' ? (
              <div className="comments-container" style={{ marginTop: 0 }}>
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
                    <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
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
            ) : (
              <div className="activities-container" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '8px 0',
                maxHeight: '400px',
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                position: 'relative'
              }}>
                {activitiesLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: '12px' }}>
                    <div style={{ border: '2px solid rgba(255,255,255,0.05)', borderRadius: '50%', borderTop: '2px solid #8b5cf6', width: '24px', height: '24px', animation: 'spin 1s linear infinite' }}></div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Đang tải lịch sử hoạt động...</span>
                  </div>
                ) : activities.length === 0 ? (
                  <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Chưa ghi nhận hoạt động nào cho công việc này.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '16px', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                    {activities.map((act) => {
                      let ActionIcon = HelpCircle;
                      let iconBgColor = 'rgba(255,255,255,0.05)';
                      let iconColor = 'var(--text-muted)';

                      if (act.action_type === 'create') {
                        ActionIcon = Plus;
                        iconBgColor = 'rgba(16, 185, 129, 0.15)';
                        iconColor = '#10b981';
                      } else if (act.action_type === 'delete') {
                        ActionIcon = X;
                        iconBgColor = 'rgba(244, 63, 94, 0.15)';
                        iconColor = '#f43f5e';
                      } else if (act.action_type === 'restore') {
                        ActionIcon = Check;
                        iconBgColor = 'rgba(16, 185, 129, 0.15)';
                        iconColor = '#10b981';
                      } else if (act.action_type === 'add_comment') {
                        ActionIcon = MessageSquare;
                        iconBgColor = 'rgba(59, 130, 246, 0.15)';
                        iconColor = '#3b82f6';
                      } else if (act.action_type === 'add_assignee') {
                        ActionIcon = UserPlus;
                        iconBgColor = 'rgba(139, 92, 246, 0.15)';
                        iconColor = '#a78bfa';
                      } else if (act.action_type === 'remove_assignee') {
                        ActionIcon = UserMinus;
                        iconBgColor = 'rgba(244, 63, 94, 0.15)';
                        iconColor = '#f43f5e';
                      } else if (act.action_type === 'add_tag') {
                        ActionIcon = Tag;
                        iconBgColor = 'rgba(139, 92, 246, 0.15)';
                        iconColor = '#a78bfa';
                      } else if (act.action_type === 'remove_tag') {
                        ActionIcon = Tag;
                        iconBgColor = 'rgba(244, 63, 94, 0.15)';
                        iconColor = '#fca5a5';
                      } else if (act.action_type === 'add_link') {
                        ActionIcon = Link;
                        iconBgColor = 'rgba(139, 92, 246, 0.15)';
                        iconColor = '#a78bfa';
                      } else if (act.action_type === 'remove_link') {
                        ActionIcon = Unlink;
                        iconBgColor = 'rgba(244, 63, 94, 0.15)';
                        iconColor = '#fca5a5';
                      } else if (act.action_type === 'update_field') {
                        ActionIcon = FileText;
                        iconBgColor = 'rgba(245, 158, 11, 0.15)';
                        iconColor = '#f59e0b';
                      }

                      const dateObj = new Date(act.created_at);
                      const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                      const dateStr = dateObj.toLocaleDateString('vi-VN');

                      return (
                        <div key={act.id} style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                          <div style={{
                            position: 'absolute',
                            left: '-28px',
                            top: '2px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: iconBgColor,
                            border: `1px solid ${iconColor}22`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1
                          }}>
                            <ActionIcon size={12} style={{ color: iconColor }} />
                          </div>

                          <div style={{
                            flex: 1,
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            transition: 'transform 0.2s ease, border 0.2s ease',
                            cursor: 'default'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                            e.currentTarget.style.transform = 'none';
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <img 
                                src={act.user_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&q=80'} 
                                alt={act.user_name} 
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: `1.5px solid ${act.user_color || '#8b5cf6'}`
                                }}
                              />
                              <span style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>
                                {act.user_name}
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {act.description}
                              </span>
                            </div>

                            {act.action_type === 'update_field' && act.field_changed && act.old_value !== null && act.new_value !== null && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                background: 'rgba(255,255,255,0.01)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.03)',
                                width: 'fit-content',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{
                                  color: '#fca5a5',
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(239, 68, 68, 0.12)'
                                }}>
                                  {act.old_value || 'Trống'}
                                </span>
                                <ArrowRight size={10} style={{ color: 'var(--text-muted)' }} />
                                <span style={{
                                  color: '#a7f3d0',
                                  background: 'rgba(16, 185, 129, 0.08)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(16, 185, 129, 0.12)'
                                }}>
                                  {act.new_value || 'Trống'}
                                </span>
                              </div>
                            )}

                            {act.action_type === 'add_comment' && act.new_value && (
                              <div style={{
                                fontSize: '11.5px',
                                color: '#fff',
                                background: 'rgba(255,255,255,0.03)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                borderLeft: '2px solid #3b82f6',
                                fontStyle: 'italic'
                              }}>
                                "{act.new_value}"
                              </div>
                            )}

                            {act.action_type === 'add_tag' && act.new_value && (
                              <span style={{
                                fontSize: '10px',
                                color: '#c084fc',
                                background: 'rgba(139, 92, 246, 0.08)',
                                border: '1px solid rgba(139, 92, 246, 0.15)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                width: 'fit-content',
                                fontWeight: '600'
                              }}>
                                #{act.new_value}
                              </span>
                            )}
                            {act.action_type === 'remove_tag' && act.old_value && (
                              <span style={{
                                fontSize: '10px',
                                color: '#fca5a5',
                                background: 'rgba(244, 63, 94, 0.05)',
                                border: '1px solid rgba(244, 63, 94, 0.1)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                width: 'fit-content',
                                textDecoration: 'line-through'
                              }}>
                                #{act.old_value}
                              </span>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>
                              <Clock size={10} />
                              <span>{timeStr} {dateStr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
                disabled={!canEdit}
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

              {/* Search input for assignees */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '6px 10px',
                marginBottom: '8px'
              }}>
                <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input 
                  type="text"
                  value={assigneeSearchQuery}
                  onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm người thực hiện..."
                  style={{
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: '#fff',
                    fontSize: '11px',
                    width: '100%',
                    padding: 0
                  }}
                />
                {assigneeSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAssigneeSearchQuery('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '9px'
                    }}
                  >
                    Xóa
                  </button>
                )}
              </div>

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
                {(() => {
                  const removeTones = (str) => {
                    return str
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/đ/g, 'd')
                      .replace(/Đ/g, 'D');
                  };
                  const filteredTeamMembers = teamMembers.filter(u => {
                    if (!assigneeSearchQuery.trim()) return true;
                    const cleanName = removeTones(u.name.toLowerCase());
                    const cleanRole = removeTones((u.role || '').toLowerCase());
                    const cleanQuery = removeTones(assigneeSearchQuery.toLowerCase());
                    return cleanName.includes(cleanQuery) || cleanRole.includes(cleanQuery);
                  });

                  if (filteredTeamMembers.length === 0) {
                    return (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                        Không tìm thấy kết quả
                      </span>
                    );
                  }

                  return filteredTeamMembers.map(u => {
                    const isChecked = assigneeIds.includes(u.id);
                    return (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canEdit ? 'pointer' : 'default', fontSize: '11px', color: isChecked ? '#fff' : 'var(--text-secondary)', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canEdit}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAssigneeIds([...assigneeIds, u.id]);
                              setAssigneePermissions(prev => ({ ...prev, [u.id]: prev[u.id] || 'edit' }));
                            } else {
                              setAssigneeIds(assigneeIds.filter(id => id !== u.id));
                            }
                          }}
                          style={{
                            accentColor: '#8b5cf6',
                            width: '13px',
                            height: '13px',
                            cursor: canEdit ? 'pointer' : 'default'
                          }}
                        />
                        <img src={u.avatar} alt={u.name} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.name} <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>({u.role})</span>
                        </span>
                        {isChecked && hasFullControl && (
                          <select
                            value={assigneePermissions[u.id] || 'edit'}
                            onChange={(e) => {
                              const newPerm = e.target.value;
                              setAssigneePermissions(prev => ({ ...prev, [u.id]: newPerm }));
                            }}
                            style={{
                              background: '#27272a',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '9px',
                              padding: '2px 4px',
                              marginLeft: 'auto',
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="edit">Edit</option>
                            <option value="view">View</option>
                          </select>
                        )}
                        {isChecked && !hasFullControl && (
                          <span style={{
                            fontSize: '9.5px',
                            color: 'var(--text-muted)',
                            marginLeft: 'auto',
                            background: 'rgba(255,255,255,0.04)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.06)'
                          }}>
                            {(assigneePermissions[u.id] || 'edit') === 'edit' ? 'Được sửa' : 'Chỉ xem'}
                          </span>
                        )}
                      </label>
                    );
                  });
                })()}
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
                disabled={!canEdit}
              >
                {PRIORITIES.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} />
                Ngày bắt đầu
              </label>
              <input 
                type="datetime-local"
                className="modal-select"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={!canEdit}
              />
              {task.actualStartDate && (
                <div style={{ 
                  fontSize: '11px', 
                  color: '#10b981', 
                  marginTop: '6px', 
                  fontWeight: '600', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  width: 'fit-content'
                }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                  Bắt đầu thực tế: {new Date(task.actualStartDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(task.actualStartDate).toLocaleDateString('vi-VN')}
                </div>
              )}
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
                disabled={!canEdit}
              />
            </div>

            {/* Predecessors / Dependencies */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Link size={12} style={{ transform: 'rotate(-45deg)', display: 'inline-block' }} />
                Công việc tiền nhiệm
              </label>
              <select
                className="modal-select"
                value={dependencies}
                onChange={(e) => setDependencies(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Không có</option>
                {tasks
                  .filter(t => t.id !== task.id && !isCircularDependency(t.id))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))
                }
              </select>
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
                disabled={!canEdit}
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
                {teamsLinks.length > 0 && canEdit && (
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
                  onClick={canEdit ? handleOpenPicker : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '10px 12px',
                    background: canEdit ? 'rgba(139, 92, 246, 0.06)' : 'rgba(255,255,255,0.02)',
                    border: canEdit ? '1px dashed rgba(139, 92, 246, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: canEdit ? '#c084fc' : 'var(--text-muted)',
                    cursor: canEdit ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!canEdit) return;
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
                    e.currentTarget.style.borderStyle = 'solid';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    if (!canEdit) return;
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                    e.currentTarget.style.borderStyle = 'dashed';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <MessageCircle size={13} />
                  {canEdit ? 'Liên kết Microsoft Teams' : 'Không có liên kết Teams'}
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
                    {canEdit && (
                      <button 
                        type="button" 
                        className="modal-tag-remove" 
                        onClick={() => handleRemoveTag(tag)}
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <input 
                    type="text" 
                    className="modal-tag-input" 
                    placeholder="+ Thêm thẻ..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                  />
                )}
              </div>
              {canEdit && <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>Gõ tên tag và nhấn Enter để thêm nhanh</span>}
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
          {!canEdit && (
            <span style={{ 
              fontSize: '11px', 
              color: '#fb7185', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              marginRight: 'auto',
              background: 'rgba(244, 63, 94, 0.08)',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(244, 63, 94, 0.15)',
              fontWeight: '600'
            }}>
              <ShieldAlert size={12} />
              Chế độ chỉ xem (Bạn không có quyền sửa)
            </span>
          )}
          <button className="btn-secondary" onClick={onClose}>{canEdit ? 'Hủy' : 'Đóng'}</button>
          {canEdit && <button className="btn-primary" onClick={handleSave}>Lưu thay đổi</button>}
        </div>
      </div>
    </div>
  );
}
