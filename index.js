const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios"); // ⭐ DM 보낼 때 쓸 예정

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "mooneo_verify_token_123";

// 👉 나중에 페이지 만들고 값 채워 넣을 자리
const PAGE_ID = process.env.PAGE_ID || "DUMMY_PAGE_ID";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "DUMMY_TOKEN";
const IG_BUSINESS_ID = process.env.IG_BUSINESS_ID || "DUMMY_IG_BIZ_ID";

// 🔥 테스트/운영용으로 사용할 타겟 게시물 ID & 키워드
// - 먼저 테스트용 릴스 ID + "테스트키워드"로 설정
// - 검증 끝난 뒤 실제 릴스 ID + "뜨개앱"으로 교체
const TARGET_MEDIA_ID = process.env.TARGET_MEDIA_ID || "DUMMY_MEDIA_ID";
const TRIGGER_KEYWORD =
  (process.env.TRIGGER_KEYWORD && process.env.TRIGGER_KEYWORD.toLowerCase()) ||
  "뜨개앱";

// 테스트용 홈
app.get("/", (req, res) => {
  res.send("안녕! 나는 mooneoDM 서버야 🐙");
});

// 댓글 단 userId가 "나를 팔로우하는지" 확인
async function checkIfFollowsMe(userId) {
  console.log("👀 팔로우 여부 확인 시작. userId:", userId);

  // followers 목록 조회 (페이징 간단 버전)
  const url = `https://graph.facebook.com/v21.0/${IG_BUSINESS_ID}/followers`;

  try {
    const res = await axios.get(url, {
      params: {
        access_token: PAGE_ACCESS_TOKEN,
        fields: "id,username",
        limit: 100, // 테스트용, 팔로워 많으면 페이징 필요
      },
    });

    const followers = res.data.data || [];
    console.log("📊 followers count:", followers.length);

    const isFollower = followers.some((f) => f.id === userId);
    console.log(`👀 ${userId} follows me?`, isFollower);

    return isFollower;
  } catch (err) {
    console.error(
      "❌ 팔로우 여부 확인 중 에러:",
      err.response?.data || err.message
    );
    // 에러 났을 때는 일단 false 취급
    return false;
  }
}

// Webhook 검증용
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook 검증 요청:", { mode, token, challenge });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook 검증 성공!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook 검증 실패");
    res.sendStatus(403);
  }
});

// ⭐ 인스타 댓글에 프라이빗 DM 한 번 보내는 함수
async function sendPrivateReplyToComment(commentId, messageText) {
  const url = `https://graph.facebook.com/v22.0/${PAGE_ID}/messages`;

  const payload = {
    recipient: {
      comment_id: commentId, // 댓글 ID
    },
    message: {
      text: messageText, // 보낼 DM 내용
    },
    access_token: PAGE_ACCESS_TOKEN, // 토큰을 body에 같이 넣는 방식
  };

  console.log("📤 프라이빗 DM 전송 시도:", payload);

  const response = await axios.post(url, payload);
  console.log("✅ 프라이빗 DM 전송 성공:", response.data);
}

// 🔥 팔로워가 아닐 때, 해당 댓글에 "공개 답글" 달기
async function replyToComment(commentId, messageText) {
  // Instagram Graph API: POST /{ig-comment-id}/replies
  const url = `https://graph.facebook.com/v21.0/${commentId}/replies`;

  const payload = {
    message: messageText,
    access_token: PAGE_ACCESS_TOKEN,
  };

  console.log("📤 댓글 답글 전송 시도:", payload);

  const response = await axios.post(url, payload);
  console.log("✅ 댓글 답글 전송 성공:", response.data);
}

