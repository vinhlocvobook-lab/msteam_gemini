export const USERS = [
  { id: 'loc', name: 'Võ Vĩnh Lộc', username: 'loc', role: 'Product Owner', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80', color: '#ec4899' },
  { id: 'lan', name: 'Nguyễn Mai Lan', username: 'lan', role: 'UI/UX Designer', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80', color: '#10b981' },
  { id: 'huy', name: 'Trần Thế Huy', username: 'huy', role: 'Frontend Dev', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80', color: '#3b82f6' },
  { id: 'binh', name: 'Phạm Thanh Bình', username: 'binh', role: 'Backend Dev', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80', color: '#f59e0b' }
];

export const PRIORITIES = [
  { id: 'high', label: 'Khẩn cấp', color: '#ef4444', keys: ['#cao', '#gap', '#khan-cap', '#high', '#urgent', '#critical'] },
  { id: 'medium', label: 'Vừa', color: '#eab308', keys: ['#trungbinh', '#vua', '#medium', '#med'] },
  { id: 'low', label: 'Thấp', color: '#10b981', keys: ['#thap', '#low'] }
];

// Helper to normalize Vietnamese accents for comparison
function removeVietnameseTones(str) {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Bả|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  // Some system encode friendly
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // Huyền sắc hỏi ngã nặng 
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // Â, Ă, Ơ
  return str.toLowerCase();
}

export function parseTaskText(text) {
  if (!text) {
    return {
      cleanText: '',
      assignee: null,
      priority: 'medium',
      dueDate: null,
      tokens: []
    };
  }

  const words = text.split(/(\s+)/);
  let assignee = null;
  let priority = 'medium';
  let dueDate = null;
  let rawDateText = '';
  
  // Find date indicators in the entire text first to allow multi-word date phrases (e.g. "thứ sáu tuần sau" or "ngày mai")
  const lowerText = text.toLowerCase();
  const normalizedText = removeVietnameseTones(lowerText);

  // Date Parsing logic
  let matchedDate = null;
  let matchedLength = 0;
  
  const today = new Date();
  
  const dateRules = [
    { phrase: 'hom nay', daysToAdd: 0, label: 'Hôm nay' },
    { phrase: 'today', daysToAdd: 0, label: 'Today' },
    { phrase: 'ngay mai', daysToAdd: 1, label: 'Ngày mai' },
    { phrase: 'tomorrow', daysToAdd: 1, label: 'Tomorrow' },
    { phrase: 'ngay kia', daysToAdd: 2, label: 'Ngày kia' },
    { phrase: 'hom kia', daysToAdd: -1, label: 'Hôm kia' },
    { phrase: 'tuan sau', daysToAdd: 7, label: 'Tuần sau' },
    { phrase: 'next week', daysToAdd: 7, label: 'Next week' }
  ];

  // Check simple rules
  for (const rule of dateRules) {
    if (normalizedText.includes(rule.phrase)) {
      const idx = normalizedText.indexOf(rule.phrase);
      // Ensure we match whole words if possible
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + rule.daysToAdd);
      targetDate.setHours(17, 0, 0, 0); // Default to 5 PM
      matchedDate = targetDate;
      // Extract the raw text representing the date from the original string
      rawDateText = text.substr(idx, rule.phrase.length);
      break;
    }
  }

  // Weekday rules
  const weekdayRules = [
    { name: 'thu hai', dayIndex: 1, label: 'Thứ hai' },
    { name: 'thu 2', dayIndex: 1, label: 'Thứ 2' },
    { name: 'monday', dayIndex: 1, label: 'Monday' },
    { name: 'mon', dayIndex: 1, label: 'Mon' },
    
    { name: 'thu ba', dayIndex: 2, label: 'Thứ ba' },
    { name: 'thu 3', dayIndex: 2, label: 'Thứ 3' },
    { name: 'tuesday', dayIndex: 2, label: 'Tuesday' },
    { name: 'tue', dayIndex: 2, label: 'Tue' },
    
    { name: 'thu tu', dayIndex: 3, label: 'Thứ tư' },
    { name: 'thu 4', dayIndex: 3, label: 'Thứ 4' },
    { name: 'wednesday', dayIndex: 3, label: 'Wednesday' },
    { name: 'wed', dayIndex: 3, label: 'Wed' },
    
    { name: 'thu nam', dayIndex: 4, label: 'Thứ năm' },
    { name: 'thu 5', dayIndex: 4, label: 'Thứ 5' },
    { name: 'thursday', dayIndex: 4, label: 'Thursday' },
    { name: 'thu', dayIndex: 4, label: 'Thu' },
    
    { name: 'thu sau', dayIndex: 5, label: 'Thứ sáu' },
    { name: 'thu 6', dayIndex: 5, label: 'Thứ 6' },
    { name: 'friday', dayIndex: 5, label: 'Friday' },
    { name: 'fri', dayIndex: 5, label: 'Fri' },
    
    { name: 'thu bay', dayIndex: 6, label: 'Thứ bảy' },
    { name: 'thu 7', dayIndex: 6, label: 'Thứ 7' },
    { name: 'saturday', dayIndex: 6, label: 'Saturday' },
    { name: 'sat', dayIndex: 6, label: 'Sat' },
    
    { name: 'chu nhat', dayIndex: 0, label: 'Chủ nhật' },
    { name: 'cn', dayIndex: 0, label: 'CN' },
    { name: 'sunday', dayIndex: 0, label: 'Sunday' },
    { name: 'sun', dayIndex: 0, label: 'Sun' }
  ];

  if (!matchedDate) {
    for (const rule of weekdayRules) {
      if (normalizedText.includes(rule.name)) {
        const idx = normalizedText.indexOf(rule.name);
        // Calculate days to next weekday
        const currentDayIndex = today.getDay();
        let daysToAdd = rule.dayIndex - currentDayIndex;
        if (daysToAdd <= 0) daysToAdd += 7; // Next week's weekday
        
        // Check if "tuan sau" or "next week" is appended
        let suffixOffset = 0;
        const subtext = normalizedText.substring(idx + rule.name.length, idx + rule.name.length + 15);
        if (subtext.includes('tuan sau') || subtext.includes('next week')) {
          daysToAdd += 7;
          suffixOffset = subtext.includes('tuan sau') ? subtext.indexOf('tuan sau') + 8 : subtext.indexOf('next week') + 9;
        }

        const targetDate = new Date();
        targetDate.setDate(today.getDate() + daysToAdd);
        targetDate.setHours(17, 0, 0, 0);
        matchedDate = targetDate;
        rawDateText = text.substr(idx, rule.name.length + suffixOffset);
        break;
      }
    }
  }

  // Check for absolute dates like dd/mm or dd-mm
  if (!matchedDate) {
    const dateRegex = /\b(\d{1,2})[\/\-](\d{1,2})\b/;
    const match = text.match(dateRegex);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // 0-indexed
      const year = today.getFullYear();
      
      const targetDate = new Date(year, month, day, 17, 0, 0, 0);
      // If date already passed in this year, assume next year
      if (targetDate < today && (today.getTime() - targetDate.getTime() > 24*3600*1000)) {
        targetDate.setFullYear(year + 1);
      }
      matchedDate = targetDate;
      rawDateText = match[0];
    }
  }

  // Check for shorthand relative days like "2d", "3d", "2 ngày nữa"
  if (!matchedDate) {
    const relativeRegex = /\b(\d+)\s*(d|ngay|days|ngay nua)\b/i;
    const match = normalizedText.match(relativeRegex);
    if (match) {
      const days = parseInt(match[1]);
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + days);
      targetDate.setHours(17, 0, 0, 0);
      matchedDate = targetDate;
      const originalIdx = normalizedText.indexOf(match[0]);
      rawDateText = text.substr(originalIdx, match[0].length);
    }
  }

  dueDate = matchedDate;
  const tags = [];

  // Process word by word to identify tokens and other simple parameters
  const tokens = [];
  let cleanWords = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Ignore whitespace tokens, just add them as is
    if (/^\s+$/.test(word)) {
      tokens.push({ type: 'space', text: word });
      continue;
    }

    const trimmedWord = word.trim();
    const lowerWord = trimmedWord.toLowerCase();
    
    // Check if word is assignee
    if (trimmedWord.startsWith('@')) {
      const username = lowerWord.substring(1);
      const matchedUser = USERS.find(u => u.username === username);
      if (matchedUser) {
        assignee = matchedUser;
        tokens.push({ type: 'assignee', text: word, value: matchedUser });
        continue;
      }
    }

    // Check if word is priority
    if (trimmedWord.startsWith('#')) {
      const matchPrio = PRIORITIES.find(p => p.keys.includes(lowerWord));
      if (matchPrio) {
        priority = matchPrio.id;
        tokens.push({ type: 'priority', text: word, value: matchPrio });
        continue;
      } else {
        // If it starts with # and is not a priority, it is a tag!
        const tagText = trimmedWord.substring(1);
        if (tagText && !tags.includes(tagText.toLowerCase())) {
          tags.push(tagText.toLowerCase());
        }
        tokens.push({ type: 'tag', text: word, value: tagText.toLowerCase() });
        continue;
      }
    }

    // Check if this word starts a slash command
    if (trimmedWord.startsWith('/')) {
      tokens.push({ type: 'command', text: word });
      continue;
    }

    // Check if this word belongs to the matched date text
    if (rawDateText && rawDateText.toLowerCase().includes(lowerWord)) {
      // Basic check: we want to ensure we don't accidentally swallow regular words
      // So only mark it as date if the date text is active and covers this
      tokens.push({ type: 'date', text: word });
      continue;
    }

    // Default text word
    tokens.push({ type: 'text', text: word });
    cleanWords.push(word);
  }

  // Reconstruct clean title by joining text words, removing leading/trailing punctuation/spaces
  let cleanText = cleanWords.join('').replace(/\s+/g, ' ').trim();
  
  // Strip trailing punctuation
  cleanText = cleanText.replace(/[,;.:!#@\-\s]+$/, '').trim();

  // Fallback title if empty
  if (!cleanText) {
    cleanText = 'Nhiệm vụ mới';
  }

  return {
    cleanText,
    assignee,
    priority,
    dueDate,
    tags,
    tokens
  };
}

