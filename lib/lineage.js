// 세대(F1, F2...) 및 Pedigree(예: 530110/530111-2-4) 자동 계산 로직
// F6 이상은 "고정계통"으로 간주하여 Pedigree 갱신을 멈춥니다.
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

  if (!parentCode) {
    const genNum = parseGenNum(manualGeneration);
    return {
      generation: manualGeneration,
      pedigree: manualPedigree,
      individualNumber,
      fixedLine: genNum !== null && genNum >= FIXED_LINE_THRESHOLD,
      error: null,
    };
  }

  const parent = seeds.find((s) => s.code === parentCode);
  if (!parent) {
    const genNum = parseGenNum(manualGeneration);
    return {
      generation: manualGeneration,
      pedigree: manualPedigree,
      individualNumber,
      fixedLine: genNum !== null && genNum >= FIXED_LINE_THRESHOLD,
      parentMissing: true,
      error: null,
    };
  }

  const parentGenNum = parseGenNum(parent.generation) || 1;
  const childGenNum = parentGenNum + 1;
  const generation = 'F' + childGenNum;

  if (parentGenNum >= FIXED_LINE_THRESHOLD || childGenNum >= FIXED_LINE_THRESHOLD) {
    return { generation, pedigree: parent.pedigree || '', individualNumber, fixedLine: true, error: null };
  }
  if (!individualNumber) {
    return { error: '모종자를 지정했다면 개체 번호를 입력해야 Pedigree를 자동으로 계산할 수 있습니다.' };
  }
  return {
    generation,
    pedigree: (parent.pedigree || '') + '-' + individualNumber,
    individualNumber,
    fixedLine: false,
    error: null,
  };
}