// ⭐ 실제 이벤트 처리
// 메인 Webhook: 댓글 → 팔로우 여부 확인 → 키워드 → DM 또는 답글
app.post("/webhook", async (req, res) => {
  console.log("📩 Webhook 이벤트 도착!");
  console.dir(req.body, { depth: null });

  try {
    const entryList = req.body.entry || [];

    for (const entry of entryList) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const field = change.field;
        const value = change.value || {};

        console.log("🧩 change.field:", field);

        if (field === "comments") {
          const rawText = value.text || "";
          const text = rawText.toLowerCase();
          const from = value.from || {};
          const username = from.username;
          const igUserId = from.id;
          const commentId = value.id;
          const media = value.media || {};
          const mediaId = media.id;

          console.log("💬 댓글 내용:", rawText);
          console.log("👤 작성자:", username, igUserId);
          console.log("🧾 comment_id:", commentId);
          console.log("🎬 media_id:", mediaId);

          // 🔥 0️⃣ 타겟 게시물 필터링 (테스트/운영용 구분)
          if (!mediaId) {
            console.log("⚠️ mediaId 없음 → 스킵");
            continue;
          }

          if (mediaId !== TARGET_MEDIA_ID) {
            console.log("⏭ 타겟이 아닌 게시물의 댓글 → 무시");
            continue;
          }

          // 🔥 1️⃣ 키워드 포함 여부 확인 (팔로워 여부와 상관없이 먼저 확인)
          if (!text.includes(TRIGGER_KEYWORD)) {
            console.log(`🔎 키워드 "${TRIGGER_KEYWORD}" 없음 → 이 댓글은 무시`);
            continue;
          }

          // 🔥 2️⃣ 팔로우 여부 확인
          const isFollower = await checkIfFollowsMe(igUserId);

          if (!isFollower) {
            // 조건 2: "댓글만 달았을 때" → 댓글 답글로 안내
            console.log("🙅‍♀️ 팔로워가 아님 → 댓글로 안내 메시지 전송");

            const guideText =
              "팔로우해주시면 DM으로 자료 보내드릴게요 💙\n" +
              '팔로우 후 다시 "뜨개앱"이라고 댓글 남겨주세요!';

            try {
              await replyToComment(commentId, guideText);
              console.log("✅ 비팔로워 안내 댓글 전송 완료");
            } catch (e) {
              console.error(
                "❌ 안내 댓글 전송 중 에러:",
                e.response?.data || e.message
              );
            }

            // 이 댓글에 대해서는 DM 보내지 않음
            continue;
          }

          console.log("✅ 팔로워 확인 완료! DM 발송 단계로 진행");

          // 🔥 3️⃣ 조건 3: 팔로우 + 댓글 + 키워드 → DM 발송
          const replyText =
            "💙안녕하세요, 뜨개무너(@mooneo_knits)입니다 🧶\n" +
            "\n" +
            `댓글로 “${TRIGGER_KEYWORD}” 남겨주셔서 감사합니다!🐙✨\n` +
            "\n" +
            "약속드린 뜨개러 필수 무료 앱 정리 자료 보내드려요👇\n" +
            "\n" +
            "🔗 노션 링크: https://www.notion.so/3-1-2a56e9c76ef58009a3eff70ec4f7a0ac?source=copy_link\n" +
            "\n" +
            "📱 아이폰 / 갤럭시 버전 다운로드 링크\n" +
            "🧵 사용법 + 보너스 앱 정보까지 한눈에 보기 쉽게 정리되어 있어요!\n" +
            "\n" +
            "+ 정리한 자료 중에 오류가 있다면 DM으로 즉시 알려주세요.\n" +
            "바로 대응해드릴게요! 감사합니다💙";

          try {
            await sendPrivateReplyToComment(commentId, replyText);
            console.log("✅ DM 발송 로직 완료");
          } catch (e) {
            console.error("❌ DM 발송 중 에러:", e.response?.data || e.message);
          }
        } else {
          console.log("ℹ️ comments 외 이벤트는 무시:", field);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook 처리 중 에러:", err);
    res.sendStatus(500);
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다! http://localhost:${PORT}`);
});
