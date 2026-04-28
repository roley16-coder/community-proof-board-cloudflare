import puppeteer from "@cloudflare/puppeteer";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
    ...init
  });

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) {
        return env.ASSETS.fetch(request);
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      const session = await getSession(request, env);

      if (url.pathname === "/api/bootstrap" && request.method === "POST") {
        return withCors(await handleBootstrap(request, env));
      }
      if (url.pathname === "/api/login" && request.method === "POST") {
        return withCors(await handleLogin(request, env));
      }
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return withCors(await handleLogout(env, session));
      }
      if (url.pathname === "/api/session" && request.method === "GET") {
        return withCors(await handleSession(env, session));
      }
      if (url.pathname === "/api/version" && request.method === "GET") {
        return withCors(handleVersion(env));
      }
      if (url.pathname === "/api/capture-probe" && request.method === "GET") {
        return withCors(await handleCaptureProbe(url, env));
      }
      if (url.pathname.startsWith("/api/telegram/webhook/") && request.method === "POST") {
        return await handleTelegramWebhook(url.pathname.split("/").pop(), request, env);
      }
      if (url.pathname === "/api/users" && request.method === "GET") {
        return withCors(await handleListUsers(env, session));
      }
      if (url.pathname === "/api/users" && request.method === "POST") {
        return withCors(await handleCreateUser(request, env, session));
      }
      if (url.pathname.startsWith("/api/users/") && request.method === "PATCH") {
        return withCors(await handleUpdateUser(url.pathname.split("/").pop(), request, env, session));
      }
      if (url.pathname.startsWith("/api/users/") && request.method === "DELETE") {
        return withCors(await handleDeleteUser(url.pathname.split("/").pop(), env, session));
      }
      if (url.pathname === "/api/posts" && request.method === "GET") {
        return withCors(await handleListPosts(env, session));
      }
      if (url.pathname === "/api/posts" && request.method === "POST") {
        return withCors(await handleCreatePost(request, env, session));
      }
      if (url.pathname.startsWith("/api/posts/") && request.method === "DELETE") {
        return withCors(await handleDeletePost(url.pathname.split("/").pop(), env, session));
      }
      if (url.pathname === "/api/notices" && request.method === "GET") {
        return withCors(await handleListNotices(env, session));
      }
      if (url.pathname === "/api/notices" && request.method === "POST") {
        return withCors(await handleCreateNotice(request, env, session));
      }
      if (url.pathname.startsWith("/api/notices/") && request.method === "DELETE") {
        return withCors(await handleDeleteNotice(url.pathname.split("/").pop(), env, session));
      }
      if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
        return await handleGetImage(url.pathname.split("/").pop(), env, session);
      }

      return withCors(json({ error: "Not found" }, { status: 404 }));
    } catch (error) {
      console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      return withCors(json({ error: error.message || "Internal Server Error" }, { status }));
    }
  },

  async scheduled(_controller, env) {
    try {
      await runScheduledRechecks(env);
    } catch (error) {
      console.error("scheduled recheck failed", error);
    }
  }
};

async function handleBootstrap(request, env) {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(countRow.count) > 0) {
    return json({ error: "Bootstrap is already completed" }, { status: 400 });
  }

  const body = await request.json();
  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || username).trim();
  const password = String(body.password || "");
  validatePassword(password);

  const credentials = await hashPassword(password);
  const userId = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, role, password_salt, password_hash) VALUES (?, ?, ?, 'admin', ?, ?)"
  ).bind(userId, username, displayName, credentials.salt, credentials.hash).run();

  return json({ success: true });
}

async function handleLogin(request, env) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  if (!user) return json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return json({ error: "Invalid credentials" }, { status: 401 });

  const token = encodeHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionId, user.id, tokenHash, expiresAt).run();

  return json(
    { success: true, user: sanitizeUser(user) },
    { headers: { "set-cookie": buildSessionCookie(env, token, expiresAt) } }
  );
}

