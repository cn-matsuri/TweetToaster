export function providerPayload(id = "1383771374183878658") {
  return {
    code: 200,
    status: {
      type: "status",
      id,
      url: `https://x.com/minatoaqua/status/${id}`,
      text: "トラブル続きですがはじまりました！ #テスト",
      created_at: "Sun Apr 18 13:16:19 +0000 2021",
      lang: "ja",
      replies: 168,
      reposts: 1032,
      likes: 6406,
      author: {
        name: "湊あくあ(本物)",
        screen_name: "minatoaqua",
        avatar_url: "https://pbs.twimg.com/profile_images/test/avatar.png",
        verification: { verified: true }
      },
      media: {},
      quote: null,
      replying_to: null
    },
    thread: null
  };
}

export function conversationPayload(id = "1383771374183878658") {
  const base = providerPayload(id);
  return {
    ...base,
    thread: [base.status],
    replies: [{
      ...base.status,
      id: "1383779999999999999",
      url: "https://x.com/fan/status/1383779999999999999",
      text: "配信お疲れさまでした！",
      created_at: "Sun Apr 18 14:16:19 +0000 2021",
      author: {
        name: "测试回复用户",
        screen_name: "fan",
        avatar_url: "https://pbs.twimg.com/profile_images/test/fan.png",
        verification: { verified: false }
      },
      replying_to: {
        screen_name: "minatoaqua",
        status: id,
        url: `https://x.com/minatoaqua/status/${id}`
      }
    }]
  };
}

export function timelinePayload() {
  const first = providerPayload("2087881201143136469").status;
  return {
    code: 200,
    results: [
      { ...first, author: { ...first.author, name: "星街すいせい", screen_name: "suisei_hosimati" } },
      { ...first, id: "2087000000000000000", url: "https://x.com/suisei_hosimati/status/2087000000000000000", text: "二条目", author: { ...first.author, name: "星街すいせい", screen_name: "suisei_hosimati" } }
    ],
    cursor: { bottom: "next" }
  };
}

export function normalizedTweet() {
  return {
    id: "1383771374183878658",
    canonicalUrl: "https://x.com/minatoaqua/status/1383771374183878658",
    mode: "conversation",
    query: { kind: "status", screenName: "minatoaqua", canonicalUrl: "https://x.com/minatoaqua/status/1383771374183878658" },
    focalIndex: 0,
    tweets: [{
      id: "1383771374183878658",
      url: "https://x.com/minatoaqua/status/1383771374183878658",
      focal: true,
      relation: "target",
      text: "トラブル続きですがはじまりました！ #テスト",
      lang: "ja",
      createdAt: "Sun Apr 18 13:16:19 +0000 2021",
      author: { name: "湊あくあ(本物)", screenName: "minatoaqua", avatarUrl: "", verified: true },
      counts: { replies: 168, reposts: 1032, likes: 6406, views: null },
      media: [],
      quote: null,
      replyingTo: null,
      replyingToStatusId: null
    }]
  };
}

export function normalizedConversation() {
  const value = normalizedTweet();
  value.tweets.push({
    id: "1383779999999999999",
    url: "https://x.com/fan/status/1383779999999999999",
    focal: false,
    relation: "reply",
    text: "配信お疲れさまでした！",
    lang: "ja",
    createdAt: "Sun Apr 18 14:16:19 +0000 2021",
    author: { name: "测试回复用户", screenName: "fan", avatarUrl: "", verified: false },
    counts: { replies: 0, reposts: 0, likes: 3, views: null },
    media: [],
    quote: null,
    replyingTo: "minatoaqua",
    replyingToStatusId: "1383771374183878658"
  });
  return value;
}
