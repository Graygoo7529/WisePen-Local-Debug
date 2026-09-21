# 在现有工作台复现长期记忆问题

使用「长期记忆」「Agent 配置」「对话」页面。两组对照都固定 Chat 地址 `http://127.0.0.1:9200`，停止 Python 服务后切换代码；前端、Java 服务、测试账号、Agent 发布版本、模型、Provider 和提示词保持不变。

## 准备环境

1. 按[环境配置指南及子文档](https://njn3pha612.feishu.cn/wiki/QY3awcna7iJTeSkllngcyR6kn6c)连接校园网或 VPN，配置 Nacos、MongoDB、Redis、Kafka、Qdrant、模型 Provider 与 Java 服务。先确认普通对话可用，并使用已开通个人资源空间的测试账号。
2. 将本仓库与用于验证的 Python 检出放在同一级目录，分别命名为 `WisePen-Local-Debug`、`WisePenCloud-AI-review`。Python 使用锁定依赖中的 Mem0 2.0.5，执行 `uv sync --package wisepen-chat-service`。
3. 在工作台目录执行 `pnpm install`、`pnpm tauri dev`。复制 `wisepen-local.config.example.json` 为 `wisepen-local.config.json`，填写测试身份与服务地址，再在「设置」导入。Chat 地址填写 `http://127.0.0.1:9200`。工作台 `X-Developer` 与 Java、Python 的开发者配置须一致。
4. 准备 Python Chat 使用的本地 `.env`，在 **WisePenCloud-AI-review 目录**的终端定义以下命令。后续 Python 命令均在此目录执行。

```bash
export CHAT_ENV_FILE=/绝对路径/到/chat.env

memory_review() {
  uv run --no-sync --package wisepen-chat-service python \
    ../WisePen-Local-Debug/scripts/reproduce_memory.py "$@" \
    --source "$PWD" --env-file "$CHAT_ENV_FILE" \
    --config ../WisePen-Local-Debug/wisepen-local.config.json
}
```

如果尚未配置 `wisepen-dev-server` 的域名解析，在调用时加 `--dev-host <开发服务器 IP>`。脚本仅调整当前 Python 进程，不修改系统 hosts。

## 切换修复前后版本

各 Python PR 的描述列出对应的基线与修复提交。在专用检出目录先获取该 PR，再按下面顺序操作：

```bash
git fetch origin pull/<PR编号>/head
git switch --detach <修复前提交>
memory_review serve
# 完成页面操作并截图后，按 Ctrl+C，等待服务退出。
git switch --detach <修复后提交>
memory_review serve
```

如果该组使用故障注入，两个版本的 `serve` 命令必须带相同参数。每次截图都保留相同页面范围，红框标出同一区域；对话各使用一个空会话。切换期间不重新发布 Agent，不改权限或模型设置。

## 读取已保存的长期记忆

1. 首次启动前执行 `memory_review seed`。命令用 Mem0 的 `add(..., infer=False)` 写入 25 条确定的测试事实，再读回核对；不依赖模型是否抽取出事实。其中一条为 `我的午餐偏好是不放香菜。`，其余是编号书架资料，用于检查超过 SDK 默认 20 条的列表。
2. 测试数据位于按测试用户区分的 `wisepen_memory_review_*` Qdrant 集合，前后版本使用同一集合。命令不清空已有集合，重复执行只补缺少的测试事实；首次确认 25 条后，两版对照期间不再执行 `seed`。
3. 启动修复前版本，在「长期记忆」点击「刷新」，列表上限选择「最多 100 条」。记录加载错误。切换修复后版本，在同一页面点击「刷新」，应显示已加载 25 条，并能读到午餐偏好。
4. 在「Agent 配置」创建 Agent，关闭会话记忆、摘要、工具、Skill、自动标题，**开启长期记忆**，召回数设为 `5`，语义分数阈值设为 `0.6`。选择可用的模型和 Provider，系统提示词填写：`只依据长期记忆回答午餐偏好。没有相关记忆时只回复：不知道。有相关记忆时只回复具体偏好。` 保存并发布一次。
5. 在修复前版本的「对话 → 新建会话」选择该 Agent。请求参数中不启用临时工具或 Skill，不添加前端上下文与附件。发送：`我的午餐有什么饮食偏好？`。记录答案。
6. 停止服务，切换修复后版本，以相同 Agent 发布版本新建空会话，发送同一句话。修复前丢失记忆，回答不知道；修复后应能回答不放香菜。问题本身没有写入答案，新会话也没有历史可供回填。

检索结果受当前嵌入模型的语义分数影响。若列表能读取而问答没有命中，先核对语义阈值与嵌入模型；调整条件后必须重新运行两版对照，不能仅修改其中一版。

## 关闭长期记忆时，初始化故障是否仍阻断聊天

1. 在「Agent 配置」创建另一 Agent，**关闭长期记忆**，也关闭会话记忆、摘要、工具、Skill、自动标题，选择可用的模型与 Provider。系统提示词填写：`只回复用户指定的短句。` 保存并发布。
2. 两个版本都用 `memory_review serve --memory-init-fail` 启动。该参数令本机 Python 进程的 `Memory.from_config()` 抛出连接异常，不停止 Qdrant，也不影响其他服务。
3. 在「对话 → 新建会话」选择该 Agent，清空请求参数中的上下文和临时覆盖，发送：`只回复：长期记忆关闭时，聊天仍然可用。`
4. 修复前请求因记忆初始化失败而显示错误；修复后应显示指定回复。停止服务、切换版本、新建空会话后重复同一步骤。
5. 验证启用时的失败提示，可在修复后版本打开「长期记忆」点击「刷新」，应看到「长期记忆服务暂不可用，请稍后重试」。初始化失败后 30 秒内不重新创建客户端。
6. 验证初始化等待上限，停止服务后改用 `memory_review serve --memory-init-delay 15`。打开「长期记忆」点击「刷新」，修复后应在约 10 秒显示「长期记忆操作超时，请稍后重试」；该后台初始化仍继续，同一进程中的其他请求共用这一次初始化。

故障注入只用于上述本机进程。验证结束后停止服务，使用 `memory_review serve` 恢复正常启动。长期记忆启用后的检索、列表正确性由读取契约修复验收；两项修复都合入后再跑一遍两组流程。
