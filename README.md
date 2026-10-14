# 文法道场

在具体场景中练习日语自动词与他动词、に／で／へ等助词关系。独立网站，复用活用道场的存储保护、有效计时、日语字体和注音对齐。

在线使用：[https://l-m-sherlock.github.io/bunpo-dojo/](https://l-m-sherlock.github.io/bunpo-dojo/)

## 本地开发

需要Node.js 22.13或以上版本。

```sh
npm ci
npm run dev
```

开发地址为终端显示的 `/bunpo-dojo/` 路径。构建和预览：

```sh
npm run build
npm run preview
```

## 验证

```sh
npm run validate
```

验证包括逐题内容与审核哈希审计、行为测试、全对和首错后全对模拟、类型检查、Lint及生产构建。当前完整冻结范围为172组自他词对、10项助词用法、858个场景。草稿与正式在用题目分开，只有当前哈希匹配独立批准报告的卡片才可接入。

计划见 [实施计划](docs/implementation-plan.md)，题库范围见 [scope](content/scope.json)，复用边界见 [复用记录](docs/reuse.md)，语言制作要求见 [内容规则](docs/content-authoring.md)。

## 学习记录

默认本地保存，无账号和后端。提示、揭晓及过早复测单独记录；自由挑战与常规复测分队列。备份导入不累计重复成绩，也不接受活用道场的备份。多标签页冲突会停止写入，存储不可用时可导出当前内存进度。

当前实现采用静态Vite构建，可部署在支持子路径的静态站点。工作基路径为 `/bunpo-dojo/`，部署前应按实际仓库或域名调整并核对字体资源。
