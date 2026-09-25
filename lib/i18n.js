// 다국어(한글/English) 사전 + 언어 상태 관리
// ------------------------------------------------------------
// 사용법 (각 페이지/컴포넌트에서):
//   import { useLang } from '../lib/i18n';
//   const { t, lang, toggleLang } = useLang();
//   <button>{t('nav.logout')}</button>
//
// 새 문구를 추가하려면 아래 DICT에 { ko: '...', en: '...' } 쌍을 추가하면 됩니다.
// 사용자가 입력한 데이터(품종명, 작물명, 비고 등)는 번역하지 않습니다.
// ------------------------------------------------------------
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'ptdl-lang'; // 브라우저(localStorage)에 저장되는 이름

export const DICT = {
  // ── 공통 ──
  'common.loading': { ko: '불러오는 중...', en: 'Loading...' },

  // ── 상단 메뉴(Nav) ──
  'nav.title': { ko: 'PTDL 연구실 포털', en: 'PTDL Lab Portal' },
  'nav.subtitle': {
    ko: '세종대학교 스마트생명산업융합학과 · 종자실 재고 관리 · 실험실/배드 예약',
    en: 'Sejong Univ. Dept. of Smart Bio-Industry Convergence · Seed Inventory · Lab/Bed Reservations',
  },
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

  // ── 종자 검색 페이지 ──
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

  // ── 종자 항목 이름 (표 머리글 / 상세 정보) ──
  'field.code': { ko: '종자코드', en: 'Seed Code' },
  'field.crop': { ko: '작물', en: 'Crop' },
  'field.variety': { ko: '품종명', en: 'Variety' },
  'field.harvestYear': { ko: '수확연도', en: 'Harvest Year' },
  'field.location': { ko: '보관위치', en: 'Storage Location' },
  'field.qtyG': { ko: '재고(g)', en: 'Stock (g)' },
  'field.qty': { ko: '재고', en: 'Stock' },
  'field.origin': { ko: '도입기관', en: 'Source Institution' },
  'field.region': { ko: '재배지역', en: 'Cultivation Region' },
  'field.notes': { ko: '비고', en: 'Notes' },

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

  // ── 입출고 구분 (DB에는 한글로 저장된 고정 값 → 화면 표시만 번역) ──
  'txType.입고': { ko: '입고', en: 'In' },
  'txType.출고': { ko: '출고', en: 'Out' },
};

// key로 문구를 찾아 현재 언어로 돌려줌. {n} 같은 자리는 vars로 채움.
function translate(lang, key, vars) {
  const entry = DICT[key];
  let text = entry ? (entry[lang] ?? entry.ko) : key; // 사전에 없으면 key 그대로 (빠진 문구를 찾기 쉬움)
  if (vars) {
    Object.keys(vars).forEach((k) => {
      text = text.replace(`{${k}}`, vars[k]);
    });
  }
  return text;
}

const LangContext = createContext({
  lang: 'ko',
  setLang: () => {},
  toggleLang: () => {},
  t: (key, vars) => translate('ko', key, vars),
});

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

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
