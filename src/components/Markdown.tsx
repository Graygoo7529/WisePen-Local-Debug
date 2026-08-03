import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";

/** Markdown 渲染（GFM），样式见 index.css 的 .md-body。 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("md-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
