# 错题集：局部设计实施约定

目标：`components/mistakes-view.tsx`，Operate 模式，code-led。用户已明确确认两张参考图及完整交互要求，不再进行方向抽选。

## Direction contract

THESIS：用题目优先的色块卡片浏览错题，拒绝在列表首屏展开全部编辑表单。

OWN-WORLD：沿用本站字体、纸白／墨色工具栏与导航；高数深绿、线代墨蓝、概率灰紫、其他暖白，课程到颜色固定映射。圆角与留白依用户参考图，内容不按卡片高度裁切。

STORY：搜索或组合过滤找到题目，独立排序，进入详情核对完整原题、解析和手写步骤，修改笔记／掌握状态，再次练习或确认删除。不会调用模型。

FIRST VIEWPORT：左上“错题集”与真实计数；右上“过滤”和紧邻其右的“排序依据”；第二行搜索／掌握状态，随后是已选条件及三列卡片。平板两列、手机单列。图标、题目、课程、状态和收藏日期构成卡片，编辑聚焦到可访问详情对话框。

FORM：扩展现有页面，使用用户指定的网格布局与两级过滤，无新视觉世界抽选。seed: none (unavailable)。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

限制：上下文引擎未安装且无缓存写权限，采用手动上下文读取。不迁移存储格式、不改共享导航或其他页面；视图纯函数与组件测试不冒充浏览器截图验收。若无法取得实际截图，视觉验收须明确标为未完成。此文件为开发说明，不进入浏览器输出。
