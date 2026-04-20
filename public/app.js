const state = {
  session: null,
  users: [],
  posts: []
};

const els = {
  bootstrapCard: document.getElementById("bootstrapCard"),
  bootstrapForm: document.getElementById("bootstrapForm"),
  bootstrapUsername: document.getElementById("bootstrapUsername"),
  bootstrapDisplayName: document.getElementById("bootstrapDisplayName"),
  bootstrapPassword: document.getElementById("bootstrapPassword"),
  loginCard: document.getElementById("loginCard"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  sessionInfo: document.getElementById("sessionInfo"),
  logoutButton: document.getElementById("logoutButton"),
  adminUserCard: document.getElementById("adminUserCard"),
  userForm: document.getElementById("userForm"),
  newUsername: document.getElementById("newUsername"),
  newDisplayName: document.getElementById("newDisplayName"),
  newPassword: document.getElementById("newPassword"),
  newRole: document.getElementById("newRole"),
  userList: document.getElementById("userList"),
  adminPostCard: document.getElementById("adminPostCard"),
  postForm: document.getElementById("postForm"),
  assignedUserId: document.getElementById("assignedUserId"),
  postTitle: document.getElementById("postTitle"),
  postContent: document.getElementById("postContent"),
  postDate: document.getElementById("postDate"),
  postLocation: document.getElementById("postLocation"),
  postSourceUrl: document.getElementById("postSourceUrl"),
  postEnableRecheck: document.getElementById("postEnableRecheck"),
  postImages: document.getElementById("postImages"),
  refreshButton: document.getElementById("refreshButton"),
  roleMessage: document.getElementById("roleMessage"),
  posts: document.getElementById("posts"),
  emptyState: document.getElementById("emptyState"),
  postTemplate: document.getElementById("postTemplate")
};

els.postDate.value = new Date().toISOString().slice(0, 10);

els.bootstrapForm.addEventListener("submit", onBootstrap);
els.loginForm.addEventListener("submit", onLogin);
els.logoutButton.addEventListener("click", onLogout);
els.userForm.addEventListener("submit", onCreateUser);
els.postForm.addEventListener("submit", onCreatePost);
els.refreshButton.addEventListener("click", loadApp);

await loadApp();

async function loadApp() {
  const sessionRes = await fetchJson("/api/session");
  state.session = sessionRes.user;

  if (!state.session) {
    showLoggedOut();
    if (sessionRes.bootstrapNeeded) {
      els.bootstrapCard.hidden = false;
      els.loginCard.hidden = true;
    } else {
      els.bootstrapCard.hidden = true;
      els.loginCard.hidden = false;
    }
    return;
  }

  showLoggedIn();
  await Promise.all([loadUsersIfAdmin(), loadPosts()]);
}

function showLoggedOut() {
  els.sessionInfo.hidden = true;
  els.logoutButton.hidden = true;
  els.adminUserCard.hidden = true;
  els.adminPostCard.hidden = true;
  els.loginCard.hidden = false;
  els.roleMessage.textContent = "로그인 후 게시글을 볼 수 있습니다.";
  els.posts.innerHTML = "";
  els.emptyState.hidden = false;
}

function showLoggedIn() {
  els.bootstrapCard.hidden = true;
  els.loginCard.hidden = true;
  els.sessionInfo.hidden = false;
  els.logoutButton.hidden = false;
  els.refreshButton.hidden = false;
  els.sessionInfo.textContent = `${state.session.display_name} (${state.session.username}) · ${state.session.role}`;
  const isAdmin = state.session.role === "admin";
  els.adminUserCard.hidden = !isAdmin;
  els.adminPostCard.hidden = !isAdmin;
  els.roleMessage.textContent = isAdmin
    ? "관리자는 전체 게시글을 보고 사용자/게시글을 관리할 수 있습니다."
    : "현재 계정에 배정된 게시글만 보여집니다.";
}

async function loadUsersIfAdmin() {
  if (state.session.role !== "admin") return;
  const res = await fetchJson("/api/users");
  state.users = res.users || [];
  els.userList.innerHTML = "";
  els.assignedUserId.innerHTML = "";
  state.users.forEach((user) => {
    const article = document.createElement("article");
    article.className = "user-item";
    article.innerHTML = `<strong>${escapeHtml(user.display_name)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.role)}</span>`;
    els.userList.appendChild(article);

    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.display_name} (${user.username})`;
    els.assignedUserId.appendChild(option);
  });
}

async function loadPosts() {
  const res = await fetchJson("/api/posts");
  state.posts = res.posts || [];
  renderPosts();
}

function renderPosts() {
  els.posts.innerHTML = "";
  els.emptyState.hidden = state.posts.length > 0;
  state.posts.forEach((post) => {
    const fragment = els.postTemplate.content.cloneNode(true);
    fragment.querySelector(".post-location").textContent = post.location;
    fragment.querySelector(".post-title").textContent = post.title || "제목 없음";
    fragment.querySelector(".post-date").textContent = formatDate(post.posted_date);
    fragment.querySelector(".post-meta").textContent = `대상 계정: ${post.assigned_username} · 등록자: ${post.created_by_username}`;
    fragment.querySelector(".post-recheck").textContent = buildRecheckText(post);
    const sourceWrap = fragment.querySelector(".post-source-wrap");
    const sourceLink = fragment.querySelector(".post-source");
    if (post.source_url) {
      sourceWrap.hidden = false;
      sourceLink.href = post.source_url;
      sourceLink.textContent = post.source_url;
    }
    fragment.querySelector(".post-content").textContent = post.content || "내용 없음";

    const imageWrap = fragment.querySelector(".post-images");
    (post.images || []).forEach((image) => {
      const card = document.createElement("div");
      card.className = "post-image-card";
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = post.title || "게시 이미지";
      const meta = document.createElement("span");
      meta.className = "post-image-type";
      meta.textContent = image.capture_type === "recheck" ? "22시간 재체크 캡처" : "초기 등록 이미지";
      card.appendChild(img);
      card.appendChild(meta);
      imageWrap.appendChild(card);
    });

    const deleteButton = fragment.querySelector(".post-delete");
    if (state.session.role === "admin") {
      deleteButton.hidden = false;
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("게시글을 삭제할까요?")) return;
        await fetchJson(`/api/posts/${post.id}`, { method: "DELETE" });
        await loadPosts();
      });
    }

    els.posts.appendChild(fragment);
  });
}

async function onBootstrap(event) {
  event.preventDefault();
  await fetchJson("/api/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      username: els.bootstrapUsername.value,
      displayName: els.bootstrapDisplayName.value,
      password: els.bootstrapPassword.value
    })
  });
  window.alert("최초 관리자 생성이 완료되었습니다. 이제 로그인하세요.");
  els.bootstrapForm.reset();
  els.bootstrapCard.hidden = true;
  els.loginCard.hidden = false;
}

async function onLogin(event) {
  event.preventDefault();
  await fetchJson("/api/login", {
    method: "POST",
    body: JSON.stringify({
      username: els.loginUsername.value,
      password: els.loginPassword.value
    })
  });
  els.loginForm.reset();
  await loadApp();
}

async function onLogout() {
  await fetchJson("/api/logout", { method: "POST" });
  await loadApp();
}

async function onCreateUser(event) {
  event.preventDefault();
  await fetchJson("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username: els.newUsername.value,
      displayName: els.newDisplayName.value,
      password: els.newPassword.value,
      role: els.newRole.value
    })
  });
  els.userForm.reset();
  els.newRole.value = "viewer";
  await loadUsersIfAdmin();
}

async function onCreatePost(event) {
  event.preventDefault();
  const form = new FormData();
  form.append("assignedUserId", els.assignedUserId.value);
  form.append("title", els.postTitle.value);
  form.append("content", els.postContent.value);
  form.append("postedDate", els.postDate.value);
  form.append("location", els.postLocation.value);
  form.append("sourceUrl", els.postSourceUrl.value);
  form.append("enableRecheck", els.postEnableRecheck.checked ? "1" : "0");
  [...els.postImages.files].forEach((file) => form.append("images", file));
  await fetchJson("/api/posts", { method: "POST", body: form });
  els.postForm.reset();
  els.postDate.value = new Date().toISOString().slice(0, 10);
  await loadPosts();
}

async function fetchJson(url, options = {}) {
  const init = { ...options, headers: { ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(options.headers || {}) } };
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(value));
}

function buildRecheckText(post) {
  if (!post.recheck_enabled) return "24시간 리체크: 사용 안 함";
  const due = post.recheck_due_at ? formatDateTime(post.recheck_due_at) : "-";
  const checked = post.recheck_checked_at ? formatDateTime(post.recheck_checked_at) : "-";
  const suffix = post.recheck_error ? ` · 오류: ${post.recheck_error}` : "";
  return `24시간 리체크: ${post.recheck_status} · 예정 ${due} · 실행 ${checked}${suffix}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
