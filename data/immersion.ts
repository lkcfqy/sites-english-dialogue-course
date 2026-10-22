import authored from "./curriculum.json";
import early from "./immersion-dialogues-early.json";
import late from "./immersion-dialogues-late.json";
import earlyChecks from "./immersion-checks-early.json";
import lateChecks from "./immersion-checks-late.json";
import rewrittenCore from "./immersion-core-late.json";
import type { AuthoredLesson } from "./curriculum-types";
import type { AuthoredDialogue, CoreDialogueOverride, CourseStage, DialogueCheck, DialogueExtension, ImmersionLesson } from "./immersion-types";

export const stages: CourseStage[] = [
  { id: 1, weeks: [1, 4], title: "听懂日常，敢于接话", goal: "听清时间、地点和需求，完成日常交流；需要时用整句中文辅助。", checkpoint: "在新的预约或出行情境里，听出约定细节，主动确认并提出一个替代方案。" },
  { id: 2, weeks: [5, 9], title: "讲清经历，解释选择", goal: "把事情的经过、原因和结果连起来，学会追问、澄清和委婉协商。", checkpoint: "脱离台词讲述一段经历，说明一个选择，并回应对方的追问。" },
  { id: 3, weeks: [10, 18], title: "理解观点，展开讨论", goal: "听懂较长的讨论，区分事实与观点，用例子解释自己的想法。", checkpoint: "听完陌生议题后复述双方观点，给出自己的理由，并指出还缺什么信息。" },
  { id: 4, weeks: [19, 22], title: "限定观点，协商分歧", goal: "讨论不确定性、利益与取舍，回应反方意见，避免过度概括。", checkpoint: "面对不同意见，承认合理之处、解释限制，并提出可执行的折中办法。" },
  { id: 5, weeks: [23, 26], title: "独立表达，迁移到新情境", goal: "连贯展开复杂话题，换一种说法解释意思，把熟悉表达用于新的交流。", checkpoint: "不看原文持续展开自己的观点，回应两轮追问；用英语写一段说明或建议，再检查是否清楚准确。" },
];

const extensions = new Map((([...early, ...late]) as DialogueExtension[]).map((entry) => [`${entry.week}-${entry.day}`, entry.dialogues]));
const checks = new Map((([...earlyChecks, ...lateChecks, ...rewrittenCore]) as DialogueCheck[]).map((entry) => [`${entry.week}-${entry.day}`, entry]));
const coreRewrites = new Map((rewrittenCore as CoreDialogueOverride[]).map((entry) => [`${entry.week}-${entry.day}`, entry.rows]));
const plain = (text: string) => text
  .replace(/雅思口语(?:\s*Part\s*[123])?/gi, "独立表达")
  .replace(/IELTS\s*(?:Speaking\s*)?(?:Part\s*[123])?/gi, "独立表达")
  .replace(/雅思(?:学术)?写作/gi, "书面表达")
  .replace(/\bTask\s*(?:[12]|One|Two)\b/gi, "report")
  .replace(/\bPart\s*[123]\s*[：:]?/gi, "")
  .replace(/考生/g, "交流者")
  .replace(/口语模拟/g, "交流练习")
  .replace(/写作辅导/g, "交流小组");

