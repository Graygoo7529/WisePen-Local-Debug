# 在现有工作台复现 Chat 修复

使用「对话」「Agent 配置」「Skill 工坊」「端点探索器」和「设置」比较修复前后。工作台和 Java 服务保持不变，Python Chat 始终监听 `http://127.0.0.1:9200`，每次停止服务后再切换源码。

## 准备环境

1. 按[环境配置指南及子文档](https://njn3pha612.feishu.cn/wiki/QY3awcna7iJTeSkllngcyR6kn6c)配置 VPN、Nacos、MongoDB、Redis、Kafka、模型 Provider 和 Java 服务。工作台需要 Node.js、pnpm、Rust 与 Tauri 2 的系统依赖，Python 服务需要 Python 3.12 与 uv。先确认普通对话可用，并使用已开通个人资源空间的测试账号。
2. 将 WisePen Local 和专用于验证的 WisePenCloud-AI 检出放在同一级目录，目录名分别使用 `WisePen-Local-Debug`、`WisePenCloud-AI-review`。在 Local 中执行 `pnpm install`、`pnpm tauri dev`。复制 `wisepen-local.config.example.json` 为 `wisepen-local.config.json`，填写自己的测试身份，在「设置」导入。Chat 地址填写 `http://127.0.0.1:9200`，这是下面命令启动的本机 Python 服务地址；其余服务地址按环境指南填写。
3. 在 AI 检出目录配置 Python Chat 使用的本地 `.env` 并执行 `uv sync --package wisepen-chat-service`。`X-Developer` 须与本机 Java 服务及 Python 服务的开发者配置一致。记下这个 `.env` 的绝对路径。
4. 在 **WisePenCloud-AI-review 目录**的终端定义下面的命令。后续命令均在此目录执行。第二个终端也需要定义此函数和环境变量。

```bash
export CHAT_ENV_FILE=/绝对路径/到/chat.env

chat_review() {
  uv run --no-sync --package wisepen-chat-service python \
    ../WisePen-Local-Debug/scripts/reproduce_chat.py "$@" \
    --source "$PWD" --env-file "$CHAT_ENV_FILE" \
    --config ../WisePen-Local-Debug/wisepen-local.config.json
}
```

如果本机尚未配置 `wisepen-dev-server` 的域名解析，可以在调用时附加 `--dev-host <开发服务器 IP>`。此参数只改变当前 Python 进程的解析。

## 切换版本

下表使用各 PR 的修复基线和修复提交，两者之间只包含该 PR 的改动。AI 检出目录的 `origin` 应指向 `https://github.com/Oriole-FDU/WisePenCloud-AI.git`。先 `git fetch origin pull/<PR编号>/head`，再在专用检出目录执行 `git switch --detach <提交>`。

| PR | 修复前 | 修复后 |
| --- | --- | --- |
| #95 | `576f759088701e603e7822805780e35e9be802f4` | `9344df96facbb618686ed6ddcb61534563a2c6f8` |
| #96 | `576f759088701e603e7822805780e35e9be802f4` | `31d7845c6ddbfcc224df3fa09cdccc99a73bce2b` |
| #97 | `576f759088701e603e7822805780e35e9be802f4` | `d8064f22d41ae95b643d3c4ed5ccf19b401f17c5` |
| #98 | `48ef3ec4263cc11c99d6ce29da62259bf68efd9c` | `d6b4ef01ab6f6a9298a6600908e253fe4a2b6725` |

以 #95 为例：

```bash
git fetch origin pull/95/head
git switch --detach 576f759088701e603e7822805780e35e9be802f4
chat_review serve --archive-fail
# 完成页面操作并截图后，按 Ctrl+C，等待进程退出。
git switch --detach 9344df96facbb618686ed6ddcb61534563a2c6f8
chat_review serve --archive-fail
```

每组比较使用同一测试用户、已发布 Agent 版本、模型、Provider、提示词及资源权限；为两个版本分别新建空会话，重复相同操作。工作台的服务地址始终不变。「请求参数」中的临时 Skill、工具覆盖保持关闭，并清除上一组测试留下的前端上下文；#97 再按步骤添加笔记上下文。版本切换期间不修改 Agent 配置、不重新发布版本。

## #95：保存失败能否在对话中看到

1. 在「Agent 配置」创建 Agent，开启对话记忆和持久化记忆，关闭对话摘要、工具、Skill、自动标题，选择可用模型并发布。系统提示词填写：`只回复用户指定的短句，不调用工具。`
2. 启动 Chat 时加上 `--archive-fail`。该注入仅令配置文件中测试用户的 assistant 消息写入失败，user 消息照常保存。
3. 在「对话」点击「新建会话」，选择上述 Agent，发送：`只回复：这条答案用于验证保存失败。`
4. 在当前页面观察答案下方：修复前没有保存错误；修复后显示「聊天消息持久化失败」。截图须在刷新会话前保存，因为失败的 assistant 消息不会进入历史。
5. 展开「原始 SSE 事件」可继续核对：修复前存在 `finish`；修复后出现 `error`，没有 `finish`。

成功路径可将启动参数改为 `--archive-delay 8`，两个版本均使用相同延迟。在「端点探索器」选择 Chat、GET、`/chat/session/listHistoryMessages`，查询参数填写 `session_id=<会话 ID>`、`page=1`、`size=20`。修复前在 8 秒延迟内已收到 `finish`，历史还没有 assistant 消息；修复后收到 `finish` 时历史已有该消息。关闭故障注入后，用 `chat_review serve` 恢复正常启动。

## #96：清缓存后是否记得刚才的暗号

1. 在「Agent 配置」创建测试 Agent，选择可用模型和 Provider，关闭自动标题。在 Spec 的 **JSON** 编辑模式中，将以下两个字段替换为给出的内容，其余字段保留。保存并发布。较低的摘要水位用于在两轮短对话内触发压缩；禁用历史工具可避免工具读取历史掩盖上下文回填结果。

```json
{
  "toolAndSkillPolicy": {
    "enableUseTool": true,
    "toolSelectionDefaultEnabled": false,
    "toolSelectionOverrides": {
      "get_historical_chat_messages": false,
      "inspect_cached_tool_output_structure": false,
      "read_cached_tool_output_by_page": false,
      "read_cached_tool_output_by_range": false,
      "read_cached_tool_output_by_section": false,
      "search_cached_tool_output_by_regex": false,
      "search_cached_tool_output_by_semantics": false
    },
    "enableUseSkill": false,
    "onDemandSkillIds": [],
    "skillMatchTopK": 20
  },
  "memoryPolicy": {
    "enableChatMemory": true,
    "enablePersistenceChatMemory": true,
    "enableChatMemorySummary": true,
    "highWatermarkRatio": 0.00002,
    "lowWatermarkRatio": 0.00001,
    "summaryPrompt": "",
    "enableLongTermMemory": false,
    "longTermMemoryLimit": 10,
    "longTermMemoryScoreThreshold": 0.6
  }
}
```

2. 使用 `chat_review serve` 启动对应版本，新建会话。依次发送以下两条内容，每条发送后等本轮结束。

```text
请记住旧背景：这个项目在周二开会，会议室叫竹林，负责人叫小林，计划先整理资料再讨论结论。这个背景只用于摘要。请简短确认。
```

```text
本轮新增的秘密暗号是「青柠松鼠-731」。请记住，只回复：记住了。
```

3. 从对话页标题下方复制会话 ID。在另一个终端运行 `chat_review inspect --session <会话ID>`。等待 `summary` 有内容，且摘要只含旧背景、不含暗号。若摘要未生成，先确认 Agent 水位值与会话绑定版本。
4. 执行 `chat_review evict --session <会话ID>`。输出中的 `cached_messages_after` 应为 `0`。命令只删除该测试用户的这一个会话热缓存，保留 MongoDB 历史与摘要。
5. 回到原会话发送：`刚才新增的秘密暗号是什么？只回答暗号；不知道就说不知道。`

修复前缺少暗号消息；修复后能回答「青柠松鼠-731」。这里比较的是已成功写入摘要后的回填路径。

## #97：关闭工具后，笔记上下文能否重新暴露工具

1. 在「Agent 配置」关闭「使用工具」和 Skill，关闭摘要，系统提示词填写：`按用户要求使用当前可用工具，不要编造工具结果。没有相应工具时请明确说无法调用。` 选择模型，保存并发布。
2. 使用 `chat_review serve` 启动对应版本，新建绑定该 Agent 的会话。点击输入框左下角「请求参数」，滚动到「前端上下文模拟」，点击「模拟打开笔记」，填入测试笔记资源 ID。保留「禁用」为关闭，收起参数面板。
3. 发送：`请调用 read_current_note_for_edit 读取当前打开的笔记，并报告实际结果。如果没有这个工具，只回复：无法调用笔记工具。`
4. 比较对话中的工具调用卡片。修复前仍能发起 `read_current_note_for_edit`；修复后没有该调用卡片，并回答无法调用。笔记内容能否读取还取决于 Note Collab 服务是否可用；此项判断依据是关闭开关后有无发起调用。

验证请求覆盖时，在新会话的「请求参数」开启「临时覆盖工具策略」，从「显式启用工具」选择一个已配置、可调用的工具，要求模型调用该工具。Agent 仍保持关闭工具。两个版本使用相同的覆盖值，比较有无工具调用卡片。

## #98：只有阅读权限时能否载入 Skill

1. 用资源所有者在「Skill 工坊」创建 Skill，上传 `SKILL.md` 并发布。正文填写：`加载后只回复：已载入权限验证技能。` 记下 Skill ID 与发布版本。
2. 在「端点探索器」选择 Resource、POST、`/resource/item/changeResourceActionPermission`，以资源所有者身份提交下列 JSON，将占位符替换为测试 Skill 和另一测试用户的 ID。使用独立测试 Skill，避免覆盖其他资源的既有权限。

```json
{
  "resourceId": "<Skill ID>",
  "overrideGrantedActions": {},
  "specifiedUsersGrantedActions": {
    "<另一测试用户 ID>": ["DISCOVER", "VIEW"]
  }
}
```

3. 在「设置」切换为该测试用户。在「Agent 配置」创建自己的 Agent，开启工具和 Skill，将上述 Skill 加入按需 Skill，关闭摘要与自动标题，发布。系统提示词填写：`按用户指定的 Skill ID 调用 load_skill；调用成功后执行技能内容，被拒绝时只报告实际错误。`
4. 使用 `chat_review serve` 启动对应版本。在「对话」新建绑定该 Agent 的会话，发送：`请调用 load_skill 载入技能 <Skill ID>，报告实际结果。`
5. 展开 `load_skill` 调用卡片并点击「输出」，在刷新或切换会话前查看结果，Skill 正文在持久化历史中会被省略。修复前返回 Skill 内容，随后回答「已载入权限验证技能」；修复后输出 `Permission denied`，回答载入被拒绝。两个版本比较期间保持相同的 `DISCOVER + VIEW` 权限，均不授予 `LOAD`。其他权限来源也不能额外授予 `LOAD`；资源所有者不用于这一步的调用。
6. 正常载入另做一组验证：切回资源所有者，把权限数组改成 `["DISCOVER", "VIEW", "LOAD"]`，再以测试用户新建会话发送同一句话。修复后应能载入。该步骤不与只有阅读权限的截图混为一组对照。

自定义 Agent 的阅读/载入边界可以用相同的资源权限接口配置，创建会话时选择对应 Agent 验证：测试用户只有 `DISCOVER + VIEW` 时修复后应拒绝创建，授予 `LOAD` 后应能创建。
