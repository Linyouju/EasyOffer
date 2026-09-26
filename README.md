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

### AI 在其中做什么？

| 环节 | EasyOffer 怎样帮你 |
| --- | --- |
| **理解页面** | 分析网页字段的含义、经历归属，以及岗位和当前投递状态 |
| **调用资料** | 从个人资料库中找到对应经历，已有确认内容优先原样使用 |
| **适配填写** | 遇到不同问法、字段拆分或字数限制，基于已有事实整理内容，填写后检查结果 |
| **跟进投递** | 一键将官网岗位与状态同步到工作台，关联已有记录，集中查看进度 |

填写和投递识别共用页面理解与模型调用能力，让 AI 参与完整流程。日期、下拉框等控件由执行模块操作，并配合回读检查与续填。

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

后续可探索飞书等可选通知渠道，用于每日提醒。当前版本使用浏览器内工作台；飞书接入需要另行开发和配置。

## 了解更多

[更新与备份](docs/USAGE.md#更新与备份) · [数据与权限](PRIVACY.md) · [源码构建](docs/DEVELOPMENT.md) · [问题反馈](https://github.com/Linyouju/EasyOffer/issues)

资料保存在本地浏览器；AI 使用你配置的模型服务，费用按服务商规则计收。开启自动检查后，访问招聘页面时同步状态。

[MIT 许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
