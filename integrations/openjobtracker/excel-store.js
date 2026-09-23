/**
 * excel-store.js
 * 本地 Excel（.xlsx）读写模块：
 *  - 通过 File System Access API 持有用户选择的 Excel 文件句柄（保存在 IndexedDB 中）。
 *  - 读取工作簿 -> 表头定位列 -> 按「公司名称 + 应聘岗位」匹配行：
 *      命中 -> 直接覆盖该行对应列的全部信息；未命中 -> 追加新行。
 *  - 重新生成工作簿并通过文件句柄原地写回（覆盖更新）。
 *
 * 纯数据部分（upsertRows / applyRecordsToWorkbook）不依赖浏览器环境，可在 Node 中直接测试。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ExcelStore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** IndexedDB 中保存 FileSystemFileHandle 的库表定义 */
  const DB_NAME = 'openjobtracker';
  const DB_VERSION = 1;
  const STORE_NAME = 'fileHandles';
  const HANDLE_KEY = 'excelFile';

  /** 目标工作表默认名称与固定列定义（表头即定位依据） */
  const DEFAULT_SHEET_NAME = '投递记录';
  const HEADERS = ['公司名称', '应聘岗位', '城市', '当前进度', '投递渠道', '投递链接', '更新时间'];

  /** 将任意单元格值规范化为去首尾空白的字符串，便于比较与定位 */
  function asText(value) {
    return value == null ? '' : String(value).trim();
  }

  /** 格式化当前时间为可读字符串（与旧飞书写入保持一致的展示格式） */
  function formatNow() {
    return new Date().toLocaleString('zh-CN', { hour12: false });
  }

  /**
   * 纯函数：在「二维数组（AOA）」形式的工作表上执行 upsert。
   * 第一行为表头；会自动补齐缺失的标准列。匹配键为「公司名称 + 应聘岗位」（精确、去空白）。
   * 命中：覆盖标准列的全部 7 个单元格（行内其他自定义列保留不变）。
   * 未命中：在末尾追加新行。同批数据内的重复键也会收敛到同一行。
   *
   * @param {Array<Array<*>>} inputAoa 原始二维数据（含表头行）
   * @param {Array<object>} records 投递记录数组
   * @param {string} [nowText] 记录未自带更新时间时使用的时间
   * @returns {{aoa: Array<Array<*>>, created: number, updated: number}}
   */
  function upsertRows(inputAoa, records, nowText) {
    const aoa = (Array.isArray(inputAoa) ? inputAoa : []).map((row) =>
      Array.isArray(row) ? row.slice() : []
    );
    if (!aoa.length) aoa.push([]); // 空表：随后补齐为标准表头

    // 1) 解析表头并补齐缺失的标准列，建立「列名 -> 列索引」的定位映射
    const headerRow = aoa[0];
    const headerIndex = new Map();
    headerRow.forEach((cell, index) => {
      const name = asText(cell);
      if (name && !headerIndex.has(name)) headerIndex.set(name, index);
    });
    HEADERS.forEach((header) => {
      if (!headerIndex.has(header)) {
        headerIndex.set(header, headerRow.length);
        headerRow.push(header);
      }
    });
    const columnCount = headerRow.length;

    // 2) 现有数据行补齐长度；建立匹配键 -> 行号 的索引（跳过无公司或无岗位的行）
    for (let r = 1; r < aoa.length; r++) {
      while (aoa[r].length < columnCount) aoa[r].push('');
    }
    const companyIdx = headerIndex.get('公司名称');
    const positionIdx = headerIndex.get('应聘岗位');
    const rowIndexByKey = new Map();
    const makeKey = (company, position) => `${asText(company)}\u0000${asText(position)}`;
    for (let r = 1; r < aoa.length; r++) {
      const company = asText(aoa[r][companyIdx]);
      const position = asText(aoa[r][positionIdx]);
      if (company && position) {
        const key = makeKey(company, position);
        if (!rowIndexByKey.has(key)) rowIndexByKey.set(key, r);
      }
    }

    // 3) 逐条定位并覆盖 / 追加
    let created = 0;
    let updated = 0;
    const list = Array.isArray(records) ? records : [];
    for (const job of list) {
      const values = {
        公司名称: asText(job && job.company),
        应聘岗位: asText(job && job.position),
        城市: asText(job && job.city),
        当前进度: asText(job && job.status) || '状态未知',
        投递渠道: asText(job && job.source),
        投递链接: asText(job && job.url),
        更新时间: asText(job && (job.updatedAt || job.time)) || nowText || formatNow()
      };
      const key = makeKey(values.公司名称, values.应聘岗位);
      let rowIndex = rowIndexByKey.get(key);
      if (rowIndex == null) {
        rowIndex = aoa.length;
        aoa.push(new Array(columnCount).fill(''));
        rowIndexByKey.set(key, rowIndex);
        created++;
      } else {
        updated++;
      }
      // 单元格定位后逐列覆盖，确保对应条目信息完整、准确
      HEADERS.forEach((header) => {
        aoa[rowIndex][headerIndex.get(header)] = values[header];
      });
    }

    return { aoa, created, updated };
  }

  /**
   * 把记录应用到已解析的 XLSX 工作簿对象上（原地修改并返回统计）。
   * 工作表不存在时自动创建（含标准表头）；存在则保留其中的其他自定义列与其它工作表。
   * @param {object} XLSX SheetJS 全局对象
   * @param {object} workbook XLSX.read 得到的工作簿
   * @param {string} sheetName 目标工作表名
   * @param {Array<object>} records 投递记录
   * @param {string} [nowText] 更新时间兜底值
   */
  function applyRecordsToWorkbook(XLSX, workbook, sheetName, records, nowText) {
    if (!XLSX || !workbook) throw new Error('Excel 解析库不可用');
    const name = (sheetName || '').trim() || DEFAULT_SHEET_NAME;
    let worksheet = workbook.Sheets[name];

    let aoa;
    if (worksheet) {
      aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    } else {
      aoa = [];
    }
    if (!aoa.length) aoa = [HEADERS.slice()];

    const result = upsertRows(aoa, records, nowText);
    const newWorksheet = XLSX.utils.aoa_to_sheet(result.aoa);

    // 保留原有列宽；没有则按表头长度生成可读列宽（含用户自定义列）
    if (worksheet && worksheet['!cols']) {
      newWorksheet['!cols'] = worksheet['!cols'];
    } else {
      newWorksheet['!cols'] = result.aoa[0].map((header) => {
        const text = asText(header);
        return { wch: Math.max(12, Math.min(60, text.length * 2 + 4)) };
      });
    }

    if (workbook.SheetNames.indexOf(name) >= 0) {
      workbook.Sheets[name] = newWorksheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newWorksheet, name);
    }

    return { created: result.created, updated: result.updated, sheetName: name };
  }

  /** 打开 / 初始化 IndexedDB（Service Worker 与设置页均可调用） */
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB，无法保存 Excel 文件句柄'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('打开本地数据库失败'));
    });
  }

  /** 以只读 / 读写方式打开对象仓库并执行一次请求 */
  function withStore(mode, action) {
    return openDatabase().then((db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        transaction.oncomplete = () => db.close();
        const request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('访问本地数据库失败'));
      })
    );
  }

  /** 持久化用户选择的 Excel 文件句柄 */
  function saveHandle(handle) {
    if (!handle) return Promise.reject(new Error('文件句柄为空'));
    return withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
  }

  /** 读取已保存的 Excel 文件句柄（未选择时返回 null） */
  function getHandle() {
    return withStore('readonly', (store) => store.get(HANDLE_KEY)).then((handle) => handle || null);
  }

  /** 查询当前对该文件是否具备读写权限：'granted' | 'prompt' | 'denied' */
  function queryPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') {
      return Promise.resolve('denied');
    }
    return Promise.resolve(handle.queryPermission({ mode: 'readwrite' }));
  }

  /**
   * 将投递记录写入用户配置的 Excel 文件（完整读-改-写闭环）。
   * @param {Array<object>} records 投递记录
   * @param {{sheetName?: string}} [options]
   * @returns {Promise<{created:number, updated:number, total:number, fileName:string, sheetName:string, _action:string}>}
   */
  async function syncRecordsToExcel(records, options) {
    const list = Array.isArray(records) ? records : [records];
    const XLSX = typeof self !== 'undefined' ? self.XLSX : null;
    if (!XLSX) throw new Error('Excel 解析库未加载');

    const handle = await getHandle();
    if (!handle) {
      throw new Error('尚未选择 Excel 文件，请先在设置页选择用于保存投递记录的 .xlsx 文件');
    }
    const permission = await queryPermission(handle);
    if (permission !== 'granted') {
      throw new Error('Excel 文件写入权限已失效，请打开设置页点击「重新授权写入」');
    }

    // 读取现有文件（文件被删除 / 移动时给出可读提示）
    let file;
    try {
      file = await handle.getFile();
    } catch (err) {
      throw new Error(`无法读取 Excel 文件（可能已被移动或删除）：${err && err.message || err}`);
    }

    let workbook;
    try {
      workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    } catch (err) {
      throw new Error(`解析 Excel 文件失败，请确认它是有效的 .xlsx 文件：${err && err.message || err}`);
    }

    const result = applyRecordsToWorkbook(
      XLSX, workbook, options && options.sheetName, list, formatNow()
    );

    // 生成完整工作簿并通过文件句柄原地覆盖写回
    let buffer;
    try {
      buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    } catch (err) {
      throw new Error(`生成 Excel 内容失败：${err && err.message || err}`);
    }

    try {
      const writable = await handle.createWritable();
      await writable.write(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));
      await writable.close();
    } catch (err) {
      throw new Error(
        `写入 Excel 文件失败（请关闭正在占用该文件的程序后重试）：${err && err.message || err}`
      );
    }

    return {
      created: result.created,
      updated: result.updated,
      total: list.length,
      fileName: handle.name,
      sheetName: result.sheetName,
      _action: result.updated && !result.created ? 'update' : 'batch'
    };
  }

  return {
    DB_NAME,
    STORE_NAME,
    HANDLE_KEY,
    DEFAULT_SHEET_NAME,
    HEADERS,
    upsertRows,
    applyRecordsToWorkbook,
    openDatabase,
    saveHandle,
    getHandle,
    queryPermission,
    syncRecordsToExcel,
    formatNow
  };
});
