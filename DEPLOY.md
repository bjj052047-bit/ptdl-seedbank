# PTDL 종자실 재고 관리 - 배포 가이드

이 문서를 따라 하시면 실제 인터넷 주소(URL)로 사이트를 띄울 수 있습니다. 모두 무료 요금제 범위 안에서 진행됩니다.

---

## 1단계. Supabase 프로젝트 만들기 (데이터베이스 + 로그인)

1. https://supabase.com 접속 → GitHub 계정으로 가입/로그인
2. "New project" 클릭
   - Name: `ptdl-seedbank` (원하는 이름)
   - Database Password: 아무 강력한 비밀번호 (따로 기억해둘 필요는 없음, DB 직접 접속용)
   - Region: Northeast Asia (Seoul) 선택 권장
3. 프로젝트가 생성될 때까지 1~2분 대기
4. 왼쪽 메뉴 **SQL Editor** 클릭 → "New query"
5. 이 프로젝트의 `supabase/schema.sql` 파일 내용을 전체 복사해서 붙여넣고 **Run** 클릭
   - "Success. No rows returned" 메시지가 뜨면 성공
6. 왼쪽 메뉴 **Settings → API** 클릭 → 아래 두 값을 복사해서 메모장에 잠깐 저장:
   - `Project URL` (예: `https://xxxxx.supabase.co`)
   - `anon public` 키 (긴 문자열)

### 이메일 확인(Confirm email) 끄기 (연구실 내부용이라 간편하게)
- 왼쪽 메뉴 **Authentication → Providers → Email** 클릭
- "Confirm email" 옵션을 꺼주세요 (꺼두면 가입 즉시 로그인되어 편리합니다)

---

## 2단계. 코드 다운로드 및 환경변수 설정

1. 전달받은 `ptdl-web` 폴더를 컴퓨터에 저장
2. 폴더 안의 `.env.example` 파일을 복사해서 이름을 `.env.local` 로 바꾸기
3. `.env.local` 파일을 열어서 1단계에서 복사한 값을 채워넣기:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...(긴 문자열)
   ```

### (선택) 로컬에서 먼저 테스트해보기
컴퓨터에 Node.js가 설치되어 있다면:
```bash
cd ptdl-web
npm install
npm run dev
```
브라우저에서 `http://localhost:3000` 접속 → 정상 동작 확인

---

## 3단계. GitHub에 코드 올리기

1. https://github.com 가입/로그인 → 오른쪽 위 "+" → "New repository"
2. 이름을 `ptdl-seedbank` 로 설정 (Public 또는 Private 아무거나 무방) → "Create repository"
3. 컴�터에서:
   ```bash
   cd ptdl-web
   git init
   git add .
   git commit -m "초기 커밋"
   git branch -M main
   git remote add origin https://github.com/내계정이름/ptdl-seedbank.git
   git push -u origin main
   ```
   (GitHub Desktop 앱을 쓰신다면 명령어 없이 화면에서 클릭만으로도 가능합니다)

---

## 4단계. Vercel로 배포하기 (무료)

1. https://vercel.com 접속 → GitHub 계정으로 가입/로그인
2. "Add New..." → "Project" 클릭
3. 방금 만든 `ptdl-seedbank` 저장소를 선택 → "Import"
4. **Environment Variables** 섹션에서 아래 두 개를 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = (1단계에서 복사한 값)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (1단계에서 복사한 값)
5. "Deploy" 클릭 → 1~2분 대기
6. 배포가 끝나면 `https://ptdl-seedbank-xxxx.vercel.app` 같은 실제 주소가 생성됩니다 🎉

---

## 5단계. 담당자 계정 지정하기

1. 사이트에 접속해서 본인 계정으로 "가입" (이름·이메일·비밀번호 입력)
2. Supabase 대시보드 → **Table Editor** → `profiles` 테이블 클릭
3. 방금 가입한 본인 행을 찾아서 `role` 값을 `researcher` → `staff` 로 직접 수정
4. 사이트를 새로고침하면 "담당자 전용" 탭(입출고 기록, 데이터 등록·관리)이 보이기 시작합니다

다른 팀원이 가입하면 기본적으로 `researcher`(연구원) 권한으로 시작하니, 담당자가 되어야 할 사람만 같은 방식으로 `staff`로 바꿔주시면 됩니다.

