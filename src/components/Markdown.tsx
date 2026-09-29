import ReactMarkdown from "react-markdown";
import type { Components, UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";

/** Markdown 渲染（GFM），样式见 index.css 的 .md-body。 */
export function Markdown({ text, className, components, urlTransform }: {
  text: string;
  className?: string;
  components?: Components;
  urlTransform?: UrlTransform;
}) {
  return (
    <div className={cn("md-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>{text}</ReactMarkdown>
    </div>
  );
}
