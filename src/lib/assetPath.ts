export function validateAssetLocation(path: string, name: string): string | null {
  if (
    !path ||
    !path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("//") ||
    path.includes("/../") ||
    path.endsWith("/..") ||
    (path !== "/" && path.endsWith("/"))
  ) {
    return "目录必须以 / 开头，且非根目录不能以 / 结尾";
  }
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return "文件名不能为空，也不能包含路径分隔符";
  }
  return null;
}
