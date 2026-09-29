# 来源、核查与 DeepTutor 参考边界

核查日期：2026-09-29。本页区分仓库事实、外部已核实材料与仍待复核材料；不将上一轮研究中的推断当作已验证结论。第 6 节为用户追加的 AMC Pre-A 几何来源说明。

## 1. MathMagics 代码与课程基线

基线 commit：`d5b475cb6501cadbc009169ee27fd6fda19056e8`。

- [P2 objectives](../../content/curriculum/singapore-primary-math/p2/objectives.json)：A1/A2 对齐的真实 ID；P2-WN-001 的 representation、readinessEvidence、masteryEvidence 等为空。A 的补充是设计，不自动写回 curriculum truth。
- [P3 objectives](../../content/curriculum/singapore-primary-math/p3/objectives.json)：P3-AS-002 指向两步加减应用题，包含比较/整体部分的注解和支持目标。
- [现有教材源](../../content/curriculum/singapore-primary-math/sources.json)、[P2 映射](../../content/curriculum/singapore-primary-math/textbook-mappings/primary-mathematics-2022-p2.json)：映射不是教材全文。
- [学生端](../../components/pilot/PilotStudentClient.tsx)、[课程服务](../../lib/pilot/session.ts)：旧课堂以状态操作为主，LEARN 不开放原 practiceAvailable 路径。
- [Mastery 策略](../../lib/learning/mastery-policy.ts)：与文字化 masteryEvidence 的概念需要区分；A 不修改该运行时。

## 2. MOE：范围对齐起点，不虚构本次全量复核

仓库登记的源为 [2021 cohort syllabus, updated October 2025](https://www.moe.gov.sg/-/media/files/primary/2021-primary-mathematics-syllabus-p1-to-p6-updated-october-2025.pdf)。A1–A3 研究记录：尝试该地址及通用 PDF 地址时返回 JavaScript/机器人验证页，未取得 PDF 正文。

因此 A 复用的是仓库内已有 syllabus ID 与 locator，而不是宣称 2026 年全部课程范围已经重新逐页核实。正式发布和 C 的完整覆盖矩阵前，需取得可访问的官方文件或用户提供的权威副本，核查 P2/P3 全量目标、学段及例外；未完成此项不阻止原创课例设计，但阻止宣称完整 MOE 对齐认证。

## 3. Primary Mathematics 2022 目录核查

以下为 A1–A3 阶段核查的公开产品目录，不是用户自有教材全文，也不证明某个家庭使用的就是该 ISBN。课例不引用具体教材页码。

| 来源 | 核实到的支持 | 用于本包的方式 |
|---|---|---|
| [2A · ISBN 9789814911382](https://www.singaporemath.com/products/primary-mathematics-student-book-2a-2022-edition) | Chapter 1 数到 1000；Chapter 4 Bar Models，含比较与应用题 | A1 章节级支持；A3 的低年级前置表示参考 |
| [2B · ISBN 9789814911399](https://www.singaporemath.com/products/primary-mathematics-student-book-2b-2022-edition) | Chapter 6 有 Add Equal Groups、skip count 和 multiplication | A2a；不给 A2b 除法虚构章节映射 |
| [3A · ISBN 9789814911405](https://www.singaporemath.com/products/primary-mathematics-student-book-3a-2022-edition) | Chapter 2 有加减与 word problems；Chapter 3 含乘除 | A3 章节级支持；不据目录断言完整页内教学方式 |

现有 repo 将 2B 6A 标为 Equal Groups，公开目录更具体为 Add Equal Groups。A 记录差别但不顺手改历史数据。书册目录与 MOE 年级标准分别管理，不能因为一册没列除法就删除标准中的除法目标。

本包题目、话术和教具安排为原创；没有复制教材文字、扫描图、出版社插画或答案册。

## 4. DeepTutor：固定版本的模式参考

研究定位 commit `ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b`。固定版本避免未来 main 改变来源；不声称已运行/验证其完整产品。

| 源码 | 可参考内容 | MathMagics 的取舍 |
|---|---|---|
| [book/models.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/book/models.py) | Spine/Chapter、Page/Block、text/quiz/figure/interactive | Lesson Pack + typed steps，不复制长文布局 |
| [visualizers/protocol.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/visualizers/protocol.py) | payload/schema、presentation、interaction、fallback 分离与校验 | 可信数学组件，不运行任意生成代码 |
| [mastery/capability.py](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/deeptutor/capabilities/mastery/capability.py) | 路径内对话与受限工具 | Tutor 围绕当前课/题，不复制长期评估规则 |
| [reading-citations.ts](https://github.com/HKUDS/DeepTutor/blob/ef2d9e5c3c99fd073742c5aadc2bb9584b1e503b/web/lib/reading-citations.ts) | 材料和工具结果约束来源定位 | 有源才链接，不编造页码 |

本次是独立设计，未迁入 DeepTutor 源码。未来复用须逐文件核查许可、第三方声明、依赖和安全边界，固定版本、记录修改；开源不意味着任何教学素材均可复制。

## 5. 事实与设计假设

已核实的基线见前四节。A1–A3 的时长、语言组合、帮助默认值及首个 B 单元属于设计建议，不是教育规律。四个样本都未经过独立教学专家审校、浏览器体验、TTS 或真实儿童试学；完整 P2/P3 交付和教材实物版本确认仍待完成。

## 6. AMC Pre-A 几何追加核查

实际读取日期：2026-09-29。

| 一手来源 | 可确认的事实 | 不能从该来源推出 |
|---|---|---|
| [ASEEDER 澳大利亚 AMC](https://www.seedasdan.asia/amc/)，“项目简介/难度说明/评分标准” | 中国区 2026 年新增 Pre-A，面向小学1–2年级；25题，20选择与5填空，50分钟 | 本课几何题与真题逐题等难；完整专项考纲 |
| [AMT Australian Mathematics Competition](https://amt.edu.au/amc)，Early Primary、Topics、Sample AMC Problems | Years1–2 Early Primary 试行；AMC 总主题包括 Geometry、Measurement、enumeration；公开样题导航从 Middle Primary 起 | 中国区与澳新安排完全相同；Middle Primary 样题可充当 Pre-A 难度证据 |

ASEEDER 页面“例题”标题下，本次可访问内容未提供可核验的 Pre-A 几何题；会员题库不是本次已读材料。未采用培训机构网站关于难度比例、真题分布或历年 Pre-A 的二手推断，也没有把美国 AMC 8 当成 Pre-A。

因此 A4 的旋转、拼合、大小正方形计数是依据目标年龄与低阅读/低运算负担设计的原创任务，难度状态为“Pre-A 目标难度，待样题校准”。Core/Stretch、每段时长和选择哪些几何技能是内部设计选择，不是官方命题结论。后续须用来源明确且有权使用的样题及试学证据校准，未校准前不宣传等难或官方覆盖。

A4 的 `P2-2D-001` 关联仅指方向/图形局部知识；不覆盖其余几何目标，也不直接写核心 Mastery。此次读取只为课例设计，不涉及活动报名、考试代答或生产变更。
