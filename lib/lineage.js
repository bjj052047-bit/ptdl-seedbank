// 세대(F1, F2...) 및 Pedigree(예: 530110/530111-2-4) 자동 계산 로직
// - F8부터 "고정계통"으로 표시합니다.
// - Pedigree는 F8까지만 개체번호를 이어 붙이고, F9 이후는 F8의 Pedigree를 그대로 물려받습니다.
//   (예: F20 종자도 Pedigree는 F8까지만 보입니다)
// - 모종자가 아직 등록되지 않았으면 직접 입력한 세대/Pedigree를 그대로 씁니다.
//   나중에 모종자가 등록되면 recomputeDescendants()로 뒷세대가 자동으로 다시 계산됩니다.
export const FIXED_LINE_THRESHOLD = 8;

export function parseGenNum(gen) {
  if (!gen) return null;
  const m = String(gen).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// seeds: 현재까지 등록된 종자 배열 (parent_code로 부모를 찾기 위함)
export function computeLineage({ parentCode, individualNumber, manualGeneration, manualPedigree, seeds }) {
  parentCode = (parentCode || '').trim();
  individualNumber = (individualNumber || '').trim();
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

  const parent = seeds.find((s) => s.code === parentCode);
  // 모종자가 아직 없음 → 직접 입력값 사용 (등록은 가능)
  if (!parent) return manual({ parentMissing: true });

  const parentGenNum = parseGenNum(parent.generation);
  // 모종자는 있지만 모종자의 세대를 모름 → 추측하지 않고 직접 입력값 사용
  if (parentGenNum === null) return manual({ parentGenUnknown: true });

  const childGenNum = parentGenNum + 1;
  const generation = 'F' + childGenNum;
  const fixedLine = childGenNum >= FIXED_LINE_THRESHOLD;
  const parentPedigree = (parent.pedigree || '').trim();

  // F9 이후: F8까지의 Pedigree를 그대로 물려받음
  if (childGenNum > FIXED_LINE_THRESHOLD) {
    return { generation, pedigree: parentPedigree || manualPedigree, individualNumber, fixedLine, error: null };
  }

  // F2~F8: 모종자 Pedigree 뒤에 개체번호를 붙임
  if (!individualNumber) {
    // 세대는 계산하고, Pedigree는 기존 값 유지
    return { generation, pedigree: manualPedigree, individualNumber, fixedLine, error: 'needIndiv' };
  }
  return {
    generation,
    pedigree: parentPedigree ? `${parentPedigree}-${individualNumber}` : manualPedigree,
    individualNumber,
    fixedLine,
    error: null,
  };
}

// 어떤 종자들(startCodes)이 새로 등록·수정됐을 때, 그 아래 뒷세대들을 모두 다시 계산합니다.
// 화면에서 쓰는 값만 계산하고, 실제 저장은 호출하는 쪽에서 합니다.
// 반환: 바뀐 종자 목록 [{ id, code, generation, pedigree, fixed_line }]
export function recomputeDescendants(startCodes, seeds) {
  const working = seeds.map((s) => ({ ...s }));
  const byParent = new Map();
  for (const s of working) {
    if (!s.parent_code) continue;
    if (!byParent.has(s.parent_code)) byParent.set(s.parent_code, []);
    byParent.get(s.parent_code).push(s);
  }

  const changes = new Map();
  const visited = new Set();
  const queue = [...startCodes];

  while (queue.length) {
    const code = queue.shift();
    if (visited.has(code)) continue; // 순환 참조 방지
    visited.add(code);

    for (const child of byParent.get(code) || []) {
      const r = computeLineage({
        parentCode: child.parent_code,
        individualNumber: child.individual_number,
        manualGeneration: child.generation,
        manualPedigree: child.pedigree,
        seeds: working,
      });
      const next = {
        generation: r.generation || '',
        pedigree: r.pedigree || '',
        fixed_line: !!r.fixedLine,
      };
      if (
        (child.generation || '') !== next.generation ||
        (child.pedigree || '') !== next.pedigree ||
        !!child.fixed_line !== next.fixed_line
      ) {
        Object.assign(child, next);
        changes.set(child.id, { id: child.id, code: child.code, ...next });
      }
      queue.push(child.code);
    }
  }
  return [...changes.values()];
}

// 전체 데이터를 처음부터 다시 계산 (모종자가 없거나 미등록인 '뿌리' 종자부터 시작)
export function recomputeAll(seeds) {
  const codes = new Set(seeds.map((s) => s.code));
  const roots = seeds.filter((s) => !s.parent_code || !codes.has(s.parent_code)).map((s) => s.code);
  return recomputeDescendants(roots, seeds);
}

// 종자 코드에서 대표 코드 추출: 52200-B → 52200, 52200-1 → 52200, 52200 → 52200
export function getBaseCode(code) {
  const m = String(code || '').trim().match(/^(.+)-(B|\d+)$/i);
  return m ? m[1] : String(code || '').trim();
}

// 같은 대표 코드 안에서 정렬: 벌크(B) 먼저, 그다음 싱글 번호순
export function compareMemberCodes(a, b) {
  const sa = String(a).match(/-(B|\d+)$/i)?.[1] || '';
  const sb = String(b).match(/-(B|\d+)$/i)?.[1] || '';
  const rank = (s) => (s === '' ? 0 : /^b$/i.test(s) ? 1 : 2);
  if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb);
  return (parseInt(sa, 10) || 0) - (parseInt(sb, 10) || 0);
}
