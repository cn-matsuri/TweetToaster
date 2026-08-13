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

export function normalizedTweet() {
  return {
    id: "1383771374183878658",
    canonicalUrl: "https://x.com/minatoaqua/status/1383771374183878658",
    focalIndex: 0,
    tweets: [{
      id: "1383771374183878658",
      url: "https://x.com/minatoaqua/status/1383771374183878658",
      focal: true,
      text: "トラブル続きですがはじまりました！ #テスト",
      lang: "ja",
      createdAt: "Sun Apr 18 13:16:19 +0000 2021",
      author: { name: "湊あくあ(本物)", screenName: "minatoaqua", avatarUrl: "", verified: true },
      counts: { replies: 168, reposts: 1032, likes: 6406, views: null },
      media: [],
      quote: null,
      replyingTo: null
    }]
  };
}
