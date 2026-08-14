(function () {
  "use strict";

  const state = {
    data: null,
    customLogo: "",
    translations: [],
    included: [],
    logo: "official",
    fontSize: 26,
    showCounts: true,
    template: "",
    botMode: false,
    focalIndex: 0,
    activeAsset: "builtin:matsuri",
    catalog: [],
    userAssets: [],
    draftTemplate: ""
  };

  const LOGOS = {
    official: "img/gongfang_official.png",
    keke: "img/gongfang_keke.png",
    magic: "img/magic_small.png"
  };

  const DEFAULT_FAVORITES = ["builtin:matsuri", "builtin:suisei", "builtin:shion", "builtin:fubuki"];
  const PREFERENCES_KEY = "tweetToaster.preferences.v1";
  const DATABASE_NAME = "tweetToasterAssets";
  const DRAFT_ID = "advanced-template-draft";
  let draftTimer;
  let databasePromise;
  let persistentStorageAvailable = true;

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}");
      return {
        favorites: Array.isArray(value.favorites) ? value.favorites : [...DEFAULT_FAVORITES],
        activeAsset: typeof value.activeAsset === "string" ? value.activeAsset : "builtin:matsuri",
        fontSize: Number(value.fontSize) || 26,
        showCounts: value.showCounts !== false
      };
    } catch {
      return { favorites: [...DEFAULT_FAVORITES], activeAsset: "builtin:matsuri", fontSize: 26, showCounts: true };
    }
  }

  const preferences = readPreferences();
  state.fontSize = preferences.fontSize;
  state.showCounts = preferences.showCounts;
  state.activeAsset = preferences.activeAsset;

  function writePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Private browsing can disable localStorage. The current session still works.
    }
  }

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("assets", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return databasePromise;
  }

  async function assetTransaction(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("assets", mode);
      const request = operation(transaction.objectStore("assets"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const getStoredAssets = () => assetTransaction("readonly", (store) => store.getAll());
  const putStoredAsset = (asset) => assetTransaction("readwrite", (store) => store.put(asset));
  const deleteStoredAsset = (id) => assetTransaction("readwrite", (store) => store.delete(id));

  async function persistAsset(asset) {
    if (!persistentStorageAvailable) return false;
    try {
      await putStoredAsset(asset);
      return true;
    } catch {
      persistentStorageAvailable = false;
      setStatus("浏览器无法持久保存素材；当前素材仍可在本次打开期间使用。", "error");
      return false;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function assetChoice(id) {
    return `user:${id}`;
  }

  function catalogChoice(id) {
    return `builtin:${id}`;
  }

  function catalogItemFromChoice(choice) {
    if (!choice.startsWith("builtin:")) return null;
    return state.catalog.find((item) => item.id === choice.slice("builtin:".length)) || null;
  }

  function userAssetFromChoice(choice) {
    if (!choice.startsWith("user:")) return null;
    return state.userAssets.find((item) => item.id === choice.slice("user:".length)) || null;
  }

  const $ = (selector) => document.querySelector(selector);

  function proxyUrl(url) {
    return url ? `/api/media?url=${encodeURIComponent(url)}` : "";
  }

  function setStatus(message, type = "info") {
    const element = $("#status");
    if (!message) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.className = `status${type === "error" ? " error" : ""}`;
    element.textContent = message;
  }

  function choiceName(choice) {
    if (choice === "none") return "不显示落款";
    if (choice === "draft") return "高级模板草稿";
    const catalogItem = catalogItemFromChoice(choice);
    if (catalogItem) return catalogItem.name;
    const userAsset = userAssetFromChoice(choice);
    if (userAsset) return userAsset.name;
    return "未选择落款";
  }

  function addSelectOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function activeChoiceExists(choice) {
    return choice === "none" || choice === "draft" || Boolean(catalogItemFromChoice(choice) || userAssetFromChoice(choice));
  }

  function refreshAssetSelect() {
    const select = $("#logo-select");
    if (!select) return;
    select.replaceChildren();
    const pinnedChoices = [];
    for (const choice of preferences.favorites) {
      const item = catalogItemFromChoice(choice);
      if (item && !item.hidden) pinnedChoices.push(choice);
    }
    for (const asset of state.userAssets.filter((item) => item.pinned)) pinnedChoices.push(assetChoice(asset.id));
    if (activeChoiceExists(state.activeAsset) && !pinnedChoices.includes(state.activeAsset) && state.activeAsset !== "none") {
      addSelectOption(select, state.activeAsset, `当前 · ${choiceName(state.activeAsset)}`);
    }
    if (pinnedChoices.length) {
      const group = document.createElement("optgroup");
      group.label = "我的常用";
      for (const choice of pinnedChoices) addSelectOption(group, choice, choiceName(choice));
      select.append(group);
    }
    addSelectOption(select, "none", "不显示落款");
    addSelectOption(select, "manage", "管理常用与上传…");
    select.value = activeChoiceExists(state.activeAsset) ? state.activeAsset : "none";
    $("#active-asset-note").textContent = `${choiceName(state.activeAsset)} · 本地保存`;
  }

  async function fetchTemplateFile(item) {
    const response = await fetch(`/templates/${encodeURIComponent(item.file)}`);
    if (!response.ok) throw new Error(`模板读取失败 (${response.status})`);
    return response.text();
  }

  async function applyAssetChoice(choice, { persist = true } = {}) {
    const catalogItem = catalogItemFromChoice(choice);
    const userAsset = userAssetFromChoice(choice);
    if (catalogItem) {
      state.template = await fetchTemplateFile(catalogItem);
      state.logo = "none";
      state.customLogo = "";
    } else if (userAsset?.kind === "logo") {
      state.template = "";
      state.logo = "custom";
      state.customLogo = await blobToDataUrl(userAsset.blob);
    } else if (userAsset?.kind === "template") {
      state.template = userAsset.html;
      state.logo = "none";
      state.customLogo = "";
      $("#template-input").value = userAsset.html;
      $("#template-name").value = userAsset.name;
    } else if (choice === "draft") {
      state.template = $("#template-input").value;
      state.logo = "none";
      state.customLogo = "";
    } else {
      choice = "none";
      state.template = "";
      state.logo = "none";
      state.customLogo = "";
    }
    state.activeAsset = choice;
    if (persist) {
      preferences.activeAsset = choice;
      writePreferences();
    }
    refreshAssetSelect();
    renderPreview();
  }

  function replaceUserAsset(asset) {
    const index = state.userAssets.findIndex((item) => item.id === asset.id);
    if (index >= 0) state.userAssets[index] = asset;
    else state.userAssets.push(asset);
  }

  async function togglePinned(choice) {
    const catalogItem = catalogItemFromChoice(choice);
    const userAsset = userAssetFromChoice(choice);
    if (catalogItem) {
      const favorites = new Set(preferences.favorites);
      if (favorites.has(choice)) favorites.delete(choice);
      else favorites.add(choice);
      preferences.favorites = [...favorites];
      writePreferences();
    } else if (userAsset) {
      const updated = { ...userAsset, pinned: !userAsset.pinned };
      const { previewUrl, ...stored } = updated;
      await persistAsset(stored);
      replaceUserAsset(updated);
    }
    refreshAssetSelect();
    renderAssetLibrary();
  }

  function createAssetCard({ choice, name, subtitle, image, custom = false }) {
    const card = document.createElement("article");
    card.className = "asset-card";
    const preview = document.createElement("div");
    preview.className = `asset-preview${image ? "" : " template-icon"}`;
    if (image) {
      const logo = document.createElement("img");
      logo.src = image;
      logo.alt = "";
      preview.append(logo);
    } else {
      preview.textContent = "{T}\nHTML";
    }
    const body = document.createElement("div");
    body.className = "asset-card-body";
    const title = document.createElement("strong");
    title.textContent = name;
    const detail = document.createElement("small");
    detail.textContent = subtitle;
    const actions = document.createElement("div");
    actions.className = "asset-card-actions";
    const use = document.createElement("button");
    use.className = "mini-button";
    use.type = "button";
    use.textContent = state.activeAsset === choice ? "使用中" : "使用";
    use.disabled = state.activeAsset === choice;
    use.addEventListener("click", async () => {
      await applyAssetChoice(choice);
      $("#asset-library").close();
    });
    const pin = document.createElement("button");
    pin.className = "mini-button pin-button";
    pin.type = "button";
    const userAsset = userAssetFromChoice(choice);
    const pinned = userAsset ? userAsset.pinned : preferences.favorites.includes(choice);
    pin.setAttribute("aria-pressed", String(Boolean(pinned)));
    pin.textContent = pinned ? "★ 常用" : "☆ 加入常用";
    pin.addEventListener("click", () => togglePinned(choice).catch((error) => setStatus(error.message, "error")));
    actions.append(use, pin);
    if (custom) {
      const remove = document.createElement("button");
      remove.className = "mini-button";
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => removeUserAsset(choice));
      actions.append(remove);
    }
    body.append(title, detail, actions);
    card.append(preview, body);
    return card;
  }

  function customAssetImage(asset) {
    if (asset.kind !== "logo") return "";
    if (!asset.previewUrl) asset.previewUrl = URL.createObjectURL(asset.blob);
    return asset.previewUrl;
  }

  function renderAssetLibrary() {
    const query = $("#asset-search").value.trim().toLocaleLowerCase();
    const builtinGrid = $("#builtin-assets-grid");
    builtinGrid.replaceChildren();
    const visible = state.catalog.filter((item) => !item.hidden &&
      (!query || [item.id, item.name, ...(item.tags || [])].join(" ").toLocaleLowerCase().includes(query)));
    for (const item of visible) {
      builtinGrid.append(createAssetCard({
        choice: catalogChoice(item.id),
        name: item.name,
        subtitle: (item.tags || []).join(" · "),
        image: `/templates/${item.logo}`
      }));
    }
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-assets";
      empty.textContent = "没有匹配的内置模板。可以上传自己的 Logo。";
      builtinGrid.append(empty);
    }
    $("#builtin-assets-count").textContent = `${visible.length} / ${state.catalog.filter((item) => !item.hidden).length}`;

    const mine = state.userAssets.filter((item) => !query || item.name.toLocaleLowerCase().includes(query));
    const mineSection = $("#my-assets-section");
    mineSection.hidden = state.userAssets.length === 0;
    const mineGrid = $("#my-assets-grid");
    mineGrid.replaceChildren();
    for (const asset of mine) {
      mineGrid.append(createAssetCard({
        choice: assetChoice(asset.id),
        name: asset.name,
        subtitle: asset.kind === "logo" ? `本地 Logo · ${Math.ceil(asset.blob.size / 1024)} KB` : "本地 HTML 模板",
        image: customAssetImage(asset),
        custom: true
      }));
    }
    $("#my-assets-count").textContent = `${mine.length} 项`;
  }

  async function removeUserAsset(choice) {
    const asset = userAssetFromChoice(choice);
    if (!asset || !window.confirm(`删除“${asset.name}”？只会清除这个浏览器里的副本。`)) return;
    if (persistentStorageAvailable) {
      try {
        await deleteStoredAsset(asset.id);
      } catch {
        persistentStorageAvailable = false;
        setStatus("浏览器没有完成本地删除；当前页面中已移除该素材。", "error");
      }
    }
    if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
    state.userAssets = state.userAssets.filter((item) => item.id !== asset.id);
    if (state.activeAsset === choice) await applyAssetChoice(preferences.favorites[0] || "none");
    refreshAssetSelect();
    renderAssetLibrary();
  }

  async function saveAdvancedTemplate() {
    const html = $("#template-input").value;
    if (!html.trim()) {
      setStatus("请先输入模板 HTML。", "error");
      return;
    }
    if (!html.includes("{T}")) {
      setStatus("自定义模板必须包含 {T}，否则翻译文字无处显示。", "error");
      return;
    }
    const current = userAssetFromChoice(state.activeAsset);
    const name = $("#template-name").value.trim() || current?.name || `我的模板 ${state.userAssets.filter((item) => item.kind === "template").length + 1}`;
    const asset = {
      id: current?.kind === "template" ? current.id : `template-${crypto.randomUUID()}`,
      kind: "template",
      name,
      html,
      pinned: true,
      updatedAt: Date.now()
    };
    const persisted = await persistAsset(asset);
    replaceUserAsset(asset);
    await applyAssetChoice(assetChoice(asset.id));
    if (persisted) setStatus(`已把“${name}”保存在这个浏览器。`);
  }

  async function storeUploadedLogo(file) {
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      throw new Error("自定义 Logo 仅支持 PNG、JPEG 或 WebP");
    }
    const name = file.name.replace(/\.[^.]+$/, "") || "我的 Logo";
    const asset = {
      id: `logo-${crypto.randomUUID()}`,
      kind: "logo",
      name,
      blob: file,
      pinned: true,
      updatedAt: Date.now()
    };
    const persisted = await persistAsset(asset);
    replaceUserAsset(asset);
    await applyAssetChoice(assetChoice(asset.id));
    renderAssetLibrary();
    if (persisted) setStatus(`“${name}”已按原图保存在这个浏览器，不会上传到服务器素材库。`);
  }

  function persistDraftTemplate(html) {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      persistAsset({ id: DRAFT_ID, kind: "draft", html, updatedAt: Date.now() });
    }, 250);
  }

  async function initializeAssetLibrary() {
    const response = await fetch("/templates/catalog.json");
    if (!response.ok) throw new Error("无法读取内置模板目录");
    const catalog = await response.json();
    state.catalog = catalog.templates || [];
    let stored = [];
    try {
      stored = await getStoredAssets();
    } catch {
      persistentStorageAvailable = false;
      setStatus("当前浏览器不允许持久化素材，自定义项只在本次打开期间可用。", "error");
    }
    const draft = stored.find((item) => item.id === DRAFT_ID);
    state.userAssets = stored.filter((item) => item.kind === "logo" || item.kind === "template");
    state.draftTemplate = draft?.html || "";
    $("#template-input").value = state.draftTemplate;
    $("#font-size-select").value = String(state.fontSize);
    $("#show-counts").checked = state.showCounts;
    const firstAvailableFavorite = preferences.favorites.find((choice) => activeChoiceExists(choice));
    const initial = activeChoiceExists(preferences.activeAsset) ? preferences.activeAsset : firstAvailableFavorite || "none";
    await applyAssetChoice(initial, { persist: false });
  }

  function appendLinkedText(container, text) {
    const pattern = /(https?:\/\/[^\s]+|@[\p{L}\p{N}_]+|#[^\s#]+)/gu;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      container.append(document.createTextNode(text.slice(cursor, match.index)));
      const link = document.createElement("a");
      link.textContent = match[0];
      link.rel = "noreferrer";
      container.append(link);
      cursor = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(cursor)));
  }

  function authorNode(author, compact = false) {
    const wrapper = document.createElement("div");
    wrapper.className = compact ? "quote-author" : "tweet-header";
    const avatar = document.createElement("img");
    avatar.src = author.avatarUrl
      ? proxyUrl(author.avatarUrl)
      : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23e9edf0'/%3E%3C/svg%3E";
    avatar.alt = "";
    avatar.crossOrigin = "anonymous";
    if (compact) {
      wrapper.append(avatar);
      const name = document.createElement("strong");
      name.textContent = author.name;
      const handle = document.createElement("span");
      handle.textContent = `@${author.screenName}`;
      wrapper.append(name, handle);
      return wrapper;
    }
    avatar.className = "tweet-avatar";
    const identity = document.createElement("div");
    identity.className = "tweet-author";
    const name = document.createElement("div");
    name.className = "tweet-name";
    const nameText = document.createElement("span");
    nameText.textContent = author.name;
    name.append(nameText);
    if (author.verified) {
      const verified = document.createElement("span");
      verified.className = "verified";
      verified.textContent = "✓";
      verified.setAttribute("aria-label", "已认证");
      name.append(verified);
    }
    const handle = document.createElement("div");
    handle.className = "tweet-handle";
    handle.textContent = `@${author.screenName}`;
    identity.append(name, handle);
    const x = document.createElement("span");
    x.className = "x-mark";
    x.textContent = "𝕏";
    wrapper.append(avatar, identity, x);
    return wrapper;
  }

  function formatCount(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("zh-CN", { notation: number >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(number);
  }

  function mediaNode(items) {
    if (!items?.length) return null;
    const grid = document.createElement("div");
    grid.className = `media-grid count-${items.length}`;
    items.forEach((item) => {
      const frame = document.createElement("div");
      frame.className = "media-item";
      const image = document.createElement("img");
      image.src = proxyUrl(item.url);
      image.alt = item.alt || "推文媒体";
      image.crossOrigin = "anonymous";
      frame.append(image);
      if (item.type === "video" || item.type === "gif") {
        const badge = document.createElement("span");
        badge.className = "video-badge";
        badge.textContent = "▶";
        frame.append(badge);
      }
      grid.append(frame);
    });
    return grid;
  }

  function quoteNode(quote) {
    if (!quote) return null;
    const card = document.createElement("div");
    card.className = "quote-card";
    card.append(authorNode(quote.author, true));
    const text = document.createElement("div");
    text.className = "quote-text";
    appendLinkedText(text, quote.text || "");
    card.append(text);
    const media = mediaNode((quote.media || []).slice(0, 1));
    if (media) card.append(media);
    return card;
  }

  function tweetNode(tweet) {
    const card = document.createElement("article");
    card.className = "tweet-card";
    card.dataset.tweetId = tweet.id;
    card.append(authorNode(tweet.author));
    if (tweet.replyingTo) {
      const replying = document.createElement("div");
      replying.className = "replying";
      replying.append("回复 ");
      const who = document.createElement("span");
      who.textContent = `@${tweet.replyingTo}`;
      replying.append(who);
      card.append(replying);
    }
    const text = document.createElement("div");
    text.className = "tweet-text";
    appendLinkedText(text, tweet.text || "");
    card.append(text);
    const media = mediaNode(tweet.media);
    if (media) card.append(media);
    const quote = quoteNode(tweet.quote);
    if (quote) card.append(quote);
    const meta = document.createElement("div");
    meta.className = "tweet-meta";
    const date = tweet.createdAt ? new Date(tweet.createdAt) : null;
    meta.textContent = date && !Number.isNaN(date.valueOf())
      ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
      : "";
    card.append(meta);
    if (state.showCounts) {
      const counts = document.createElement("div");
      counts.className = "tweet-counts";
      counts.innerHTML = `<span>${formatCount(tweet.counts.replies)} 回复</span><span>${formatCount(tweet.counts.reposts)} 转发</span><span>${formatCount(tweet.counts.likes)} 喜欢</span>`;
      card.append(counts);
    }
    return card;
  }

  function safeTemplateHtml(template, translation, fontSize) {
    const escaped = document.createElement("div");
    escaped.textContent = translation;
    const translationHtml = `<span class="template-translation-text" style="font-size:${fontSize}px">${escaped.innerHTML.replace(/\n/g, "<br>")}</span>`;
    const parsed = document.createElement("template");
    parsed.innerHTML = template.replaceAll("{T}", translationHtml);
    const allowedTags = new Set(["DIV", "SPAN", "P", "BR", "IMG", "STRONG", "EM", "B", "I", "SMALL", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
    const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON", "VIDEO", "AUDIO"]);
    parsed.content.querySelectorAll("*").forEach((node) => {
      if (blockedTags.has(node.tagName)) node.remove();
      else if (!allowedTags.has(node.tagName)) node.replaceWith(...node.childNodes);
    });
    parsed.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        const allowed = name === "class" || name === "style" || name === "title" || name === "alt" ||
          name === "width" || name === "height" || (node.tagName === "IMG" && name === "src");
        if (!allowed) node.removeAttribute(attribute.name);
        if (name === "style" && /(url\s*\(|expression\s*\(|@import|javascript:)/i.test(value)) node.removeAttribute(attribute.name);
        if (name === "src" && !/^(?:data:image\/|img\/|\/?templates?\/|\/api\/media)/i.test(value)) node.removeAttribute(attribute.name);
      });
    });
    return parsed.content;
  }

  function templateVariants(template) {
    const markers = [...template.matchAll(/<!--([\s\S]*?)-->/g)];
    const variants = [];
    for (let index = 0; index + 1 < markers.length; index += 2) {
      if (markers[index][1].trim() !== markers[index + 1][1].trim()) return [template];
      const start = markers[index].index + markers[index][0].length;
      variants.push(template.slice(start, markers[index + 1].index));
    }
    return variants.length ? variants : [template];
  }

  function logoSource() {
    if (state.logo === "custom") return state.customLogo;
    return LOGOS[state.logo] || "";
  }

  function translationNode(text, index) {
    const block = document.createElement("section");
    block.className = "translation-block";
    if (state.template.trim()) {
      const variants = templateVariants(state.template);
      const variantIndex = state.botMode && index !== state.focalIndex && variants[1] ? 1 : 0;
      block.append(safeTemplateHtml(variants[variantIndex], text, state.fontSize));
      return block;
    }
    const logo = logoSource();
    if (logo) {
      const image = document.createElement("img");
      image.className = "translation-logo";
      image.src = logo;
      image.alt = "翻译组 Logo";
      block.append(image);
    }
    const translation = document.createElement("div");
    translation.className = "translation-text";
    translation.style.fontSize = `${state.fontSize}px`;
    appendLinkedText(translation, text);
    block.append(translation);
    return block;
  }

  function renderPreview() {
    if (!state.data) return;
    const capture = $("#capture");
    capture.replaceChildren();
    const stack = document.createElement("div");
    stack.className = "tweet-stack";
    state.data.tweets.forEach((tweet, index) => {
      if (!state.included[index]) return;
      stack.append(tweetNode(tweet));
      const translation = state.translations[index]?.trim();
      if (translation) stack.append(translationNode(translation, index));
    });
    capture.append(stack);
    $("#preview-hint").textContent = `${state.included.filter(Boolean).length} 条推文 · 640px`;
  }

  function buildEditor() {
    const list = $("#translation-list");
    list.replaceChildren();
    state.data.tweets.forEach((tweet, index) => {
      const item = document.createElement("div");
      item.className = `translation-item${state.included[index] ? "" : " disabled"}`;
      const header = document.createElement("div");
      header.className = "translation-item-header";
      const include = document.createElement("input");
      include.type = "checkbox";
      include.checked = state.included[index];
      include.setAttribute("aria-label", `包含 @${tweet.author.screenName} 的第 ${index + 1} 条推文`);
      const originalWrap = document.createElement("div");
      originalWrap.className = "original-wrap";
      const originalMeta = document.createElement("div");
      originalMeta.className = "original-meta";
      originalMeta.textContent = `${tweet.author.name} · @${tweet.author.screenName}`;
      const original = document.createElement("div");
      original.className = "original";
      original.textContent = tweet.text;
      originalWrap.append(originalMeta, original);
      const label = document.createElement("span");
      label.className = `relation-label ${tweet.relation || "context"}`;
      if (state.data.mode === "timeline" && index === 0) label.textContent = "最新";
      else label.textContent = ({ target: "目标", reply: "回复", timeline: "主页", context: "上下文" })[tweet.relation] || "上下文";
      header.append(include, originalWrap, label);
      const textarea = document.createElement("textarea");
      textarea.placeholder = "输入中文翻译（留空则只显示原文）";
      textarea.value = state.translations[index] || "";
      textarea.dataset.index = index;
      include.addEventListener("change", () => {
        state.included[index] = include.checked;
        item.classList.toggle("disabled", !include.checked);
        renderPreview();
      });
      textarea.addEventListener("input", () => {
        state.translations[index] = textarea.value;
        renderPreview();
      });
      item.append(header, textarea);
      list.append(item);
    });
  }

  function recommendedSelection(data) {
    if (data.mode === "timeline") return data.tweets.map((_, index) => index < Math.min(3, data.tweets.length));
    return data.tweets.map((tweet, index) => tweet.focal || index === data.focalIndex);
  }

  function setSelection(mode) {
    if (!state.data) return;
    if (mode === "all") state.included = state.data.tweets.map(() => true);
    else if (mode === "none") state.included = state.data.tweets.map(() => false);
    else state.included = recommendedSelection(state.data);
    buildEditor();
    renderPreview();
  }

  function loadData(data) {
    state.data = data;
    state.botMode = false;
    state.focalIndex = data.focalIndex;
    state.translations = data.tweets.map(() => "");
    state.included = recommendedSelection(data);
    buildEditor();
    renderPreview();
    const replyCount = data.tweets.filter((tweet) => tweet.relation === "reply").length;
    $("#tweet-count").textContent = replyCount ? `${data.tweets.length} 条 · ${replyCount} 回复` : `${data.tweets.length} 条`;
    $("#recommended-selection").textContent = data.mode === "timeline" ? "前 3 条" : "仅目标";
    $("#translation-panel").hidden = false;
    $("#style-panel").hidden = false;
    $("#action-bar").hidden = false;
  }

  async function queryTweet(url) {
    const button = $("#query-button");
    button.disabled = true;
    button.textContent = "读取中…";
    setStatus("正在读取公开主页、上下文和回复，这通常只需要几秒钟。");
    try {
      const response = await fetch("/api/tweet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "读取失败");
      loadData(payload);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "无法读取这个主页或推文", "error");
    } finally {
      button.disabled = false;
      button.textContent = "查询";
    }
  }

  async function waitForImages(root) {
    const images = [...root.querySelectorAll("img")];
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 10000);
      });
    }));
    if (document.fonts?.ready) await document.fonts.ready;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForTask(taskId) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetch(`/api/get_task=${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const task = await response.json();
      if (!response.ok) throw new Error(task?.error?.message || "无法查询出图任务");
      if (task.state === "SUCCESS") return task.result;
      if (task.state === "FAILURE") throw new Error(task.error || "服务端生成图片失败");
      await delay(250);
    }
    throw new Error("图片生成超时，请稍后重试");
  }

  async function downloadPng() {
    const button = $("#download-button");
    const selection = state.data.tweets.flatMap((tweet, index) => state.included[index]
      ? [{ id: tweet.id, translation: state.translations[index] || "" }]
      : []);
    if (!selection.length) {
      setStatus("请先勾选至少一条要出图的推文。", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "正在生成…";
    try {
      setStatus("服务端正在用与预览相同的 Chromium 页面生成 2x PNG…");
      const created = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tweet: state.data.query?.canonicalUrl || state.data.canonicalUrl,
          selection,
          template: state.template,
          noLikes: !state.showCounts,
          logo: state.logo,
          customLogo: state.logo === "custom" ? state.customLogo : "",
          fontSize: state.fontSize
        })
      });
      const payload = await created.json();
      if (!created.ok) throw new Error(payload?.error?.message || "无法创建出图任务");
      const filename = await waitForTask(payload.task_id);
      const imageResponse = await fetch(`/cache/${encodeURIComponent(filename)}.png`, { cache: "no-store" });
      if (!imageResponse.ok) throw new Error("生成的图片暂时无法下载");
      const blob = await imageResponse.blob();
      const source = state.data.query?.screenName || state.data.id;
      window.saveAs(blob, `TweetToaster-${source}-${state.data.id}.png`);
      setStatus("");
    } catch (error) {
      setStatus(`图片生成失败：${error.message}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = "下载 PNG";
    }
  }

  function parseBotTranslations(value, focalIndex, length) {
    const translations = Array.from({ length }, () => "");
    const text = String(value || "");
    const markers = [...text.matchAll(/^##(\d+)\s*$/gm)];
    if (!markers.length) {
      translations[focalIndex] = text;
      return translations;
    }
    markers.forEach((marker, index) => {
      const target = Number(marker[1]) - 1;
      const start = marker.index + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      if (target >= 0 && target < length) translations[target] = text.slice(start, end).replace(/^\s*\n/, "").trimEnd();
    });
    return translations;
  }

  async function renderForBot(payload) {
    window.__tweetToasterReady = false;
    document.body.classList.add("render-mode");
    state.data = payload.data;
    // Browser downloads send an explicit selection and must match the editor preview.
    // Only the legacy Bot translation string keeps the old per-reply variant behavior.
    state.botMode = !Array.isArray(payload.selection);
    state.focalIndex = payload.data.focalIndex;
    state.logo = payload.logo || "official";
    state.customLogo = payload.customLogo || "";
    state.fontSize = Number(payload.fontSize) || 26;
    state.showCounts = !payload.noLikes;
    state.template = payload.template || "";
    if (Array.isArray(payload.selection)) {
      const selected = new Map(payload.selection.map((item) => [String(item.id), String(item.translation || "")]));
      state.translations = payload.data.tweets.map((tweet) => selected.get(tweet.id) || "");
      state.included = payload.data.tweets.map((tweet) => selected.has(tweet.id));
      if (!state.included.some(Boolean)) throw new Error("选中的推文已不在当前公开数据中，请重新查询");
    } else {
      state.translations = parseBotTranslations(payload.translate, payload.data.focalIndex, payload.data.tweets.length);
      state.included = payload.data.tweets.map((tweet, index) => tweet.focal || index <= payload.data.focalIndex);
    }
    if (/^https:\/\//.test(state.template)) state.template = "";
    renderPreview();
    await waitForImages($("#capture"));
    window.__tweetToasterReady = true;
    return true;
  }

  function reset() {
    state.data = null;
    state.translations = [];
    state.included = [];
    $("#capture").innerHTML = `<div class="empty-preview"><div class="skeleton profile-skeleton"></div><div class="skeleton line line-wide"></div><div class="skeleton line line-medium"></div><div class="skeleton media-skeleton"></div><div class="skeleton line line-short"></div><p>一张可以直接发布的烤推图，会出现在这里。</p></div>`;
    $("#translation-panel").hidden = true;
    $("#action-bar").hidden = true;
    $("#tweet-url").focus();
    setStatus("");
  }

  async function loadTemplateParam(value) {
    try {
      const response = await fetch(value);
      if (!response.ok) throw new Error(`模板读取失败 (${response.status})`);
      const template = await response.text();
      if (new Blob([template]).size > 64 * 1024) throw new Error("模板文件过大");
      state.template = template;
      state.draftTemplate = template;
      state.activeAsset = "draft";
      state.logo = "none";
      $("#template-input").value = template;
      preferences.activeAsset = "draft";
      writePreferences();
      persistDraftTemplate(template);
      refreshAssetSelect();
      return true;
    } catch (error) {
      setStatus(error.message || "无法读取模板", "error");
      return false;
    }
  }

  function bind() {
    $("#tweet-form").addEventListener("submit", (event) => {
      event.preventDefault();
      queryTweet($("#tweet-url").value);
    });
    $("#logo-select").addEventListener("change", async (event) => {
      if (event.target.value === "manage") {
        refreshAssetSelect();
        renderAssetLibrary();
        $("#asset-library").showModal();
        return;
      }
      try {
        await applyAssetChoice(event.target.value);
      } catch (error) {
        setStatus(error.message || "无法读取这个模板", "error");
      }
    });
    $("#custom-logo").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await storeUploadedLogo(file);
      } catch (error) {
        setStatus(error.message || "无法保存自定义 Logo", "error");
      } finally {
        event.target.value = "";
      }
    });
    $("#font-size-select").addEventListener("change", (event) => {
      state.fontSize = Number(event.target.value);
      preferences.fontSize = state.fontSize;
      writePreferences();
      renderPreview();
    });
    $("#show-counts").addEventListener("change", (event) => {
      state.showCounts = event.target.checked;
      preferences.showCounts = state.showCounts;
      writePreferences();
      renderPreview();
    });
    $("#template-input").addEventListener("input", (event) => {
      state.template = event.target.value;
      state.draftTemplate = event.target.value;
      state.logo = "none";
      if (state.activeAsset !== "draft") {
        state.activeAsset = "draft";
        preferences.activeAsset = "draft";
        writePreferences();
        refreshAssetSelect();
      }
      persistDraftTemplate(event.target.value);
      renderPreview();
    });
    $("#save-template").addEventListener("click", () => saveAdvancedTemplate().catch((error) => setStatus(error.message, "error")));
    $("#clear-template").addEventListener("click", () => {
      applyAssetChoice(preferences.favorites.find((choice) => catalogItemFromChoice(choice)) || "none")
        .catch((error) => setStatus(error.message, "error"));
    });
    $("#manage-assets").addEventListener("click", () => {
      $("#asset-search").value = "";
      renderAssetLibrary();
      $("#asset-library").showModal();
    });
    $("#close-library").addEventListener("click", () => $("#asset-library").close());
    $("#asset-search").addEventListener("input", renderAssetLibrary);
    $("#upload-logo").addEventListener("click", () => $("#custom-logo").click());
    $("#select-all").addEventListener("click", () => setSelection("all"));
    $("#recommended-selection").addEventListener("click", () => setSelection("recommended"));
    $("#select-none").addEventListener("click", () => setSelection("none"));
    $("#download-button").addEventListener("click", downloadPng);
    $("#reset-button").addEventListener("click", reset);
    $("#show-settings").addEventListener("click", () => $("#settings-pane").classList.add("open"));
    $("#hide-settings").addEventListener("click", () => $("#settings-pane").classList.remove("open"));
  }

  window.TweetToaster = { renderForBot, loadData };
  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    const params = new URLSearchParams(location.search);
    if (params.get("render") === "1") {
      document.body.classList.add("render-mode");
      return;
    }
    try {
      await initializeAssetLibrary();
    } catch (error) {
      state.logo = "official";
      state.activeAsset = "none";
      refreshAssetSelect();
      setStatus(error.message || "模板库暂时不可用，仍可继续查询和出图。", "error");
    }
    if (params.get("template")) await loadTemplateParam(params.get("template"));
    if (params.get("tweet")) {
      $("#tweet-url").value = params.get("tweet");
      queryTweet(params.get("tweet"));
    }
  });
})();
