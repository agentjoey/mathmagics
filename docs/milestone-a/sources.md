# 来源、核查与 DeepTutor 参考边界

核查日期：2026-09-29。本页区分仓库事实、外部已核实材料与仍待复核材料；不将上一轮研究中的推断当作已验证结论。

## 1. MathMagics 代码与课程基线

基线 commit：`d5b475cb6501cadbc009169ee27fd6fda19056e8`。

- [P2 objectives](../../content/curriculum/singapore-primary-math/p2/objectives.json)：A1/A2 对齐的真实 ID；P2-WN-001 的 representation、readinessEvidence、masteryEvidence 等为空。A 的补充是设计，不自动写回 curriculum truth。
- [P3 objectives](../../content/curriculum/singapore-primary-math/p3/objectives.json)：P3-AS-002 指向两步加减应用题，包含比较/整体部分的注解和支持目标。
- [现有教材源](../../content/curriculum/singapore-primary-math/sources.json)、[P2 映射](../../content/curriculum/singapore-primary-math/textbook-mappings/primary-mathematics-2022-p2.json)：映射不是教材全文。
- [学生端](../../components/pilot/PilotStudentClient.tsx)、[课程服务](../../lib/pilot/session.ts)：旧课堂以状态操作为主，LEARN 不开放原 practiceAvailable 路径。
- [Mastery 策略](../../lib/learning/mastery-policy.ts)：与文字化 masteryEvidence 的概念需要区分；A 不修改该运行时。

## 2. MOE：范围对齐起点，不虚构本次全量复核

仓库登记的源为 [2021 cohort syllabus, updated October 2025](https://www.moe.gov.sg/-/media/files/primary/2021-primary-mathematics-syllabus-p1-to-p6-updated-october-2025.pdf)。本次尝试该地址及通用 PDF 地址，均返回 JavaScript/机器人验证页，未取得 PDF 正文。

因此 A 复用的是仓库内已有 syllabus ID 与 locator，而不是宣称 2026 年全部课程范围已经重新逐页核实。正式发布和 C 的完整覆盖矩阵前，需取得可访问的官方文件或用户提供的权威副本，核查 P2/P3 全量目标、学段及例外；未完成此项不阻止原创课例设计，但阻止宣称完整 MOE 对齐认证。

## 3. Primary Mathematics 2022 目录核查

以下是公开产品页的目录，不是用户自有教材全文，也不证明某个家庭使用的就是该 ISBN。课例不引用具体教材页码。

| 来源 | 本次核实到的支持 | 用于本包的方式 |
|---|---|---|
| [2A · ISBN 9789814911382](https://www.singaporemath.com/products/primary-mathematics-student-book-2a-2022-edition) | Chapter 1 数到 1000；Chapter 4 Bar Models，含比较与应用题 | A1 的章节级支持；A3 的低年级前置表示参考 |
| [2B · ISBN 9789814911399](https://www.singaporemath.com/products/primary-mathematics-student-book-2b-2022-edition) | Chapter 6 有 Add Equal Groups、skip count 和 multiplication | A2a；没有据此给 A2b 除法虚构章节映射 |
| [3A · ISBN 9789814911405](https://www.singaporemath.com/products/primary-mathematics-student-book-3a-2022-edition) | Chapter 2 有加减与 word problems；Chapter 3 含乘除 | A3 的章节级支持；不据目录断言全题型或完整页内教学方式 |

现有 repo 将 2B 6A 标为 Equal Groups，公开目录更具体为 Add Equal Groups。A 记录差别但不顺手改历史数据。书册目录与 MOE 年级标准分别管理，尤其不能因为一册没有列除法，就删除课程标准中的除法目标。

本包题目、教学话术和教具安排为本次原创；没有复制教材文字、扫描图、出版社插画或答案册。

## 4. DeepTutor：固定版本的模式参考

研究定位到 commit `ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b`。固定此版本以避免未来 main 改动影响来源；不声称已运行或验证它的完整产品。

| 源码 | 可参考内容 | MathMagics 的取舍 |
|---|---|---|
| [book/models.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/book/models.py) | Spine/Chapter、Page/Block，以及 text/quiz/figure/interactive 等类型 | 采用 Lesson Pack + typed steps 思路，不复制长文电子书布局 |
| [visualizers/protocol.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/visualizers/protocol.py) | payload/schema、presentation、interaction、fallback 的分离与校验 | 先使用小学数学可信组件，不运行模型生成的任意代码 |
| [mastery/capability.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/capabilities/mastery/capability.py) | 学习路径内对话与受限工具的组合 | Tutor 围绕当前课与题进行辅导，不复制其长期评估规则 |
| [reading-citations.ts](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/web/lib/reading-citations.ts) | 页码/来源定位由真实材料和工具结果约束 | 有源记录才显示来源链接，不编造教材页码 |

本次新增内容是独立设计，没有迁入 DeepTutor 源码。未来如复用实现，须逐文件检查许可证、第三方声明、依赖和安全边界，固定上游版本并记录修改；不能从“项目开源”推断任何教学素材都可直接复制。

## 5. 事实与设计假设

已核实：仓库目标 ID 与部分注解、真实学生流程的缺口、上面三本书的公开目录、DeepTutor 固定版本的相关数据模型。

设计选择：第三样本选 P3 Bar Model；A2 拆为两段；题干英语加中文教学支持；按钮尺寸目标；两次失败后提供示范/暂停；首个 B 单元选择 P2 数到 1000 的前段。这些是可审阅、可试验的建议，不是研究证明的教育规律。

未完成：全量官方课纲逐页复核、用户教材实物版本确认、独立教学专家审校、浏览器体验、TTS、真实儿童试学、学习效果研究、完整 P2/P3 内容交付。
