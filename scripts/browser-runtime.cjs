// Launch only an isolated test profile. Never attach to or modify the user's Chrome.
const fs=require('node:fs');
function runtimeOptions(chromium,packagePath,env=process.env){
 const executablePath=env.CHROMIUM_EXECUTABLE||chromium.executablePath();
 if(!fs.existsSync(executablePath))throw Error('CHROMIUM_UNAVAILABLE: install Chromium with the Playwright version pinned by this project');
 return {executablePath,headless:env.V2_HEADED!=='1',chromiumSandbox:true,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+packagePath,'--load-extension='+packagePath]};
}
function diagnose(error,phase){
 const message=String(error?.message||error);
 if(/bootstrap_check_in|MachPortRendezvousServer|_RegisterApplication|TransformProcessType|Operation not permitted/i.test(message))return {code:'BROWSER_ENVIRONMENT_DENIED',message:'当前环境拒绝启动 Chromium 的系统进程或通信端口。尚未执行任何扩展验收。',next:'在允许启动浏览器的终端／测试环境运行相同命令；有桌面会话时可加 V2_HEADED=1。仍使用独立临时配置，不连接用户 Chrome。'};
 if(/CHROMIUM_UNAVAILABLE|Executable doesn't exist/.test(message))return {code:'BROWSER_NOT_INSTALLED',message:'未安装与项目 Playwright 对应的 Chromium。',next:'先安装项目锁定的 Chromium，再运行真实浏览器验收。'};
 if(phase==='launch')return {code:'BROWSER_LAUNCH_FAILED',message:'浏览器在启动阶段退出，尚未执行扩展验收。',next:'完整启动日志已保存在报告中；在允许启动 Chromium 的环境重试独立测试配置。'};
 return {code:'BROWSER_OR_FLOW_FAILURE',message,next:'检查 work/v2-live/result.json；不要把启动失败或流程失败记为通过。'};
}
module.exports={runtimeOptions,diagnose};
