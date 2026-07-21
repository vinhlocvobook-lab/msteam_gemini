# Synapse Collaboration - Project Handover Document

Welcome to **Synapse Collaboration** (v1.0), a premium, state-of-the-art task management dashboard featuring real-time collaborative multi-user simulations, natural language processing (NLP) smart input, and highly responsive glassmorphic interfaces.

This folder contains comprehensive developer-level documentation designed to enable future software engineering teams or AI Large Language Models (LLMs) to seamlessly take over, understand, and continue expanding this project.

---

## 📂 Project Directory Structure

Below is the directory map of the codebase to help you orient yourself quickly:

```text
tasks_management_gemini/
├── docs/                             # Project Handover Documentation
│   ├── README.md                     # [This File] Main Handover & Quick Start
│   ├── ARCHITECTURE.md               # Architecture, Component Architecture & Engines
│   ├── DEVELOPMENT_GUIDE.md          # Extension Guide for Teams and AI LLMs
│   ├── ENVIRONMENT_GUIDE.md          # Environment Management & Dev/Prod Transition Guide
│   ├── APACHE_SUBPATH_DEPLOYMENT.md  # Apache Subpath Deployment Guide (/mptech & /mptech_task_management)
│   ├── CORS_TROUBLESHOOTING.md        # CORS Origin Configuration & Troubleshooting Guide
│   └── user_guide/                   # User Guides
│       └── create_task.md            # Detailed Task Creation Guide (Vietnamese)
├── src/
│   ├── components/                   # React Functional Components
│   │   ├── KanbanBoard.jsx           # Interactive Kanban Board (Drag & Drop, Inline Edits)
│   │   ├── Sidebar.jsx               # Accordion-style Team & Activity Collapsible Panel
│   │   ├── SmartInput.jsx            # Highlighted NLP Smart Textarea with Autocomplete
│   │   └── TaskEditorModal.jsx       # Detailed Task metadata editor & comments list
│   ├── utils/
│   │   └── nlpParser.js              # Tokenization, Regex & Vietnamese NLP Date parsing
│   ├── App.jsx                       # State synchronization, Real-time Simulator & Layout
│   ├── index.css                     # Premium Glassmorphism styling & animations system
│   └── main.jsx                      # React mounting entrypoint
├── index.html                        # Standard HTML5 skeleton & modern fonts imports
├── vite.config.js                    # Vite bundler configuration
├── package.json                      # DevDependencies, Scripts & packages catalog
├── .gitignore                        # Git best practice exclude configuration
├── .env_sample                       # Sample structure for environment variables
└── .env                              # Official environment variables (Local git-ignored)
```

---

## 🛠️ Technology Stack & Dependencies

The project is built entirely on a modern, ultra-lightweight frontend stack with high-performance execution:

*   **Framework**: [React 19](https://react.dev/) (Functional components, hooks, high-efficiency state reconciliation).
*   **Styling**: Vanilla CSS3 + Premium Glassmorphism Design System (custom variables, HSL Tailwind-like harmonious dark mode palette, hardware-accelerated transitions, and GPU-driven animations).
*   **Icons**: [Lucide React](https://lucide.dev/) (clean vector stroke icons).
*   **Build Tool**: [Vite 8](https://vite.dev/) (extremely fast Hot Module Replacement (HMR) and optimized rollup production bundles).
*   **NLP Parser**: Custom JavaScript Regex tokenization supporting Vietnamese diacritics and relative date-time indicators.

---

## 🚀 Step-by-Step Local Setup

To run the application locally on your development system, follow these steps:

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) (version 18.0 or higher) and `npm` installed.

### 2. Clone and Checkout Branch
Ensure you checkout the active feature branch containing the latest sidebar and picker updates:
```bash
# Clone the repository
git clone https://github.com/vinhlocvobook-lab/msteam_gemini.git
cd msteam_gemini

# Fetch all branches and switch to the development feature branch
git fetch origin
git checkout feature/collapsible-right-sidebar
```

### 3. Install Dependencies
Install all required Node modules specified in `package.json`:
```bash
npm install
```

### 4. Run Development Server
Start the local development server with Vite:
```bash
npm run dev
```
By default, the application will mount at [http://localhost:5173/](http://localhost:5173/).

### 5. Build for Production
To bundle the assets into optimized minified files:
```bash
npm run build
```
The built static files will be exported to the `dist/` directory.

---

## 🔄 Git Branching and Release Management

We follow standard Git Flow best practices to ensure repository health:
*   `main`: Holds the stable production-ready code.
*   `develop`: The integration branch for active development.
*   `feature/*`: Feature branches spawned for distinct tasks (e.g. `feature/collapsible-right-sidebar`).

> [!IMPORTANT]
> The current changes reside in `feature/collapsible-right-sidebar`. Before merging to `develop`, please run a build (`npm run build`) to ensure 0 compilation errors.

---

## 📖 Handover Documents Index
To deep dive into the code mechanics, proceed to the following guides:
1.  👉 **[Architecture Guide (docs/ARCHITECTURE.md)](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/docs/ARCHITECTURE.md)**: Details the inner workings of components, NLP engines, simulator loops, and local storage schemas.
2.  👉 **[Development & Extension Guide (docs/DEVELOPMENT_GUIDE.md)](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/docs/DEVELOPMENT_GUIDE.md)**: Provides copy-paste templates and instructions for adding columns, extending NLP tokens, or creating new components.
3.  👉 **[Task Creation User Guide (docs/user_guide/create_task.md)](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/docs/user_guide/create_task.md)**: Detailed manual for end users on creating and managing tasks using NLP Smart Input and detailed editors.
