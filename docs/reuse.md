# 活用道场基础功能复用记录

来源仓库 `L-M-Sherlock/katsuyo-dojo`，源提交 `67459b9b500ad660f0225f55d736789616f91025`。

| 新文件                       | 源文件                       | 处理                                                                   |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| src/lib/profile-store.mjs    | app/lib/profile-store.mjs    | 原样复制，存储key通过参数注入                                          |
| tests/profile-store.test.mjs | tests/profile-store.test.mjs | 只改import路径                                                         |
| src/lib/statistics-clock.mjs | app/lib/statistics-clock.mjs | 原样复制，localDay接入本站统计模块                                     |
| src/lib/sentence-parts.mjs   | app/lib/usage-cards.mjs      | 抽取usageSentenceParts及依赖函数，未改对齐算法                         |
| public/fonts                 | public/fonts                 | 原样复制Noto Sans JP Variable与Noto Serif JP Variable的分片和OFL许可证 |
| 构建、类型和Lint配置         | package.json等               | 复用固定依赖版本，采用本站脚本与Vite基路径                             |

字体来自Fontsource 5.3.0，采用SIL Open Font License 1.1；许可随字体目录保存。按unicode-range加载当前页面需要的字形。正文和输入使用Noto Sans JP，品牌使用Noto Serif JP；中文界面采用系统中文字体。

新站计分器采用旧站的EMA计算思想（0.2更新率、5次证据、0.85正确率目标），并以独立场景和自他两个方向覆盖作为达标条件。未沿用旧站的形态操作路径、form键、旧备份格式、词类模型和活用诊断；它们与本项目的语义辨析不同。

本站本地存储键为 `bunpo-dojo-profile-v1`，导出格式为 `bunpo-dojo-progress`。跨站进度不共享，导入器拒绝活用道场的备份。基础文件完整存在于本仓库，运行及构建不依赖相邻工作目录。
