# 文法辨析题制作规则

本规则从[活用道场的用法卡制作 skill](https://github.com/L-M-Sherlock/katsuyo-dojo/blob/67459b9b500ad660f0225f55d736789616f91025/.agents/skills/write-katsuyo-usage-cards/SKILL.md)适配而来。以下内容是新站的完整执行规范；本项目使用独立题目 schema，不依赖相邻仓库的 form、senseId、活用器或卡片合并工具。

作者使用 `gpt-6-luna max`，独立审核者使用 `gpt-6-sol medium`。作者不能审自己的稿件，协调者核对范围、结构、收据和哈希后接入；协调者不代替逐题语言批准。每个审核包由一名独立审核者判断，未决状态不能算通过。返修保存新版本，不覆盖原稿与报告。

每份assignment固定id、module、courseId、skillId、familyId及词对或用法。不得更改这些值。作者只写所分配的draft与notes路径，交付后停止写入。初始pilot三题，批准后每批最多16题。参考 `content/requirements.json`，禁止反向按稿件修改需求。

```json
{
  "id": "来自assignment",
  "module": "verbs或particles或mixed",
  "courseId": "来自assignment",
  "skillId": "来自assignment",
  "familyId": "来自assignment",
  "lexicalKey": "能区分词条或句子谓词的稳定短键",
  "scene": "简短具体中文情境，最好12至24字",
  "before": [
    { "text": "挖空之前的日语", "reading": "对应书面假名，保留片假名和标点" }
  ],
  "after": [{ "text": "挖空之后的日语", "reading": "对应假名" }],
  "options": [
    {
      "id": "a",
      "text": "候选词形或助词",
      "reading": "假名",
      "verdict": "correct",
      "explanation": "解释这个选项如何符合场景"
    },
    {
      "id": "b",
      "text": "另一个候选",
      "reading": "假名",
      "verdict": "meaning-mismatch",
      "explanation": "说明它实际表达的意思和场景的差别"
    }
  ],
  "answerIds": ["a"],
  "translation": "只翻译正确完整日语句实际表达的内容",
  "explanation": "一句简洁中文说明此次关系",
  "hint": "指出应考虑的关系，不直接填出答案",
  "sourceIds": ["tufs-case"],
  "review": "draft"
}
```

“存在与活动地点”课程只提供「に／で」两个候选，每项用法各20个场景；不在本课教「へ」。其他课程的候选按其目标保持。

选项verdict只允许correct、meaning-mismatch或ungrammatical。每题至少两个不同选项，answerIds与所有correct选项严格一致。允许多正确答案；目的地行く／来る／帰る的に和へ须逐句核对，通常都接受。不同正确答案应表达同一指定场景；不能为了制造单一答案漏掉合理读法。错误选项必须逐一解释，不把能成立的另一种含义称为语法错误。

句段的汉字必须有对应reading；纯假名、片假名及标点句段可省略reading，直接显示正文。整句reading采用书面假名。独立助词候选的reading可以记录发音（へ读え、を读お），但输入判定只接受实际助词书写へ／を，不把发音拼写当成另一正确答案。此为本项目题目schema对旧站变形答案接口的适配。

词对题只挖动词，助词题只挖助词，综合题也只挖一处，主知识点由assignment决定。自动词与他动词的活用形式须完整，句干、助词与施事相符。assignment.direction指定正确动词的方向。每个词对包含两种方向、不同对象和场景，不能换几个名词就声称都是独立情境。

词对默认仍使用词形题。遇到同形自他词，或某个候选同时可以解释为另一词的可能形等歧义时，协调者可指定个别卡在 `verbs` 模块的 `pairs` 课程使用 `exerciseType: "verb-role"`，直接判断完整句中的动词类别。作者不可自行转换其他卡。

此类型将完整日语句放在 `before`（`after` 可为空数组），不挖空；`focusVerb` 必须精确对应冻结词对中 assignment.direction 指定的词条文字与读音。例如同形 `開く／開く` 两方向均为 `{ "text": "開く", "reading": "ひらく" }`；`弾ける／弾く` 的 transitive 卡为 `{ "text": "弾く", "reading": "はじく" }`，完整句可采用明确的 `弾いた`，避免把 `弾けました` 的可能形读法混入词形选择。两个候选固定为中文“自动词”和“他动词”，reading 分别为“じどうし”和“たどうし”，也可记录对应中文本身。唯一正确类别与 assignment.direction 一致，错误类别解释本句角色判断为何不符，不将完整句说成另一种表达。`fullSentences` 对此类型返回唯一的 `before + after` 完整句，审核、收据和接入均使用这同一个完整句，不插入类别候选。此接口不会自行增加冻结需求或批准题目。

所有内容显式逐句编写。禁止脚本按照名词列表填模板批量制造教材，禁止通用中文场景、占位译文或靠长note挽救生硬句。reading不采用读音猜测；自然正文保留常用汉字，按词义核对多音字。必要时显式分词句段，避免昨日の等锚点误切。

来源ID：tufs-case为格助词说明，tufs-destination为目的地说明，jf-pairs为自他动词词表。参考URL见实施计划；sourceIds表达规则依据，例句为原创。疑义须查可靠资料或改写更明确情境，不能把另一个模型判断当成语言证据。

作者notes每项包含id、完整正确句、中文情境为何限制答案、可能其他读法及其处理、注音核对说明和未决问题。notes不得只填通用已检查。

试稿中发现的重点：严格保持assignment.direction，不能交换题目ID修复方向；没有显式宾语不代表及物动词绝对不合语法。译文不从中文场景擅自加「终于」「遗失」等日语未表达的信息。「以上」包含端点，不能译为「多」；「今度の日曜日」应按实际最近到来的星期日表达，避免无根据固定为下周。「終わる」也有及物用法，按整句判断正确集合；「開く」有「あく／ひらく」读法，候选与本题词义必须一致。

审核报告逐题包含id、hash、fullSentences（所有正确选项的完整句）、status（approved/revise/uncertain）、reason、answerSet、readings、translation、options。hash取JSON.stringify(card)的SHA-256。逐项核对正确集合完整性、每个错误选项的合法性或另一含义、场景、角色、时点、自然搭配、译文、注音。状态不能仅依据结构检查，作者自审不能替代独立审核。只有当前内容哈希匹配报告且逐题approved才可接入。

从仓库根目录交付与接入：

```sh
node scripts/content-workflow.mjs freeze work/content/BATCH/PHASE.draft.json content/deliveries/NEW_DELIVERY /root/实际作者
node scripts/content-workflow.mjs check-review content/deliveries/NEW_DELIVERY content/reviews/REPORT.json
node scripts/accept-content.mjs content/deliveries/NEW_DELIVERY content/reviews/REPORT.json
npm run audit:content
```

`freeze` 同时保存作者 notes 和 assignment。相同交付目录不得覆盖。`approved-index.json` 记录当前有效批准；源卡对象保持原样，作者的 `review: draft` 不冒充审核结果。运行时目录只包含索引绑定的批准对象，审计会重新读取全部交付与报告并验证内容哈希、角色独立性、正确句和冻结范围。
