const PAGE_SIZE = 10;

const state = {
  session: null,
  users: [],
  posts: [],
  sort: "posted-desc",
  page: 1
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
  adminMenuCard: document.getElementById("adminMenuCard"),
  openUserModalButton: document.getElementById("openUserModalButton"),
  openPostModalButton: document.getElementById("openPostModalButton"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  userModal: document.getElementById("userModal"),
  postModal: document.getElementById("postModal"),
  userForm: document.getElementById("userForm"),
  userFormMessage: document.getElementById("userFormMessage"),
  newUsername: document.getElementById("newUsername"),
  newDisplayName: document.getElementById("newDisplayName"),
  newPassword: document.getElementById("newPassword"),
  newRole: document.getElementById("newRole"),
  userCount: document.getElementById("userCount"),
  userList: document.getElementById("userList"),
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
  sortFilter: document.getElementById("sortFilter"),
  roleMessage: document.getElementById("roleMessage"),
  posts: document.getElementById("posts"),
  emptyState: document.getElementById("emptyState"),
  pagination: document.getElementById("pagination"),
  prevPageButton: document.getElementById("prevPageButton"),
  nextPageButton: document.getElementById("nextPageButton"),
  pageInfo: document.getElementById("pageInfo"),
  postTemplate: document.getElementById("postTemplate")
};

els.postDate.value = new Date().toISOString().slice(0, 10);

els.bootstrapForm.addEventListener("submit", onBootstrap);
els.loginForm.addEventListener("submit", onLogin);
els.logoutButton.addEventListener("click", onLogout);
els.userForm.addEventListener("submit", onCreateUser);
els.postForm.addEventListener("submit", onCreatePost);
els.refreshButton.addEventListener("click", onRefresh);
els.sortFilter.addEventListener("change", onChangeSort);
els.prevPageButton.addEventListener("click", () => changePage(-1));
els.nextPageButton.addEventListener("click", () => changePage(1));
els.openUserModalButton.addEventListener("click", () => openModal("userModal"));
els.openPostModalButton.addEventListener("click", () => openModal("postModal"));
els.modalBackdrop.addEventListener("click", closeAllModals);
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", closeAllModals);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllModals();
});

await loadApp();

async function loadApp() {
  try {
    const sessionRes = await fetchJson("/api/session");
    state.session = sessionRes.user;

    if (!state.session) {
      showLoggedOut(sessionRes.bootstrapNeeded);
      return;
    }

    showLoggedIn();
    await Promise.all([loadUsersIfAdmin(), loadPosts()]);
  } catch (error) {
    console.error(error);
    window.alert(error.message || "앱 정보를 불러오지 못했습니다.");
  }
}

function showLoggedOut(bootstrapNeeded) {
  state.users = [];
  state.posts = [];
  closeAllModals();
  els.sessionInfo.hidden = true;
  els.logoutButton.hidden = true;
  els.adminMenuCard.hidden = true;
  els.refreshButton.hidden = true;
  els.bootstrapCard.hidden = !bootstrapNeeded;
  els.loginCard.hidden = bootstrapNeeded;
  els.roleMessage.textContent = "로그인 후 게시글 목록을 확인할 수 있습니다.";
  els.posts.innerHTML = "";
  els.emptyState.hidden = false;
  els.pagination.hidden = true;
}

function showLoggedIn() {
  closeAllModals();
  els.bootstrapCard.hidden = true;
  els.loginCard.hidden = true;
  els.sessionInfo.hidden = false;
  els.logoutButton.hidden = false;
  els.refreshButton.hidden = false;
  els.sessionInfo.textContent = `${state.session.display_name} (${state.session.username}) · ${state.session.role}`;

  const isAdmin = state.session.role === "admin";
  els.adminMenuCard.hidden = !isAdmin;
  els.roleMessage.textContent = isAdmin
    ? "전체 게시글을 보고 계정과 게시글을 관리할 수 있습니다."
    : "배정된 게시글만 조회할 수 있습니다. 새로고침, 내용 복사, 원본 링크 이동, 사진 보기가 가능합니다.";
}