const lateContexts: Record<string, { scene: string; speaking: string; writing?: string; review?: string }> = {
  "w23d1": { scene: "朋友聊起工作日习惯、居住环境和周末计划", speaking: "向朋友说说你的日常安排。解释一个习惯为什么改变，再追问对方的安排；尽量用具体经历回应。" },
  "w23d2": { scene: "邻居聊起停车场变成社区花园后的变化", speaking: "给没来过这里的朋友讲讲一个地方的变化。说明以前和现在有什么不同，用具体细节解释这对人们意味着什么。" },
  "w23d3": { scene: "朋友分享一位教会自己维修的人和共同经历", speaking: "讲讲教过你某项技能的人。用一件具体的事说明他怎么帮助你，再说说你后来如何使用这项技能。" },
  "w23d4": { scene: "家长和教师讨论事实知识、创造力与学校评价", speaking: "与朋友讨论学校怎样帮助学生学习。说明一个课堂例子，认真回应不同意见，再说说你的建议适用于什么情境。", writing: "用英语写一封给学校的建议邮件，说明事实知识与创造力如何一起培养。用例子解释理由，并指出执行中需要注意的限制。" },
  "w23d5": { scene: "朋友从个人的困难决定聊到公共决策", speaking: "先讲一个自己的困难决定，让伙伴追问你考虑过哪些选择。再讨论信息不完整时怎样做决定，用自己的话澄清立场。", writing: "回听自己的一段交流，用英语写下说清楚的地方、卡住的地方和想换一种说法的句子。选择一个问题，在新情境中再试一次。" },
  "w24d1": { scene: "社区成员比较虚构的通勤变化，讨论预测的边界", speaking: "向邻居解释通勤方式怎样变化。先说主要趋势，再比较不同方式；明确哪些是实际数据，哪些只是预测。", writing: "给社区成员写一段通勤简报。虚构数据：2010年汽车60%、公交30%、自行车10%；2020年50%、30%、20%；2030年预测40%、35%、25%。准确比较并说明预测的边界。" },
  "w24d2": { scene: "图书馆团队比较三家分馆的虚构数据", speaking: "向新同事介绍三家分馆，选出最有用的比较。解释哪些结论能从数据看出，哪些还需要更多信息。", writing: "为图书馆团队写一段情况说明。虚构数据：中央分馆每周访客1400、开放60小时、自习桌80；河畔1200、50、60；山丘900、40、30。比较差别，再提出一个需要调查的问题。" },
  "w24d3": { scene: "回收中心工作人员向访客解释纸张回收的流程", speaking: "不用原文，向访客解释纸怎样再利用。按顺序说明，遇到分支或循环时换一种说法确认对方理解。", writing: "给第一次参观回收中心的人写一段介绍：收集、分类并剔除污染纸、运输、加水制浆、筛除大杂质、去墨、铺网、压制脱水、干燥、卷成纸卷；回收水返回制浆。把步骤和循环讲清楚。" },
  "w24d4": { scene: "社区小组讨论博物馆收费、经费和公平入场", speaking: "分别解释收费和免费最有说服力的理由。提出你的方案，回应一个反对意见，再说明哪些人应得到例外安排。", writing: "给博物馆写一封建议邮件，说明怎样兼顾运行经费和公众访问。公平解释不同需求，提出执行办法和需要复查的地方。" },
  "w24d5": { scene: "社区志愿者讨论城市中的孤立感和可行的支持办法", speaking: "解释两种可能造成孤立的情况，给出各自对应的社区措施。不要把独居直接等同于孤独；说明措施有什么局限。", writing: "为社区志愿者写一份行动建议，解释问题、对应措施及其作用方式。给出如何检查效果的办法，保留对个人选择的尊重。" },
  "w25d4": { scene: "同学协调实验室参观的行程变更", speaking: "不看台词，向不能及时到场的朋友转述最终的日期、签到和开始时间、入口、名额及报销范围。对方听错时，换一种说法澄清。", writing: "给参加实验室参观的同学写一条消息，准确列出最终安排、需要自备的东西和报销条件。只使用对话已经确认的信息。" },
  "w26d5": { scene: "食堂团队回顾减废项目，比较数据并协商下一步", speaking: "向食堂团队解释减废项目的结果。先准确比较数据，再说明不能确定的原因。让伙伴追问小份默认安排是否公平，回应后共同制定下一步。", writing: "给食堂团队写一份总结和建议。虚构数据：四月600份/120公斤、五月500份/90公斤、六月480份/72公斤，每份浪费分别200、180、150克。说明变化和因果局限，再解释默认小份并允许加餐的条件与改进办法。", review: "换一个没有练过的社区项目，独立解释数据、讨论一个限制并提出建议。回听自己的回应，记录哪里听错、哪里表达不清楚，再选一个问题继续练。" },
};

const adaptRow = (en: string, zh: string) => {
  if (en.startsWith("Progress toward a high examination score")) return {
    en: "Let's try explaining these results to someone outside the team, then ask which details are still unclear and revise our recommendation together.",
    zh: "我们试着向团队以外的人解释这些结果，再问问哪些细节还不清楚，一起修改建议。",
  };
  if (en.includes("an effective Task One response")) return {
    en: "Exactly; a useful community report presents the information accurately, highlights the main changes, and supports its overview with a few carefully chosen details.",
    zh: "没错；有用的社区报告要准确呈现信息，突出主要变化，用几项精选细节支撑概述。",
  };
  return { en: plain(en), zh: plain(zh) };
};

