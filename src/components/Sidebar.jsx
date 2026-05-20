import React, { useState } from 'react';
import { Users, Activity, PlusCircle, ArrowRight, UserCheck } from 'lucide-react';
import { USERS } from '../utils/nlpParser';

export default function Sidebar({ tasks, logs, onUpdateTask }) {
  const [hoveredMemberId, setHoveredMemberId] = useState(null);

  // Drag and drop assignment onto member avatar / row
  const handleDragOver = (e, memberId) => {
    e.preventDefault();
    if (hoveredMemberId !== memberId) {
      setHoveredMemberId(memberId);
    }
  };

  const handleDragLeave = () => {
    setHoveredMemberId(null);
  };

  const handleDrop = (e, memberId) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const matchedUser = USERS.find(u => u.id === memberId);
    if (taskId && matchedUser) {
      onUpdateTask(taskId, { assignee: matchedUser });
    }
    setHoveredMemberId(null);
  };

  const getTaskCount = (userId) => {
    return tasks.filter(t => t.assignee?.id === userId && t.status !== 'done').length;
  };

  const getLogClass = (type) => {
    switch (type) {
      case 'create': return 'create';
      case 'move': return 'move';
      case 'priority': return 'high-prio';
      default: return '';
    }
  };

  return (
    <div className="sidebar-panel">
      {/* Team Directory Section */}
      <div className="panel-section glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Users size={16} style={{ color: '#8b5cf6' }} />
          <h3 className="section-title">Thành viên đội ngũ</h3>
        </div>
        
        <div className="team-list">
          {USERS.map(member => {
            const taskCount = getTaskCount(member.id);
            const isHovered = hoveredMemberId === member.id;
            
            // Check if member status is "typing" or "online"
            // Lan or Huy might be "typing" when the simulation simulates them writing a task
            const isTyping = member.status === 'typing';
            const isOnline = member.status !== 'offline';
            
            return (
              <div
                key={member.id}
                className={`team-member-card ${isHovered ? 'drop-target' : ''}`}
                onDragOver={(e) => handleDragOver(e, member.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, member.id)}
                title="Kéo thẻ công việc thả vào đây để gán việc nhanh"
              >
                <div className="member-info">
                  <div style={{ position: 'relative' }}>
                    <img src={member.avatar} alt={member.name} className="avatar" />
                    <span 
                      className={`status-indicator ${isTyping ? 'typing' : isOnline ? 'online' : ''}`}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        border: '2px solid #121214',
                        width: '10px',
                        height: '10px'
                      }}
                    />
                  </div>
                  <div className="member-details">
                    <span className="member-name">{member.name}</span>
                    <span className="member-role">{member.role}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isHovered && (
                    <UserCheck size={14} style={{ color: '#10b981', animation: 'pulse 0.5s infinite alternate' }} />
                  )}
                  <span className="member-tasks-count" title="Công việc chưa xong">
                    {taskCount} việc
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '10px', fontSize: '10px', color: '#71717a', textAlign: 'center' }}>
          💡 Kéo thẻ việc thả vào thành viên để giao việc tức thì!
        </div>
      </div>

      {/* Activity Feed Section */}
      <div className="panel-section glass-panel" style={{ padding: '20px', flexGrow: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Activity size={16} style={{ color: '#06b6d4' }} />
          <h3 className="section-title">Nhật ký hoạt động</h3>
        </div>

        <div className="activity-feed">
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <span style={{ fontSize: '12px' }}>Chưa có hoạt động nào</span>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className={`activity-item ${getLogClass(log.type)}`}>
                <div className="activity-content">
                  <span className="activity-text">
                    <strong style={{ color: 'white' }}>{log.userName}</strong> {log.action}
                  </span>
                  <span className="activity-time">{log.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
