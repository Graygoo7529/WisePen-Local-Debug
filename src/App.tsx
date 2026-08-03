import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  Bot,
  Brain,
  Compass,
  Cpu,
  FolderOpen,
  MessageSquare,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Wrench,
} from "lucide-react";
import { cn } from "./lib/cn";
import { useSettingsStore } from "./stores/settingsStore";
import { IconButton } from "./components/ui";
import { Toasts } from "./components/Toasts";
import ChatPage from "./pages/ChatPage";
import SkillsPage from "./pages/SkillsPage";
import AgentsPage from "./pages/AgentsPage";
import ModelsPage from "./pages/ModelsPage";
import ToolsPage from "./pages/ToolsPage";
import MemoryPage from "./pages/MemoryPage";
import ResourcesPage from "./pages/ResourcesPage";
import ExplorerPage from "./pages/ExplorerPage";
import SettingsPage from "./pages/SettingsPage";

const NAV_ITEMS = [
  { to: "/chat", label: "对话", icon: MessageSquare },
  { to: "/skills", label: "Skill 工坊", icon: Sparkles },
  { to: "/agents", label: "Agent 配置", icon: Bot },
  { to: "/models", label: "模型与 Provider", icon: Cpu },
  { to: "/tools", label: "工具与 MCP", icon: Wrench },
  { to: "/memory", label: "长期记忆", icon: Brain },
  { to: "/resources", label: "资源浏览", icon: FolderOpen },
  { to: "/explorer", label: "端点探索器", icon: Compass },
];

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const setSettings = useSettingsStore((s) => s.set);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex h-full">
      {/* 侧边导航 */}
      <aside className="flex w-[208px] shrink-0 flex-col border-r border-line bg-bg-elev">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2c.3 0 .58.16.72.43l5.2 9.9a1 1 0 0 1-.05.93l-4.9 8.4a.84.84 0 0 1-1.94-.02l-4.9-8.38a1 1 0 0 1-.05-.93l5.2-9.9c.14-.27.42-.43.72-.43Zm0 6.1a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z" />
            </svg>
          </div>
          <div>
            <div className="text-sm leading-4 font-semibold">WisePen Local</div>
            <div className="mt-0.5 text-[11px] text-fg-faint">本地调试工作台</div>
          </div>
        </div>

        <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-bg-hover hover:text-fg",
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                isActive ? "text-accent" : "text-fg-muted hover:text-fg",
              )
            }
          >
            <Settings size={16} />
            设置
          </NavLink>
          <IconButton
            title={theme === "dark" ? "切换浅色" : "切换深色"}
            onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="min-w-0 flex-1 overflow-hidden bg-bg">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>

      <Toasts />
    </div>
  );
}
