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
    focalIndex: 0
  };

  const LOGOS = {
    official: "img/gongfang_official.png",
    keke: "img/gongfang_keke.png",
    magic: "img/magic_small.png"
  };

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

  function safeTemplateHtml(template, translation) {
    const escaped = document.createElement("div");
    escaped.textContent = translation;
    const translationHtml = escaped.innerHTML.replace(/\n/g, "<br>");
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
        if (name === "src" && !/^(?:data:image\/|img\/|\/?template\/|\/api\/media)/i.test(value)) node.removeAttribute(attribute.name);
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
      block.append(safeTemplateHtml(variants[variantIndex], text));
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
      include.setAttribute("aria-label", `包含第 ${index + 1} 条推文`);
      const original = document.createElement("div");
      original.className = "original";
      original.textContent = tweet.text;
      header.append(include, original);
      if (tweet.focal) {
        const label = document.createElement("span");
        label.className = "focal-label";
        label.textContent = "目标推文";
        header.append(label);
      }
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

  function loadData(data) {
    state.data = data;
    state.botMode = false;
    state.focalIndex = data.focalIndex;
    state.translations = data.tweets.map(() => "");
    state.included = data.tweets.map((tweet, index) => tweet.focal || index === data.focalIndex);
    if (data.tweets.length > 1) {
      for (let i = 0; i <= data.focalIndex; i += 1) state.included[i] = true;
    }
    buildEditor();
    renderPreview();
    $("#tweet-count").textContent = `${data.tweets.length} 条`;
    $("#translation-panel").hidden = false;
    $("#style-panel").hidden = false;
    $("#action-bar").hidden = false;
  }

  async function queryTweet(url) {
    const button = $("#query-button");
    button.disabled = true;
    button.textContent = "读取中…";
    setStatus("正在读取推文，这通常只需要几秒钟。");
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
      setStatus(error.message || "无法读取这条推文", "error");
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

  async function downloadPng() {
    const button = $("#download-button");
    button.disabled = true;
    button.textContent = "正在生成…";
    try {
      await waitForImages($("#capture"));
      const canvas = await window.html2canvas($("#capture"), {
        useCORS: true,
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false
      });
      canvas.toBlob((blob) => window.saveAs(blob, `TweetToaster-${state.data.id}.png`), "image/png");
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
    state.botMode = true;
    state.focalIndex = payload.data.focalIndex;
    state.logo = payload.logo || "official";
    state.showCounts = !payload.noLikes;
    state.template = payload.template || "";
    state.translations = parseBotTranslations(payload.translate, payload.data.focalIndex, payload.data.tweets.length);
    state.included = payload.data.tweets.map((tweet, index) => tweet.focal || index <= payload.data.focalIndex);
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
    $("#style-panel").hidden = true;
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
      $("#template-input").value = template;
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
    $("#logo-select").addEventListener("change", (event) => {
      state.logo = event.target.value;
      if (state.logo === "custom") $("#custom-logo").click();
      renderPreview();
    });
    $("#custom-logo").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        setStatus("自定义 Logo 请控制在 2 MB 以内。", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => { state.customLogo = String(reader.result); renderPreview(); };
      reader.readAsDataURL(file);
    });
    $("#font-size-select").addEventListener("change", (event) => { state.fontSize = Number(event.target.value); renderPreview(); });
    $("#show-counts").addEventListener("change", (event) => { state.showCounts = event.target.checked; renderPreview(); });
    $("#template-input").addEventListener("input", (event) => { state.template = event.target.value; renderPreview(); });
    $("#download-button").addEventListener("click", downloadPng);
    $("#reset-button").addEventListener("click", reset);
    $("#show-settings").addEventListener("click", () => $("#settings-pane").classList.add("open"));
    $("#hide-settings").addEventListener("click", () => $("#settings-pane").classList.remove("open"));
  }

  window.TweetToaster = { renderForBot, loadData };
  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    const params = new URLSearchParams(location.search);
    if (params.get("render") === "1") document.body.classList.add("render-mode");
    if (params.get("template") && params.get("render") !== "1") await loadTemplateParam(params.get("template"));
    if (params.get("tweet") && params.get("render") !== "1") {
      $("#tweet-url").value = params.get("tweet");
      queryTweet(params.get("tweet"));
    }
  });
})();
