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
  userFormMessage: document.getElementById("userFormMessage"),
  newUsername: document.getElementById("newUsername"),
  newDisplayName: document.getElementById("newDisplayName"),
  newPassword: document.getElementById("newPassword"),
  newRole: document.getElementById("newRole"),
  userList: document.getElementById("userList"),
  adminPostCard: document.getElementById("adminPostCard"),
  postForm: document.getElementById("postForm"),
  postFormMessage: document.getElementById("postFormMessage"),
  assignedUserId: document.getElementById("assignedUserId"),
  postTitle: document.getElementById("postTitle"),
  postContent: document.getElementById("postContent"),
  postDate: document.getElementById("postDate"),
  postLocation: document.getElementById("postLocation"),
  postSourceUrl: document.getElementById("postSourceUrl"),
  postEnableRecheck: document.getElementById("postEnableRecheck"),
  postSubmitButton: document.getElementById("postSubmitButton"),
  refreshButton: document.getElementById("refreshButton"),
  roleMessage: document.getElementById("roleMessage"),
  posts: document.getElementById("posts"),
  emptyState: document.getElementById("emptyState"),
  postTemplate: document.getElementById("postTemplate"),
  imageModal: document.getElementById("imageModal"),
  imageModalClose: document.getElementById("imageModalClose"),
  imageModalContent: document.getElementById("imageModalContent")
};

els.postDate.value = new Date().toISOString().slice(0, 10);

els.bootstrapForm.addEventListener("submit", onBootstrap);
els.loginForm.addEventListener("submit", onLogin);
els.logoutButton.addEventListener("click", onLogout);
els.userForm.addEventListener("submit", onCreateUser);
els.postForm.addEventListener("submit", onCreatePost);
els.refreshButton.addEventListener("click", onRefresh);
els.imageModal.addEventListener("click", closeImageModal);
els.imageModalClose.addEventListener("click", closeImageModal);

await loadApp();

async function loadApp() {
  try {
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
  } catch (error) {
    console.error(error);
    window.alert(error.message || "앱 정보를 불러오지 못했습니다.");
  }
}

function showLoggedOut() {
  els.sessionInfo.hidden = true;
  els.logoutButton.hidden = true;
  els.adminUserCard.hidden = true;
  els.adminPostCard.hidden = true;
  els.refreshButton.hidden = true;
  els.loginCard.hidden = false;
  els.roleMessage.textContent = "로그인 후 게시글 목록을 확인할 수 있습니다.";
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
    ? "관리자는 전체 게시글을 보고 사용자 계정과 게시글을 관리할 수 있습니다."
    : "현재 계정에 배정된 게시글만 표시됩니다.";
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

  const hasUsers = state.users.length > 0;
  els.postSubmitButton.disabled = !hasUsers;
  if (!hasUsers) {
    showMessage(els.postFormMessage, "먼저 보여줄 사용자 계정을 하나 이상 만들어주세요.", "error");
  } else if (
    els.postFormMessage.dataset.kind === "error" &&
    els.postFormMessage.textContent.includes("먼저 보여줄 사용자")
  ) {
    hideMessage(els.postFormMessage);
  }
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

    fragment.querySelector(".post-content").textContent = post.content || "코멘트 없음";

    const imageWrap = fragment.querySelector(".post-images");
    const images = post.images || [];
    if (images.length > 0) {
      images.forEach((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "image-open-button";
        button.textContent = images.length === 1
          ? "사진 보기"
          : `사진 보기 ${index + 1}`;
        button.addEventListener("click", () => openImageModal(image.url, post.title || "게시 캡처 이미지"));

        const meta = document.createElement("span");
        meta.className = "post-image-type";
        meta.textContent = image.capture_type === "recheck" ? "22시간 재체크 캡처" : "초기 등록 캡처";

        const item = document.createElement("div");
        item.className = "post-image-card";
        item.appendChild(button);
        item.appendChild(meta);
        imageWrap.appendChild(item);
      });
    }

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

function openImageModal(src, alt) {
  els.imageModalContent.src = src;
  els.imageModalContent.alt = alt;
  els.imageModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeImageModal(event) {
  if (event && event.target !== els.imageModal && event.target !== els.imageModalClose) return;
  els.imageModal.hidden = true;
  els.imageModalContent.src = "";
  document.body.style.overflow = "";
}

async function onBootstrap(event) {
  event.preventDefault();
  try {
    await fetchJson("/api/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        username: els.bootstrapUsername.value,
        displayName: els.bootstrapDisplayName.value,
        password: els.bootstrapPassword.value
      })
    });
    window.alert("최초 관리자 계정 생성이 완료되었습니다. 이제 로그인해주세요.");
    els.bootstrapForm.reset();
    els.bootstrapCard.hidden = true;
    els.loginCard.hidden = false;
  } catch (error) {
    window.alert(error.message || "관리자 계정을 만들지 못했습니다.");
  }
}

