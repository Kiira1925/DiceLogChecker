import type { AnalysisOptions, CharLogs, DiceResult, GrowthStats, ParsedLog, RollOutcome, UserStats } from './types';

const SUCCESS_RESULTS: RollOutcome[] = [
  'クリティカル',
  'イクストリーム成功',
  'ハード成功',
  'レギュラー成功',
  '成功',
];

const EXCLUDED_GROWTH_SKILLS = new Set([
  '正気度ロール',
  'STR',
  'CON',
  'POW',
  'DEX',
  'APP',
  'INT',
  'EDU',
  '幸運',
  'アイデア',
  '知識',
  'クトゥルフ神話',
  '信用',
]);

const createEmptyResult = (): DiceResult => ({
  critical: 0,
  extreme: 0,
  hard: 0,
  regular: 0,
  failure: 0,
  fumble: 0,
  sanSuccess: 0,
  sanFailure: 0,
});

const getOrCreateCharacter = (
  charName: string,
  stats: UserStats,
  growthStats: GrowthStats,
  charLogs: CharLogs,
) => {
  stats[charName] ??= createEmptyResult();
  growthStats[charName] ??= new Set();
  charLogs[charName] ??= [];
};

const normalizeSkillName = (skillName: string) => skillName.toUpperCase();

const isGrowthExcludedSkill = (skillName: string) => EXCLUDED_GROWTH_SKILLS.has(normalizeSkillName(skillName));

const getSkillName = (rollText: string) => rollText.match(/[【＜](.+?)[】＞]/)?.[1];

const getRollCommand = (rollText: string) => (
  rollText.match(/^([sS]?[cC][cC][^\s【＜]*)/) ?? rollText.match(/^(\d+[dD]\d+[^\s【＜]*)/)
)?.[1] ?? '';

const getRollValue = (rollText: string) => (
  rollText.match(/＞\s*([\d,\s]+?)\s*＞\s*(?:クリティカル|イクストリーム成功|ハード成功|レギュラー成功|成功|失敗|ファンブル)/)?.[1] ?? ''
).trim();

const isModifiedRoll = (rollText: string) => {
  const hasBonusDice = /^s?CC[1-9][0-9]*<=/i.test(rollText);
  const formula = rollText.match(/^(?:s?CC\d*|1[dD]100)<=\(?([^\s【＜)]+)/i)?.[1] ?? '';
  return hasBonusDice || /[+*]/.test(formula);
};

const splitContinuousRolls = (text: string): Array<{ text: string; index?: number }> => {
  if (!text.includes('#1')) {
    return [{ text }];
  }

  const parts = text.split(/#\d+\n?/);
  const command = (parts[0] ?? '').replace(/^x\d+\s*/i, '').trim();

  return parts.slice(1).flatMap((part, index) => {
    const trimmed = part.trim();
    return trimmed ? [{ text: `${command} ${trimmed}`, index: index + 1 }] : [];
  });
};

const countResult = (stat: DiceResult, result: RollOutcome, isSan: boolean, isSuccess: boolean) => {
  if (isSan) {
    if (isSuccess) {
      stat.sanSuccess++;
    } else {
      stat.sanFailure++;
    }
    return;
  }

  if (result === 'クリティカル') stat.critical++;
  else if (result === 'イクストリーム成功') stat.extreme++;
  else if (result === 'ハード成功') stat.hard++;
  else if (result === 'レギュラー成功' || result === '成功') stat.regular++;
  else if (result === '失敗') stat.failure++;
  else if (result === 'ファンブル') stat.fumble++;
};

export const parseDiceLog = (htmlContent: string, options: AnalysisOptions): ParsedLog => {
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  const stats: UserStats = {};
  const growthStats: GrowthStats = {};
  const charLogs: CharLogs = {};
  const tabs = new Set<string>();

  doc.querySelectorAll('p').forEach((paragraph) => {
    const spans = paragraph.querySelectorAll('span');
    if (spans.length < 3) return;

    const tabName = (spans[0].textContent?.trim() ?? '').replace(/[[\]【】]/g, '');
    if (tabName) tabs.add(tabName);
    if (tabName && options.excludedTabs.has(tabName)) return;

    const charName = spans[1].textContent?.trim() ?? '';
    const text = spans[2].textContent?.trim() ?? '';

    splitContinuousRolls(text).forEach(({ text: rollText, index }) => {
      const isDiceRoll = /(s?CC(?:\d+|-?\d*)?<=|1[dD]100<=)/i.test(rollText);
      const result = rollText.match(/＞\s*(クリティカル|イクストリーム成功|ハード成功|レギュラー成功|成功|失敗|ファンブル)/)?.[1] as RollOutcome | undefined;
      if (!isDiceRoll || !result) return;

      getOrCreateCharacter(charName, stats, growthStats, charLogs);

      const isSan = rollText.includes('【正気度ロール】');
      const isSuccess = SUCCESS_RESULTS.includes(result);
      const modified = isModifiedRoll(rollText);
      const skill = getSkillName(rollText);
      const skillLabel = skill ?? (isSan ? '正気度ロール' : '-');
      const commandSuffix = index === undefined ? '' : ` #${index}`;

      charLogs[charName].push({
        tab: tabName,
        skill: skillLabel,
        command: `${getRollCommand(rollText)}${commandSuffix}`,
        rollValue: getRollValue(rollText),
        result,
        isSuccess,
        isSan,
        isModified: modified,
      });

      if (isSuccess && skill && !isGrowthExcludedSkill(skill) && !(options.excludeModifiedRolls && modified)) {
        growthStats[charName].add(skill);
      }

      countResult(stats[charName], result, isSan, isSuccess);
    });
  });

  return {
    stats,
    growthStats,
    charLogs,
    availableTabs: Array.from(tabs),
  };
};