async function handleLogout(env, session) {
  if (session?.sessionId) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.sessionId).run();
  }
  return json(
    { success: true },
    { headers: { "set-cookie": `${cookieName(env)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } }
  );
}

async function handleSession(env, session) {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  return json({
    user: session ? sanitizeUser(session.user) : null,
    bootstrapNeeded: Number(countRow.count) === 0
  });
}

async function handleListUsers(env, session) {
  requireAdmin(session);
  const { results } = await env.DB.prepare(
    "SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at DESC"
  ).all();
  return json({ users: results });
}

async function handleCreateUser(request, env, session) {
  requireAdmin(session);
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || username).trim();
  const role = body.role === "admin" ? "admin" : "viewer";
  const password = String(body.password || "");
  validatePassword(password);

  const credentials = await hashPassword(password);
  const userId = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, username, displayName, role, credentials.salt, credentials.hash).run();

  return json({ success: true });
}

async function handleUpdateUser(userId, request, env, session) {
  requireAdmin(session);
  if (!userId) return json({ error: "User id is required" }, { status: 400 });

  const body = await request.json();
  const password = String(body.password || "");
  validatePassword(password);

  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!user) return json({ error: "User not found" }, { status: 404 });

  const credentials = await hashPassword(password);
  await env.DB.prepare(
    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?"
  ).bind(credentials.salt, credentials.hash, userId).run();

  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  return json({ success: true });
}

async function handleDeleteUser(userId, env, session) {
  requireAdmin(session);
  if (!userId) return json({ error: "User id is required" }, { status: 400 });
  if (userId === session.user.id) {
    return json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다" }, { status: 400 });
  }

  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!user) return json({ error: "User not found" }, { status: 404 });

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return json({ success: true });
}

async function handleListPosts(env, session) {
  requireAuth(session);

  let query = `
    SELECT p.*, au.username AS assigned_username, cu.username AS created_by_username
    FROM posts p
    JOIN users au ON au.id = p.assigned_user_id
    JOIN users cu ON cu.id = p.created_by_user_id
  `;
  const bindings = [];
  if (session.user.role !== "admin") {
    query += " WHERE p.assigned_user_id = ?";
    bindings.push(session.user.id);
  }
  query += " ORDER BY p.created_at DESC";

  const { results: posts } = await env.DB.prepare(query).bind(...bindings).all();
  if (!posts.length) return json({ posts: [] });

  const placeholders = posts.map(() => "?").join(",");
  const { results: images } = await env.DB.prepare(
    `SELECT id, post_id, capture_type FROM post_images WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`
  ).bind(...posts.map((post) => post.id)).all();

  const imagesByPost = new Map();
  for (const image of images) {
    if (!imagesByPost.has(image.post_id)) imagesByPost.set(image.post_id, []);
    imagesByPost.get(image.post_id).push({
      id: image.id,
      url: `/api/images/${image.id}`,
      capture_type: image.capture_type
    });
  }

  return json({
    posts: posts.map((post) => ({
      ...post,
      images: imagesByPost.get(post.id) || []
    }))
  });
}

async function handleCreatePost(request, env, session) {
  requireAdmin(session);
  const form = await request.formData();

  const assignedUserId = String(form.get("assignedUserId") || "");
  const title = nullableString(form.get("title"));
  const content = nullableString(form.get("content"));
  const postedDate = String(form.get("postedDate") || "");
  const location = String(form.get("location") || "").trim();
  const sourceUrl = nullableString(form.get("sourceUrl"));
  const enableRecheck = String(form.get("enableRecheck") || "") === "1";

  if (!assignedUserId || !postedDate || !location || !sourceUrl) {
    return json({ error: "assignedUserId, postedDate, location, sourceUrl are required" }, { status: 400 });
  }

  const result = await createPostRecord({
    env,
    assignedUserId,
    title,
    content,
    postedDate,
    location,
    sourceUrl,
    enableRecheck,
    createdByUserId: session.user.id
  });

  return json({ success: true, postId: result.postId });
}

async function handleDeletePost(postId, env, session) {
  requireAdmin(session);
  const { results: images } = await env.DB.prepare("SELECT object_key FROM post_images WHERE post_id = ?").bind(postId).all();
  if (images.length) {
    await env.IMAGES_BUCKET.delete(images.map((item) => item.object_key));
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM post_images WHERE post_id = ?").bind(postId),
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId)
  ]);
  return json({ success: true });
}

async function ensureNoticeTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function handleListNotices(env, session) {
  requireAdmin(session);
  await ensureNoticeTable(env);
  const { results } = await env.DB.prepare(`
    SELECT n.id, n.title, n.content, n.created_at, u.username AS created_by_username, u.display_name AS created_by_display_name
    FROM notices n
    JOIN users u ON u.id = n.created_by_user_id
    ORDER BY n.created_at DESC
  `).all();
  return json({ notices: results });
}

async function handleCreateNotice(request, env, session) {
  requireAdmin(session);
  await ensureNoticeTable(env);
  const body = await request.json();
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();

  if (!title || !content) {
    return json({ error: "title and content are required" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO notices (id, title, content, created_by_user_id)
    VALUES (?, ?, ?, ?)
  `).bind(id, title, content, session.user.id).run();

  return json({ success: true, noticeId: id });
}

async function handleDeleteNotice(noticeId, env, session) {
  requireAdmin(session);
  await ensureNoticeTable(env);
  if (!noticeId) return json({ error: "Notice id is required" }, { status: 400 });

  const notice = await env.DB.prepare("SELECT id FROM notices WHERE id = ?").bind(noticeId).first();
  if (!notice) return json({ error: "Notice not found" }, { status: 404 });

  await env.DB.prepare("DELETE FROM notices WHERE id = ?").bind(noticeId).run();
  return json({ success: true });
}

async function handleGetImage(imageId, env, session) {
  requireAuth(session);
  const image = await env.DB.prepare(`
    SELECT pi.object_key, pi.content_type, p.assigned_user_id
    FROM post_images pi
    JOIN posts p ON p.id = pi.post_id
    WHERE pi.id = ?
  `).bind(imageId).first();

  if (!image) return json({ error: "Image not found" }, { status: 404 });
  if (session.user.role !== "admin" && image.assigned_user_id !== session.user.id) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const object = await env.IMAGES_BUCKET.get(image.object_key);
  if (!object) return json({ error: "Image object not found" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": image.content_type || "application/octet-stream",
      "cache-control": "private, max-age=3600"
    }
  });
}