const messageTasks: Record<string, string> = {
  "w19d1": "给招聘团队写一段建议：说明自动决定为何需要解释，回应效率方面的顾虑，并提出可执行的申诉办法。",
  "w19d3": "给公共艺术展的组织者写一段建议：解释哪些制作过程需要说明，为什么过多细节也会造成负担，并给出披露的标准。",
  "w19d5": "给平台团队写一条反馈：说明互动量为何不能代表讨论质量，提出一个改进推荐的方法，并承认衡量中的困难。",
  "w20d1": "给交通听证会写一段意见：在预算有限的条件下，解释免费公交和扩大服务范围的取舍。给出你的建议，并说明什么条件会改变它。",
  "w20d3": "给引入自动化的工作团队写一段建议：说明员工、企业和公共服务各能做什么，提出培训安排，并回应成本方面的顾虑。",
  "w20d5": "给社区讨论组写一段说明：用明确标为假设的例子，解释收入、健康、时间或公平怎样共同影响生活质量。",
  "w22d1": "给社区居民写一段说明：解释短期保护与长期基础设施怎样协调，提出实施顺序，并指出资源有限时的取舍。",
  "w22d3": "给招聘团队写一段建议：说明怎样验证实际能力、满足安全要求并帮助新人适应，用具体办法回应只看本地经验的顾虑。",
  "w22d4": "给采购团队写一段建议：解释品牌怎样用合同、采购安排和复查改善劳动条件，同时说明它实际能控制的范围。",
  "w22d5": "给一个合作讨论组写一段建议：说明何时可以先试行合作、怎样邀请更多参与者，以及如何兼顾速度和代表性。",
  "w25d5": "给同事写一份远程协作建议：公平复述不同证据，提出试行安排，并说明要看到什么结果才会调整方案。使用本课假设情境，不把它说成真实研究。",
  "w26d1": "给居民代表写一份方案说明。虚构数据：防洪墙初始1200万美元、年维护30万美元，应对设计标准洪水；迁居初始800万美元、支持200户，接收地公共服务增支未计入。准确比较已知差别，解释还缺哪些信息，并提出下一步调查。",
  "w26d2": "给大学课程委员会写一段建议：提出AI辅助学习的使用规则，说明如何验证学生的独立能力，并回应全面禁止与完全开放两种意见。",
  "w26d3": "给能源项目讨论组写一段建议。虚构预计数据：风能90吉瓦时/年、专用地20公顷、18月；地面太阳能60吉瓦时/年、50公顷、12月；屋顶太阳能30吉瓦时/年、不新增土地、24月。按不同优先条件提出选择，准确区分单位和范围。",
  "w26d4": "给博物馆与来源社区写一份交流提议：公平复述双方关切，说明需要核查的历史证据，并提出可执行的行动顺序。可以用假设例子，不编造法律结论。",
};

export const immersionLessons: ImmersionLesson[] = (authored as AuthoredLesson[]).map((source) => {
  const id = `w${String(source.week).padStart(2, "0")}d${source.day}`;
  const context = lateContexts[id];
  const check = checks.get(`${source.week}-${source.day}`);
  const rewrite = coreRewrites.get(`${source.week}-${source.day}`);
  const stage = stages.find((item) => source.week >= item.weeks[0] && source.week <= item.weeks[1])!;
  const core: AuthoredDialogue[] = source.sections.map((section, index) => {
    const rows = rewrite?.[index] || section.rows;
    return {
    title: ["进入情境", "把意思说清楚", "换一个角度回应"][index],
    scene: context?.scene || plain(source.scene),
    roles: { A: "角色 A", B: "角色 B" },
    intent: plain(index === 0 ? source.objective : source.grammar),
    question: plain(index === 0 ? check?.question || source.practice.listening.question : "这段交流中，双方怎样解释、补充或调整自己的意思？"),
    answer: plain(index === 0 ? check?.answer || source.practice.listening.answer : rows.map((row) => adaptRow(row[1], row[2]).zh).join(" ")),
    challenge: plain(index === 0 ? context?.speaking || source.practice.speaking : index === 1 ? "不看原文，用自己的话转述这一段。换一个人物、条件或应用场景重新接话，让对方追问，再澄清自己的意思。" : messageTasks[id] || context?.writing || source.practice.writing),
    rows,
  }; });
  return {
    id, week: source.week, day: source.day,
    weekTitle: source.week === 23 ? "细致描述与深入交流" : source.week === 24 ? "用数据和理由讲清楚" : plain(source.weekTitle),
    title: plain(source.title), scene: context?.scene || plain(source.scene), objective: plain(source.objective), stage,
    dialogues: [...core, ...(extensions.get(`${source.week}-${source.day}`) || [])].map(({ rows, ...dialogue }, index) => ({
      ...dialogue, id: `${id}-s${index + 1}`,
      lines: rows.map(([speaker, en, zh], row) => ({ id: `${id}-s${index + 1}-${row + 1}`, speaker, ...adaptRow(en, zh) })),
    })),
  };
});

export const outline = immersionLessons.map(({ id, week, day, weekTitle, title, scene }) => ({ id, week, day, weekTitle, title, scene }));
export const courseStats = {
  weeks: 26, lessons: immersionLessons.length,
  dialogues: immersionLessons.reduce((sum, lesson) => sum + lesson.dialogues.length, 0),
  sentences: immersionLessons.reduce((sum, lesson) => sum + lesson.dialogues.reduce((count, dialogue) => count + dialogue.lines.length, 0), 0),
};
