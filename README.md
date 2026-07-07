# PTDL 종자실 재고 관리 시스템

세종대학교 스마트생명산업융합학과 PTDL 연구실의 종자 재고 관리 웹사이트입니다.

## 기술 스택
- **프론트엔드**: Next.js (React)
- **데이터베이스 + 로그인**: Supabase (Postgres + Auth + Row Level Security)
- **배포**: Vercel

## 진행 상황
- [x] 데이터베이스 스키마 설계 (`supabase/schema.sql`)
- [x] 로그인 / 회원가입 (이메일 + 비밀번호)
- [x] 역할 기반 접근 제한 (담당자 / 연구원, 서버가 강제하는 진짜 권한)
- [x] 검색 / 조회 탭 (코드·품종명 검색, 상세 카드, 세대 계보)
- [ ] 종자 요청 탭 (다음 단계)
- [ ] 입출고 기록 탭 - 담당자 전용 (다음 단계)
- [ ] 데이터 등록·관리 탭 - 담당자 전용 (다음 단계)

## 배포 방법
`DEPLOY.md` 파일을 참고해 순서대로 따라 하시면 됩니다 (Supabase + Vercel, 모두 무료).

## 로컬 개발
```bash
npm install
cp .env.example .env.local   # 이후 .env.local에 Supabase 키 입력
npm run dev
```
