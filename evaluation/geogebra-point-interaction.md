# GeoGebra 交互研究与本地集成

目标：借鉴路径约束和依赖更新，让导数示例可直接拖动切点。未移植 GeoGebra 源码、资源或运行时，未发布。

## 证据与范围

- [GeoPoint.setCoords](https://github.com/geogebra/geogebra/blob/main/source/shared/common/src/main/java/org/geogebra/common/kernel/geos/GeoPoint.java)：设置坐标时，如果有路径，会交给路径调整位置，再更新坐标。
- [AlgoPointOnPath](https://github.com/geogebra/geogebra/blob/main/source/shared/common/src/main/java/org/geogebra/common/kernel/algos/AlgoPointOnPath.java)：登记路径（及可选参数）为输入、路径点为输出，注册依赖；重新计算时由路径定位该点。
- [GeoElement.updateCascade](https://github.com/geogebra/geogebra/blob/main/source/shared/common/src/main/java/org/geogebra/common/kernel/geos/GeoElement.java)：存在级联更新入口。以上是公开源码静态观察，不代表对具体安装版本的运行时跟踪。
- [官方授权](https://github.com/geogebra/legal/blob/main/geogebra_license.md)区分 EUPL 1.2 源码与成品素材、语言资源的条款。本项目只参考交互机制。当前仅有 REA Skill，没有已连接分析工具，且未选定本地成品；没有下载或反编译 GeoGebra，没有 REA Evidence ID。

## 实现

- `lib/plot-point-control.ts`：只识别横坐标等于已通过题意校验的参数、纵坐标可安全计算的单点图层。拖动仅更新横向参数，纵坐标和切线通过原有表达式重新计算。
- `components/plot-parameter-handle.tsx`：使用当前轴范围转换屏幕坐标，限幅并按已有滑块步进对齐。支持方向键和 Home/End；捕获主指针，处理取消、失去捕获和窗口失焦，逐动画帧合并输入。
- `components/math-plot.tsx`、`components/visual-experiment.tsx`：沿用 Plotly、步骤图层和原有参数状态；直接操控时停止原动画。未提供交互回调的历史图、固定参数及三维视图保持原行为。二维定位适配器依赖当前 Plotly 的轴布局字段，升级绘图库时需回归。

## 验证

本地导数示例进入“观察切线”步骤。真实浏览器：方向键使数值从 0 到 0.01，鼠标拖动使数值到 0.99，图上切点和切线跟随变化。自动化覆盖在 t=1 时 P=(1,-2)、切线为 y=-2，原函数不变，以及无授权、隐藏步骤和固定题不提供操控、坐标换算、限幅与原有三维行为。未验证实体触屏；未实现任意曲线或三维对象的 GeoGebra 式构造拖动。
