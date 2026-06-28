export type DiceResult = {
  critical: number;
  extreme: number;
  hard: number;
  regular: number;
  failure: number;
  fumble: number;
  sanSuccess: number;
  sanFailure: number;
};

export type UserStats = Record<string, DiceResult>;
export type GrowthStats = Record<string, Set<string>>;

export type RollOutcome =
  | 'クリティカル'
  | 'イクストリーム成功'
  | 'ハード成功'
  | 'レギュラー成功'
  | '成功'
  | '失敗'
  | 'ファンブル';

export type LogEntry = {
  tab: string;
  skill: string;
  command: string;
  rollValue: string;
  result: RollOutcome;
  isSuccess: boolean;
  isSan: boolean;
  isModified: boolean;
};

export type CharLogs = Record<string, LogEntry[]>;

export type ParsedLog = {
  stats: UserStats;
  growthStats: GrowthStats;
  charLogs: CharLogs;
  availableTabs: string[];
};

export type AnalysisOptions = {
  excludedTabs: Set<string>;
  excludeModifiedRolls: boolean;
};
