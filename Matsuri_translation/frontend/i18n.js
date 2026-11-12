(function () {
  "use strict";

  const STORAGE_KEY = "tweetToaster.language.v1";
  // Keep both languages together so a new UI message cannot silently omit one.
  // These strings describe the application, never user text or template artwork.
  const entries = {
    "nav.workspace": ["工作区视图", "Workspace view"],
    "nav.edit": ["编辑内容", "Edit"],
    "nav.preview": ["预览图片", "Preview"],
    "nav.back": ["返回编辑", "Back to edit"],
    "query.label": ["X 主页、@用户名或推文链接", "X profile, @handle or post link"],
    "query.placeholder": ["@用户名或 x.com 链接", "@handle or x.com link"],
    "query.button": ["查询", "Load"],
    "query.loading": ["读取中…", "Loading…"],
    "query.reading": ["正在读取推文…", "Loading posts…"],
    "query.help": ["主页仅显示本人近期推文；链接可省略 https://。", "Profiles show their own recent posts. https:// is optional."],
    "editor.title": ["推文与翻译", "Posts & translations"],
    "editor.help": ["勾选要出图的推文或回复；翻译可留空。", "Select posts or replies to include. Translations are optional."],
    "editor.selection": ["批量选择", "Select posts"],
    "editor.target": ["目标", "Target"],
    "editor.targetOnly": ["仅目标", "Target only"],
    "editor.all": ["全选", "Select all"],
    "editor.none": ["清空", "Deselect all"],
    "editor.include": ["包含 @{handle} 的第 {index} 条推文", "Include post {index} by @{handle}"],
    "editor.translate": ["翻译 @{handle} 的第 {index} 条推文", "Translation for post {index} by @{handle}"],
    "editor.translationPlaceholder": ["输入翻译（留空则只显示原文）", "Enter a translation (leave blank for original only)"],
    "editor.latest": ["最新", "Latest"],
    "editor.reply": ["回复", "Reply"],
    "editor.timeline": ["主页", "Profile"],
    "editor.context": ["上下文", "Context"],
    "editor.count": ["{count} 条", "{count} posts"],
    "editor.count.one": ["{count} 条", "{count} post"],
    "editor.countWithReplies": ["{count} 条 · {replies} 回复", "{count} posts · {replies} replies"],
    "editor.countWithReplies.onePost": ["{count} 条 · {replies} 回复", "{count} post · {replies} replies"],
    "editor.countWithReplies.oneReply": ["{count} 条 · {replies} 回复", "{count} posts · {replies} reply"],
    "editor.countWithReplies.onePostOneReply": ["{count} 条 · {replies} 回复", "{count} post · {replies} reply"],
    "editor.firstThree": ["前 3 条", "First 3"],
    "style.title": ["落款与模板", "Branding & templates"],
    "style.template": ["常用模板 / Logo", "Favorite template / logo"],
    "style.fontSize": ["翻译字号", "Translation size"],
    "style.standard": ["标准", "Standard"],
    "style.compact": ["紧凑", "Compact"],
    "style.large": ["醒目", "Large"],
    "style.showCounts": ["显示回复、转发和点赞数", "Show replies, reposts and likes"],
    "assets.loading": ["正在读取模板库…", "Loading templates…"],
    "assets.manage": ["管理常用与上传…", "Manage & upload…"],
    "assets.local": ["保存在此浏览器", "Saved in this browser"],
    "assets.none": ["不显示落款", "No branding"],
    "assets.draft": ["高级模板草稿", "HTML template draft"],
    "assets.unselected": ["未选择落款", "No branding selected"],
    "assets.current": ["当前 · {name}", "Current · {name}"],
    "assets.favorites": ["我的常用", "Favorites"],
    "assets.localNote": ["{name} · 本地保存", "{name} · Saved locally"],
    "assets.inUse": ["使用中", "In use"],
    "assets.use": ["使用", "Use"],
    "assets.pinned": ["★ 常用", "★ Favorite"],
    "assets.pin": ["☆ 加入常用", "☆ Add favorite"],
    "assets.delete": ["删除", "Delete"],
    "assets.noMatches": ["没有匹配的内置模板。可以上传自己的 Logo。", "No matching templates. You can upload your own logo."],
    "assets.localLogo": ["本地 Logo · {size} KB", "Local logo · {size} KB"],
    "assets.localTemplate": ["本地 HTML 模板", "Local HTML template"],
    "assets.itemCount": ["{count} 项", "{count} items"],
    "assets.itemCount.one": ["{count} 项", "{count} item"],
    "assets.confirmDelete": ["删除“{name}”？只会清除这个浏览器里的副本。", "Delete “{name}”? This removes only the copy in this browser."],
    "assets.persistUnavailable": ["浏览器无法持久保存素材；当前素材仍可在本次打开期间使用。", "This browser could not save the asset. You can still use it in this session."],
    "assets.deleteUnavailable": ["浏览器没有完成本地删除；当前页面中已移除该素材。", "The asset was removed from this page, but the browser could not delete its saved copy."],
    "assets.storageUnavailable": ["当前浏览器不允许持久化素材，自定义项只在本次打开期间可用。", "Local storage is unavailable. Custom assets will work only in this session."],
    "assets.catalogUnavailable": ["无法读取内置模板目录", "Could not load the built-in template catalog."],
    "assets.libraryUnavailable": ["模板库暂时不可用，仍可继续查询和出图。", "The template library is unavailable. You can still load posts and export images."],
    "assets.logoSaveFailed": ["无法保存自定义 Logo", "Could not save the custom logo."],
    "assets.invalidLogo": ["自定义 Logo 仅支持 PNG、JPEG 或 WebP", "Custom logos must be PNG, JPEG or WebP images."],
    "assets.defaultLogo": ["我的 Logo", "My logo"],
    "assets.logoSaved": ["“{name}”已按原图保存在这个浏览器，不会上传到服务器素材库。", "“{name}” was saved at its original size in this browser, not in a server-side asset library."],
    "library.title": ["落款素材库", "Branding library"],
    "library.help": ["加入常用后显示在下拉菜单。", "Add favorites to show them in the dropdown."],
    "library.close": ["关闭素材库", "Close branding library"],
    "library.done": ["完成", "Done"],
    "library.search": ["搜索角色、字幕组或模板名称", "Search characters, groups or templates"],
    "library.upload": ["上传 Logo", "Upload logo"],
    "library.privacy": ["Logo 原图保存在此浏览器，不限 50 KB、保留原尺寸。下载时临时上传用于出图，不在服务器保存素材副本。", "Original logos stay in this browser with no 50 KB limit or resizing. They are sent temporarily for export, not saved in a server-side asset library."],
    "library.mine": ["我的素材", "My assets"],
    "library.builtin": ["内置模板", "Built-in templates"],
    "template.advanced": ["高级 HTML 模板", "Advanced HTML template"],
    "template.help": [" 为翻译内容；脚本等不安全内容会被移除。", " is replaced with your translation. Scripts and other unsafe content are removed."],
    "template.name": ["模板名称", "Template name"],
    "template.save": ["保存到我的模板", "Save template"],
    "template.disable": ["停用自定义 HTML", "Disable custom HTML"],
    "template.privacy": ["草稿和模板仅保存在此浏览器。", "Drafts and templates are saved only in this browser."],
    "template.empty": ["请先输入模板 HTML。", "Enter your template HTML first."],
    "template.missingToken": ["自定义模板必须包含 {T}，否则翻译文字无处显示。", "Include {T} in your template so the translation can appear."],
    "template.defaultName": ["我的模板 {count}", "My template {count}"],
    "template.saved": ["已把“{name}”保存在这个浏览器。", "“{name}” was saved in this browser."],
    "template.readFailed": ["模板读取失败 ({status})", "Could not load the template ({status})."],
    "template.tooLarge": ["模板文件过大", "The template file is too large."],
    "template.loadFailed": ["无法读取这个模板", "Could not load this template."],
    "footer.privacy": ["数据仅用于出图，PNG 缓存自动清理。", "Data is used only for rendering. Cached PNGs are cleaned up automatically."],
    "preview.title": ["图片预览", "Image preview"],
    "preview.noPosts": ["暂无推文", "No posts loaded"],
    "preview.emptyTitle": ["暂无预览", "No preview yet"],
    "preview.emptyHelp": ["输入用户名或推文链接开始查询。", "Enter a handle or post link to get started."],
    "preview.postCount": ["{count} 条推文", "{count} posts"],
    "preview.postCount.one": ["{count} 条推文", "{count} post"],
    "preview.noSelection": ["还没有选中推文，请回到编辑内容，勾选要出图的推文。", "No posts selected. Return to Edit and choose posts to include."],
    "post.verified": ["已认证", "Verified"],
    "post.unknownUser": ["未知用户", "Unknown user"],
    "post.media": ["推文媒体", "Post media"],
    "post.replyingTo": ["回复 ", "Replying to "],
    "post.replies": ["{count} 回复", "{count} replies"],
    "post.replies.one": ["{count} 回复", "{count} reply"],
    "post.reposts": ["{count} 转发", "{count} reposts"],
    "post.reposts.one": ["{count} 转发", "{count} repost"],
    "post.likes": ["{count} 喜欢", "{count} likes"],
    "post.likes.one": ["{count} 喜欢", "{count} like"],
    "post.translationLogo": ["翻译组 Logo", "Translation group logo"],
    "export.reset": ["重新开始", "Start over"],
    "export.download": ["下载 PNG", "Download PNG"],
    "export.generating": ["正在生成…", "Rendering…"],
    "export.progress": ["正在生成高清 PNG，请稍候…", "Rendering your PNG. Please wait…"],
    "export.selectFirst": ["请先勾选至少一条要出图的推文。", "Select at least one post to export."],
    "export.taskQueryFailed": ["无法查询出图任务", "Could not check the export task."],
    "export.renderFailed": ["服务端生成图片失败", "The server could not render the image."],
    "export.timeout": ["图片生成超时，请稍后重试", "The export timed out. Please try again."],
    "export.createFailed": ["无法创建出图任务", "Could not start the export task."],
    "export.downloadFailed": ["生成的图片暂时无法下载", "The generated image could not be downloaded. Please try again."],
    "export.failure": ["图片生成失败：{message}", "Export failed: {message}"],
    "export.selectionMissing": ["部分选中的推文已不可用，未生成图片；请先复制保存翻译，再重新查询", "Some selected posts are unavailable. No image was generated. Copy your translations before loading the posts again."],
    "export.selectionUnavailable": ["选中的推文已不在当前公开数据中，请重新查询", "The selected posts are no longer available. Copy your translations before loading the posts again."],
    "error.queryFailed": ["读取失败", "Could not load the posts."],
    "error.queryUnavailable": ["无法读取这个主页或推文", "Could not read this profile or post. Please try again or use a specific post link."],
    "error.generic": ["操作失败，请稍后重试", "Something went wrong. Please try again."],
    "error.INVALID_INPUT": ["请输入 @用户名、X 主页，或具体推文链接；https:// 可以省略", "Enter an @handle, X profile or post link. https:// is optional."],
    "error.INVALID_URL": ["这里需要具体推文链接", "A specific post link is required here."],
    "error.INVALID_SELECTION": ["请选择 1–30 条有效推文，并检查翻译内容", "Select 1–30 valid posts and check their translations."],
    "error.INVALID_TIME_ZONE": ["时区无效，请刷新页面后重试", "The timezone is invalid. Save your translations, refresh the page and try again."],
    "error.INVALID_LANGUAGE": ["界面语言无效，请选择 EN 或中文", "Choose English or Chinese as the interface language."],
    "error.INVALID_SNAPSHOT": ["查询快照标识无效，请先复制保存翻译，再重新查询", "The query snapshot is invalid. Copy your translations before loading the posts again."],
    "error.SNAPSHOT_MISMATCH": ["查询快照与当前推文不匹配，请先复制保存翻译，再重新查询", "The snapshot does not match these posts. Copy your translations before loading them again."],
    "error.SNAPSHOT_EXPIRED": ["查询快照已过期；请先复制保存翻译，再重新查询后下载", "This query has expired. Copy your translations, load the posts again, then retry the download."],
    "error.SNAPSHOT_UNAVAILABLE": ["查询缓存暂时不可用，请稍后重试", "Query snapshots are temporarily unavailable. Please try again."],
    "error.SNAPSHOT_TOO_LARGE": ["这次查询的内容过大，请改用具体推文链接", "This query is too large. Please use a specific post link."],
    "error.SELECTION_NOT_FOUND": ["部分选中的推文已不在当前结果中；请先复制保存翻译，再重新查询", "Some selected posts are missing. Copy your translations before loading the posts again."],
    "error.TWEET_NOT_FOUND": ["推文不存在、已删除或暂时无法读取", "This post was deleted, does not exist, or is temporarily unavailable."],
    "error.TIMELINE_NOT_FOUND": ["该主页近期内容中没有可读取的本人推文，请尝试具体推文链接", "No readable posts by this account were found on the returned page. Try a specific post link."],
    "error.TIMELINE_UNAVAILABLE": ["暂时无法读取该主页，请稍后重试或粘贴具体推文链接", "This profile is temporarily unavailable. Try again or use a specific post link."],
    "error.PROVIDER_ERROR": ["公开推文数据源暂时无法完成请求，请稍后重试", "The public post provider could not complete the request. Please try again."],
    "error.PROVIDER_UNAVAILABLE": ["公开推文数据源暂时不可用或响应超时，请稍后重试", "The public post provider is unavailable or timed out. Please try again."],
    "error.TEMPLATE_TOO_LARGE": ["模板文件过大", "The template file is too large."],
    "error.INVALID_LOGO": ["自定义 Logo 仅支持 PNG、JPEG 或 WebP，请检查所选素材", "Check the selected logo. Custom logos must be PNG, JPEG or WebP images."],
    "error.LOGO_TOO_LARGE": ["Logo 的临时出图数据过大", "This logo exceeds the temporary export size limit."],
    "error.QUEUE_FULL": ["任务队列已满，请稍后重试", "The export queue is full. Please try again shortly."],
    "error.QUEUE_CLOSED": ["服务器正在关闭，请稍后重新提交任务", "The server is restarting. Please submit the task again shortly."],
    "error.JOB_TIMEOUT": ["任务处理超时，请稍后重试", "The task timed out. Please try again."],
    "error.JOB_NOT_FOUND": ["任务不存在或已过期，请重新下载", "This task does not exist or has expired. Please start a new download."],
    "error.JOB_FAILED": ["任务执行失败，请稍后重试", "The task failed. Please try again."],
    "error.RENDER_TIMEOUT": ["图片渲染超时，请稍后重试", "Image rendering timed out. Please try again."],
    "error.RENDERER_CLOSED": ["图片渲染服务暂时不可用，请稍后重试", "Image rendering is temporarily unavailable. Please try again."],
    "error.REMOTE_BODY_TOO_LARGE": ["远程文件过大", "The remote file is too large."],
    "error.NOT_FOUND": ["接口不存在", "The requested endpoint was not found."],
    "error.BAD_REQUEST": ["请求内容无效，请检查输入后重试", "The request is invalid. Check your input and try again."],
    "error.INTERNAL_ERROR": ["服务器暂时无法完成请求，请稍后重试", "The server could not complete the request. Please try again."]
  };

  const messages = { zh: {}, en: {} };
  for (const [key, pair] of Object.entries(entries)) {
    messages.zh[key] = pair[0];
    messages.en[key] = pair[1];
  }
  Object.freeze(messages.zh);
  Object.freeze(messages.en);
  Object.freeze(messages);

  function normalizeLanguage(value) {
    if (typeof value !== "string") return null;
    if (/^zh(?:-|$)/i.test(value)) return "zh";
    if (/^en(?:-|$)/i.test(value)) return "en";
    return null;
  }

  function initialLanguage() {
    try {
      const saved = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch {
      // Storage may be blocked in private browsing; switching still works.
    }
    const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const candidate of preferred) {
      const supported = normalizeLanguage(candidate);
      if (supported) return supported;
    }
    return "en";
  }

  let language = initialLanguage();

  function t(key, params = {}) {
    if (!params || typeof params !== "object") params = {};
    if (Number(params.count) === 1 && messages.en[`${key}.one`]) key = `${key}.one`;
    if (key === "editor.countWithReplies") {
      if (Number(params.count) === 1 && Number(params.replies) === 1) key += ".onePostOneReply";
      else if (Number(params.count) === 1) key += ".onePost";
      else if (Number(params.replies) === 1) key += ".oneReply";
    }
    const message = messages[language][key] ?? messages.en[key] ?? key;
    return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token);
  }

  function matchingElements(root, selector) {
    const elements = [...root.querySelectorAll(selector)];
    if (root.matches?.(selector)) elements.unshift(root);
    return elements;
  }

  function apply(root = document) {
    for (const node of matchingElements(root, "[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    const allowedAttributes = new Set(["title", "aria-label", "placeholder"]);
    for (const node of matchingElements(root, "[data-i18n-attr]")) {
      for (const entry of node.dataset.i18nAttr.split(";")) {
        const separator = entry.indexOf(":");
        const attribute = entry.slice(0, separator).trim();
        const key = entry.slice(separator + 1).trim();
        if (separator > 0 && allowedAttributes.has(attribute) && key) node.setAttribute(attribute, t(key));
      }
    }
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    const control = document.querySelector("#language-switch");
    if (control) {
      control.dataset.language = language;
      for (const button of control.querySelectorAll("button[data-language]")) {
        const selected = button.dataset.language === language;
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
    }
  }

  function setLanguage(value, { persist = true, emit = true } = {}) {
    const next = normalizeLanguage(value);
    if (!next) return false;
    const changed = language !== next;
    language = next;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Session-only is fine. */ }
    }
    apply();
    if (changed && emit) window.dispatchEvent(new CustomEvent("tweettoaster:languagechange", { detail: { language } }));
    return true;
  }

  function error(value, fallbackKey = "error.generic") {
    if (value?.i18nKey) return t(value.i18nKey, value.params);
    if (value?.code && messages.en[`error.${value.code}`]) return t(`error.${value.code}`);
    const message = typeof value === "string" ? value : value?.message;
    if (message) {
      // Translate known local errors even if the user switched during a request.
      const known = Object.keys(entries).find((key) => messages.zh[key] === message || messages.en[key] === message);
      if (known) return t(known);
      if (language === "zh" || !/[\u3400-\u9fff]/.test(message)) return message;
    }
    return t(fallbackKey);
  }

  window.TweetToasterI18n = Object.freeze({
    t, getLanguage: () => language, setLanguage, getLocale: () => language === "zh" ? "zh-CN" : "en-US",
    get locale() { return language === "zh" ? "zh-CN" : "en-US"; },
    apply, error, messages
  });
  apply();
})();
