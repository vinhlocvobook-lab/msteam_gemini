import React, { useState } from 'react';
import { X, User, Calendar, ShieldAlert, Tag, MessageSquare, ListTodo, Plus, HelpCircle } from 'lucide-react';
import { USERS, PRIORITIES } from '../utils/nlpParser';

const STATUS_OPTIONS = [
  { id: 'todo', label: 'Cần làm' },
  { id: 'in_progress', label: 'Đang làm' },
  { id: 'review', label: 'Đang review' },
  { id: 'done', label: 'Hoàn thành' }
];

export default function TaskEditorModal({ task, onClose, onSave, activeUser }) {
  const [title, setTitle] = useState(task.title || '');
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status || 'todo');
  const [assignee, setAssignee] = useState(task.assignee ? task.assignee.id : '');
  const [priority, setPriority] = useState(task.priority || 'medium');
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().substr(0, 10) : ''
  );
  
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

  const handlePostComment = (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    const newComment = {
      id: `comment-${Date.now()}`,
      author: activeUser,
      text: commentInput.trim(),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    const updatedComments = [newComment, ...comments];
    setComments(updatedComments);
    setCommentInput('');
  };

  const handleSave = () => {
    const selectedAssignee = USERS.find(u => u.id === assignee) || null;
    const parsedDate = dueDate ? new Date(dueDate + 'T17:00:00') : null;

    onSave(task.id, {
      title: title.trim() || 'Nhiệm vụ không tên',
      description: description.trim(),
      status,
      assignee: selectedAssignee,
      priority,
      dueDate: parsedDate,
      tags,
      comments
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

            {/* Assignee */}
            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={12} />
                Người thực hiện
              </label>
              <select 
                className="modal-select" 
                value={assignee} 
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Chưa gán</option>
                {USERS.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
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
