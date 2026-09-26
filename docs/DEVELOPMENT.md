# 从源码构建 EasyOffer

[← 返回项目首页](../README.md)

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