async function runScheduledRechecks(env) {
  await ensureTelegramTables(env);
  const now = new Date().toISOString();
  const { results: duePosts } = await env.DB.prepare(`
    SELECT id, source_url
    FROM posts
    WHERE recheck_enabled = 1
      AND recheck_status = 'scheduled'
      AND recheck_due_at IS NOT NULL
      AND recheck_due_at <= ?
  `).bind(now).all();

  for (const post of duePosts) {
    try {
      const screenshot = await captureRemoteScreenshot(post.source_url, env);
      const imageId = crypto.randomUUID();
      const objectKey = `${post.id}/${imageId}.png`;
      await env.IMAGES_BUCKET.put(objectKey, screenshot, {
        httpMetadata: { contentType: "image/png" }
      });
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO post_images (id, post_id, object_key, content_type, capture_type) VALUES (?, ?, ?, 'image/png', 'recheck')"
        ).bind(imageId, post.id, objectKey),
        env.DB.prepare(
          "UPDATE posts SET recheck_status = 'completed', recheck_checked_at = ?, recheck_error = NULL WHERE id = ?"
        ).bind(new Date().toISOString(), post.id)
      ]);
      await notifyTelegramRecheck(env, post.id, screenshot);
    } catch (error) {
      await env.DB.prepare(
        "UPDATE posts SET recheck_status = 'failed', recheck_checked_at = ?, recheck_error = ? WHERE id = ?"
      ).bind(new Date().toISOString(), String(error.message || error), post.id).run();
    }
  }
}