---

## 참고: 무료 요금제 한도
- **Supabase 무료**: DB 500MB, 월간 API 요청 5만 건 등 — 연구실 규모(수천 종 데이터)에는 충분합니다.
- **Vercel 무료**: 개인/소규모 프로젝트 용도로 충분한 트래픽 한도 제공.
- 나중에 사용량이 늘어나면 각 서비스의 유료 플랜으로 전환할 수 있습니다 (지금 단계에서는 필요 없음).

---

문제가 생기면 Supabase 대시보드의 **Logs** 메뉴(에러 확인)나 Vercel의 **Deployments → 로그**를 확인해보시고, 에러 메시지를 캡처해서 알려주시면 도와드리겠습니다.

---

## 기존 시스템 업데이트하기 (가입 승인 + 실험실 예약 추가)

이미 종자실 관리 시스템을 Supabase + Vercel로 운영 중이라면, 처음부터 다시 만들 필요 없이 아래 2단계만 하면 됩니다.

### 1단계. Supabase에 새 테이블/정책 추가하기
1. Supabase 대시보드 → 본인 프로젝트 → **SQL Editor** → "New query"
2. 이 프로젝트의 `supabase/schema.sql` 파일을 열어서, 아래 주석으로 시작하는 부분부터 **파일 맨 끝까지**만 복사:
   ```
   -- 마이그레이션: 연구실 통합 포털 확장
   ```
3. SQL Editor에 붙여넣고 **Run** 클릭 → "Success" 메시지 확인
   - 이 작업으로 `profiles`에 가입 승인 상태(`status`)와 이메일(`email`) 컬럼이 추가되고,
     `labs`(실험실 목록), `lab_reservations`(예약) 테이블이 새로 생깁니다.
   - **중요**: 이 SQL은 기존에 이미 가입해 있던 계정들을 자동으로 `approved`(승인됨) 상태로 만들어줍니다.
     이후 새로 가입하는 사람만 승인 대기 상태로 시작합니다.

### 2단계. 코드 반영 후 재배포
1. 전달받은 최신 `ptdl-web` 폴더 내용으로 로컬 코드를 교체 (또는 Git으로 받은 변경사항을 pull)
2. GitHub 저장소에 커밋 & 푸시:
   ```bash
   cd ptdl-web
   git add .
   git commit -m "가입 승인 + 실험실 예약 기능 추가"
   git push
   ```
3. Vercel은 GitHub 저장소와 연결되어 있으므로 push하면 자동으로 새 버전이 배포됩니다 (Vercel 대시보드에서 진행 상황 확인 가능)
4. 새 환경변수는 필요 없습니다. 기존 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 그대로 사용합니다.

### 3단계. 동작 확인 체크리스트
- [ ] 기존에 쓰던 계정으로 로그인 → 예전처럼 바로 모든 탭이 보이는지 확인 (승인 화면이 뜨면 안 됨)
- [ ] 새 계정을 하나 만들어 가입 → "승인 대기중" 화면이 뜨는지 확인
- [ ] 담당자/승인자 계정으로 로그인 → 상단 **가입 승인** 탭에서 방금 만든 신규 계정이 보이고, 승인 버튼이 동작하는지 확인
- [ ] 승인 후 신규 계정으로 새로고침 → 정상적으로 메인 화면이 보이는지 확인
- [ ] **실험실 예약** 탭 → 405B / 311C 버튼 전환이 되는지 확인
- [ ] 캘린더에서 날짜 클릭 → 오른쪽에 시간 선택 칸(00-01 ~ 23-24)이 뜨는지 확인
- [ ] 연속된 시간 2~3칸을 선택해 예약 → 캘린더에 예약 건수가 표시되는지 확인
- [ ] 같은 시간대를 다른 계정(또는 같은 계정)으로 다시 예약 시도 → "이미 예약된 시간" 에러가 뜨는지 확인
- [ ] 본인 예약에는 취소 버튼이 보이고, 다른 사람 예약에는 (담당자/승인자가 아니면) 취소 버튼이 안 보이는지 확인

이 중 하나라도 예상과 다르게 동작하거나 화면에 에러 메시지(빨간 글씨)가 보이면, 어느 단계에서 무엇이 나왔는지 알려주시면 바로 확인해드리겠습니다.
