(function (root) {
  'use strict';

  const IDENTITY_LABEL_RE = /(?:候选人|申请人|求职者|应聘者|用户)(?:姓名|名字)?\s*[：:]|(?:姓名|名字)\s*[：:]|手机(?:号码?|尾号)?|手机号|联系电话|联系方式|电话(?:号码)?|尾号\s*[：:]?\s*\d{2,}/i;
  const PHONE_RE = /^(?:\+?86[-\s]?)?1[3-9](?:[-\s]?\d){9}$/;
  const MASKED_PHONE_RE = /^(?:\+?86[-\s]?)?(?:1[3-9]\d?)?[-\s]?[xX*＊•·]{3,}[-\s]?\d{0,4}$/;
  const PURE_TAIL_RE = /^\d{2,6}$/;
  const NAVIGATION_TEXT_RE = /^(?:个人资料|个人信息|个人中心|我的资料|我的信息|我的简历|简历中心|简历管理|账号设置|账户设置|用户中心|候选人中心|查看记录|查看详情|了解更多|立即投递|立即申请|申请职位|返回|首页|投递记录|应聘记录|申请记录)$/i;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function compact(value) {
    return clean(value).replace(/[\s\-—()（）]/g, '');
  }

  function isIdentityText(text, profile) {
    const value = clean(text);
    if (!value) return false;
    const packed = compact(value);
    if (IDENTITY_LABEL_RE.test(value) || PHONE_RE.test(value) || MASKED_PHONE_RE.test(packed)) return true;

    const name = clean(profile && profile.name);
    if (name && (value === name || value === `我是${name}` || value === `${name}同学`)) return true;

    const phone = String(profile && profile.phone || '').replace(/\D/g, '');
    if (phone) {
      const digits = value.replace(/\D/g, '');
      if (digits === phone) return true;
      const tail = phone.slice(-4);
      if (tail && PURE_TAIL_RE.test(packed) && packed === tail) return true;
      if (tail && /尾号|后四位|末四位/.test(value) && digits.endsWith(tail)) return true;
    }
    return false;
  }

  function isLikelyPosition(text, profile) {
    const value = clean(text);
    if (/^(?:hi|hello|hey|你好|您好|欢迎|岗位详情|职位详情|岗位职责|任职要求)[!！,，。\s]*$/i.test(value)) return false;
    if (!value || value.length > 80 || NAVIGATION_TEXT_RE.test(value) || isIdentityText(value, profile)) return false;
    if (/^(?:\d{2,6}|[-—_/]+)$/.test(value)) return false;
    if (/扫码|二维码|公众号|关注我们|了解更多|招聘信息|隐私政策|版权所有|点击查看|投递成功|申请成功/.test(value)) return false;
    return true;
  }

  function isNavigationCandidate(text, className, id, role) {
    const value = clean(text);
    const marker = `${className || ''} ${id || ''}`;
    const navigationClass = /(?:^|[-_\s])(nav|menu|tabs?)(?:[-_\s]|$)|profile|personal|account|user(?:info|center|panel)|header|footer|sidebar|breadcrumb/i;
    return NAVIGATION_TEXT_RE.test(value) || navigationClass.test(marker) || /^(?:navigation|tab|menuitem)$/i.test(role || '');
  }

  function isLikelyCompany(text) { return !!clean(text)&&! /^(?:岗位详情|职位详情|校园招聘|招聘官网|我的申请|我的简历|hi|hello)[!！\s]*$/i.test(clean(text)); }
  const api = { clean, isIdentityText, isLikelyPosition, isLikelyCompany, isNavigationCandidate };
  root.JobValidator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
