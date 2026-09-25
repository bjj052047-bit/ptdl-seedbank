// 다국어(한글/English) 사전 + 언어 상태 관리
// ------------------------------------------------------------
// 사용법 (각 페이지/컴포넌트에서):
//   import { useLang } from '../lib/i18n';
//   const { t, lang, fmtDate } = useLang();
//   <button>{t('common.save')}</button>
//   t('search.resultCount', { n: 5 })   // → "검색 결과: 5건" / "Results: 5"
//
// 새 문구를 추가하려면 아래 DICT에 'key': { ko: '...', en: '...' } 한 줄을 추가하면 됩니다.
// 사용자가 입력한 데이터(품종명, 작물명, 비고, 이름, 기기명 등)는 번역하지 않습니다.
// ------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'ptdl-lang'; // 브라우저(localStorage)에 저장되는 이름

export const DICT = {
  // ══════════════ 공통 ══════════════
  'common.loading': { ko: '불러오는 중...', en: 'Loading...' },
  'common.checking': { ko: '확인 중...', en: 'Checking...' },
  'common.processing': { ko: '처리 중...', en: 'Processing...' },
  'common.saving': { ko: '저장 중...', en: 'Saving...' },
  'common.save': { ko: '저장', en: 'Save' },
  'common.cancel': { ko: '취소', en: 'Cancel' },
  'common.edit': { ko: '수정', en: 'Edit' },
  'common.delete': { ko: '삭제', en: 'Delete' },
  'common.approve': { ko: '승인', en: 'Approve' },
  'common.reject': { ko: '거절', en: 'Reject' },
  'common.today': { ko: '오늘', en: 'Today' },
  'common.count': { ko: '{n}건', en: '{n}' },
  'common.name': { ko: '이름', en: 'Name' },
  'common.email': { ko: '이메일', en: 'Email' },
  'common.date': { ko: '날짜', en: 'Date' },
  'common.unknown': { ko: '(알수없음)', en: '(unknown)' },
  'common.saveFailed': { ko: '저장 실패: {msg}', en: 'Save failed: {msg}' },
  'common.actionFailed': { ko: '처리 실패: {msg}', en: 'Action failed: {msg}' },
  'common.cancelFailed': { ko: '취소 실패: {msg}', en: 'Cancellation failed: {msg}' },
  'common.dept': { ko: '세종대학교 스마트생명산업융합학과', en: 'Sejong University · Dept. of Smart Bio-Industry Convergence' },
  'common.namePlaceholder': { ko: '예: 홍길동', en: 'e.g. Gildong Hong' },
  'common.seedNotFound': { ko: '해당 코드의 종자를 찾을 수 없습니다.', en: 'No seed found with this code.' },
  'common.enterValidCode': { ko: '먼저 유효한 종자 코드를 입력하세요.', en: 'Please enter a valid seed code first.' },
  'common.qtyPositive': { ko: '수량은 0보다 큰 숫자여야 합니다.', en: 'Quantity must be a number greater than 0.' },
  'common.dow': { ko: '일,월,화,수,목,금,토', en: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat' },
  'common.yearMonth': { ko: '{y}년 {m}월', en: '{mname} {y}' },
  'common.prevMonth': { ko: '이전달', en: 'Prev' },
  'common.nextMonth': { ko: '다음달', en: 'Next' },
  'common.eg': { ko: '예:', en: 'e.g.' },
  'common.noRecords': { ko: '내역이 없습니다.', en: 'No records.' },

  // ══════════════ 상단 메뉴(Nav) ══════════════
  'nav.title': { ko: 'PTDL 연구실 포털', en: 'PTDL Lab Portal' },
  'nav.logout': { ko: '로그아웃', en: 'Log out' },
  'nav.langToggle': { ko: 'English', en: '한글' }, // 버튼에는 "바꿀 언어"를 표시
  'nav.tab.search': { ko: '종자 검색', en: 'Seed Search' },
  'nav.tab.requests': { ko: '종자 요청', en: 'Seed Requests' },
  'nav.tab.reservations': { ko: '실험실 예약', en: 'Lab Reservations' },
  'nav.tab.beds': { ko: '배드 예약', en: 'Bed Reservations' },
  'nav.tab.io': { ko: '입출고 기록', en: 'Stock In/Out Log' },
  'nav.tab.manage': { ko: '데이터 등록·관리', en: 'Data Entry & Management' },
  'nav.tab.approvals': { ko: '가입 승인', en: 'Sign-up Approvals' },
  'nav.tab.audit': { ko: '수정 이력', en: 'Audit Log' },

  // ── 역할 이름 ──
  'role.staff': { ko: '종자실 담당자', en: 'Seed Room Manager' },
  'role.supervisor': { ko: '승인자', en: 'Supervisor' },
  'role.researcher': { ko: '연구원', en: 'Researcher' },
  'role.developer': { ko: '개발자', en: 'Developer' },

  // ── 입출고 구분 (DB에는 한글로 저장된 고정 값 → 화면 표시만 번역) ──
  'txType.입고': { ko: '입고', en: 'In' },
  'txType.출고': { ko: '출고', en: 'Out' },
  'txType.정정': { ko: '정정', en: 'Correction' },
  'txType.초기등록': { ko: '초기등록', en: 'Initial entry' },

  // ── 단위 (DB에는 'g' / '립'으로 저장) ──
  'unit.립': { ko: '립', en: 'grains' },
  'unit.grainQty': { ko: '{q}립 (약 {g}g)', en: '{q} grains (≈{g} g)' },

  // ══════════════ 종자 항목 이름 ══════════════
  'field.code': { ko: '종자코드', en: 'Seed Code' },
  'field.codeShort': { ko: '코드', en: 'Code' },
  'field.crop': { ko: '작물', en: 'Crop' },
  'field.variety': { ko: '품종명', en: 'Variety' },
  'field.varietyShort': { ko: '품종', en: 'Variety' },
  'field.cropVariety': { ko: '작물/품종', en: 'Crop/Variety' },
  'field.harvestYear': { ko: '수확연도', en: 'Harvest Year' },
  'field.year': { ko: '연도', en: 'Year' },
  'field.location': { ko: '보관위치', en: 'Storage Location' },
  'field.locationShort': { ko: '위치', en: 'Location' },
  'field.qtyG': { ko: '재고(g)', en: 'Stock (g)' },
  'field.qty': { ko: '재고', en: 'Stock' },
  'field.origin': { ko: '도입기관', en: 'Source Institution' },
  'field.region': { ko: '재배지역', en: 'Cultivation Region' },
  'field.notes': { ko: '비고', en: 'Notes' },

  // ══════════════ 종자 검색 페이지 ══════════════
  'search.placeholder': {
    ko: '종자 코드 또는 품종명으로 검색 (예: RIC-2023-014, 밀크씨슬)',
    en: 'Search by seed code or variety name (e.g. RIC-2023-014, 밀크씨슬)',
  },
  'search.sort.desc': { ko: '수확연도 내림차순 (최신순)', en: 'Harvest year: newest first' },
  'search.sort.asc': { ko: '수확연도 오름차순 (오래된순)', en: 'Harvest year: oldest first' },
  'search.searching': { ko: '검색 중...', en: 'Searching...' },
  'search.resultCount': { ko: '검색 결과: {n}건', en: 'Results: {n}' },
  'search.noResult': {
    ko: '검색 결과가 없습니다. 다른 코드나 품종명으로 검색해보세요.',
    en: 'No results found. Try a different code or variety name.',
  },
  'search.noResultShort': { ko: '검색 결과가 없습니다.', en: 'No results found.' },
  'search.codeOrVariety': { ko: '종자 코드 또는 품종명으로 검색', en: 'Search by seed code or variety' },

  // ── 종자 상세 팝업 ──
  'detail.genPedigree': { ko: '세대 / Pedigree', en: 'Generation / Pedigree' },
  'detail.fixedLine': { ko: '🔒 고정계통', en: '🔒 Fixed line' },
  'detail.loadingLineage': { ko: '계보 불러오는 중...', en: 'Loading lineage...' },
  'detail.lineage': { ko: '세대 계보', en: 'Lineage' },
  'detail.unregistered': { ko: '미등록', en: 'Not registered' },
  'detail.current': { ko: '현재', en: 'current' },
  'detail.children': { ko: '이 종자를 심어서 얻은 종자 ({n})', en: 'Seeds derived from this seed ({n})' },
  'detail.tx.date': { ko: '일자', en: 'Date' },
  'detail.tx.type': { ko: '구분', en: 'Type' },
  'detail.tx.change': { ko: '변동', en: 'Change' },
  'detail.tx.by': { ko: '담당자', en: 'Handled by' },

  // ══════════════ 로그인 / 가입 ══════════════
  'login.title': { ko: '종자실 재고 관리', en: 'Seed Inventory' },
  'login.signin': { ko: '로그인', en: 'Log in' },
  'login.signupTab': { ko: '처음이신가요? (가입)', en: 'New here? (Sign up)' },
  'login.signupBtn': { ko: '가입하기', en: 'Sign up' },
  'login.nameLabel': { ko: '이름 *', en: 'Name *' },
  'login.emailLabel': { ko: '이메일 *', en: 'Email *' },
  'login.pwLabel': { ko: '비밀번호 *', en: 'Password *' },
  'login.pwPlaceholder': { ko: '6자 이상', en: 'At least 6 characters' },
  'login.err.fillAll': { ko: '이름, 이메일, 비밀번호를 모두 입력하세요.', en: 'Please enter your name, email and password.' },
  'login.err.fillSignin': { ko: '이메일과 비밀번호를 입력하세요.', en: 'Please enter your email and password.' },
  'login.err.signup': { ko: '가입 실패: {msg}', en: 'Sign-up failed: {msg}' },
  'login.err.profile': { ko: '프로필 생성 실패: {msg}', en: 'Failed to create profile: {msg}' },
  'login.err.signin': { ko: '로그인 실패: {msg}', en: 'Login failed: {msg}' },
  'login.ok.signup': {
    ko: '가입 신청이 완료되었습니다. 이메일 확인이 켜져 있다면 메일함을 확인한 뒤 로그인해주세요. 로그인 후에는 관리자 승인을 기다려야 이용할 수 있습니다.',
    en: 'Your sign-up request has been submitted. If email confirmation is enabled, check your inbox before logging in. After logging in, you can use the site once an administrator approves your account.',
  },
  'login.help': {
    ko: "가입 신청 후에는 관리자(담당자/승인자)의 승인이 있어야 사이트를 이용할 수 있습니다. 승인 전까지는 '승인 대기중' 화면이 표시됩니다. 담당자 권한이 필요하면 연구실 관리자(Supabase 프로젝트 소유자)에게 요청해 role을 변경해달라고 하세요.",
    en: "After signing up, an administrator (manager/supervisor) must approve your account before you can use the site. Until then, a 'Pending approval' screen is shown. If you need manager permissions, ask the lab administrator (Supabase project owner) to change your role.",
  },

  // ── 이름 입력(welcome) ──
  'welcome.title': { ko: '거의 다 됐습니다 👋', en: 'Almost there 👋' },
  'welcome.subtitle': { ko: '마지막으로 이름만 알려주세요', en: 'Just tell us your name' },
  'welcome.err.name': { ko: '이름을 입력해주세요.', en: 'Please enter your name.' },
  'welcome.start': { ko: '시작하기', en: 'Get started' },

  // ── 승인 대기(pending) ──
  'pending.title': { ko: '가입 승인 대기중입니다 ⏳', en: 'Your account is pending approval ⏳' },
  'pending.body': {
    ko: '관리자(담당자/승인자)가 가입 신청을 확인한 뒤 승인하면 이용하실 수 있습니다. 승인이 늦어지면 연구실 관리자에게 직접 문의해주세요.',
    en: 'You can use the site once an administrator (manager/supervisor) reviews and approves your request. If approval takes a while, please contact the lab administrator directly.',
  },
  'rejected.title': { ko: '가입이 거절되었습니다', en: 'Your sign-up was rejected' },
  'rejected.body': {
    ko: '관리자가 가입 신청을 거절했습니다. 사유가 궁금하시면 연구실 관리자에게 문의해주세요.',
    en: 'An administrator rejected your sign-up request. Please contact the lab administrator for details.',
  },
  'pending.refresh': { ko: '상태 새로고침', en: 'Refresh status' },

  // ══════════════ 가입 승인(approvals) ══════════════
  'approvals.pendingTitle': { ko: '가입 승인 대기 ({n})', en: 'Pending sign-ups ({n})' },
  'approvals.noPending': { ko: '승인 대기 중인 가입 신청이 없습니다.', en: 'No pending sign-up requests.' },
  'approvals.joined': { ko: '가입일', en: 'Joined' },
  'approvals.allTitle': { ko: '전체 계정 ({n})', en: 'All accounts ({n})' },
  'approvals.role': { ko: '역할', en: 'Role' },
  'approvals.status': { ko: '상태', en: 'Status' },
  'approvals.noAccounts': { ko: '계정이 없습니다.', en: 'No accounts.' },
  'approvals.approved': { ko: '승인됨', en: 'Approved' },
  'approvals.rejected': { ko: '거절됨', en: 'Rejected' },
  'approvals.reapprove': { ko: '다시 승인', en: 'Approve again' },
  'approvals.noEmail': { ko: '이메일 없음', en: 'no email' },
  'approvals.confirm': { ko: '{name}({email}) 님의 가입을 {action}할까요?', en: '{action} the sign-up of {name} ({email})?' },
  'approvals.roleHelp': {
    ko: '담당자/승인자 역할 변경은 아직 이 화면에서 지원하지 않습니다. Supabase 대시보드 → Table Editor → profiles 테이블에서 role 값을 직접 수정해주세요.',
    en: 'Changing roles (manager/supervisor) is not yet supported on this screen. Edit the role value directly in Supabase Dashboard → Table Editor → profiles.',
  },

  // ══════════════ 수정 이력(audit) ══════════════
  'audit.title': { ko: '수정 이력 (개발자 전용)', en: 'Audit Log (developers only)' },
  'audit.desc': {
    ko: '종자·입출고·요청·예약(실험실/배드) 데이터의 추가·수정·삭제 기록입니다. 누가, 언제, 무엇을 바꿨는지 확인할 수 있습니다.',
    en: 'Records of additions, edits and deletions to seeds, stock logs, requests and reservations (lab/bed). See who changed what, and when.',
  },
  'audit.allTables': { ko: '전체 테이블', en: 'All tables' },
  'audit.searchPlaceholder': { ko: '종자코드·이름 등으로 검색', en: 'Search by seed code, name, etc.' },
  'audit.when': { ko: '일시', en: 'Date/Time' },
  'audit.table': { ko: '테이블', en: 'Table' },
  'audit.item': { ko: '항목', en: 'Item' },
  'audit.action': { ko: '동작', en: 'Action' },
  'audit.by': { ko: '담당자', en: 'Changed by' },
  'audit.noRecords': { ko: '기록이 없습니다.', en: 'No records.' },
  'audit.details': { ko: '자세히 →', en: 'Details →' },
  'audit.inserted': { ko: '새로 추가된 내용', en: 'Added content' },
  'audit.deleted': { ko: '삭제 직전 내용', en: 'Content before deletion' },
  'audit.changedOnly': { ko: '바뀐 항목만 표시', en: 'Changed fields only' },
  'audit.noChange': { ko: '실제로 값이 바뀐 항목이 없습니다.', en: 'No values actually changed.' },
  'audit.field': { ko: '항목', en: 'Field' },
  'audit.value': { ko: '값', en: 'Value' },
  'audit.before': { ko: '수정 전', en: 'Before' },
  'audit.after': { ko: '수정 후', en: 'After' },
  'audit.empty': { ko: '(비어있음)', en: '(empty)' },
  'audit.tbl.seeds': { ko: '종자', en: 'Seeds' },
  'audit.tbl.seed_transactions': { ko: '입출고기록', en: 'Stock log' },
  'audit.tbl.seed_requests': { ko: '종자요청', en: 'Seed requests' },
  'audit.tbl.lab_reservations': { ko: '실험실예약', en: 'Lab reservations' },
  'audit.tbl.bed_reservations': { ko: '배드예약', en: 'Bed reservations' },
  'audit.act.INSERT': { ko: '추가', en: 'Added' },
  'audit.act.UPDATE': { ko: '수정', en: 'Edited' },
  'audit.act.DELETE': { ko: '삭제', en: 'Deleted' },

  // ══════════════ 입출고 기록(io) ══════════════
  'io.formTitle': { ko: '입출고 기록하기', en: 'Record stock in/out' },
  'io.codeLabel': { ko: '종자 코드 *', en: 'Seed code *' },
  'io.codePlaceholder': { ko: '코드 입력', en: 'Enter code' },
  'io.locationLabel': { ko: '위치', en: 'Location' },
  'io.currentStock': { ko: '현재 재고', en: 'Current stock' },
  'io.typeLabel': { ko: '구분 *', en: 'Type *' },
  'io.qtyLabel': { ko: '수량 (g) *', en: 'Quantity (g) *' },
  'io.qtyPlaceholder': { ko: '예: 50', en: 'e.g. 50' },
  'io.dateLabel': { ko: '일자', en: 'Date' },
  'io.noteLabel': { ko: '사유/용도', en: 'Reason/Purpose' },
  'io.notePlaceholder': { ko: '예: 파종용 반출', en: 'e.g. taken out for sowing' },
  'io.submit': { ko: '기록하기', en: 'Record' },
  'io.confirmNegative': {
    ko: '처리 후 재고가 음수({next})가 됩니다. 현재 재고({cur}g)보다 많은 출고입니다. 그래도 기록할까요?',
    en: 'Stock will become negative ({next}). This is more than the current stock ({cur} g). Record anyway?',
  },
  'io.err.record': { ko: '기록 실패: {msg}', en: 'Failed to record: {msg}' },
  'io.err.stock': { ko: '재고 반영 실패: {msg}', en: 'Failed to update stock: {msg}' },
  'io.ok': { ko: '기록되었습니다. 처리 후 재고: {next}g', en: 'Recorded. Stock after: {next} g' },
  'io.logTitle': { ko: '최근 입출고 내역', en: 'Recent stock in/out' },
  'io.logFilter': { ko: '종자코드로 필터링', en: 'Filter by seed code' },
  'io.col.qty': { ko: '수량', en: 'Qty' },
  'io.col.after': { ko: '처리후재고', en: 'Stock after' },

  // ══════════════ 종자 요청(requests) ══════════════
  'req.status.pending': { ko: '대기중(승인전)', en: 'Pending (awaiting approval)' },
  'req.status.approved': { ko: '승인됨(출고대기)', en: 'Approved (awaiting release)' },
  'req.status.fulfilled': { ko: '완료', en: 'Completed' },
  'req.status.rejected': { ko: '거절됨', en: 'Rejected' },
  'req.formTitle': { ko: '종자 요청하기', en: 'Request seeds' },
  'req.codePlaceholder': { ko: '코드 입력 (오른쪽 목록에서 클릭해도 됩니다)', en: 'Enter code (or click one in the list on the right)' },
  'req.qtyLabel': { ko: '필요 수량 *', en: 'Quantity needed *' },
  'req.qtyPlaceholder': { ko: '예: 20', en: 'e.g. 20' },
  'req.unitLabel': { ko: '단위', en: 'Unit' },
  'req.noteLabel': { ko: '용도/사유', en: 'Purpose/Reason' },
  'req.notePlaceholder': { ko: '예: OO 실험용', en: 'e.g. for XX experiment' },
  'req.grainHint': { ko: '약 {g}g 로 환산되어 재고에 반영됩니다 (100립 = 2g 기준)', en: 'Converted to about {g} g for stock (based on 100 grains = 2 g)' },
  'req.submitting': { ko: '제출 중...', en: 'Submitting...' },
  'req.submit': { ko: '요청 제출', en: 'Submit request' },
  'req.err.submit': { ko: '요청 실패: {msg}', en: 'Request failed: {msg}' },
  'req.ok.submit': { ko: '요청이 등록되었습니다. 승인자 확인 후 담당자가 처리하면 상태가 바뀝니다.', en: 'Request submitted. Its status will change once a supervisor approves it and a manager processes it.' },
  'req.err.enterCode': { ko: '종자 코드를 입력하세요.', en: 'Please enter a seed code.' },
  'req.confirmReject': { ko: '이 요청을 거절할까요?', en: 'Reject this request?' },
  'req.confirmApprove': { ko: '{code} {qty} 요청을 승인할까요? (승인 후 담당자가 출고 처리합니다)', en: 'Approve the request for {code} {qty}? (A manager will release it after approval)' },
  'req.err.seedMissing': { ko: '연결된 종자를 찾을 수 없습니다.', en: 'The linked seed could not be found.' },
  'req.confirmNegative': { ko: '처리 후 재고가 음수({next}g)가 됩니다. 그래도 처리할까요?', en: 'Stock will become negative ({next} g). Process anyway?' },
  'req.confirmFulfill': { ko: '{code} ({variety}) {qty} 출고 처리할까요?', en: 'Release {qty} of {code} ({variety})?' },
  'req.reason': { ko: '사유', en: 'Reason' },
  'req.listTitle': { ko: '등록된 종자 목록', en: 'Registered seeds' },
  'req.myTitle': { ko: '나의 요청 내역 ({n})', en: 'My requests ({n})' },
  'req.date': { ko: '요청일', en: 'Requested' },
  'req.qty': { ko: '수량', en: 'Qty' },
  'req.status': { ko: '상태', en: 'Status' },
  'req.requester': { ko: '요청자', en: 'Requester' },
  'req.noMine': { ko: '아직 요청한 내역이 없습니다.', en: "You haven't made any requests yet." },
  'req.awaitApprovalTitle': { ko: '승인 대기 중인 요청 ({n})', en: 'Requests awaiting approval ({n})' },
  'req.noAwaitApproval': { ko: '승인 대기 중인 요청이 없습니다.', en: 'No requests awaiting approval.' },
  'req.awaitFulfillTitle': { ko: '처리(출고) 대기 중인 요청 ({n})', en: 'Requests awaiting release ({n})' },
  'req.awaitFulfillHelp': { ko: '승인자가 승인한 요청만 여기 나타납니다.', en: 'Only requests approved by a supervisor appear here.' },
  'req.noAwaitFulfill': { ko: '처리 대기 중인 요청이 없습니다.', en: 'No requests awaiting release.' },
  'req.fulfill': { ko: '처리(출고)', en: 'Release' },
  'req.allTitle': { ko: '전체 요청 내역', en: 'All requests' },
  'req.noAll': { ko: '요청 내역이 없습니다.', en: 'No requests.' },

  // ══════════════ 데이터 등록·관리(manage) ══════════════
  'manage.editTitle': { ko: '종자 수정', en: 'Edit seed' },
  'manage.addTitle': { ko: '종자 1건 등록', en: 'Add one seed' },
  'manage.codeLabel': { ko: '종자 코드 (고유값) *', en: 'Seed code (unique) *' },
  'manage.dupCode': { ko: '⚠ 이미 등록된 종자 코드입니다.', en: '⚠ This seed code is already registered.' },
  'manage.cropLabel': { ko: '작물명 *', en: 'Crop *' },
  'manage.varietyLabel': { ko: '품종명 *', en: 'Variety *' },
  'manage.sciLabel': { ko: '학명', en: 'Scientific name' },
  'manage.harvestLabel': { ko: '수확연도', en: 'Harvest year' },
  'manage.locationLabel': { ko: '보관 위치 *', en: 'Storage location *' },
  'manage.qtyLabel': { ko: '재고량 (g)', en: 'Stock (g)' },
  'manage.originLabel': { ko: '도입기관', en: 'Source institution' },
  'manage.originYearLabel': { ko: '도입연도', en: 'Year introduced' },
  'manage.regionLabel': { ko: '재배 지역 (조건)', en: 'Cultivation region (conditions)' },
  'manage.parentLabel': { ko: '모종자 코드 (선택)', en: 'Parent seed code (optional)' },
  'manage.parentMissing': { ko: '아직 등록되지 않은 코드예요. 나중에 등록되면 계보가 자동으로 이어집니다.', en: 'This code is not registered yet. The lineage will link automatically once it is registered.' },
  'manage.indivLabel': { ko: '개체 번호', en: 'Individual number' },
  'manage.autoGenLabel': { ko: '세대 / Pedigree (자동계산)', en: 'Generation / Pedigree (auto)' },
  'manage.genLabel': { ko: '세대 (F1, F2...)', en: 'Generation (F1, F2...)' },
  'manage.notesPlaceholder': { ko: '특이사항', en: 'Remarks' },
  'manage.saveBtn': { ko: '저장하기', en: 'Save' },
  'manage.clear': { ko: '입력 지우기', en: 'Clear form' },
  'manage.err.required': { ko: '종자 코드, 작물명, 품종명, 보관위치는 필수 입력입니다.', en: 'Seed code, crop, variety and storage location are required.' },
  'manage.err.dup': { ko: '이미 등록된 종자 코드입니다.', en: 'This seed code is already registered.' },
  'manage.err.selfParent': { ko: '자기 자신을 모종자로 지정할 수 없습니다.', en: 'A seed cannot be its own parent.' },
  'manage.err.needIndiv': { ko: '모종자를 지정했다면 개체 번호를 입력해야 Pedigree를 자동으로 계산할 수 있습니다.', en: 'When a parent seed is set, enter an individual number so the pedigree can be calculated automatically.' },
  'manage.ok.saved': { ko: '저장되었습니다.', en: 'Saved.' },
  'manage.confirmDelete': { ko: "'{code}' 항목을 삭제할까요?", en: "Delete '{code}'?" },
  'manage.bulkTitle': { ko: '여러 건 한번에 붙여넣기', en: 'Paste multiple entries' },
  'manage.bulkHelp': {
    ko: '엑셀에서 아래 순서로 열을 맞춰 복사한 뒤 붙여넣으세요 (탭 구분). 재고는 g 단위, 모종자코드가 있으면 세대·Pedigree는 자동 계산됩니다.',
    en: 'Copy columns from Excel in the order below and paste them here (tab-separated). Stock is in grams; if a parent code is given, generation and pedigree are calculated automatically.',
  },
  'manage.bulkColumns': {
    ko: '종자코드 / 작물명 / 품종명 / 학명 / 수확연도 / 보관위치 / 재고량(g) / 도입기관 / 도입연도 / 재배지역 / 모종자코드 / 개체번호 / 세대(모종자없을때) / Pedigree(모종자없을때) / 비고',
    en: 'Seed code / Crop / Variety / Scientific name / Harvest year / Storage location / Stock (g) / Source institution / Year introduced / Cultivation region / Parent code / Individual no. / Generation (if no parent) / Pedigree (if no parent) / Notes',
  },
  'manage.dupModeLabel': { ko: '기존에 등록된 코드와 겹칠 경우', en: 'If a code already exists' },
  'manage.dupSkip': { ko: '기존 데이터 유지 (건너뜀)', en: 'Keep existing data (skip)' },
  'manage.dupOverwrite': { ko: '덮어쓰기 (붙여넣은 내용으로 교체)', en: 'Overwrite (replace with pasted data)' },
  'manage.bulkBusy': { ko: '등록 중...', en: 'Registering...' },
  'manage.bulkSubmit': { ko: '붙여넣은 내용 등록하기', en: 'Register pasted data' },
  'manage.err.bulkEmpty': { ko: '붙여넣은 내용이 없습니다.', en: 'Nothing was pasted.' },
  'manage.bulkResult': {
    ko: '신규 {added}건 등록, 덮어쓰기 {updated}건, 건너뜀 {skipped}건 (자기참조·빈 값 등)',
    en: '{added} added, {updated} overwritten, {skipped} skipped (self-reference, empty values, etc.)',
  },
  'manage.bulkWarn': { ko: ', {n}건은 개체번호 누락으로 Pedigree 미계산', en: ', {n} without pedigree due to missing individual number' },
  'manage.allTitle': { ko: '전체 데이터 ({n}건)', en: 'All data ({n})' },
  'manage.exporting': { ko: '내보내는 중...', en: 'Exporting...' },
  'manage.export': { ko: '전체 데이터 백업 (엑셀)', en: 'Back up all data (Excel)' },
  'manage.exportHelp': {
    ko: '종자 목록·입출고기록·요청내역을 각각 시트로 담은 엑셀 파일이 즉시 다운로드됩니다. 정기적으로 받아두시면 만약의 상황에도 데이터를 복구할 수 있습니다.',
    en: 'Downloads an Excel file with the seed list, stock log and requests on separate sheets. Download it regularly so data can be recovered if anything goes wrong.',
  },
  'manage.findPlaceholder': { ko: '종자 코드 또는 품종명으로 찾기', en: 'Find by seed code or variety' },
  'manage.noData': { ko: '데이터가 없습니다.', en: 'No data.' },

  // ══════════════ 실험실 예약(reservations) ══════════════
  'lab.name': { ko: '{id} 실험실', en: 'Lab {id}' },
  'lab.purpose.기타': { ko: '기타', en: 'Other' },
  'lab.statusTitle': { ko: '{date} 예약 현황 ({lab})', en: 'Reservations on {date} ({lab})' },
  'lab.shareHelp': { ko: '같은 시간대라도 실험실은 여러 팀이 함께 쓸 수 있습니다. 기기가 겹치는 경우만 예약이 막힙니다.', en: 'Several teams can share the lab at the same time. Only overlapping devices are blocked.' },
  'lab.noneYet': { ko: '아직 예약이 없습니다.', en: 'No reservations yet.' },
  'lab.time': { ko: '시간', en: 'Time' },
  'lab.user': { ko: '예약자', en: 'Reserved by' },
  'lab.purpose': { ko: '실험 목적', en: 'Purpose' },
  'lab.devices': { ko: '사용 기기', en: 'Devices' },
  'lab.reserveTitle': { ko: '예약하기', en: 'Make a reservation' },
  'lab.hourHelp': { ko: '연속된 시간을 클릭해서 선택하세요 (1시간 단위).', en: 'Click consecutive time slots to select them (1-hour units).' },
  'lab.purposeLabel': { ko: '실험 목적 *', en: 'Purpose *' },
  'lab.purposeCustom': { ko: '실험 목적을 입력하세요', en: 'Enter the purpose' },
  'lab.devicesLabel': { ko: '사용할 기기 (선택, 여러 개 선택 가능)', en: 'Devices to use (optional, multiple allowed)' },
  'lab.deviceConflict': { ko: '⚠ {device} 기기가 {range}에 이미 예약되어 있습니다 ({user}).', en: '⚠ {device} is already reserved for {range} ({user}).' },
  'lab.reserving': { ko: '예약 중...', en: 'Reserving...' },
  'lab.reserveBtn': { ko: '예약하기', en: 'Reserve' },
  'lab.reserveBtnHours': { ko: '{n}시간 예약하기', en: 'Reserve {n} h' },
  'lab.myTitle': { ko: '나의 예약 내역 ({n})', en: 'My reservations ({n})' },
  'lab.noMine': { ko: '아직 예약한 내역이 없습니다.', en: "You haven't made any reservations yet." },
  'lab.lab': { ko: '실험실', en: 'Lab' },
  'lab.startHour': { ko: '시작 시간', en: 'Start time' },
  'lab.endHour': { ko: '종료 시간', en: 'End time' },
  'lab.choose': { ko: '선택하세요', en: 'Select' },
  'lab.customLabel': { ko: '기타 목적 직접입력', en: 'Other purpose (type in)' },
  'lab.devicesFor': { ko: '사용할 기기 ({lab})', en: 'Devices to use ({lab})' },
  'lab.err.noHours': { ko: '예약할 시간을 1개 이상 선택하세요.', en: 'Select at least one time slot.' },
  'lab.err.notContiguous': { ko: '연속된 시간대만 한 번에 예약할 수 있어요. (예: 09-11시는 가능, 09-10시 + 13-14시는 따로따로 예약해주세요)', en: 'Only consecutive time slots can be reserved at once. (e.g. 09–11 is fine; reserve 09–10 and 13–14 separately)' },
  'lab.err.noPurpose': { ko: '실험 목적을 선택하세요.', en: 'Please select a purpose.' },
  'lab.err.noCustom': { ko: '기타 실험 목적을 직접 입력하세요.', en: "Please type in the 'Other' purpose." },
  'lab.err.conflict': { ko: '선택한 기기가 다른 예약과 겹칩니다. 아래 경고를 확인하고 기기를 다시 선택해주세요.', en: 'A selected device overlaps with another reservation. Check the warning below and choose again.' },
  'lab.err.reserve': { ko: '예약 실패: {msg}', en: 'Reservation failed: {msg}' },
  'lab.err.race': { ko: '방금 다른 사람이 같은 기기·시간을 먼저 예약했습니다. 새로고침 후 다시 시도해주세요.', en: 'Someone just reserved the same device and time. Refresh and try again.' },
  'lab.err.device': { ko: '기기 예약 실패: {msg}', en: 'Device reservation failed: {msg}' },
  'lab.err.deviceSave': { ko: '기기 저장 실패: {msg}', en: 'Failed to save devices: {msg}' },
  'lab.ok.reserve': { ko: '{range} 예약이 완료되었습니다.', en: 'Reserved {range}.' },
  'lab.confirmCancel': { ko: '{user}님의 {range} 예약을 취소할까요?', en: "Cancel {user}'s reservation for {range}?" },
  'lab.err.noDate': { ko: '날짜를 선택하세요.', en: 'Please select a date.' },
  'lab.err.endBeforeStart': { ko: '종료 시간은 시작 시간보다 늦어야 합니다.', en: 'End time must be later than start time.' },
  'lab.err.editConflict': { ko: '다음 기기와 시간이 겹칩니다: {list}', en: 'Time overlaps for these devices: {list}' },
  'lab.err.overlap': { ko: '그 시간대는 이미 다른 예약과 겹칩니다.', en: 'That time slot overlaps with another reservation.' },

  // ══════════════ 배드 예약(beds) ══════════════
  'bed.status.pending': { ko: '대기중(승인전)', en: 'Pending (awaiting approval)' },
  'bed.status.approved': { ko: '승인됨', en: 'Approved' },
  'bed.status.rejected': { ko: '거절됨', en: 'Rejected' },
  'bed.formTitle': { ko: '배드 예약하기', en: 'Reserve a bed' },
  'bed.formHelp': { ko: '예약을 신청하면 바로 확정되지 않고, 담당자/승인자가 승인해야 최종 반영됩니다.', en: 'Reservations are not confirmed immediately; a manager/supervisor must approve them first.' },
  'bed.selectLabel': { ko: '배드 선택 *', en: 'Bed *' },
  'bed.startLabel': { ko: '시작일 * (직접 입력 가능)', en: 'Start date * (can type)' },
  'bed.endLabel': { ko: '종료일 * (직접 입력 가능)', en: 'End date * (can type)' },
  'bed.applying': { ko: '신청 중...', en: 'Submitting...' },
  'bed.apply': { ko: '예약 신청하기', en: 'Request reservation' },
  'bed.cropLabel': { ko: '재배 작물 (선택)', en: 'Crop (optional)' },
  'bed.cropPlaceholder': { ko: '예: 벼 F2', en: 'e.g. rice F2' },
  'bed.purposeLabel': { ko: '용도 (선택)', en: 'Purpose (optional)' },
  'bed.purposePlaceholder': { ko: '예: 세대 진전', en: 'e.g. generation advance' },
  'bed.notesLabel': { ko: '비고 (선택)', en: 'Notes (optional)' },
  'bed.notesPlaceholder': { ko: '특이사항이 있으면 적어주세요', en: 'Add any remarks' },
  'bed.bed': { ko: '배드', en: 'Bed' },
  'bed.legend': {
    ko: '진한 보라 = 승인된 예약, 연한 주황 = 승인 대기 중인 예약, 초록 테두리 = 지금 고르는 중인 기간. 날짜를 클릭해서 시작일/종료일을 고르거나, 위 입력칸에 직접 타이핑해도 됩니다.',
    en: 'Dark purple = approved, light orange = pending approval, green border = the period you are selecting. Click dates to pick start/end, or type them in the fields above.',
  },
  'bed.listTitle': { ko: '{bed} 예약 목록', en: 'Reservations for {bed}' },
  'bed.listTitleNoBed': { ko: '예약 목록', en: 'Reservations' },
  'bed.noneYet': { ko: '아직 예약이 없습니다.', en: 'No reservations yet.' },
  'bed.period': { ko: '기간', en: 'Period' },
  'bed.user': { ko: '예약자', en: 'Reserved by' },
  'bed.crop': { ko: '작물', en: 'Crop' },
  'bed.purpose': { ko: '용도', en: 'Purpose' },
  'bed.status': { ko: '상태', en: 'Status' },
  'bed.facility': { ko: '시설', en: 'Facility' },
  'bed.finish': { ko: '종료', en: 'End early' },
  'bed.pendingTitle': { ko: '승인 대기 중인 배드 예약 ({n})', en: 'Bed reservations awaiting approval ({n})' },
  'bed.noPending': { ko: '승인 대기 중인 예약이 없습니다.', en: 'No reservations awaiting approval.' },
  'bed.myTitle': { ko: '나의 배드 예약 내역 ({n})', en: 'My bed reservations ({n})' },
  'bed.noMine': { ko: '아직 예약한 배드가 없습니다.', en: "You haven't reserved any beds yet." },
  'bed.start': { ko: '시작일', en: 'Start' },
  'bed.end': { ko: '종료일', en: 'End' },
  'bed.editHelp': { ko: '저장하면 다시 승인 대기 상태로 바뀝니다.', en: 'Saving will set it back to pending approval.' },
  'bed.confirmOverlap': { ko: '{detail} 기간과 예약이 겹칩니다. 공유하도록 협의하셨나요?', en: 'This overlaps with {detail}. Have you agreed to share the bed?' },
  'bed.err.noBed': { ko: '배드를 선택하세요.', en: 'Please select a bed.' },
  'bed.err.noDates': { ko: '시작일과 종료일을 모두 선택하세요.', en: 'Please select both start and end dates.' },
  'bed.err.noDatesEdit': { ko: '시작일과 종료일을 모두 입력하세요.', en: 'Please enter both start and end dates.' },
  'bed.err.endBeforeStart': { ko: '종료일은 시작일보다 빠를 수 없습니다.', en: 'End date cannot be earlier than start date.' },
  'bed.err.reserve': { ko: '예약 실패: {msg}', en: 'Reservation failed: {msg}' },
  'bed.ok.reserve': { ko: '{start} ~ {end} 예약을 신청했습니다. 담당자/승인자가 승인하면 확정됩니다.', en: 'Requested {start} ~ {end}. It will be confirmed once a manager/supervisor approves it.' },
  'bed.confirmCancel': { ko: '{start} ~ {end} 예약을 취소할까요?', en: 'Cancel the reservation {start} ~ {end}?' },
  'bed.promptFinish': {
    ko: '실제로 종료된 날짜를 입력하세요 (YYYY-MM-DD). 이 날짜 다음날부터는 다른 사람이 예약할 수 있게 됩니다.\n(원래 예약 기간: {start} ~ {end})',
    en: 'Enter the actual end date (YYYY-MM-DD). Others can reserve from the following day.\n(Original period: {start} ~ {end})',
  },
  'bed.err.dateFormat': { ko: '날짜 형식이 올바르지 않습니다. 예: 2026-07-20', en: 'Invalid date format. e.g. 2026-07-20' },
  'bed.err.beforeStart': { ko: '시작일보다 빠른 날짜로는 종료할 수 없습니다.', en: 'Cannot end before the start date.' },
  'bed.err.notEarlier': { ko: '원래 종료일보다 빠른 날짜를 입력해야 종료 처리가 됩니다.', en: 'Enter a date earlier than the original end date.' },
  'bed.confirmFinish': {
    ko: '{start} ~ {input} 로 종료 처리할까요? (원래 종료일 {end}는 취소되고, 이후 날짜는 예약 가능해집니다)',
    en: 'End the reservation as {start} ~ {input}? (The original end date {end} is cancelled and later dates become available)',
  },
  'bed.confirmApproval': { ko: '{bed} ({start}~{end}, {user}님) 예약을 {action}할까요?', en: '{action} the reservation for {bed} ({start}~{end}, {user})?' },
};

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// key로 문구를 찾아 현재 언어로 돌려줌. {n} 같은 자리는 vars로 채움.
export function translate(lang, key, vars) {
  const entry = DICT[key];
  let text = entry ? (entry[lang] ?? entry.ko) : key; // 사전에 없으면 key 그대로 (빠진 문구를 찾기 쉬움)
  if (vars) {
    Object.keys(vars).forEach((k) => {
      text = text.split(`{${k}}`).join(vars[k]);
    });
  }
  return text;
}

function makeHelpers(lang) {
  const t = (key, vars) => translate(lang, key, vars);
  // 사전에 있으면 번역, 없으면 원래 값 그대로 (DB에 저장된 고정값 표시용)
  const tMaybe = (prefix, value) => (DICT[`${prefix}.${value}`] ? t(`${prefix}.${value}`) : value);
  const locale = lang === 'en' ? 'en-US' : 'ko-KR';
  const fmtDate = (v) => new Date(v).toLocaleDateString(locale);
  const fmtDateTime = (v) => new Date(v).toLocaleString(locale);
  const yearMonth = (y, m0) => t('common.yearMonth', { y, m: m0 + 1, mname: EN_MONTHS[m0] });
  const dow = t('common.dow').split(',');
  return { t, tMaybe, fmtDate, fmtDateTime, yearMonth, dow };
}

const LangContext = createContext({ lang: 'ko', setLang: () => {}, toggleLang: () => {}, ...makeHelpers('ko') });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('ko');

  // 처음 들어왔을 때 브라우저에 저장된 언어 불러오기
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ko') setLangState(saved);
    } catch (e) {
      // 개인정보 보호 모드 등으로 저장소를 못 쓰면 그냥 한글로 유지
    }
  }, []);

  // 언어가 바뀔 때마다 <html lang="..."> 속성도 맞춰줌
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ko' ? 'en' : 'ko');
  }, [lang, setLang]);

  // 언어가 바뀔 때만 번역 함수들을 새로 만듦 (불필요한 재실행 방지)
  const value = useMemo(() => ({ lang, setLang, toggleLang, ...makeHelpers(lang) }), [lang, setLang, toggleLang]);

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
