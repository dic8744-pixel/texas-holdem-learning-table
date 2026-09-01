# 上游来源与本地改造声明

本仓库是在现有开源项目上继续开发的衍生版本，不是从零开发，也不把上游作者的工作声明为本仓库维护者的原创成果。

## 上游基线

- Upstream repository: <https://github.com/best-trading-indicator-tools/poker>
- Upstream remote: `https://github.com/best-trading-indicator-tools/poker.git`
- Audited base commit: `42f4d675e180f284388db6d7e9de4cb90c7d3c77`
- Retrieved: 2026-08-23
- Upstream license: GNU Affero General Public License v3.0 (`LICENSE`)

Git 仓库保留完整上游提交历史。公开发布时，原项目地址保留为 `upstream` 远程，新仓库使用 `origin`，从而能清楚区分上游来源和本地维护版本。

## 本地版完成的工作

- 中文本地学习桌与 6～9 人桌设置。
- 50/100 固定盲注、每份 10,000 积分、1～5 份买入和手间补充积分流程。
- 烧牌、牌张守恒、累计短码全押重开加注、合法行动、边池、零头积分和最佳五张牌等规则修正。
- 可测的三档 AI 难度与禁止读取隐藏牌的边界。
- 学习提示、复盘、回放和扩展统计。
- 随机模拟、规则回归、严格教练审计与 Chrome 端到端验收。
- Mac 本地启动/测试脚本和公开仓库清理。

代码级差异可从基线提交与当前 `main` 比较；功能、规则和验证证据详见 `LOCAL_AUDIT.md`。

## 许可证延续

本地修改继续按 AGPL-3.0 分发。所需第三方署名、许可证文本和锁定组件版本保留在 `THIRD_PARTY_NOTICES.md`、`LICENSE` 与 `vendor/wasm-postflop/`。下游再分发或通过网络向用户提供交互时，也必须继续履行相应的 AGPL-3.0 义务。
