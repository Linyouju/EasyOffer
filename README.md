# EasyOffer

**把个人资料整理一次，用来填写不同公司的网申，并集中管理投递进度。**

EasyOffer 是一款 Chrome / Edge 浏览器扩展，自带本地投递工作台。

[下载 5.0.3 测试版](https://github.com/Linyouju/EasyOffer/releases/tag/v5.0.3) · [反馈问题](https://github.com/Linyouju/EasyOffer/issues)

## 可以做什么

- **管理个人资料**：录入教育、实习、项目和获奖经历，也可以导入 Excel 或通过 AI 整理简历。
- **辅助填写网申**：理解网页字段，优先使用已确认的原文；需要拆分、合并或限字时，再由 AI 适配。
- **记录投递进度**：读取招聘页面中的岗位和状态，汇总到工作台。
- **跟进每次投递**：打开官网、查看详情、更新状态，导出记录备份。

## 5 分钟开始使用

### 1. 下载并安装

1. 打开 [下载页](https://github.com/Linyouju/EasyOffer/releases/tag/v5.0.3)，在 **Assets** 中下载 **easyoffer-extension.zip**。
2. 解压文件，得到 `extension` 文件夹。
3. 在浏览器地址栏输入：Chrome 用 `chrome://extensions`，Edge 用 `edge://extensions`。
4. 打开右上角的 **开发者模式**，点击 **加载已解压的扩展程序**，选择刚才的 `extension` 文件夹。
5. 点击浏览器工具栏的扩展图标，将 **EasyOffer** 固定到工具栏。

普通用户下载扩展 ZIP 即可；`easyoffer-source.zip` 是开发者使用的源码包。

### 2. 录入自己的资料

打开 EasyOffer → **资料与设置**，选择一种方式：

- 直接添加个人信息和各段经历；
- 导入个人资料 Excel，核对差异后保存；
- 粘贴简历文字或选择 PDF / Word / TXT 文件，点击 AI 分析，确认后保存。

以后直接在资料管理页更新即可。Excel 用于导入和导出；扫描版 PDF 可先转成文字再导入。

### 3. 配置 AI

在设置页填写自己的 **模型服务地址、模型名称和 API Key**，然后运行连接测试。

这些信息由你使用的模型服务商提供。支持 OpenAI 兼容协议和 Anthropic 协议，调用费用由相应服务商计费。

### 4. 开始填写和跟进

| 你想做的事 | 操作 |
| --- | --- |
| 填写网申 | 打开公司的简历编辑页 → 点击 EasyOffer → **开始智能网申** |
| 记录岗位或更新进度 | 打开岗位详情页或投递记录页 → **同步工作台** |
| 查看所有投递 | 点击 **秋招工作台** |
| 修改投递状态 | 在列表中使用状态按钮或旁边的下拉菜单；误操作后可短暂撤销 |
| 再次查看招聘网站 | 点击列表中的 **↗ 官网** |

填写完成后，核对信息并由你在招聘网站保存、提交。插件会保留页面已有内容，需要补充的项目会显示提示。

开启自动检查后，访问相关招聘页面时可同步状态；工作台会区分「官网读取」和「手动更新」，并显示最近检查时间。

## 5.0.3 更新了什么

- 官网入口直接显示在投递列表中，点击后新标签打开。
- 状态操作支持直接进入面试、标记未通过或放弃，结束的投递隐藏推进按钮。
- 状态修改后提供 **8 秒撤销**。
- 展示状态来源与官网检查时间，编辑备注不会改变官网检查时间。
- 修复公开源码的依赖安装问题，支持在干净环境构建。

## 更新与备份

更新前导出资料和投递记录备份。下载新版扩展 ZIP，将文件替换到原安装目录，再到浏览器扩展管理页点击 EasyOffer 的 **重新加载**。

资料和投递记录保存在自己的浏览器中。AI 功能会将所需内容发送到你配置的模型服务。卸载扩展或清理浏览器数据前，请先导出备份。[查看数据与权限说明](PRIVACY.md)

## 遇到问题

到 [Issues](https://github.com/Linyouju/EasyOffer/issues) 描述：使用的浏览器、EasyOffer 版本、出现问题的页面类型，以及预期和实际结果。截图请遮住联系方式等个人信息，保留字段名称和错误提示即可。

<details>
<summary>开发者：从源码构建</summary>

需要 Node.js 22+ 与 npm。

```sh
git clone https://github.com/Linyouju/EasyOffer.git
cd EasyOffer
npm ci
npm --prefix frontend ci
npm run build
```

在浏览器扩展管理页加载 `outputs/easyoffer-extension-v2/`。

```sh
npm run test:node
npm run test:v2
npm run test:browser
```

`integrations/openjobtracker/` 是扩展源码，`workbench/` 是工作台业务源码，`frontend/` 是 React 组件。`npm run release:prepare` 生成源码包、扩展包和校验值。

隔离浏览器测试需安装 Playwright Chromium；真实模型测试另需设置 `MODEL_CONFIG_FILE`，会使用模型额度。运行 `npm run test:share` 验证首次使用流程。

</details>

[MIT 许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