async function onLogin(event) {
  event.preventDefault();
  try {
    await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value,
        password: els.loginPassword.value
      })
    });
    els.loginForm.reset();
    await loadApp();
  } catch (error) {
    window.alert(error.message || "로그인에 실패했습니다.");
  }
}

async function onLogout() {
  await fetchJson("/api/logout", { method: "POST" });
  await loadApp();
}

async function onCreateUser(event) {
  event.preventDefault();
  hideMessage(els.userFormMessage);

  try {
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
    showMessage(els.userFormMessage, "사용자 계정을 만들었습니다.", "success");
    await loadUsersIfAdmin();
  } catch (error) {
    showMessage(els.userFormMessage, error.message || "사용자 계정을 만들지 못했습니다.", "error");
  }
}

async function onCreatePost(event) {
  event.preventDefault();
  hideMessage(els.postFormMessage);
  els.postSubmitButton.disabled = true;
  const originalLabel = els.postSubmitButton.textContent;
  els.postSubmitButton.textContent = "링크 접속 후 캡처 중...";

  try {
    const form = new FormData();
    form.append("assignedUserId", els.assignedUserId.value);
    form.append("title", els.postTitle.value);
    form.append("content", els.postContent.value);
    form.append("postedDate", els.postDate.value);
    form.append("location", els.postLocation.value);
    form.append("sourceUrl", els.postSourceUrl.value);
    form.append("enableRecheck", els.postEnableRecheck.checked ? "1" : "0");

    await fetchJson("/api/posts", { method: "POST", body: form });
    els.postForm.reset();
    els.postDate.value = new Date().toISOString().slice(0, 10);
    showMessage(els.postFormMessage, "캡처와 등록이 완료되었습니다.", "success");
    await loadPosts();
  } catch (error) {
    showMessage(els.postFormMessage, error.message || "게시글 등록에 실패했습니다.", "error");
  } finally {
    els.postSubmitButton.disabled = false;
    els.postSubmitButton.textContent = originalLabel;
  }
}

async function onRefresh() {
  hideMessage(els.userFormMessage);
  hideMessage(els.postFormMessage);
  await loadApp();
}

async function fetchJson(url, options = {}) {
  const init = {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(options.headers || {})
    }
  };
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청이 실패했습니다.");
  return data;
}

function showMessage(element, message, kind) {
  element.hidden = false;
  element.textContent = message;
  element.dataset.kind = kind;
}

function hideMessage(element) {
  element.hidden = true;
  element.textContent = "";
  element.dataset.kind = "";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(value));
}

function buildRecheckText(post) {
  if (!post.recheck_enabled) return "22시간 재체크 사용 안 함";
  const due = post.recheck_due_at ? formatDateTime(post.recheck_due_at) : "-";
  const checked = post.recheck_checked_at ? formatDateTime(post.recheck_checked_at) : "-";
  const suffix = post.recheck_error ? ` · 오류: ${post.recheck_error}` : "";
  return `22시간 재체크 상태: ${post.recheck_status} · 예정 ${due} · 실행 ${checked}${suffix}`;
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
