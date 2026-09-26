<div align="center">
  <img src="https://raw.githubusercontent.com/Linyouju/EasyOffer/main/integrations/openjobtracker/icons/icon128.png" width="80" alt="EasyOffer 图标" />
  <h1>EasyOffer</h1>
  <p><strong>让 AI 读懂网申，用你的资料填写，帮你跟进投递。</strong></p>
  <p>AI 驱动的网申助手与求职工作台 · Chrome / Edge 扩展</p>
  <p>
    <a href="https://github.com/Linyouju/EasyOffer/releases/download/v1.0.0/easyoffer-extension.zip"><strong>⬇ 下载插件</strong></a> ·
    <a href="#安装">安装教程</a> ·
    <a href="docs/USAGE.md">使用指南</a> ·
    <a href="https://github.com/Linyouju/EasyOffer/releases/tag/v1.0.0">V1.0 正式版</a> ·
    <a href="https://github.com/Linyouju/EasyOffer/issues">反馈问题</a>
  </p>
</div>

## 这是什么？

每换一家公司的招聘网站，就要重新填一次教育、实习和项目经历；投递多了，还要记住哪家在笔试、哪家等面试。

**EasyOffer 让 AI 分析招聘页面，按需读取你的个人资料，完成填写适配，并将岗位和投递进度同步到配套工作台。**

**读懂页面 → 调取资料 → 智能填写 → 同步进度**

## 为什么选择 EasyOffer？

### 1. 理解语义，让同一份履历适应不同表单

网页写的是「项目描述」还是「实践内容」？询问的是哪一段实习的职责？AI 结合字段含义和上下文，找到资料库里对应的经历。已有内容直接使用；遇到背景、职责、成果拆分或字数限制，再基于已有事实整理表达。

### 2. 填写、检查、续填，关注真正完成的结果

输入框、日期、下拉选项分别适配，填写后回读检查。遇到控件未接受内容或页面变化，将结果反馈给 AI，在本次任务范围内重新规划。已有公司和时间、描述仍空着的经历，也能在确认归属后继续补充。

### 3. 记住处理进度，减少重复理解

保存任务中的经历归属、填写结果和适配内容，续填时复用仍然有效的记录；资料更新后，检查相关内容的版本再使用。随着资料逐步完善、同一任务持续推进，助手能利用更多已确认信息。

### 4. 从填网申到跟进投递，一处衔接

填写与投递识别共享 AI 页面理解能力。访问岗位或投递记录页，一键同步到工作台；按公司查看状态、打开官网、更新进度，减少重复录入。

## 界面预览

**浏览器里开始填写，工作台里跟进投递。**

<img src="docs/images/popup.png" width="340" alt="EasyOffer 插件：开始智能网申、同步工作台、打开秋招工作台三个入口，右上角为个人资料设置" />

![EasyOffer 工作台：按公司展示岗位、官网入口、笔试与面试状态及最近检查时间](docs/images/workbench.png)

*以上为实际界面，工作台使用虚构的示例记录。*

## 安装

**准备：Chrome 或 Edge 浏览器；使用 AI 功能需要自己的模型 API Key。**

1. **[下载插件 ZIP](https://github.com/Linyouju/EasyOffer/releases/download/v1.0.0/easyoffer-extension.zip)**，解压得到 `extension` 文件夹。
2. 在浏览器地址栏输入 `chrome://extensions`（Edge 输入 `edge://extensions`），打开 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择 `extension` 文件夹。安装完成！

点击浏览器工具栏的扩展图标，将 **EasyOffer** 固定，之后就能随时打开。

## 开始使用

1. **准备资料**：点击插件右上角的人像图标，录入经历，或导入 Excel / 简历文件。
2. **连接 AI**：在设置页填写模型服务地址、模型名称和 API Key，测试连接。
3. **填写网申**：打开公司的简历编辑页，点击 **开始智能网申**；填完核对后保存、提交。
4. **跟进投递**：打开岗位或投递记录页，点击 **同步工作台**，再到 **秋招工作台** 查看进度。

[查看详细使用指南 →](docs/USAGE.md)

## EasyOffer V1.0 正式版

从整理个人资料，到填写网申、记录岗位，再到跟进笔试和面试，在浏览器中完成整套求职流程。

- **个人资料库**：集中维护教育、实习、项目和获奖经历，支持 Excel 导入导出、AI 整理简历。
- **智能网申**：理解不同表单的问法，优先使用已确认资料；按需要适配日期、拆分内容或压缩字数，补充未填项。
- **投递记录**：读取官网岗位和当前状态，关联已有记录，汇总到同一个工作台。
- **求职工作台**：管理计划投递、已投递、笔试、面试、Offer 等进度，直接打开官网、手动更新状态并撤销误操作。
- **进度来源与备份**：查看官网读取时间、区分手动更新，导出资料和投递记录。

[下载 V1.0 正式版 →](https://github.com/Linyouju/EasyOffer/releases/tag/v1.0.0)

## 后续扩展

**规划中：微信、Facebook、飞书等可选通知渠道。** 希望将投递进度和每日跟进提醒送到你常用的工具中。具体接入方式将根据平台开放能力确定，当前版本尚未上线。

## 了解更多

[更新与备份](docs/USAGE.md#更新与备份) · [数据与权限](PRIVACY.md) · [源码构建](docs/DEVELOPMENT.md) · [问题反馈](https://github.com/Linyouju/EasyOffer/issues)

资料保存在本地浏览器；AI 使用你配置的模型服务，费用按服务商规则计收。开启自动检查后，访问招聘页面时同步状态。

[MIT 许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
