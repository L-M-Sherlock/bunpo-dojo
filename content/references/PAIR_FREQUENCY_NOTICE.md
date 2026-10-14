# 词对排序数据来源与许可

`pair-frequency.json` 只服务于自动词与他动词课程的例词排序。课程内容、答案和掌握标准不由词频数据决定。

## Jiten Global

- 来源：[Jiten Japanese Frequency Dictionaries](https://jiten.moe/frequency-dictionaries)
- 数据版本：`Jiten 26-10-09`
- 获取日期：2026-10-14
- 完整 CSV SHA-256：`aff679f1ae21dbf7b1c3525c2fd0389d90f6837b4a62b79e1a4ac4a577081004`
- 原始及衍生数据许可：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

本项目从 Global CSV 中筛选课程词形，按表记与读音匹配，并对有多个词义的条目进行人工消歧。`pair-frequency.json` 中的 Jiten 排名、Jiten 词对分数及其衍生字段继续按 CC BY-SA 4.0 提供。改动包括筛选、词义消歧、词对合成和与另一来源的等权顺位合并。

## JPDB v2.2 Frequency Kana

- 转换资料：[Kuuuube/yomitan-dictionaries](https://github.com/Kuuuube/yomitan-dictionaries/blob/b1114cc014f4343d04c387c7dcd3b1171dd31782/data/jpdb_v2.2_freq_list_2024-10-13.csv)
- 上游：[jpdb.io](https://jpdb.io/)
- 数据日期：2024-10-13
- 完整 TSV SHA-256：`5cf103c1538a2189cda2fe0d462ebfe08eb09f211a48b727f533d387b371c5eb`

该转换资料没有声明开放许可证，因此仓库不保存完整文件或逐词原始 JPDB 排名。`pair-frequency.json` 只保存由本项目计算的 172 项来源内顺位和最终综合顺序，并保留版本、来源与校验值。

## 本项目的合并方法

1. 按课程固定的词义，以“词形＋读音”精确匹配；缺项或一对多必须在 `pair-frequency-aliases.json` 中显式解决。
2. 每套来源取词对中较低频一侧的排名，并以 `log1p(rank) / log1p(sourceMaxRank + 1)` 在来源内归一化。
3. 将 JPDB 与 Jiten 的归一化分数等权平均，以十亿分之一为单位保存定点综合分。
4. 综合分相同时，再依次比较较差的单源分、JPDB词对排名、Jiten词对排名和假名写法综合分；最终回退到冻结的课程原顺序。两侧排名的几何平均另行保存，用于审计而不主导排序。

排名越小表示越常见。词频反映语料中的表记与读音，不等同于语义难度，也不能证明一条自他对应没有例外。

在取得上述两个完整快照后，可用下列命令重建审核数据和运行时顺序：

```sh
node scripts/build-pair-frequency.mjs \
  --jpdb /path/to/jpdb.tsv \
  --jiten /path/to/jiten.csv \
  --jiten-revision "Jiten 26-10-09" \
  --output content/references/pair-frequency.json \
  --order-output content/references/pair-frequency-order.json \
  --date 2026-10-14
```
