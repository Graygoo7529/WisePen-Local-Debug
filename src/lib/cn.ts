/** 合并 class 名（跳过 falsy），保持调用处可读。 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
