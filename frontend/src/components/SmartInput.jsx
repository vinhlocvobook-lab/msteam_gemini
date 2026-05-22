import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, CornerDownLeft, User, Calendar, AlertTriangle, Hash, ShieldAlert } from 'lucide-react';
import { parseTaskText, USERS, PRIORITIES } from '../utils/nlpParser';

const SLASH_COMMANDS = [
  { id: 'assign', title: '/assign', desc: 'Gán nhanh người nhận việc', param: '@' },
  { id: 'high', title: '/high', desc: 'Thiết lập độ ưu tiên Khẩn cấp', param: '#cao' },
  { id: 'medium', title: '/medium', desc: 'Thiết lập độ ưu tiên Vừa', param: '#vua' },
  { id: 'low', title: '/low', desc: 'Thiết lập độ ưu tiên Thấp', param: '#thap' },
  { id: 'today', title: '/today', desc: 'Thiết lập hạn chót Hôm nay', param: 'hôm nay' },
  { id: 'tomorrow', title: '/tomorrow', desc: 'Thiết lập hạn chót Ngày mai', param: 'ngày mai' }
];

export default function SmartInput({ onAddTask, activeUser }) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  
  const textareaRef = useRef(null);
  const highlighterRef = useRef(null);

  const parsed = parseTaskText(text);

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

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);

    // Check if showing slash command menu
    // We show it if the text ends with "/" or is just "/"
    const lastWord = val.split(/\s+/).pop();
    if (lastWord.startsWith('/')) {
      setShowSlashMenu(true);
      // Filter slash commands based on typed query if any (e.g. /t -> matches /today, /tomorrow)
      const query = lastWord.substring(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(cmd => cmd.title.includes(lastWord.toLowerCase()));
      setSlashIndex(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
    } else {
      setShowSlashMenu(false);
    }
  };

  const insertCommandText = (cmdText) => {
    const words = text.split(/(\s+)/);
    // Replace the last word (which started with /) with the parameter of the command
    words.pop(); // remove the space or command
    
    // Find the last word that contains "/"
    let lastNonSpaceIndex = -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].trim().startsWith('/')) {
        lastNonSpaceIndex = i;
        break;
      }
    }

    if (lastNonSpaceIndex !== -1) {
      words[lastNonSpaceIndex] = cmdText;
    } else {
      words.push(cmdText);
    }

    const newText = words.join('') + ' ';
    setText(newText);
    setShowSlashMenu(false);
    
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    // If slash menu is visible, handle navigation
    if (showSlashMenu) {
      const lastWord = text.split(/\s+/).pop();
      const filtered = SLASH_COMMANDS.filter(cmd => cmd.title.includes(lastWord.toLowerCase()));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(prev => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(prev => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[slashIndex]) {
          insertCommandText(filtered[slashIndex].param);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // Default Enter: Create the task
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        const finalParsed = parseTaskText(text);
        
        // Add task
        onAddTask({
          title: finalParsed.cleanText,
          assignee: finalParsed.assignee || activeUser, // Default to current active user if none parsed
          priority: finalParsed.priority,
          dueDate: finalParsed.dueDate,
          tags: finalParsed.tags || [],
          creator: activeUser
        });

        // Reset input
        setText('');
        setShowSlashMenu(false);
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

  // Filter commands for autocomplete
  const lastWord = text.split(/\s+/).pop() || '';
  const filteredCommands = SLASH_COMMANDS.filter(cmd => cmd.title.includes(lastWord.toLowerCase()));

  // Render Date String
  const formatPreviewDate = (date) => {
    if (!date) return null;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getPriorityLabel = (id) => {
    const prio = PRIORITIES.find(p => p.id === id);
    return prio ? prio.label : 'Vừa';
  };

  return (
    <div className="smart-input-container">
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
            onBlur={() => setTimeout(() => setIsFocused(false), 200)} // delay to allow clicks
          />

          <Sparkles className="input-icon" size={20} />
        </div>

        {/* Slash Command Autocomplete Menu */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div className="slash-dropdown">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                className={`slash-item ${idx === slashIndex ? 'active' : ''}`}
                onClick={() => insertCommandText(cmd.param)}
                onMouseEnter={() => setSlashIndex(idx)}
              >
                <div className="slash-item-icon">
                  <Hash size={14} />
                </div>
                <div className="slash-item-meta">
                  <span className="slash-item-title">{cmd.title}</span>
                  <span className="slash-item-desc">{cmd.desc}</span>
                </div>
              </button>
            ))}
          </div>
        )}
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
