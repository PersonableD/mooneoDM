const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios"); // ⭐ DM 보낼 때 쓸 예정

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "mooneo_verify_token_123";

// 👉 나중에 페이지 만들고 값 채워 넣을 자리
const PAGE_ID = process.env.PAGE_ID || "DUMMY_PAGE_ID";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "DUMMY_TOKEN";

// 테스트용 홈
app.get("/", (req, res) => {
  res.send("안녕! 나는 mooneoDM 서버야 🐙");
});

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

// ⭐ 실제 이벤트 처리
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

        // 인스타 댓글 이벤트인지 확인
        if (field === "comments") {
          const text = (value.text || "").toLowerCase();
          const from = value.from || {};
          const username = from.username;
          const igUserId = from.id; // DM용 IG user id (일반 DM API에서 쓸 수 있는 값)
          const commentId = value.id; // ⭐ 프라이빗 답장에 쓸 comment_id

          console.log("💬 댓글 내용:", text, "작성자:", username, igUserId);
          console.log("🧾 comment_id:", commentId);

          // 👉 여기서 키워드 체크
          if (text.includes("뜨개앱")) {
            console.log("🎯 키워드 발견! DM 보내기 대상:", username);

            // 👉 보낼 DM 내용
            const replyText =
              "💙안녕하세요, 뜨개무너(@mooneo_knits)입니다 🧶\n" +
              "\n" +
              "댓글로 “뜨개앱” 남겨주셔서 감사합니다!🐙✨\n" +
              "\n" +
              "약속드린 뜨개러 필수 무료 앱 정리 자료 보내드려요👇\n" +
              "\n" +
              "🔗 노션 링크: https://www.notion.so/3-1-2a56e9c76ef58009a3eff70ec4f7a0ac?source=copy_link\n" +
              "\n" +
              "📱 아이폰 / 갤럭시 버전 다운로드 링크\n" +
              "🧵 사용법 + 보너스 앱 정보까지 한눈에 보기 쉽게 정리되어 있어요!\n" +
              "\n" +
              "+정리한 자료중에 오류가 있다면 dm으로 즉시 알려주세요\n" +
              "바로 대응해드릴게요! 감사합니다💙";

            // ⭐ 실제 DM 전송
            await sendPrivateReplyToComment(commentId, replyText);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(
      "❌ Webhook 처리 중 에러:",
      err.response?.data || err.message
    );
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다! http://localhost:${PORT}`);
});
