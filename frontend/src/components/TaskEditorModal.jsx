import React, { useState } from 'react';
import { X, User, Calendar, ShieldAlert, Tag, MessageSquare, ListTodo, Plus, HelpCircle, Link, Unlink, ExternalLink, MessageCircle } from 'lucide-react';
import { USERS, PRIORITIES } from '../utils/nlpParser';
import { api } from '../utils/api';

const STATUS_OPTIONS = [
  { id: 'todo', label: 'Cần làm' },
  { id: 'in_progress', label: 'Đang làm' },
  { id: 'review', label: 'Đang review' },
  { id: 'done', label: 'Hoàn thành' }
];

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
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().substr(0, 10) : ''
  );
  
  // Teams Integration local states
  const [teamsLink, setTeamsLink] = useState(task.teamsLink || '');
  const [channelLink, setChannelLink] = useState(task.channelLink || '');
  const [chatLink, setChatLink] = useState(task.chatLink || '');
  const [teamsId, setTeamsId] = useState(task.teamsId || '');
  const [channelId, setChannelId] = useState(task.channelId || '');
  const [chatId, setChatId] = useState(task.chatId || '');

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
        setTeamsId(tempTeamId);
        setChannelId(tempChannelId);
        setChannelLink(selectedChannel.webUrl);
        setTeamsLink(selectedTeam ? `https://teams.microsoft.com/l/team/${tempTeamId}` : '');
        setChatId('');
        setChatLink('');
      }
    } else {
      const selectedChat = pickerChats.find(c => c.id === tempChatId);
      if (selectedChat) {
        setChatId(tempChatId);
        setChatLink(selectedChat.webUrl);
        setTeamsId('');
        setChannelId('');
        setChannelLink('');
        setTeamsLink('');
      }
    }
    setShowPicker(false);
  };

  const handleClearTeamsLink = () => {
    setTeamsId('');
    setChannelId('');
    setChannelLink('');
    setTeamsLink('');
    setChatId('');
    setChatLink('');
  };

  const handleSave = () => {
    const selectedAssigneeObjects = teamMembers.filter(u => assigneeIds.includes(u.id));
    const parsedDate = dueDate ? new Date(dueDate + 'T17:00:00') : null;

    onSave(task.id, {
      title: title.trim() || 'Nhiệm vụ không tên',
      description: description.trim(),
      status,
      assignees: selectedAssigneeObjects,
      priority,
      dueDate: parsedDate,
      tags,
      comments,
      teamsLink,
      channelLink,
      chatLink,
      teamsId,
      channelId,
      chatId
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
                type="date" 
                className="modal-date-picker" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Microsoft Teams Sync Integration */}
            <div className="modal-field" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Link size={12} style={{ color: '#8b5cf6' }} />
                Đồng bộ Microsoft Teams
              </label>
              
              {channelLink || chatLink ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px',
                  background: 'rgba(139, 92, 246, 0.04)',
                  border: '1px solid rgba(139, 92, 246, 0.15)',
                  borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageCircle size={14} style={{ color: '#a78bfa' }} />
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                      {channelLink ? 'Kênh Teams đã liên kết' : 'Cuộc trò chuyện đã liên kết'}
                    </span>
                  </div>
                  
                  <p style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    ID: {channelId || chatId}
                  </p>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <a 
                      href={channelLink || chatLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '6px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                        fontSize: '10px',
                        color: '#a78bfa',
                        textDecoration: 'none',
                        fontWeight: '500',
                        transition: 'all 0.2s ease',
                        textAlign: 'center'
                      }}
                    >
                      <ExternalLink size={10} />
                      Mở Teams
                    </a>
                    <button
                      type="button"
                      onClick={handleClearTeamsLink}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '6px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        borderRadius: '6px',
                        fontSize: '10px',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Unlink size={10} />
                      Hủy liên kết
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#c084fc',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <MessageCircle size={13} />
                  Liên kết Microsoft Teams
                </button>
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
                              <select 
                                className="modal-select"
                                value={tempTeamId}
                                onChange={(e) => handleTeamChange(e.target.value)}
                              >
                                {pickerTeams.map(t => (
                                  <option key={t.id} value={t.id}>{t.displayName}</option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Channel Select */}
                          <div className="modal-field">
                            <label className="modal-label">Chọn Kênh (Channel)</label>
                            {pickerChannels.length === 0 ? (
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Không tìm thấy kênh nào.</p>
                            ) : (
                              <select 
                                className="modal-select"
                                value={tempChannelId}
                                onChange={(e) => setTempChannelId(e.target.value)}
                              >
                                {pickerChannels.map(c => (
                                  <option key={c.id} value={c.id}>{c.displayName}</option>
                                ))}
                              </select>
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
                            <select 
                              className="modal-select"
                              value={tempChatId}
                              onChange={(e) => setTempChatId(e.target.value)}
                            >
                              {pickerChats.map(c => (
                                <option key={c.id} value={c.id}>{c.topic}</option>
                              ))}
                            </select>
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
