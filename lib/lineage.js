// 세대(F1, F2...) 및 Pedigree(예: 530110/530111-2-4) 자동 계산 로직
// - F8부터 "고정계통"으로 표시합니다.
// - Pedigree는 F8까지만 개체번호를 이어 붙이고, F9 이후는 F8의 Pedigree를 그대로 물려받습니다.
//   (예: F20 종자도 Pedigree는 F8까지만 보입니다)
// - 모종자가 아직 등록되지 않았으면 직접 입력한 세대/Pedigree를 그대로 씁니다.
//   나중에 모종자가 등록되면 recomputeDescendants()로 뒷세대가 자동으로 다시 계산됩니다.
// - 모종자 코드를 대표 코드(예: 52200)로 쓰면, 52200-1·52200-2·52200-B 등을 섞어 파종한 것으로 보고
//   섞은 세대를 B로 표기합니다. (예: …-2-B-4)
//   모종자 코드를 52200-1처럼 싱글 번호까지 쓰면 그 종자에만 연결합니다.
export const FIXED_LINE_THRESHOLD = 8;

export function parseGenNum(gen) {
  if (!gen) return null;
  const m = String(gen).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// 대표 코드(52200)에 속한 종자들 (52200-1, 52200-2, 52200-B …)
export function findGroupMembers(baseCode, seeds) {
  baseCode = String(baseCode || '').trim();
  if (!baseCode) return [];
  return seeds
    .filter((s) => s.code !== baseCode && getBaseCode(s.code) === baseCode)
    .sort((a, b) => compareMemberCodes(a.code, b.code));
}

// 모종자 찾기: 정확히 같은 코드가 있으면 그 종자, 없으면 대표 코드 묶음
// 반환: { kind: 'single', seed } | { kind: 'group', members, generation, pedigree } | null
export function resolveParent(parentCode, seeds) {
  parentCode = String(parentCode || '').trim();
  if (!parentCode) return null;
  const exact = seeds.find((s) => s.code === parentCode);
  if (exact) return { kind: 'single', seed: exact, generation: exact.generation, pedigree: exact.pedigree };

  const members = findGroupMembers(parentCode, seeds);
  if (!members.length) return null;

  // 묶음의 세대: 구성 종자 중 가장 높은 세대
  const gens = members.map((m) => parseGenNum(m.generation)).filter((g) => g !== null);
  const genNum = gens.length ? Math.max(...gens) : null;

  // 묶음의 Pedigree: 구성 종자 Pedigree의 마지막 개체번호를 B로 바꿈
  //   52200-1 (…-2-1), 52200-2 (…-2-2) → 묶음 …-2-B
  //   F9 이후 구성 종자는 Pedigree가 이미 F8에서 멈춰 있으므로 그대로 사용
  let pedigree = '';
  const sameGen = members.filter((m) => parseGenNum(m.generation) === genNum && (m.pedigree || '').trim());
  const ref = sameGen[0] || members.find((m) => (m.pedigree || '').trim());
  if (ref) {
    const ped = ref.pedigree.trim();
    if (genNum !== null && genNum > FIXED_LINE_THRESHOLD) {
      pedigree = ped;
    } else {
      const indiv = (ref.individual_number || '').trim() || getIndividualFromCode(ref.code);
      pedigree = indiv && ped.endsWith('-' + indiv) ? ped.slice(0, -(indiv.length + 1)) + '-B' : ped;
    }
  }
  return { kind: 'group', members, generation: genNum !== null ? 'F' + genNum : '', pedigree };
}

export function isSelfParent(code, parentCode) {
  code = String(code || '').trim();
  parentCode = String(parentCode || '').trim();
  if (!code || !parentCode) return false;
  return parentCode === code || parentCode === getBaseCode(code);
}

// seeds: 현재까지 등록된 종자 배열 (parent_code로 부모를 찾기 위함)
// code: 이 종자의 코드. 개체번호를 비워 두면 코드 끝(52200-3 → 3, 52200-B → B)에서 가져옵니다.
export function computeLineage({ code, parentCode, individualNumber, manualGeneration, manualPedigree, seeds }) {
  parentCode = (parentCode || '').trim();
  individualNumber = (individualNumber || '').trim() || getIndividualFromCode(code);
  manualGeneration = (manualGeneration || '').trim();
  manualPedigree = (manualPedigree || '').trim();

  const manual = (extra) => {
    const genNum = parseGenNum(manualGeneration);
    return {
      generation: manualGeneration,
      pedigree: manualPedigree,
      individualNumber,
      fixedLine: genNum !== null && genNum >= FIXED_LINE_THRESHOLD,
      error: null,
      ...extra,
    };
  };

  if (!parentCode) return manual();
  // 자기 자신 또는 자기가 속한 묶음(52200-1 → 52200)을 모종자로 지정한 경우
  if (isSelfParent(code, parentCode)) return manual({ selfParent: true });

  const parent = resolveParent(parentCode, seeds);
  // 모종자가 아직 없음 → 직접 입력값 사용 (등록은 가능)
  if (!parent) return manual({ parentMissing: true });
  const groupInfo = parent.kind === 'group' ? { parentGroup: parent.members.length } : {};

  const parentGenNum = parseGenNum(parent.generation);
  // 모종자는 있지만 모종자의 세대를 모름 → 추측하지 않고 직접 입력값 사용
  if (parentGenNum === null) return manual({ parentGenUnknown: true, ...groupInfo });

  const childGenNum = parentGenNum + 1;
  const generation = 'F' + childGenNum;
  const fixedLine = childGenNum >= FIXED_LINE_THRESHOLD;
  const parentPedigree = (parent.pedigree || '').trim();

  // F9 이후: F8까지의 Pedigree를 그대로 물려받음
  if (childGenNum > FIXED_LINE_THRESHOLD) {
    return { generation, pedigree: parentPedigree || manualPedigree, individualNumber, fixedLine, error: null, ...groupInfo };
  }

  // F2~F8: 모종자 Pedigree 뒤에 개체번호를 붙임
  if (!individualNumber) {
    // 세대는 계산하고, Pedigree는 기존 값 유지
    return { generation, pedigree: manualPedigree, individualNumber, fixedLine, error: 'needIndiv', ...groupInfo };
  }
  return {
    generation,
    pedigree: parentPedigree ? `${parentPedigree}-${individualNumber}` : manualPedigree,
    individualNumber,
    fixedLine,
    error: null,
    ...groupInfo,
  };
}

function lineageOf(seed, seeds) {
  const r = computeLineage({
    code: seed.code,
    parentCode: seed.parent_code,
    individualNumber: seed.individual_number,
    manualGeneration: seed.generation,
    manualPedigree: seed.pedigree,
    seeds,
  });
  return {
    individual_number: r.individualNumber || '',
    generation: r.generation || '',
    pedigree: r.pedigree || '',
    fixed_line: !!r.fixedLine,
  };
}

function differs(seed, next) {
  return (seed.individual_number || '') !== next.individual_number
    || (seed.generation || '') !== next.generation
    || (seed.pedigree || '') !== next.pedigree
    || !!seed.fixed_line !== next.fixed_line;
}

// targets(다시 계산할 종자들)를 값이 더 이상 바뀌지 않을 때까지 반복 계산
// (묶음 모종자는 구성 종자가 여러 개라 한 번에 순서를 정하기 어려워서 반복 방식 사용)
function settle(working, targetIds) {
  const changes = new Map();
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (const s of working) {
      if (!targetIds.has(s.id) || !s.parent_code) continue;
      const next = lineageOf(s, working);
      if (differs(s, next)) {
        Object.assign(s, next);
        changes.set(s.id, { id: s.id, code: s.code, ...next });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return [...changes.values()];
}

// 어떤 종자들(startCodes)이 새로 등록·수정됐을 때, 그 아래 뒷세대들을 모두 다시 계산합니다.
// 모종자 코드가 그 종자의 코드(52200-1)이든 대표 코드(52200)이든 모두 찾아갑니다.
// 화면에서 쓰는 값만 계산하고, 실제 저장은 호출하는 쪽에서 합니다.
// 반환: 바뀐 종자 목록 [{ id, code, individual_number, generation, pedigree, fixed_line }]
export function recomputeDescendants(startCodes, seeds) {
  const working = seeds.map((s) => ({ ...s }));
  const byParent = new Map();
  for (const s of working) {
    if (!s.parent_code) continue;
    const key = s.parent_code.trim();
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(s);
  }

  // 영향을 받는 뒷세대 모으기
  const targetIds = new Set();
  const visited = new Set();
  const queue = [...startCodes];
  while (queue.length) {
    const code = queue.shift();
    if (visited.has(code)) continue; // 순환 참조 방지
    visited.add(code);
    const keys = new Set([code, getBaseCode(code)]); // 이 종자를 직접 가리키거나, 묶음으로 가리키는 자식
    for (const key of keys) {
      for (const child of byParent.get(key) || []) {
        targetIds.add(child.id);
        queue.push(child.code);
      }
    }
  }
  return settle(working, targetIds);
}

// 전체 데이터를 처음부터 다시 계산
export function recomputeAll(seeds) {
  const working = seeds.map((s) => ({ ...s }));
  return settle(working, new Set(working.map((s) => s.id)));
}

// 종자 코드에서 대표 코드 추출: 52200-B → 52200, 52200-1 → 52200, 52200 → 52200
export function getBaseCode(code) {
  const m = String(code || '').trim().match(/^(.+)-(B|\d+)$/i);
  return m ? m[1] : String(code || '').trim();
}

// 종자 코드 끝에서 개체번호 추출: 52200-3 → '3', 52200-B → 'B', 52200 → ''
export function getIndividualFromCode(code) {
  const m = String(code || '').trim().match(/-(B|\d+)$/i);
  if (!m) return '';
  return /^b$/i.test(m[1]) ? 'B' : m[1];
}

// 같은 대표 코드 안에서 정렬: 벌크(B) 먼저, 그다음 싱글 번호순
export function compareMemberCodes(a, b) {
  const sa = String(a).match(/-(B|\d+)$/i)?.[1] || '';
  const sb = String(b).match(/-(B|\d+)$/i)?.[1] || '';
  const rank = (s) => (s === '' ? 0 : /^b$/i.test(s) ? 1 : 2);
  if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb);
  return (parseInt(sa, 10) || 0) - (parseInt(sb, 10) || 0);
}
