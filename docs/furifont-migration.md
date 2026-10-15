# Furifont 振假名显示

本项目将已审核的读音与词界数据转换成定制 Furifont。Furifont 只负责显示，`src/data/ruby-layouts.json` 仍是注音内容的依据。迁移不重写题卡正文、译文、读音、选项或动词原形，也不重新推测多音字。

## 版本与来源

- 字体生成工具固定为 [antfu/furifont v0.1.2](https://github.com/antfu/furifont/releases/tag/v0.1.2)。
- 词界规则沿用 [W3C JLReq](https://www.w3.org/TR/jlreq/#usage_of_ruby) 与 [W3C Ruby Markup](https://www.w3.org/International/articles/ruby/markup.en.html#how-long)。
- 选择器和字体行为参考该版本的 [设计说明](https://github.com/antfu/furifont/blob/v0.1.2/docs/design.md) 与 [网站接入说明](https://github.com/antfu/furifont/blob/v0.1.2/packages/app/content/docs/en/website.md)。

不能直接换成上游的自动词典字体。相同汉字在课程中可能具有不同读音；每个 `(text, reading)` 必须有精确的本地映射，并与本次字体构建同时更新。

基底为固定提交的 Source Han Sans JP VF，保留 250～900 的可变字重。交付字体采用新名称 `Bunpo Furifont Sans`，置于 `public/fonts/furifont/`；同目录保留字体的 SIL OFL 1.1、Furifont 工具的 MIT 授权与来源说明。本构建只使用本站已审核读音，没有使用 Furifont 上游词典数据。完整版本、来源与字节哈希见 `src/data/furifont-manifest.json`。

## 重新生成

```sh
npm ci
npm run build:furifont
npm run audit:furifont
npm run validate
```

首次构建自动下载并校验固定版本的基底字体，再保存在系统临时目录缓存。后续可以复用缓存；也可以向构建脚本传入 `--base=/path/to/font.ttf`，提供与固定哈希完全相同的本地文件。无需检出上游仓库，也不从线上动态加载字典。

新增或修改题目时，先完成读音与词界审核并更新 `ruby-layouts.json`，再生成字体和清单。不能只增加清单条目、手写选择器或继续使用对应旧布局的字体。构建会生成本地字体、精确选择器清单与 `public/fonts/furifont/audit.json` 审计收据。

当前构建覆盖 1,842 条布局中的 2,472 个去重注音配对；字体大小为 485,420 字节。一个首字最多需要 31 个选择器，因此不能套用上游预置词典字体的选择器上限。字体仅从本网站加载，资源哈希用于版本化缓存。

## 渲染契约

1. 先按已审核的布局取出含汉注音片段与普通文字。
2. 字体未就绪时，原生 HTML ruby 提供完整振假名。
3. 字体成功加载后，注音片段改用带精确 `salt` 的 Furifont span；普通假名和未注音文字保留原字体。
4. 字体选择器只存在于 CSS，正文不插入 variation selector、私有区字符或隐藏假名。
5. 注音片段内部不折行，防止字体在分行后重新整形并丢失词读音；词与词之间仍可换行。
6. 隐藏注音时移除注音字体，句子、选项和动词原形仍是原有文字。重新显示后恢复同一配对的读音。
7. 目标动词高亮、答案标记和正确／错误选项的动词原形都复用同一渲染路径。

字体已加载但映射缺失时，不能放任字体猜测读音；该片段保留原生 ruby，覆盖检查同时阻止不完整构建进入发布流程。

部分振假名会超出汉字本身的水平范围。清单中的 `inkOverhangEm` 保存从最终字体各字重实测得到的左右超出量；页面按该片段的实际数值预留空间，防止相邻注音相撞。当前 2,472 个配对中只有 110 个需要额外空间，零超出量的片段不统一加宽。例如「入場」左右分别预留 0.164 em 与 0.135 em，相邻的「案内」保持原宽度；两者都继续由 Furifont 显示。

## 验证范围

- 将字体映射与全部在用布局中的去重 `(text, reading)` 集合双向比对，不允许缺失、重复或陈旧项。
- 校验字体文件、授权文件、生成工具版本和内容哈希。
- 使用 HarfBuzz 检查每个选择器实际命中的字形及其读音，清单中的“存在”不能替代字体排版结果。
- UI 测试覆盖加载中、加载成功、加载失败、注音开关、目标高亮、答前挖空、答后补全、前导标点搬移和双选项原形。
- 比较去除原生 `rt` 后的 DOM 文字，确保迁移没有改变复制、搜索、判题所使用的原文。
- 实际浏览器抽查多音字、熟字训、时间和量词、长词及窄屏换行；自动测试不能证明振假名的视觉质量。

字体里的振假名与汉字属于同一个字形，颜色、字重和字号会一起变化。上游指出不同字体栈和排版引擎的行为可能不同；本地原生 ruby 后备机制需要持续保留。
