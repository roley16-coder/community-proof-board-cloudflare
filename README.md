# Community Proof Board on Cloudflare

Cloudflare Workers + D1 + R2 기반의 가벼운 게시판 MVP입니다.

## 구조

- Backend: Cloudflare Workers
- Database: D1
- Storage: R2
- Frontend: Workers static assets
- Domain: Cloudflare Custom Domain 또는 Route

## MVP 기능

- 최초 관리자 계정 1개 부트스트랩
- 관리자 로그인 / 로그아웃
- 사용자 3~4개 생성
- 게시글 생성
  - 텍스트
  - 날짜
  - 위치
  - 대상 계정 지정
  - 이미지 최대 30장
- 관리자 전체 조회
- 일반 계정은 자기 배정 글만 조회
- 게시글 삭제
- 원본 링크 저장
- `22시간 뒤 자동 재캡처` 예약
- 한 시간마다 cron이 돌아가 재체크 대상 글 자동 확인

## 22시간 재체크 기능

게시글 등록 시 아래를 함께 넣을 수 있습니다.

- 원본 링크
- `22시간 뒤 자동 재캡처 요청` 체크

그러면 Worker cron이 매시간 실행되면서:

1. `recheck_due_at`이 지난 글 조회
2. Cloudflare Browser Run으로 페이지 접속
3. 화면을 `50%` 축소 상태로 캡처
4. R2 저장
5. 해당 게시글에 `recheck` 이미지로 추가
6. 상태를 `completed` 또는 `failed`로 갱신

## 배포 전 준비

1. Cloudflare 계정 로그인
2. Wrangler 설치 또는 `npm install`
3. D1 생성
4. R2 버킷 생성
5. Browser Run binding 사용 가능 상태 확인
6. `wrangler.toml`의 `database_id`, `bucket_name` 확인
7. `SESSION_SECRET` 시크릿 등록

## 로컬 명령

```bash
npm install
npx wrangler d1 create community-proof-board
npx wrangler r2 bucket create community-proof-board-images
npx wrangler secret put SESSION_SECRET
npx wrangler d1 execute community-proof-board --file=./schema.sql --remote
npm run dev
```

## Browser Run 바인딩

Cloudflare 공식 문서 기준으로 Browser Run 바인딩을 Wrangler에 선언하고, Worker 코드에서 `@cloudflare/puppeteer`로 사용할 수 있습니다.

- Wrangler 설정: [Browser binding docs](https://developers.cloudflare.com/workers/wrangler/configuration/)
- Browser Run binding + Puppeteer: [Workers bindings docs](https://developers.cloudflare.com/browser-rendering/workers-bindings/)
- Cron 설정: [Cron Triggers docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

현재 프로젝트는 이미 `wrangler.toml`에 아래가 들어있습니다.

```toml
[triggers]
crons = ["0 * * * *"]

[browser]
binding = "BROWSER"
```

즉:

- 매 정시마다 재체크 실행
- Browser Run 바인딩 이름은 `BROWSER`

## 로컬 테스트

재체크 cron은 공식 문서 기준 `wrangler dev --test-scheduled`로 테스트할 수 있습니다.

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

## 첫 실행

앱을 열면 관리자 계정이 하나도 없을 때만 부트스트랩 화면이 보입니다.

- username
- display name
- password

로 첫 관리자 계정을 만듭니다.

## 서브도메인 연결

Cloudflare 문서상 Worker가 원본이면 `Custom Domain` 사용이 권장됩니다.

- 예: `proof.yourdomain.com`

배포 후 Dashboard에서 Worker > Settings > Domains & Routes 또는 Custom Domains에서 연결하세요.
