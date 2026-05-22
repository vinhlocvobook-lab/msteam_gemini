import React, { useState, useEffect } from 'react';
import { Users, Activity, PlusCircle, ArrowRight, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { USERS } from '../utils/nlpParser';

export default function Sidebar({ tasks, logs, onUpdateTask, teamMembers = USERS }) {
  const [hoveredMemberId, setHoveredMemberId] = useState(null);

  // Persisted collapse state for sidebar sections
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const saved = localStorage.getItem('synapse_sidebar_collapsed');
    return saved ? JSON.parse(saved) : { team: false, activity: false };
  });

  useEffect(() => {
    localStorage.setItem('synapse_sidebar_collapsed', JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const toggleSection = (sectionId) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

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
    const matchedUser = teamMembers.find(u => u.id === memberId);
    if (taskId && matchedUser) {
      const targetTask = tasks.find(t => String(t.id) === String(taskId));
      if (targetTask) {
        const currentAssignees = targetTask.assignees || [];
        const alreadyAssigned = currentAssignees.some(a => a.id === memberId);
        if (!alreadyAssigned) {
          const nextAssignees = [...currentAssignees, matchedUser];
          onUpdateTask(taskId, { assignees: nextAssignees });
        }
      }
    }
    setHoveredMemberId(null);
  };

  const getTaskCount = (userId) => {
    return tasks.filter(t => t.assignees && t.assignees.some(a => a.id === userId) && t.status !== 'done').length;
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
      <div className="panel-section glass-panel" style={{ padding: '20px', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsedSections.team ? '0px' : '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} style={{ color: '#8b5cf6' }} />
            <h3 className="section-title">Thành viên đội ngũ</h3>
          </div>
          <button
            onClick={() => toggleSection('team')}
            className="column-toggle-btn"
            title={collapsedSections.team ? 'Mở rộng' : 'Thu nhỏ'}
          >
            {collapsedSections.team ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
        
        {!collapsedSections.team && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="team-list">
              {teamMembers.map(member => {
                const taskCount = getTaskCount(member.id);
                const isHovered = hoveredMemberId === member.id;
                
                // Check if member status is "typing" or "online"
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
            <div style={{ marginTop: '2px', fontSize: '10px', color: '#71717a', textAlign: 'center' }}>
              💡 Kéo thẻ việc thả vào thành viên để giao việc tức thì!
            </div>
          </div>
        )}
      </div>

      {/* Activity Feed Section */}
      <div className="panel-section glass-panel" style={{ padding: '20px', flexGrow: collapsedSections.activity ? 0 : 1, transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsedSections.activity ? '0px' : '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: '#06b6d4' }} />
            <h3 className="section-title">Nhật ký hoạt động</h3>
          </div>
          <button
            onClick={() => toggleSection('activity')}
            className="column-toggle-btn"
            title={collapsedSections.activity ? 'Mở rộng' : 'Thu nhỏ'}
          >
            {collapsedSections.activity ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {!collapsedSections.activity && (
          <div className="activity-feed fade-in">
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
        )}
      </div>
    </div>
  );
}
