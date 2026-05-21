# Synapse Collaboration - Developer Extension Guide

This guide is designed for future software developers or AI LLMs who want to extend Synapse, add new features, or alter the core behavior. Below are step-by-step instructions and code snippets for common extension requests.

---

## 🎨 1. Customizing Themes and CSS Tokens

The application uses custom CSS variables at the root of `src/index.css` to build the entire glassmorphic design system. You can easily adjust colors, borders, and shadows globally:

```css
/* Locate in src/index.css */
:root {
  --bg-primary: #09090b;             /* Deep obsidian primary backdrop */
  --bg-secondary: #121214;           /* Secondary card background */
  --bg-card: rgba(24, 24, 27, 0.7);  /* Translucent glass card base */
  
  --primary: #8b5cf6;                /* Neon Purple accents */
  --primary-hover: #7c3aed;          /* Darker purple hover states */
  --primary-glow: rgba(139, 92, 246, 0.25);
  
  --success: #10b981;                /* Emerald Green accents */
  --warning: #f59e0b;                /* Gold Yellow accents */
  --danger: #ef4444;                 /* Crimson Red accents */
  
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  --glass-border: 1px solid rgba(255, 255, 255, 0.06);
}
```

---

## ➕ 2. Adding a New Column to the Kanban Board

If you want to add a fifth column to the board (e.g. "Lưu trữ" / "Archive" or "Kiểm thử" / "Testing"):

### Step 1: Update Columns Array in `src/components/KanbanBoard.jsx`
Open `src/components/KanbanBoard.jsx`, find the `COLUMNS` list around line 15, and add your column definition:
```javascript
const COLUMNS = [
  { id: 'todo', title: 'Cần làm', color: '#a1a1aa' },
  { id: 'in_progress', title: 'Đang làm', color: '#8b5cf6' },
  { id: 'review', title: 'Đang review', color: '#06b6d4' },
  { id: 'testing', title: 'Đang kiểm thử', color: '#f59e0b' }, // <-- NEW COLUMN
  { id: 'done', title: 'Hoàn thành', color: '#10b981' }
];
```

### Step 2: Update CSS Grid Tracks in `src/index.css`
Open `src/index.css`, locate `.kanban-board` around line 560, and adjust the grid tracks to fit 5 columns seamlessly:
```css
.kanban-board {
  display: grid;
  grid-template-columns: 
    var(--col-todo, minmax(200px, 1fr))
    var(--col-in_progress, minmax(200px, 1fr))
    var(--col-review, minmax(200px, 1fr))
    var(--col-testing, minmax(200px, 1fr)) /* <-- ADDED */
    var(--col-done, minmax(200px, 1fr));
  gap: 16px;
  overflow-x: auto;
}
```

---

## 👥 3. Adding a New Team Member (Mock Users)

Mock users are defined in `src/utils/nlpParser.js`. To add a new designer or developer:

Open `src/utils/nlpParser.js`, locate the `USERS` array at line 1, and append the new user profile:
```javascript
export const USERS = [
  { 
    id: 'vy', 
    name: 'Phạm Khánh Vy', 
    username: 'vy', 
    role: 'QA Engineer', 
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80', 
    color: '#06b6d4' 
  }, // <-- NEW USER
  // ... existing users
];
```
*Note: The new member will instantly show up in the top role switcher, assignee selection lists, comments author threads, and is automatically supported by the NLP parser (`@vy`).*

---

## 🧠 4. Extending the NLP Parser

You can easily enrich the AI Smart Input parser with more diacritic keys or relative date-time expressions.

### Adding New Priority Hashtags
To add shorthands like `#hot` or `#priority1` to trigger "high priority":
Open `src/utils/nlpParser.js`, find the `PRIORITIES` array at line 8, and add keys to the `keys` array:
```javascript
export const PRIORITIES = [
  { id: 'high', label: 'Khẩn cấp', color: '#ef4444', keys: ['#cao', '#gap', '#khan-cap', '#high', '#urgent', '#critical', '#hot', '#p1'] }, // <-- ADDED '#hot', '#p1'
  // ...
];
```

### Adding New Relative Dates
To support expressions like `cuối tuần` (end of week $\rightarrow$ Saturday):
Open `src/utils/nlpParser.js`, locate `dateRules` around line 63, and add a rule:
```javascript
const dateRules = [
  // ...
  { phrase: 'cuoi tuan', daysToAdd: 6 - today.getDay(), label: 'Cuối tuần' }, // <-- NEW RULE
  // ...
];
```

---

## 🤖 5. Customizing Simulator Engine Timing and Probabilities

If you want to speed up simulated user actions or change what actions they perform:

Open `src/App.jsx` and search for `REAL-TIME SIMULATION ENGINE` around line 223:
*   **Speed Up/Slow Down Loops**: Adjust the interval time at the bottom of the `useEffect` block (default is `18000`ms or 18 seconds):
    ```javascript
    }, 12000); // <-- Trigger simulated actions faster (every 12 seconds)
    ```
*   **Altering Probabilities**: Locate the action random selector around line 262:
    ```javascript
    const randAction = Math.random();
    if (randAction < 0.3) {
      // Action A: Move a task (30% chance)
    } else if (randAction < 0.6) {
      // Action B: Create task via NLP (30% chance)
    } else {
      // Action C: Custom Action (40% chance)
    }
    ```
