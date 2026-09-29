# Milestone A：真实课例设计包

日期：2026-09-29。范围已批准；本包为设计交付，不是已经可运行的课堂。按用户追加要求，原 A1–A3 保留，新增 A4 几何拓展。

## 阅读顺序

1. [新产品 scope 与 roadmap](../superpowers/specs/2026-09-29-mathmagics-learning-product-roadmap.md)
2. [课堂与 Lesson Pack 契约](classroom-and-lesson-pack.md)
3. [A1：P2 按十和百数](lessons/p2-count-tens-hundreds.md)
4. [A2：P2 等量分组与乘除](lessons/p2-equal-groups-multiply-divide.md)
5. [A3：P3 两步 Bar Model 应用题](lessons/p3-bar-model-two-step.md)
6. [A4：图形小侦探，AMC Pre-A 目标难度几何](lessons/pre-a-geometry.md)及[精确图形数据](lessons/pre-a-geometry-fixtures.json)
7. [来源与复用边界](sources.md)
8. [验收与交接](acceptance.md)

## 四个样本覆盖什么

| 样本 | 目标关系 | 教学设计范围 | 不能据此声称 |
|---|---|---|---|
| A1 | P2-WN-001；P2-WN-002 局部支持 | 按十/百数、跨百交换、加十与加百比较 | 所有位值/读写已覆盖 |
| A2 | P2-MD-001/002/003/005 局部子技能 | 等量分组、乘法、平均分/按份分、逆关系 | 2/3/4/5/10 全表已掌握 |
| A3 | P3-AS-002；P2-AS-002/P3-AS-001 支持 | 比较与合并的两步关系、标签、单位、未知量 | 所有四位数算法或两步结构已覆盖 |
| A4 | ENRICHMENT；与 P2-2D-001 图形/方向局部关联 | 转向后识图、平面旋转、拼合、复合正方形计数 | 官方 AMC Pre-A 考纲全覆盖、真题同难或核心 Mastery 提升 |

A4 以澳大利亚 AMC 中国区 Pre-A 的一、二年级定位作为难度目标，包含 Foundation/Core/Stretch 三层。其具体几何任务是原创设计，尚待正式样题校准；不将美国 AMC 8 或澳洲 A 级混用。三段可分次学，挑战可选，不替代 Singapore Math 核心几何课程，也不阻塞主线。

状态统一为 `DRAFT / ready for design review`。四份课例共 51 个题目表条目：原 36 个加 A4 的 15 个，包括示范、引导、独立和支持后新题，并非全是独立测验。浏览器交互、资产绘制、音频、儿童试学和发布均未在 A 执行。工程 ID 不显示给儿童。

## 已做的设计选择

A3 选 Bar Model，分数仍属整体 scope。A2 分两段，A1 可在按十数之后暂停；A4 分认图转动、拼合、数图三个短段。预计分钟数不是完成门槛。A4 不改变 B 首个连续 P2 数数单元的实施顺序，后续几何包使用 A4 作为内容与渲染验收输入。

每题有稳定 ID、用途、答案和帮助分支。文档与 geometry fixtures 含作者答案，未来必须生成安全学生投影，不能原样发送作者包。

## 设计验收与产品验收

本次核对数学关系、步骤、提示、分支和来源。几何用顶点、旋转与真实边界枚举校验，不能拿四则运算测试代替。设计写完不等于完整 P2/P3 课程交付，也不等于 B 自动获准实施；真实交互和学习体验仍需后续验收。
