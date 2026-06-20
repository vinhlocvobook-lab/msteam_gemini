import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, CornerDownLeft, User, Calendar, AlertTriangle, Hash, ShieldAlert, Tag, Plus, Check, CalendarPlus } from 'lucide-react';
import { parseTaskText, USERS, PRIORITIES } from '../utils/nlpParser';

const SLASH_COMMANDS = [
  { id: 'assign', title: '/assign', desc: 'Gán nhanh người nhận việc', param: '@' },
  { id: 'high', title: '/high', desc: 'Thiết lập độ ưu tiên Khẩn cấp', param: '#cao' },
  { id: 'medium', title: '/medium', desc: 'Thiết lập độ ưu tiên Vừa', param: '#vua' },
  { id: 'low', title: '/low', desc: 'Thiết lập độ ưu tiên Thấp', param: '#thap' },
  { id: 'today', title: '/today', desc: 'Thiết lập hạn chót Hôm nay', param: 'hôm nay' },
  { id: 'tomorrow', title: '/tomorrow', desc: 'Thiết lập hạn chót Ngày mai', param: 'ngày mai' }
];

// Helper to get active token under cursor position
const getActiveToken = (text, cursorPosition) => {
  if (!text) return null;
  
  // Find text up to selection/cursor position
  const textBeforeCursor = text.slice(0, cursorPosition);
  
  // Find the start of the current word before cursor (delimited by space or new line)
  const lastSpaceIdx = Math.max(
    textBeforeCursor.lastIndexOf(' '),
    textBeforeCursor.lastIndexOf('\n')
  );
  
  const currentWord = textBeforeCursor.slice(lastSpaceIdx + 1);
  
  if (currentWord.startsWith('@')) {
    return { type: 'user', query: currentWord.slice(1), startIdx: lastSpaceIdx + 1, word: currentWord };
  } else if (currentWord.startsWith('#')) {
    return { type: 'priority_tag', query: currentWord.slice(1), startIdx: lastSpaceIdx + 1, word: currentWord };
  } else if (currentWord.startsWith('//')) {
    return { type: 'date', query: currentWord.slice(2), startIdx: lastSpaceIdx + 1, word: currentWord };
  } else if (currentWord.startsWith('/')) {
    return { type: 'slash', query: currentWord.slice(1), startIdx: lastSpaceIdx + 1, word: currentWord };
  }
  
  return null;
};