async function loadUsersIfAdmin() {
  if (state.session.role !== "admin") return;

  const res = await fetchJson("/api/users");
  state.users = res.users || [];
  els.userCount.textContent = `${state.users.length}명`;
  els.userList.innerHTML = "";
  els.assignedUserId.innerHTML = "";

  for (const user of state.users) {
    const item = document.createElement("article");
    item.className = "user-item";
    item.innerHTML = `<strong>${escapeHtml(user.display_name)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.role)}</span>`;
    els.userList.appendChild(item);

    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.display_name} (${user.username})`;
    els.assignedUserId.appendChild(option);
  }

  els.postSubmitButton.disabled = state.users.length === 0;
  if (state.users.length === 0) {
    showMessage(els.postFormMessage, "먼저 보여줄 사용자 계정을 하나 이상 만들어주세요.", "error");
  } else if (els.postFormMessage.textContent.includes("먼저 보여줄 사용자")) {
    hideMessage(els.postFormMessage);
  }
}

async function loadPosts() {
  const res = await fetchJson("/api/posts");
  state.posts = res.posts || [];
  clampPage();
  renderPosts();
}

function renderPosts() {
  const sortedPosts = sortPosts(state.posts, state.sort);
  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / PAGE_SIZE));
  const start = (state.page - 1) * PAGE_SIZE;
  const pagePosts = sortedPosts.slice(start, start + PAGE_SIZE);

  els.posts.innerHTML = "";
  els.emptyState.hidden = sortedPosts.length > 0;
  els.pagination.hidden = sortedPosts.length <= PAGE_SIZE;
  els.pageInfo.textContent = `${state.page} / ${totalPages}`;
  els.prevPageButton.disabled = state.page === 1;
  els.nextPageButton.disabled = state.page === totalPages;

  for (const post of pagePosts) {
    const fragment = els.postTemplate.content.cloneNode(true);
    fragment.querySelector(".post-location").textContent = post.location || "위치 미입력";
    fragment.querySelector(".post-date").textContent = formatDate(post.posted_date);
    fragment.querySelector(".post-title").textContent = post.title || "제목 없음";
    fragment.querySelector(".post-meta").textContent = `대상: ${post.assigned_username} · 등록자: ${post.created_by_username}`;
    fragment.querySelector(".post-content").textContent = post.content || "코멘트 없음";
    fragment.querySelector(".post-recheck").textContent = buildRecheckText(post);

    const sourceLink = fragment.querySelector(".post-source");
    sourceLink.href = post.source_url || "#";
    sourceLink.textContent = "원본 링크";
    sourceLink.hidden = !post.source_url;

    const imageLink = fragment.querySelector(".post-image-link");
    const initialImage = (post.images || []).find((image) => image.capture_type === "initial") || post.images?.[0];
    if (initialImage) {
      imageLink.href = initialImage.url;
      imageLink.textContent = "사진 보기";
      imageLink.hidden = false;
    } else {
      imageLink.hidden = true;
    }

    const copyButton = fragment.querySelector(".post-copy");
    copyButton.addEventListener("click", async () => {
      const textToCopy = [
        post.title || "",
        post.content || "",
        post.location || "",
        post.source_url || ""
      ].filter(Boolean).join("\n");

      try {
        await navigator.clipboard.writeText(textToCopy);
        copyButton.textContent = "복사 완료";
        window.setTimeout(() => {
          copyButton.textContent = "내용 복사";
        }, 1400);
      } catch (error) {
        window.alert("복사에 실패했습니다.");
      }
    });

    const deleteButton = fragment.querySelector(".post-delete");
    if (state.session.role === "admin") {
      deleteButton.hidden = false;
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("이 게시글을 삭제할까요?")) return;
        await fetchJson(`/api/posts/${post.id}`, { method: "DELETE" });
        await loadPosts();
      });
    }

    els.posts.appendChild(fragment);
  }
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
    window.setTimeout(() => {
      closeAllModals();
      hideMessage(els.userFormMessage);
    }, 500);
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
    showMessage(els.postFormMessage, "게시글 등록과 캡처 저장이 완료되었습니다.", "success");
    await loadPosts();
    window.setTimeout(() => {
      closeAllModals();
      hideMessage(els.postFormMessage);
    }, 500);
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

function onChangeSort() {
  state.sort = els.sortFilter.value;
  state.page = 1;
  renderPosts();
}

function changePage(delta) {
  state.page += delta;
  clampPage();
  renderPosts();
}

function clampPage() {
  const totalPages = Math.max(1, Math.ceil(state.posts.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
}

function sortPosts(posts, sort) {
  const copied = [...posts];
  const time = (value) => new Date(value || 0).getTime();

  if (sort === "created-desc") {
    return copied.sort((a, b) => time(b.created_at) - time(a.created_at));
  }
  if (sort === "created-asc") {
    return copied.sort((a, b) => time(a.created_at) - time(b.created_at));
  }
  return copied.sort((a, b) => {
    const postedDiff = time(b.posted_date) - time(a.posted_date);
    if (postedDiff !== 0) return postedDiff;
    return time(b.created_at) - time(a.created_at);
  });
}

function openModal(id) {
  els.modalBackdrop.hidden = false;
  els[id].hidden = false;
  document.body.classList.add("modal-open");
}

function closeAllModals() {
  els.modalBackdrop.hidden = true;
  els.userModal.hidden = true;
  els.postModal.hidden = true;
  document.body.classList.remove("modal-open");
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
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
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

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function buildRecheckText(post) {
  if (!post.recheck_enabled) return "22시간 재체크 사용 안 함";
  const due = post.recheck_due_at ? formatDateTime(post.recheck_due_at) : "-";
  const checked = post.recheck_checked_at ? formatDateTime(post.recheck_checked_at) : "-";
  const suffix = post.recheck_error ? ` · 오류: ${post.recheck_error}` : "";
  return `22시간 재체크: ${post.recheck_status} · 예정 ${due} · 실행 ${checked}${suffix}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
