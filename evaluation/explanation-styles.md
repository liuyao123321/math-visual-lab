# 简洁／详细答疑风格调整

日期：2026-10-28。仅本地修改，未发布、未读取密钥、未调用真实模型。

## 原因与修改

原实现两种模式共用同一段步骤正文，仅隐藏依据和易错提醒；服务端仅用一句话区分要求。

- 简洁：最短可核验路径、每步一句关键操作和公式；依据及必要条件始终显示。额外说明、易错点、自检可展开，不截取正文、不省略证明或定义域。
- 详细：目标、为什么这样做、中间推导、定理依据、适用条件、局部自检。简单题不强制凑步数，不以重复或堆字数代替解释。
- 对普通求解和步骤追问分别约束风格，追问仍只回应学生困惑；hint-only 保留不泄露答案约束。
- 步骤 schema 新增可选 summary / goal / conditions / verification；旧解析仍可读取，没有这些字段时不伪造补充内容，不迁移存储。
- 三个离线示例添加人工核验的教学注释。模式切换保留原题、步骤 ID、公式、答案和学习进度；不额外调用付费服务。AI 题仍按既有流程重新生成。
- 错题详情复用详细步骤展示，保留新增条件与自检说明。

## 文件

- lib/explanation-style.ts：生成风格要求。
- app/api/tutor/route.ts：求解与追问提示词接入。
- lib/math-schema.ts：兼容旧数据的可选教学字段。
- lib/example-explanations.ts：离线教学注释。
- components/solution-step-content.tsx：两种阅读层级。
- components/solve-workspace.tsx、components/mistake-details.tsx：步骤展示与模式切换。
- components/solution-step-content.test.tsx、components/solve-workspace.test.tsx、app/api/tutor/route.test.ts：差异、条件保留、旧数据、示例数学不变、刷新恢复、代理字段保留。

## 验证边界

全量自动化 46 文件／369 项通过（含同时存在的其他模块测试）；最后错题详情复用后的定向测试 18 项通过。类型检查与目标文件 lint 通过。所有模型响应为模拟接口，不代表真实 DeepSeek 已遵循新风格；未取得本轮浏览器截图，未进行真实模型质量对比。生产构建上轮存在 dist/client 占用，本轮未再清理或停止服务器。

对已有 AI 题切换模式会触发既有重新生成流程；仅重新打开历史解析不会无提示调用模型。真实效果需使用网站已有配置，分别对同一道题选择简洁／详细重新解析核对。