export default function SmartInput({ onAddTask, activeUser, teamMembers = USERS, existingTags = [] }) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState({
    type: null, // 'user' | 'priority_tag' | 'date' | 'slash'
    query: '',
    items: [],
    index: 0
  });
  
  const textareaRef = useRef(null);
  const highlighterRef = useRef(null);
  const dateInputRef = useRef(null);

  const openDatePicker = () => {
    if (dateInputRef.current) {
      setSuggestions({ type: null, query: '', items: [], index: 0 });
      try {
        dateInputRef.current.showPicker();
      } catch (err) {
        dateInputRef.current.click();
      }
    }
  };

  const handleDatePickerChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [year, month, day] = val.split('-');
    const formattedDate = `${day}/${month}`;
    insertSuggestion(formattedDate);
    e.target.value = '';
  };

  const parsed = parseTaskText(text, teamMembers);

  // Sync scroll between textarea and highlighter div
  const handleScroll = () => {
    if (highlighterRef.current && textareaRef.current) {
      highlighterRef.current.scrollTop = textareaRef.current.scrollTop;
      highlighterRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    handleScroll();
  }, [text]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!suggestions.type) return;

      const container = document.querySelector('.smart-input-container');
      if (container && container.contains(e.target)) {
        return;
      }

      setSuggestions({ type: null, query: '', items: [], index: 0 });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [suggestions.type]);

  const updateSuggestionsList = (val, cursorPos) => {
    const activeToken = getActiveToken(val, cursorPos);
    if (!activeToken) {
      setSuggestions({ type: null, query: '', items: [], index: 0 });
      return;
    }

    const { type, query } = activeToken;
    let items = [];

    if (type === 'user') {
      items = teamMembers.filter(u => 
        u.username.toLowerCase().includes(query.toLowerCase()) || 
        u.name.toLowerCase().includes(query.toLowerCase())
      ).map(u => ({
        id: u.id,
        title: u.name,
        subtitle: `@${u.username}`,
        icon: 'avatar',
        avatarUrl: u.avatar,
        role: u.role,
        param: `@${u.username}`
      }));
    } 
    else if (type === 'priority_tag') {
      // Priorities
      const matchingPriorities = PRIORITIES.map(prio => {
        const mainKey = prio.keys[0]; // '#cao', '#vua', '#thap'
        return {
          id: `prio-${prio.id}`,
          title: prio.label,
          subtitle: 'Độ ưu tiên',
          icon: 'priority',
          color: prio.color,
          param: mainKey,
          isPriority: true,
          matchKeys: prio.keys
        };
      }).filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.matchKeys.some(k => k.toLowerCase().includes(query.toLowerCase()))
      );

      // Tags
      const matchingTags = existingTags.filter(tag => 
        tag.toLowerCase().includes(query.toLowerCase())
      ).map(tag => ({
        id: `tag-${tag}`,
        title: `#${tag}`,
        subtitle: 'Nhãn dán',
        icon: 'tag',
        param: `#${tag}`
      }));

      items = [...matchingPriorities, ...matchingTags];

      // Custom tag option
      if (query && !items.some(item => item.param.toLowerCase() === `#${query.toLowerCase()}`)) {
        items.push({
          id: `create-tag-${query}`,
          title: `Tạo nhãn mới: #${query}`,
          subtitle: 'Nhãn dán',
          icon: 'tag-plus',
          param: `#${query}`
        });
      }
    } 
    else if (type === 'date') {
      const today = new Date();
      const dateOptions = [
        { title: 'Hôm nay', days: 0 },
        { title: 'Ngày mai', days: 1 },
        { title: 'Ngày kia', days: 2 },
        { title: 'Tuần sau', days: 7 },
        { title: 'Thứ hai tới', dayOfWeek: 1 },
        { title: 'Thứ ba tới', dayOfWeek: 2 },
        { title: 'Thứ tư tới', dayOfWeek: 3 },
        { title: 'Thứ năm tới', dayOfWeek: 4 },
        { title: 'Thứ sáu tới', dayOfWeek: 5 },
        { title: 'Thứ bảy tới', dayOfWeek: 6 },
        { title: 'Chủ nhật tới', dayOfWeek: 0 }
      ].map((opt, idx) => {
        const d = new Date();
        if (opt.days !== undefined) {
          d.setDate(today.getDate() + opt.days);
        } else if (opt.dayOfWeek !== undefined) {
          let daysToAdd = opt.dayOfWeek - today.getDay();
          if (daysToAdd <= 0) daysToAdd += 7;
          d.setDate(today.getDate() + daysToAdd);
        }
        const formatted = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        
        let parserParam = opt.title.toLowerCase().replace(' tới', '');
        if (parserParam === 'thứ hai tới') parserParam = 'thứ hai';
        
        return {
          id: `date-${idx}`,
          title: opt.title,
          subtitle: formatted,
          icon: 'calendar',
          param: parserParam
        };
      });

      const filteredOptions = dateOptions.filter(opt => 
        opt.title.toLowerCase().includes(query.toLowerCase())
      );

      items = [
        {
          id: 'choose-from-calendar',
          title: 'Chọn từ lịch...',
          subtitle: 'Mở lịch chọn ngày tùy chỉnh',
          icon: 'calendar-plus',
          param: ''
        },
        ...filteredOptions
      ];
    } 
    else if (type === 'slash') {
      items = SLASH_COMMANDS.filter(cmd => 
        cmd.title.includes('/' + query.toLowerCase()) || cmd.desc.toLowerCase().includes(query.toLowerCase())
      ).map(cmd => ({
        id: cmd.id,
        title: cmd.title,
        subtitle: cmd.desc,
        icon: 'command',
        param: cmd.param
      }));
    }

    setSuggestions(prev => ({
      type,
      query,
      items,
      index: Math.min(prev.index, Math.max(0, items.length - 1))
    }));
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    const cursorPos = e.target.selectionStart;
    updateSuggestionsList(val, cursorPos);
  };

  const handleSelectionChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    updateSuggestionsList(val, cursorPos);
  };

  const insertSuggestion = (paramText) => {
    if (!textareaRef.current) return;
    const cursorPosition = textareaRef.current.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPosition);
    const textAfterCursor = text.slice(cursorPosition);
    
    const lastSpaceIdx = Math.max(
      textBeforeCursor.lastIndexOf(' '),
      textBeforeCursor.lastIndexOf('\n')
    );
    
    const newTextBeforeCursor = textBeforeCursor.slice(0, lastSpaceIdx + 1) + paramText;
    const newText = newTextBeforeCursor + ' ' + textAfterCursor;
    
    setText(newText);
    
    const newCursorPos = newTextBeforeCursor.length + 1;
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setSuggestions({ type: null, query: '', items: [], index: 0 });
      }
    }, 10);
  };

  const isUserSelected = (username) => {
    return parsed.tokens.some(t => t.type === 'assignee' && t.value && t.value.username.toLowerCase() === username.toLowerCase());
  };

  const toggleUserAssignment = (user) => {
    const userTag = `@${user.username}`;
    const isSelected = isUserSelected(user.username);
    
    let newText = '';
    let newCursorPos = 0;
    
    if (isSelected) {
      // Remove the exact user tag token from the text using word boundary \b and case-insensitive matching
      const regex = new RegExp(`@${user.username}\\b\\s*`, 'gi');
      newText = text.replace(regex, '');
      newCursorPos = newText.length;
    } else {
      if (!textareaRef.current) return;
      const cursorPosition = textareaRef.current.selectionStart;
      const textBeforeCursor = text.slice(0, cursorPosition);
      const textAfterCursor = text.slice(cursorPosition);
      
      const lastSpaceIdx = Math.max(
        textBeforeCursor.lastIndexOf(' '),
        textBeforeCursor.lastIndexOf('\n')
      );
      
      const newTextBeforeCursor = textBeforeCursor.slice(0, lastSpaceIdx + 1) + userTag;
      newText = newTextBeforeCursor + ' ' + textAfterCursor;
      newCursorPos = newTextBeforeCursor.length + 1;
    }
    
    setText(newText);
    
    // Keep user suggestions open and refocus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        
        // Refresh full user list in state
        const members = teamMembers;
        const items = members.map(u => ({
          id: u.id,
          title: u.name,
          subtitle: `@${u.username}`,
          icon: 'avatar',
          avatarUrl: u.avatar,
          role: u.role,
          param: `@${u.username}`
        }));
        
        setSuggestions(prev => ({
          ...prev,
          query: '',
          items,
          index: prev.items.findIndex(item => item.id === user.id)
        }));
      }
    }, 10);
  };

  const handleKeyDown = (e) => {
    // If suggestions are visible, handle keyboard navigation
    if (suggestions.type && suggestions.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestions(prev => ({
          ...prev,
          index: (prev.index + 1) % prev.items.length
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestions(prev => ({
          ...prev,
          index: (prev.index - 1 + prev.items.length) % prev.items.length
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const activeItem = suggestions.items[suggestions.index];
        if (activeItem) {
          if (activeItem.id === 'choose-from-calendar') {
            openDatePicker();
          } else {
            insertSuggestion(activeItem.param);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions({ type: null, query: '', items: [], index: 0 });
        return;
      }
    }

    // Default Enter: Create the task
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        const finalParsed = parseTaskText(text, teamMembers);
        
        // Extract all assignees parsed from tokens
        const parsedAssignees = finalParsed.tokens
          .filter(t => t.type === 'assignee')
          .map(t => t.value);

        // Add task
        onAddTask({
          title: finalParsed.cleanText,
          assignees: parsedAssignees.length > 0 ? parsedAssignees : [activeUser],
          priority: finalParsed.priority,
          dueDate: finalParsed.dueDate,
          tags: finalParsed.tags || [],
          creator: activeUser
        });

        // Reset input
        setText('');
        setSuggestions({ type: null, query: '', items: [], index: 0 });
      }
    }
  };

  // Generate highlighted HTML content for backdrop
  const renderHighlightedContent = () => {
    if (!text) return '';
    
    return parsed.tokens.map((token, index) => {
      if (token.type === 'space') {
        return token.text;
      }
      if (token.type === 'assignee') {
        return `<span class="token-assignee">${token.text}</span>`;
      }
      if (token.type === 'priority') {
        return `<span class="token-priority-${token.value.id}">${token.text}</span>`;
      }
      if (token.type === 'tag') {
        return `<span class="token-tag">${token.text}</span>`;
      }
      if (token.type === 'date') {
        return `<span class="token-date">${token.text}</span>`;
      }
      if (token.type === 'command') {
        return `<span class="token-command">${token.text}</span>`;
      }
      // Regular text, escape HTML
      return token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }).join('');
  };

  const getSuggestionsHeader = () => {
    switch (suggestions.type) {
      case 'user': return 'Gợi ý thành viên';
      case 'priority_tag': return 'Gợi ý Độ ưu tiên & Nhãn dán';
      case 'date': return 'Gợi ý Hạn chót';
      case 'slash': return 'Phím tắt nhanh (Slash commands)';
      default: return 'Gợi ý';
    }
  };

  // Render Date String
  const formatPreviewDate = (date) => {
    if (!date) return null;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getPriorityLabel = (id) => {
    const prio = PRIORITIES.find(p => p.id === id);
    return prio ? prio.label : 'Vừa';
  };

  const handleBlur = () => {
    // If suggestions dropdown is open, keep focus class active to prevent DOM reflows that swallow clicks
    if (suggestions.type) {
      return;
    }
    setIsFocused(false);
  };

  return (
    <div className="smart-input-container">
      {/* Wrapper that allows dropdown to overflow */}
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Input Box Wrapper */}
        <div className={`input-backdrop-container ${isFocused ? 'focus' : ''}`}>
          <div className="input-wrapper">
            {/* Highlight overlay behind the textarea */}
            <div 
              ref={highlighterRef}
              className="textarea-highlighter"
              dangerouslySetInnerHTML={{ __html: renderHighlightedContent() }}
            />

            {/* Actual textarea for typing */}
            <textarea
              ref={textareaRef}
              className="smart-textarea"
              placeholder="Nhập công việc... Ví dụ: Thiết kế trang chủ @lan #cao hôm nay (Nhấn '/' để có phím tắt)"
              value={text}
              rows={1}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              onClick={handleSelectionChange}
              onKeyUp={handleSelectionChange}
            />

            <Sparkles className="input-icon" size={20} />
          </div>
        </div>

        {/* Unified Autocomplete Suggestions Menu */}
        {suggestions.type && suggestions.items.length > 0 && (
          <div className="suggestions-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="suggestions-header">{getSuggestionsHeader()}</div>
            {suggestions.items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`suggestion-item ${idx === suggestions.index ? 'active' : ''}`}
                onMouseDown={(e) => {
                  // Prevent textarea from losing focus (must be first)
                  e.preventDefault();
                  // Fire action immediately on mousedown — avoids double-click caused by
                  // React re-rendering the button between mousedown and click events.
                  if (item.id === 'choose-from-calendar') {
                    openDatePicker();
                  } else if (suggestions.type === 'user') {
                    const username = item.param.substring(1);
                    const user = teamMembers.find(u => u.username === username);
                    if (user) {
                      toggleUserAssignment(user);
                    }
                  } else {
                    insertSuggestion(item.param);
                  }
                }}
                onMouseEnter={() => setSuggestions(prev => ({ ...prev, index: idx }))}
              >
                 {suggestions.type === 'user' && (
                  <div className={`suggestion-item-checkbox ${isUserSelected(item.param.substring(1)) ? 'checked' : ''}`}>
                    {isUserSelected(item.param.substring(1)) && <Check size={10} />}
                  </div>
                )}
                {item.icon === 'avatar' && (
                  <img src={item.avatarUrl} alt={item.title} className="suggestion-item-avatar" />
                )}
                {item.icon === 'priority' && (
                  <div className="suggestion-item-icon">
                    <span style={{ backgroundColor: item.color, width: 8, height: 8, borderRadius: '50%' }} />
                  </div>
                )}
                {item.icon === 'tag' && (
                  <div className="suggestion-item-icon">
                    <Tag size={14} />
                  </div>
                )}
                {item.icon === 'tag-plus' && (
                  <div className="suggestion-item-icon">
                    <Plus size={14} />
                  </div>
                )}
                 {item.icon === 'calendar-plus' && (
                  <div className="suggestion-item-icon">
                    <CalendarPlus size={14} />
                  </div>
                )}
                {item.icon === 'calendar' && (
                  <div className="suggestion-item-icon">
                    <Calendar size={14} />
                  </div>
                )}
                {item.icon === 'command' && (
                  <div className="suggestion-item-icon">
                    <Hash size={14} />
                  </div>
                )}

                <div className="suggestion-item-meta">
                  <span className="suggestion-item-title">{item.title}</span>
                  <span className="suggestion-item-subtitle">{item.subtitle}</span>
                </div>

                {item.role && (
                  <span className="suggestion-item-role">{item.role}</span>
                )}
              </button>
            ))}
          </div>
        )}
        
        {/* Hidden date picker input */}
        <input
          ref={dateInputRef}
          type="date"
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
            bottom: 0,
            left: 0
          }}
          onChange={handleDatePickerChange}
        />
      </div>

      {/* Real-time Visual Parsing Preview Panel */}
      {text.trim() && (
        <div className="nlp-preview-card">
          <div className="preview-main">
            <div className="preview-label">Bản xem trước nhiệm vụ</div>
            <div className="preview-title">{parsed.cleanText}</div>
          </div>

          <div className="preview-meta-items">
            {/* Assignee Preview */}
            <div className="preview-meta-badge">
              <User size={13} style={{ color: parsed.assignee ? parsed.assignee.color : 'inherit' }} />
              <span>{parsed.assignee ? parsed.assignee.name : `${activeUser.name} (Bạn)`}</span>
            </div>

            {/* Priority Preview */}
            <div className={`preview-meta-badge priority-${parsed.priority}`}>
              <ShieldAlert size={13} />
              <span>{getPriorityLabel(parsed.priority)}</span>
            </div>

            {/* Due Date Preview */}
            {parsed.dueDate && (
              <div className="preview-meta-badge">
                <Calendar size={13} style={{ color: '#06b6d4' }} />
                <span>{formatPreviewDate(parsed.dueDate)}</span>
              </div>
            )}

            {/* Tags Preview */}
            {parsed.tags && parsed.tags.map(tag => (
              <div key={tag} className="preview-meta-badge tag-preview-badge">
                <span>#{tag}</span>
              </div>
            ))}
            
            {/* Enter Prompt */}
            <div className="preview-enter-tip">
              <CornerDownLeft size={11} />
              <span>Nhấn <span className="key-cap">Enter</span> để tạo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
