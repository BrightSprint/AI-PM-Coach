/*
 * diagnosis-data.js — 弱点诊断与学习资源推荐的预制内容库
 * 全部内容在生产阶段写好、随应用打包；运行时只做本地查表与拼装，
 * 无网络请求、无 LLM。资源库刻意不含任何 URL 字段：用户凭搜索关键词
 * 自行检索核验（见 diagnosis.js 的资源匹配与页面上的搜索按钮）。
 */
(function (global) {
  'use strict';

  /* ---------- 一句话总结句式：每维 6 条，{t} = 主要薄弱子考点（截断至 10 字） ---------- */
  var SUMMARY_TEMPLATES = {
    'AI 基础认知': [
      '你对{t}缺乏判断框架',
      '你在{t}上还没形成判断标准',
      '你对{t}的判断停留在概念层',
      '你还没分清{t}的适用边界',
      '你对{t}只知其名不知其用',
      '你在{t}上容易选错工具'
    ],
    '场景洞察': [
      '你判断{t}时还没有筛选标准',
      '你在{t}上靠感觉多于靠标准',
      '你对{t}的价值判断不稳定',
      '你还没学会给{t}排优先级',
      '你看{t}只盯表面没拆流程',
      '你在{t}上容易把伪需求当真'
    ],
    '产品设计': [
      '你在{t}上没处理好不确定性',
      '你对{t}的设计停留在顺利路径',
      '你在{t}上划线规则不清楚',
      '你还没给{t}留出纠错入口',
      '你对{t}的边界情况准备不足',
      '你在{t}上重功能轻兜底'
    ],
    '数据与评估': [
      '你判断{t}时基本靠感觉',
      '你在{t}上没有固定评估方法',
      '你对{t}的理解停留在看数字',
      '你还没分清{t}该看哪类指标',
      '你在{t}上缺一套固定考卷',
      '你对{t}的判断缺分层归因'
    ],
    '技术协作': [
      '你在{t}上只问能不能做',
      '你对{t}的代价追问不到位',
      '你在{t}上漏问了失败模式',
      '你对{t}的判断偏乐观缺预案',
      '你在{t}上还没全链路视角',
      '你对{t}的成本曲线心里没数'
    ],
    '商业与落地': [
      '你做{t}判断时还没先算账',
      '你在{t}上价值验证顺序不对',
      '你对{t}的成本账算得不全',
      '你在{t}上量化表达说服力弱',
      '你还没给{t}定好验证标准',
      '你在{t}上容易跳过试点环节'
    ]
  };
  /* 无错题可填空时的备用总结（按维度，同样 ≤30 字、无黑名单词） */
  var SUMMARY_FALLBACK = {
    'AI 基础认知': '你的大模型基础判断已经成型',
    '场景洞察': '你的场景判断已经比较可靠',
    '产品设计': '你的AI产品设计判断已经扎实',
    '数据与评估': '你的评估判断已经成体系',
    '技术协作': '你的技术协作判断已经成熟',
    '商业与落地': '你的商业与落地判断已经可靠'
  };
  /* 子考点过长（>12 字）时改用维度级总结，避免截断切词 */
  var SUMMARY_LONG = {
    'AI 基础认知': '你对大模型方案的判断框架没立住',
    '场景洞察': '你判断场景价值时还没有筛选标准',
    '产品设计': '你的设计还停留在顺利路径上',
    '数据与评估': '你判断效果时还没有固定方法',
    '技术协作': '你和工程对齐时追问不到关键处',
    '商业与落地': '你做商业判断时还没先把账算清'
  };
  var BLACKLIST = ['有潜力', '提升空间', '多学习', '多了解', '继续努力', '有待提高', '需要加强', '不足之处', '加油'];

  /* ---------- 基础诊断：维度 × 分数段（0-40 / 40-60 / 60-80 / 80-100），共 24 段 ---------- */
  var BASE_DIAGNOSIS = {
    'AI 基础认知': [
      { summary: '你对大模型的基本机制还没摸清', text: '这个分数段说明，Token、上下文、概率生成这些最底层的机制还没有连成线，遇到选型和方案判断时只能凭印象选。先把大模型怎么生成内容、幻觉从哪来这两件事弄明白，再往上谈 RAG 和微调，顺序反了只会越学越乱。' },
      { summary: '你知道概念，但分不清适用边界', text: '名词你大多听过，问题出在边界：RAG、微调、提示词分别解决什么问题，放在具体场景里就容易选错工具。这个阶段最管用的动作是把每个概念都配上一个适用场景和一个反例，能说清什么时候不用，才算真懂。' },
      { summary: '你基础不差，判断框架还不完整', text: '主要概念已经过关，丢分多在需要同时权衡效果、成本和成熟度的题上。下一步把选型做成固定动作：先定评估标准，再用真实数据测，最后看成本曲线，形成框架后这类题会稳很多。' },
      { summary: '你的大模型基础判断已经成型', text: '这个分数说明你对模型机制和主流方案的边界判断比较稳。剩下要补的是新方案的成熟度判断：看到新技术先问它在真实业务数据上验证过没有，而不是先看演示效果。' }
    ],
    '场景洞察': [
      { summary: '你还没学会判断场景值不值得做', text: '你现在看场景主要靠感觉：听起来智能就觉得值得做。这个分数段要先立筛选标准——高频、重复、可容错，三条同时成立的场景才适合先做，其余的先放一放。' },
      { summary: '你能找到场景，但不会排优先级', text: '你能列出不少可做的场景，卡在排序：哪个先做、哪个是伪需求，分辨还不稳。先练分因：数据不好时分清不会用、用不上还是效果不稳定，再决定动作，别一上来就扩功能。' },
      { summary: '你会选场景，工作流拆得还不够细', text: '切入点判断基本靠谱，丢分多在工作流拆解：只盯用户嘴上说的那一步，漏掉交接、等待和质检复核。把端到端流程按耗时和频次排一遍，最大的提效点往往不在最显眼的那一步。' },
      { summary: '你的场景判断已经比较可靠', text: '你对场景价值和切入顺序的判断比较稳。接下来可以练反直觉需求挖掘和能力边界取舍：在业务方热情最高的时候，判断哪些场景反而要劝退，这比顺着需求做更考验功力。' }
    ],
    '产品设计': [
      { summary: '你还没意识到AI输出天生不确定', text: '这个分数段的典型问题是把 AI 产品当普通软件设计：只设计顺利路径，不设计出错怎么办。先把三件事补上：关键事实给引用、低置信度给提示、出错时给重试或转人工入口。' },
      { summary: '你有兜底意识，但划线还不清楚', text: '你知道要做兜底和人工接管，但什么时候自动处理、什么时候转人工，规则还说不清。把接管条件按置信度和风险事先定死，并设计好交接时带哪些上下文，这是这一段的主线。' },
      { summary: '你的设计框架完整，细节有漏项', text: '多轮上下文、不确定性呈现这些主干你都有，丢分多在细节：上下文超限怎么压缩、摘要保留哪些关键实体。把这些边界情况逐个列成清单逐项设计，稳定性会上一个台阶。' },
      { summary: '你的AI产品设计判断已经扎实', text: '你对不确定性、人机协作和上下文管理的处理比较成熟。可以挑战更难的组合题：多意图叠加高情绪、长期记忆与隐私边界这类需要同时权衡体验和风险的设计。' }
    ],
    '数据与评估': [
      { summary: '你判断效果基本靠感觉和印象', text: '这个分数段说明评估体系还没建立：习惯拿点击率、点赞率代替真实效果，也没有固定评估集，每次改版好不好全凭感觉。先分清行为指标和效果指标，再动手建一套来自真实场景的小评估集。' },
      { summary: '你懂指标，但不会搭评估闭环', text: '单个指标的含义你清楚，缺的是闭环：离线评估集怎么建、标注怎么对齐、灰度时盯哪些护栏指标。把这三步串起来练，你的评估判断会从知道变成能落地。' },
      { summary: '你的评估方法可用，归因还不够细', text: '评估集和灰度这些主干已经有了，丢分多在归因：效果变化时能不能分层定位到具体类目和环节。练 Badcase 分类和逆向排查，把平均数拆开看，是这一段的关键。' },
      { summary: '你的评估判断已经成体系', text: '你对指标、评估集和上线决策的判断比较稳。可以挑战自动归因、分阶段上线标准这类更工程化的题目，并把评估结论和商业取舍连起来看。' }
    ],
    '技术协作': [
      { summary: '你和工程对话还停留在能不能做', text: '这个分数段说明你对可行性的判断缺少抓手：算法说能做就信。先学会追问四件事：预期效果、失败模式、峰值表现、成本曲线，问不到这四项，就不要把功能排进版本。' },
      { summary: '你会问代价，但漏了失败和降级', text: '成本和延迟你会问了，失败模式和降级方案问得还少。AI 服务慢、挤、错、贵四种翻车都要有预案，把降级分级和触发条件写进方案，协作判断才算完整。' },
      { summary: '你的协作判断靠谱，系统视角待补', text: '单点问题你问得比较到位，丢分多在系统层面：多环节串联时哪一环最容易失效、Agent 工具调用的边界怎么定。按全链路视角复盘一次真实系统，收获会比刷概念大。' },
      { summary: '你的技术协作判断已经成熟', text: '你对可行性、成本和风险的追问比较完整。可以挑战多模态知识库、企业级架构这类复杂系统的拆解题，练把大系统拆成可排期的小块。' }
    ],
    '商业与落地': [
      { summary: '你做商业判断时还没先算账', text: '这个分数段的典型问题是先谈价值故事，后想成本。先把单位经济算清：一个用户全生命周期的推理、审核和兜底成本，对照客单价和续费率，账成立再谈推广。' },
      { summary: '你会算成本，但价值验证节奏乱', text: '单项测算你会，缺的是验证顺序：没做小步试点就想推广，或者试点没有预先写好的成功标准。把试点当实验来设计：定人群、定标准、定复盘时间点，结论只有放大、调整、停止三种。' },
      { summary: '你的落地判断稳，量化表达偏弱', text: '推进节奏和风险意识都不错，丢分多在量化表达：介绍成果时先讲过程、后讲数字，价值说服力打折。练成习惯：先对齐评价标准，再用业务和商业化数字逐项匹配。' },
      { summary: '你的商业与落地判断已经可靠', text: '你对单位经济、试点验证和推进风险的把握比较稳。可以挑战预算缩水下的优先级取舍这类资源受限题，练在钱和时间都不够时保住核心价值。' }
    ]
  };

  /* ---------- 全卷无答对题时的保底鼓励（不引用题目，不伪造） ---------- */
  var FALLBACK_ENCOURAGEMENT = '这次全卷没有答对的题，但你完整答完了 15 道自适应题 — 愿意先把短板测出来，本身就是补强的第一步。接下来从最弱维度的第一个知识点开始，一次只补一块，节奏比贪多更重要。';

  /* ---------- 学习模式知识点映射：按阶段（维度顺序）× 3 个知识点 ---------- */
  var POINT_KEYWORDS = [
    ['token', '上下文', '幻觉', '概率', '生成机制'], ['提示词', 'prompt', '示例', '约束'], ['rag', '微调', '检索', '知识库', '向量'],
    ['场景', '高频', '容错', '切入', '值不值得'], ['工作流', '流程', '环节', '质检'], ['伪需求', '流失', '续费', '不会用'],
    ['多轮上下文', '上下文管理', '会话记忆', '多轮', '对话'], ['不确定', '引用', '置信', '兜底'], ['人工', '接管', '人机', '审批'],
    ['评估', '指标', '点击率', '准确率'], ['评估集', '测试集', '标注', '回归'], ['灰度', '护栏', '上线', '回滚', 'p99'],
    ['可行性', '算法', '工程', '排期'], ['延迟', '并发', '降级', '容量', 'p99'], ['agent', '编排', '工具调用', '工作流'],
    ['成本', '单位经济', '推理', '客单价'], ['试点', '留存', '续费', '验证'], ['上线', '推进', '风险', '落地'],
    ['模型选型', '能力边界', '选型', '基座模型', '模型评估'], ['混合检索', 'query改写', '文档切分', '切分策略', '分块策略', '检索不准', '切分', '召回', '重排', '分块'],
    ['竞品', '产品定位', '场景发现', '用户画像', '差异化', '定位'], ['需求优先级', '版本规划', '持续迭代', '优先级', '路线图'],
    ['隐私', '数据最小化', '合规', '脱敏', '权限控制'], ['badcase', '错误分析', '归因', '逆向排查', '分类优化'],
    ['数据质量', '数据管道', '数据清洗', '标注规范'], ['弹性伸缩', '系统架构', '多模态', '架构', '弹性', '扩容'],
    ['项目价值', '价值量化', '量化表达', '价值定义', '商业价值']
  ];

  /* ---------- 预制资源库：每维 5 条，共 30 条；只有搜索关键词，没有任何 URL ---------- */
  var RESOURCES = [
    /* AI 基础认知 */
    { dimension: 'AI 基础认知', title: 'Building Systems with the ChatGPT API（Andrew Ng / Isa Fulford）', platform: 'DeepLearning.AI', type: '课程', minutes: 90, reason: '从调用、评估到系统搭建的完整链路，帮你把模型能力落成判断框架。', keywords: 'DeepLearning.AI ChatGPT API Building Systems', tags: ['选型', '模型', 'api', '系统', '评估'] },
    { dimension: 'AI 基础认知', title: 'Neural Networks: Zero to Hero（Andrej Karpathy）', platform: 'YouTube · Karpathy 频道', type: '视频', minutes: 600, reason: '从零手写神经网络与 GPT，补上模型如何生成内容这一层机制理解。', keywords: 'Karpathy Neural Networks Zero Hero', tags: ['token', '生成', '机制', '神经网络', 'gpt'] },
    { dimension: 'AI 基础认知', title: 'Attention Is All You Need（Transformer 原始论文）', platform: 'arXiv · Google Research', type: '文章', minutes: 60, reason: '理解注意力机制与 Transformer 结构，后面所有架构判断都建立在它上面。', keywords: 'Attention Is All You Need', tags: ['transformer', '注意力', '架构', '机制'] },
    { dimension: 'AI 基础认知', title: '《AI Engineering》by Chip Huyen', platform: 'O’Reilly 出版', type: '书', minutes: 720, reason: '系统讲基础模型应用的构建与评估，适合把零散概念连成完整框架。', keywords: 'Chip Huyen AI Engineering book', tags: ['框架', '评估', 'rag', '微调', '系统'] },
    { dimension: 'AI 基础认知', title: 'OpenAI 官方 Prompt Engineering 指南', platform: 'OpenAI 官方文档', type: '文章', minutes: 30, reason: '官方给出的提示词策略与示例，纠正靠形容词堆叠的写法。', keywords: 'OpenAI prompt engineering guide', tags: ['提示词', 'prompt', '示例', '约束'] },
    /* 场景洞察 */
    { dimension: '场景洞察', title: '《The Mom Test》by Rob Fitzpatrick', platform: 'Rob Fitzpatrick 出版', type: '书', minutes: 240, reason: '专治访谈时问出假需求：怎么提问才能拿到用户真实的行为证据。', keywords: 'The Mom Test Fitzpatrick', tags: ['访谈', '需求', '伪需求', '用户'] },
    { dimension: '场景洞察', title: '《Competing Against Luck》by Clayton Christensen', platform: 'Harper Business 出版', type: '书', minutes: 480, reason: 'Jobs to Be Done 的源头：从用户要完成的任务而不是功能清单出发找场景。', keywords: 'Competing Against Luck Christensen', tags: ['场景', '需求', '任务', 'jtbd'] },
    { dimension: '场景洞察', title: '《Continuous Discovery Habits》by Teresa Torres', platform: 'Product Talk 出版', type: '书', minutes: 420, reason: '把机会-方案树和持续访谈做成习惯，适合练场景排序与验证。', keywords: 'Continuous Discovery Habits Torres', tags: ['场景', '验证', '访谈', '优先级'] },
    { dimension: '场景洞察', title: 'People + AI Guidebook（Google PAIR 官方）', platform: 'Google PAIR', type: '文章', minutes: 90, reason: '官方的人机协作设计指南，第一部分专门讲如何识别值得做 AI 的场景。', keywords: 'Google People AI Guidebook', tags: ['场景', '切入', '人机', '价值'] },
    { dimension: '场景洞察', title: 'AI for Everyone（Andrew Ng）', platform: 'DeepLearning.AI · Coursera', type: '课程', minutes: 360, reason: '面向非技术背景讲如何发现 AI 机会并判断可行性，适合建立场景直觉。', keywords: 'Andrew Ng AI Everyone', tags: ['场景', '机会', '可行性', '价值'] },
    /* 产品设计 */
    { dimension: '产品设计', title: 'Human Interface Guidelines: Machine Learning（Apple 官方）', platform: 'Apple 开发者文档', type: '文章', minutes: 40, reason: '官方给出的机器学习交互规范，重点在反馈、纠错与用户控制。', keywords: 'Apple Human Interface Machine Learning', tags: ['交互', '不确定', '反馈', '纠错'] },
    { dimension: '产品设计', title: 'Guidelines for Human-AI Interaction（Microsoft 官方）', platform: 'Microsoft Research', type: '文章', minutes: 45, reason: '18 条人机交互准则逐条配正反例，直接对应不确定性与接管设计。', keywords: 'Microsoft Human AI Interaction Guidelines', tags: ['人机', '接管', '不确定', '交互'] },
    { dimension: '产品设计', title: '《Designing Machine Learning Systems》by Chip Huyen', platform: 'O’Reilly 出版', type: '书', minutes: 660, reason: '从需求到上线的系统设计视角，帮你把产品决策放回完整链路里看。', keywords: 'Chip Huyen Designing Machine Learning Systems', tags: ['系统', '设计', '上线', '链路'] },
    { dimension: '产品设计', title: 'NN/g 关于 AI 与用户体验的系列文章', platform: 'Nielsen Norman Group', type: '文章', minutes: 60, reason: '基于可用性研究的 AI 界面结论，适合校准对话与生成式界面的设计直觉。', keywords: 'Nielsen Norman AI UX', tags: ['对话', '交互', '体验', '界面'] },
    { dimension: '产品设计', title: 'People + AI Guidebook：Explainability 与 Feedback 章节', platform: 'Google PAIR', type: '文章', minutes: 60, reason: '专讲可解释与反馈回路怎么设计，对应引用、提示与纠错入口。', keywords: 'Google PAIR Guidebook explainability', tags: ['引用', '置信', '解释', '反馈', '兜底'] },
    /* 数据与评估 */
    { dimension: '数据与评估', title: 'OpenAI Evals 官方文档与开源框架', platform: 'OpenAI 官方文档 · GitHub', type: '文章', minutes: 45, reason: '官方评测框架的用法与示例，帮你把评估集从概念落成可运行的流程。', keywords: 'OpenAI Evals documentation', tags: ['评测', '评估集', '测试集', 'evals'] },
    { dimension: '数据与评估', title: '《AI Engineering》评估章节 by Chip Huyen', platform: 'O’Reilly 出版', type: '书', minutes: 180, reason: '专章讲模型评估方法与指标选择，纠正拿行为指标冒充效果的习惯。', keywords: 'Chip Huyen AI Engineering evaluation', tags: ['评估', '指标', '准确率', '方法'] },
    { dimension: '数据与评估', title: 'Hugging Face Evaluate 库官方文档', platform: 'Hugging Face 官方文档', type: '文章', minutes: 40, reason: '主流指标库的官方说明，适合建立指标含义与适用条件的准确理解。', keywords: 'Hugging Face Evaluate documentation', tags: ['指标', '评测', '库', '方法'] },
    { dimension: '数据与评估', title: 'Rules of Machine Learning（Martin Zinkevich）', platform: 'Google 官方文档', type: '文章', minutes: 50, reason: 'Google 内部经验总结，专讲上线、监控与迭代决策的先后顺序。', keywords: 'Google Rules Machine Learning', tags: ['上线', '灰度', '监控', '迭代', '决策'] },
    { dimension: '数据与评估', title: 'Machine Learning Specialization 中的评估与调试内容（Andrew Ng）', platform: 'DeepLearning.AI · Coursera', type: '课程', minutes: 240, reason: '系统讲训练/验证划分、偏差方差与错误分析，补评估方法论的底子。', keywords: 'DeepLearning.AI Machine Learning Specialization', tags: ['评估', '标注', '错误分析', '方法'] },
    /* 技术协作 */
    { dimension: '技术协作', title: 'Intro to Large Language Models（Andrej Karpathy）', platform: 'YouTube · Karpathy 频道', type: '视频', minutes: 60, reason: '一小时讲清大模型的能力边界与系统视角，和工程对话时最有用的一课。', keywords: 'Karpathy Intro Large Language Models', tags: ['模型', '边界', '系统', '机制'] },
    { dimension: '技术协作', title: 'Building Effective Agents（Anthropic 官方）', platform: 'Anthropic 官方博客', type: '文章', minutes: 35, reason: '官方对 Agent 与工作流的拆解，重点在何时用编排、何时保持简单。', keywords: 'Anthropic Building Effective Agents', tags: ['agent', '编排', '工作流', '工具调用'] },
    { dimension: '技术协作', title: 'Transformers 官方文档（Hugging Face）', platform: 'Hugging Face 官方文档', type: '文章', minutes: 60, reason: '主流开源框架的官方文档，适合建立对模型加载、推理与成本的实际概念。', keywords: 'Hugging Face Transformers documentation', tags: ['推理', '模型', '框架', '成本'] },
    { dimension: '技术协作', title: '《Designing Machine Learning Systems》部署与监控章节', platform: 'O’Reilly 出版', type: '书', minutes: 200, reason: '专讲部署、监控与持续迭代，对应延迟、容量与降级这些协作追问。', keywords: 'Designing Machine Learning Systems deployment', tags: ['延迟', '降级', '监控', '部署', '并发'] },
    { dimension: '技术协作', title: 'OpenAI Cookbook（官方示例库）', platform: 'OpenAI 官方 GitHub', type: '文章', minutes: 90, reason: '官方可运行示例合集，看真实调用方式比看概念描述更能校准可行性判断。', keywords: 'OpenAI Cookbook GitHub examples', tags: ['api', '调用', '示例', '可行性'] },
    /* 商业与落地 */
    { dimension: '商业与落地', title: 'AI Transformation Playbook（Andrew Ng）', platform: 'Landing AI 官方', type: '文章', minutes: 40, reason: '吴恩达给企业落 AI 的五步路线，重点在试点选择与推进顺序。', keywords: 'Andrew Ng AI Transformation Playbook', tags: ['落地', '试点', '推进', '路线'] },
    { dimension: '商业与落地', title: '《Prediction Machines》by Agrawal、Gans、Goldfarb', platform: 'Harvard Business Review Press', type: '书', minutes: 540, reason: '用经济学框架看 AI 的价值与成本，适合建立单位经济的思考方式。', keywords: 'Prediction Machines Agrawal', tags: ['单位经济', '成本', '价值', '商业'] },
    { dimension: '商业与落地', title: '《Competing in the Age of AI》by Iansiti、Lakhani', platform: 'Harvard Business Review Press', type: '书', minutes: 560, reason: '讲 AI 如何改变企业运营与规模化，适合补落地与组织层面的判断。', keywords: 'Competing Age AI Iansiti', tags: ['落地', '规模化', '运营', '商业'] },
    { dimension: '商业与落地', title: 'OpenAI 官方 API 定价与用量文档', platform: 'OpenAI 官方文档', type: '文章', minutes: 25, reason: '算推理成本的第一手依据：按 Token 计价的口径与用量查看方式。', keywords: 'OpenAI API pricing documentation', tags: ['成本', 'token', '定价', '推理'] },
    { dimension: '商业与落地', title: 'AI for Business Specialization（Wharton）', platform: 'Coursera', type: '课程', minutes: 480, reason: '沃顿的 AI 商业课，覆盖应用场景、组织落地与治理，补商业表达框架。', keywords: 'Coursera AI Business Wharton', tags: ['商业', '落地', '价值', '治理'] }
  ];

  global.DIAG_DATA = {
    SUMMARY_TEMPLATES: SUMMARY_TEMPLATES,
    SUMMARY_LONG: SUMMARY_LONG,
    SUMMARY_FALLBACK: SUMMARY_FALLBACK,
    BLACKLIST: BLACKLIST,
    BASE_DIAGNOSIS: BASE_DIAGNOSIS,
    FALLBACK_ENCOURAGEMENT: FALLBACK_ENCOURAGEMENT,
    POINT_KEYWORDS: POINT_KEYWORDS,
    RESOURCES: RESOURCES
  };
})(window);
