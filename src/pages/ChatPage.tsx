import { useEffect, useRef, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { MessageItem } from "../components/chat/MessageItem";
import { Composer } from "../components/chat/Composer";
import { RequestOptionsPanel } from "../components/chat/RequestOptionsPanel";
import {
  partsFromLiveTurn,
  partsFromUIMessage,
  userPartsFromLiveTurn,
} from "../components/chat/chatDisplay";
import { Button, EmptyState, IconButton, Spinner } from "../components/ui";
import { formatRelativeTime } from "../lib/format";
import { Link } from "react-router-dom";

export default function ChatPage() {
  const loadSessions = useChatStore((s) => s.loadSessions);
  const sessions = useChatStore((s) => s.sessions);
  const session = useChatStore((s) => s.currentSession);
  const history = useChatStore((s) => s.history);
  const historyTotal = useChatStore((s) => s.historyTotal);
  const historyLoading = useChatStore((s) => s.historyLoading);
  const loadOlderHistory = useChatStore((s) => s.loadOlderHistory);
  const liveTurns = useChatStore((s) => s.liveTurns);
  const sending = useChatStore((s) => s.sending);
  const syncCurrentTurn = useChatStore((s) => s.syncCurrentTurn);
  const fromSource = useSettingsStore((s) => s.fromSource);
  const userId = useSettingsStore((s) => s.userId);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新内容时若用户在底部附近则自动滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [history, liveTurns, sending]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const hasMoreHistory = history.length < historyTotal;
  const emptyConversation = history.length === 0 && liveTurns.length === 0;

  return (
    <div className="flex h-full">
      <SessionSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 会话头部 */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg-elev px-4">
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm font-semibold">
              {session ? session.title || "未命名会话" : "对话"}
            </span>
            {session && (
              <span className="ml-2 text-xs text-fg-faint">
                更新于 {formatRelativeTime(session.updated_at)} · {session.id}
              </span>
            )}
          </div>
          {session && (
            <IconButton title="刷新并恢复会话" onClick={() => void syncCurrentTurn()}>
              <RefreshCw size={14} />
            </IconButton>
          )}
        </div>

        {/* 消息区 */}
        {!fromSource || !userId ? (
          <EmptyState
            icon={<MessageSquare size={36} />}
            title="尚未配置身份凭据"
            description="请先在设置页填写 X-From-Source 与 X-User-Id，或从 wisepen-local.config.json 配置文件导入。"
            action={
              <Link to="/settings">
                <Button variant="primary">前往设置</Button>
              </Link>
            }
          />
        ) : (
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-3">
            {hasMoreHistory && (
              <div className="mb-2 flex justify-center">
                <Button size="xs" variant="outline" loading={historyLoading} onClick={() => void loadOlderHistory()}>
                  加载更早的消息（{history.length}/{historyTotal}）
                </Button>
              </div>
            )}
            {historyLoading && history.length === 0 && (
              <div className="flex justify-center py-10">
                <Spinner size={20} />
              </div>
            )}
            {emptyConversation && !historyLoading && (
              <EmptyState
                icon={<MessageSquare size={36} />}
                title={sessions.length === 0 ? "开始第一个对话" : "该会话还没有消息"}
                description="输入问题后回车发送；可点输入框左下的滑杆图标调整模型、Skill、工具与上下文参数。"
              />
            )}
            {history.map((msg) => (
              <MessageItem
                key={msg.id}
                role={msg.role === "user" ? "user" : "assistant"}
                parts={partsFromUIMessage(msg)}
                createdAt={msg.createdAt ? formatRelativeTime(msg.createdAt) : undefined}
              />
            ))}
            {liveTurns.map((turn) => (
              <div key={turn.id}>
                <MessageItem role="user" parts={userPartsFromLiveTurn(turn)} />
                <MessageItem
                  role="assistant"
                  parts={partsFromLiveTurn(turn)}
                  streaming={turn.status === "streaming" || turn.status === "cancelling"}
                  rawEvents={turn.rawEvents}
                />
              </div>
            ))}
          </div>
        )}

        {/* 请求参数面板（可折叠） */}
        {optionsOpen && <RequestOptionsPanel />}

        <Composer optionsOpen={optionsOpen} onToggleOptions={() => setOptionsOpen((v) => !v)} />
      </div>
    </div>
  );
}