async function createPostRecord({
  env,
  assignedUserId,
  title,
  content,
  postedDate,
  location,
  sourceUrl,
  enableRecheck,
  createdByUserId,
  telegramChatId = null
}) {
  await ensureTelegramTables(env);
  const assignedUser = await env.DB.prepare("SELECT id, username FROM users WHERE id = ?").bind(assignedUserId).first();
  if (!assignedUser) throw new HttpError(404, "Assigned user not found");

  const screenshot = await captureRemoteScreenshot(sourceUrl, env);
  const postId = crypto.randomUUID();
  const recheckDueAt = enableRecheck ? new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString() : null;
  const recheckStatus = enableRecheck ? "scheduled" : "none";

  await env.DB.prepare(`
    INSERT INTO posts
      (id, assigned_user_id, title, content, posted_date, location, source_url, recheck_enabled, recheck_due_at, recheck_status, created_by_user_id, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    assignedUserId,
    title,
    content,
    postedDate,
    location,
    sourceUrl,
    enableRecheck ? 1 : 0,
    recheckDueAt,
    recheckStatus,
    createdByUserId,
    telegramChatId ? String(telegramChatId) : null
  ).run();

  const imageId = crypto.randomUUID();
  const objectKey = `${postId}/${imageId}.png`;
  await env.IMAGES_BUCKET.put(objectKey, screenshot, {
    httpMetadata: { contentType: "image/png" }
  });
  await env.DB.prepare(
    "INSERT INTO post_images (id, post_id, object_key, content_type, capture_type) VALUES (?, ?, ?, 'image/png', 'initial')"
  ).bind(imageId, postId, objectKey).run();

  if (telegramChatId) {
    await ensureTelegramTables(env);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO telegram_post_targets (post_id, chat_id) VALUES (?, ?)"
    ).bind(postId, String(telegramChatId)).run();
  }

  return { postId, imageId, screenshot, assignedUser };
}

async function ensureTelegramTables(env) {
  try {
    await env.DB.prepare("ALTER TABLE posts ADD COLUMN telegram_chat_id TEXT").run();
  } catch (_) {
    // Ignore when the column already exists.
  }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS telegram_post_targets (
      post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function handleTelegramWebhook(secret, request, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false }, { status: 404 });
  }

  await ensureTelegramTables(env);
  const update = await request.json().catch(() => ({}));
  const message = update.message || update.edited_message;
  const text = String(message?.text || "").trim();
  const chatId = message?.chat?.id;

  if (!chatId || !text) {
    return json({ ok: true });
  }

  if (!isAllowedTelegramChat(chatId, env)) {
    await sendTelegramText(env, chatId, "허용되지 않은 채팅입니다.");
    return json({ ok: true });
  }

  try {
    const parsed = parseTelegramPostMessage(text);
    const assignedUser = await env.DB.prepare(
      "SELECT id, username, display_name FROM users WHERE username = ?"
    ).bind(parsed.assignedUsername).first();
    if (!assignedUser) {
      throw new HttpError(404, `보여줄 계정을 찾지 못했습니다: ${parsed.assignedUsername}`);
    }

    const author = await resolveTelegramAuthor(env);
    const result = await createPostRecord({
      env,
      assignedUserId: assignedUser.id,
      title: parsed.title,
      content: parsed.content,
      postedDate: parsed.postedDate,
      location: parsed.location,
      sourceUrl: parsed.sourceUrl,
      enableRecheck: parsed.enableRecheck,
      createdByUserId: author.id,
      telegramChatId: chatId
    });

    await sendTelegramPhoto(env, chatId, result.screenshot, buildTelegramCaption({
      phase: "첫 캡처",
      title: parsed.title,
      location: parsed.location,
      postedDate: parsed.postedDate,
      sourceUrl: parsed.sourceUrl
    }));
    await sendTelegramText(env, chatId, `등록 완료\n대상 계정: ${assignedUser.display_name} (${assignedUser.username})`);
  } catch (error) {
    const messageText = error instanceof HttpError
      ? error.message
      : "등록에 실패했습니다. 양식을 다시 확인해주세요.";
    await sendTelegramText(env, chatId, `${messageText}\n\n${telegramMessageExample()}`);
  }

  return json({ ok: true });
}

function parseTelegramPostMessage(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const data = {};

  for (const line of lines) {
    const match = line.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    data[key] = value;
  }

  const assignedUsername = normalizeUsername(
    data["보여줄 계정"] || data["계정"] || data["아이디"] || ""
  );
  const postedDate = String(data["날짜"] || "").trim();
  const location = String(data["게시 위치"] || data["위치"] || "").trim();
  const sourceUrl = String(data["원본 링크"] || data["링크"] || "").trim();
  const title = nullableString(data["제목"] || "");
  const content = nullableString(data["코멘트"] || data["내용"] || "");
  const enableRecheck = parseBooleanText(data["22시간 뒤 자동 재체크"] || data["재체크"] || "");

  if (!assignedUsername || !postedDate || !location || !sourceUrl) {
    throw new HttpError(400, "필수 항목이 부족합니다.");
  }

  return { assignedUsername, postedDate, location, sourceUrl, title, content, enableRecheck };
}

function parseBooleanText(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "y", "yes", "true", "예", "네", "사용", "on"].includes(normalized);
}

function telegramMessageExample() {
  return [
    "텔레그램 등록 양식",
    "보여줄 계정: viewer1",
    "제목: 예시 제목",
    "코멘트: 간단한 메모",
    "날짜: 2026-04-21",
    "게시 위치: FMKorea",
    "원본 링크: https://www.fmkorea.com/9733201035",
    "22시간 뒤 자동 재체크: 예"
  ].join("\n");
}

async function resolveTelegramAuthor(env) {
  const preferred = nullableString(env.TELEGRAM_CREATED_BY_USERNAME || "");
  if (preferred) {
    const user = await env.DB.prepare(
      "SELECT id, username FROM users WHERE username = ?"
    ).bind(normalizeUsername(preferred)).first();
    if (user) return user;
  }

  const fallback = await env.DB.prepare(
    "SELECT id, username FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
  ).first();
  if (!fallback) throw new HttpError(400, "관리자 계정이 없어 텔레그램 등록을 처리할 수 없습니다.");
  return fallback;
}

function isAllowedTelegramChat(chatId, env) {
  const raw = String(env.TELEGRAM_ALLOWED_CHAT_IDS || "").trim();
  if (!raw) return true;
  const allowed = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(String(chatId));
}

async function sendTelegramText(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
}

async function sendTelegramPhoto(env, chatId, imageBytes, caption) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("photo", new Blob([imageBytes], { type: "image/png" }), "capture.png");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form
  });
}

function buildTelegramCaption({ phase, title, location, postedDate, sourceUrl }) {
  return [
    phase,
    title ? `제목: ${title}` : null,
    `위치: ${location}`,
    `날짜: ${postedDate}`,
    sourceUrl ? `링크: ${sourceUrl}` : null
  ].filter(Boolean).join("\n");
}

async function notifyTelegramRecheck(env, postId, screenshot) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await ensureTelegramTables(env);
  const post = await env.DB.prepare(
    "SELECT title, location, posted_date, source_url, telegram_chat_id FROM posts WHERE id = ?"
  ).bind(postId).first();
  if (!post) return;

  let chatId = post.telegram_chat_id;
  if (!chatId) {
    const target = await env.DB.prepare(
      "SELECT chat_id FROM telegram_post_targets WHERE post_id = ?"
    ).bind(postId).first();
    chatId = target?.chat_id || null;
  }
  if (!chatId) return;

  await sendTelegramPhoto(env, chatId, screenshot, buildTelegramCaption({
    phase: "22시간 후 사진",
    title: post.title,
    location: post.location,
    postedDate: post.posted_date,
    sourceUrl: post.source_url
  }));
  await sendTelegramText(env, chatId, "22시간 후 사진 전송 완료");
}

async function captureRemoteScreenshot(url, env) {
  if (shouldUseLocalCapture(url, env) && env.LOCAL_CAPTURE_ENDPOINT) {
    const localCapture = await tryLocalCapture(url, env);
    if (localCapture) return localCapture;
  }

  if (!env.BROWSER) throw new Error("BROWSER binding is not configured");
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1280, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForPostContent(page);
    await waitForPostImages(page);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await page.screenshot({ type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
}

function shouldUseLocalCapture(url, env) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const localCaptureHosts = String(env.LOCAL_CAPTURE_HOSTS || "fmkorea.com,www.fmkorea.com")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return localCaptureHosts.includes(hostname);
  } catch (_) {
    return false;
  }
}

function handleVersion(env) {
  return json({
    version: "2026-04-21-fmkorea-local-capture",
    localCaptureEndpointConfigured: Boolean(env.LOCAL_CAPTURE_ENDPOINT),
    localCaptureHosts: String(env.LOCAL_CAPTURE_HOSTS || ""),
    localCaptureEndpoint: String(env.LOCAL_CAPTURE_ENDPOINT || "")
  });
}

async function handleCaptureProbe(url, env) {
  const target = url.searchParams.get("target") || "https://www.fmkorea.com/9733201035";
  const shouldLocal = shouldUseLocalCapture(target, env);
  let localHealth = null;
  let localCapture = null;

  if (env.LOCAL_CAPTURE_ENDPOINT) {
    try {
      const healthUrl = env.LOCAL_CAPTURE_ENDPOINT.replace(/\/capture$/, "/health");
      const healthRes = await fetch(healthUrl);
      localHealth = {
        ok: healthRes.ok,
        status: healthRes.status,
        body: await healthRes.text()
      };
    } catch (error) {
      localHealth = {
        ok: false,
        error: String(error.message || error)
      };
    }

    if (shouldLocal) {
      try {
        const captureRes = await fetch(env.LOCAL_CAPTURE_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(env.LOCAL_CAPTURE_TOKEN ? { "x-capture-token": env.LOCAL_CAPTURE_TOKEN } : {})
          },
          body: JSON.stringify({ url: target })
        });
        const body = await captureRes.arrayBuffer();
        localCapture = {
          ok: captureRes.ok,
          status: captureRes.status,
          byteLength: body.byteLength,
          contentType: captureRes.headers.get("content-type") || ""
        };
      } catch (error) {
        localCapture = {
          ok: false,
          error: String(error.message || error)
        };
      }
    }
  }

  return json({
    version: "2026-04-21-fmkorea-local-capture",
    target,
    shouldUseLocalCapture: shouldLocal,
    localCaptureEndpoint: String(env.LOCAL_CAPTURE_ENDPOINT || ""),
    localHealth,
    localCapture
  });
}

async function tryLocalCapture(url, env) {
  try {
    const response = await fetch(env.LOCAL_CAPTURE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.LOCAL_CAPTURE_TOKEN ? { "x-capture-token": env.LOCAL_CAPTURE_TOKEN } : {})
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("local capture failed", response.status, text);
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return null;
    return buffer;
  } catch (error) {
    console.warn("local capture unavailable", error);
    return null;
  }
}

async function waitForPostContent(page) {
  await page.waitForFunction(() => {
    const rendered = document.querySelector("#new_contents");
    const hiddenSource = document.querySelector("#org_contents");
    return Boolean(
      (rendered && rendered.textContent && rendered.textContent.trim().length > 20) ||
      (rendered && rendered.querySelector("img")) ||
      (hiddenSource && "value" in hiddenSource && hiddenSource.value && hiddenSource.value.trim().length > 20)
    );
  }, { timeout: 15000 }).catch(() => null);

  await page.evaluate(() => {
    const rendered = document.querySelector("#new_contents");
    const hiddenSource = document.querySelector("#org_contents");
    if (!rendered || !hiddenSource || !("value" in hiddenSource)) return;
    if (rendered.children.length > 0 || rendered.textContent.trim()) return;
    rendered.innerHTML = hiddenSource.value;
  });
}

async function waitForPostImages(page) {
  await page.evaluate(() => {
    const targetImages = [...document.querySelectorAll(
      "#new_contents img, .view-content img, img.maxImg, img[src*='img2.quasarzone.com/editor/'], img[src*='/qb_partnersaleinfo/']"
    )];
    for (const img of targetImages) {
      img.loading = "eager";
      img.decoding = "sync";
      if (img.dataset?.src && !img.src) img.src = img.dataset.src;
      if (img.dataset?.original && !img.src) img.src = img.dataset.original;
    }
    targetImages[0]?.scrollIntoView({ block: "center" });
  }).catch(() => null);

  await page.waitForFunction(() => {
    const targetImages = [...document.querySelectorAll(
      "#new_contents img, .view-content img, img.maxImg, img[src*='img2.quasarzone.com/editor/'], img[src*='/qb_partnersaleinfo/']"
    )].filter((img) => {
      const src = img.getAttribute("src") || "";
      return src.includes("img2.quasarzone.com/editor/") || src.includes("/qb_partnersaleinfo/") || img.closest("#new_contents");
    });

    if (!targetImages.length) return false;
    return targetImages.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 15000 }).catch(() => null);

  await page.evaluate(async () => {
    const targetImages = [...document.querySelectorAll(
      "#new_contents img, .view-content img, img.maxImg, img[src*='img2.quasarzone.com/editor/'], img[src*='/qb_partnersaleinfo/']"
    )].slice(0, 8);

    await Promise.all(targetImages.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch (_) {
        // ignore decode failures and allow the caller to continue with the best available render
      }
    }));
  }).catch(() => null);

  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
}

async function getSession(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const token = cookies[cookieName(env)];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at,
           u.id, u.username, u.display_name, u.role, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(row.session_id).run();
    return null;
  }
  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
      created_at: row.created_at
    }
  };
}

function requireAuth(session) {
  if (!session) throw new HttpError(401, "Authentication required");
}

function requireAdmin(session) {
  requireAuth(session);
  if (session.user.role !== "admin") throw new HttpError(403, "Admin only");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    created_at: user.created_at
  };
}

function nullableString(value) {
  const str = String(value || "").trim();
  return str ? str : null;
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new HttpError(400, "Username must be 3-30 chars: a-z, 0-9, ., _, -");
  }
  return username;
}

function validatePassword(password) {
  if (String(password).length < 4) throw new HttpError(400, "Password must be at least 4 characters");
}

async function hashPassword(password, salt = encodeHex(crypto.getRandomValues(new Uint8Array(16)))) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations: 100000 },
    baseKey,
    256
  );
  return { salt, hash: encodeHex(new Uint8Array(bits)) };
}

async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  return timingSafeEqual(hash, expectedHash);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeHex(new Uint8Array(digest));
}

function encodeHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
  );
}

function buildSessionCookie(env, token, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `${cookieName(env)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

function cookieName(env) {
  return env.SESSION_COOKIE_NAME || "cpb_session";
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS"
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
