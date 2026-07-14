import React, { useRef, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toBlob, toPng } from 'html-to-image';
import { parseDiceLog } from './logParser';
import type { CharLogs, DiceResult, GrowthStats, LogEntry, SanChange, SanHistory, UserStats } from './types';
import './App.css';

type ActiveTab = 'stats' | 'growth' | 'log';
type ChartType = 'pie' | 'bar';
type CopyStatus = 'idle' | 'success' | 'error';
type SortDirection = 'asc' | 'desc';

const RESULT_COLORS = {
  'クリティカル': '#fbbf24',
  'イクストリーム成功': '#34d399',
  'ハード成功': '#60a5fa',
  'レギュラー成功': '#e2e8f0',
  '成功': '#e2e8f0',
  '失敗': '#94a3b8',
  'ファンブル': '#f87171',
} as const;

const RESULT_LABELS = [
  { label: 'クリティカル', key: 'critical', className: 'critical', color: '#fbbf24' },
  { label: 'イクストリーム', key: 'extreme', className: 'extreme', color: '#34d399' },
  { label: 'ハード', key: 'hard', className: 'hard', color: '#60a5fa' },
  { label: 'レギュラー', key: 'regular', className: 'regular', color: '#e2e8f0' },
  { label: '失敗', key: 'failure', className: 'failure', color: '#94a3b8' },
  { label: 'ファンブル', key: 'fumble', className: 'fumble', color: '#f87171' },
] as const;

type ResultKey = (typeof RESULT_LABELS)[number]['key'];
type CharacterSortKey = 'character' | 'rolls' | ResultKey;

const calculatePercentage = (count: number, total: number) => {
  if (total === 0) return '0.0%';
  return `${((count / total) * 100).toFixed(1)}%`;
};

const createRollBins = (entries: LogEntry[]) => {
  const bins = Array.from({ length: 10 }, (_, index) => {
    const start = index * 10 + 1;
    const end = start + 9;
    return { name: `${start}-${end}`, shortName: `${start}-${end}`, value: 0 };
  });

  entries.forEach((entry) => {
    entry.rollValue
      .split(/[\s,]+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => !Number.isNaN(value) && value >= 1 && value <= 100)
      .forEach((value) => {
        bins[Math.min(Math.floor((value - 1) / 10), 9)].value++;
      });
  });

  return bins;
};

const getRoomName = (name: string | null) => {
  if (!name) return '';
  const match = name.match(/^(.*)\[.*\]\.html$/i) ?? name.match(/^(.*)\.html$/i);
  return match ? match[1] : name;
};

const emptyDiceResult: DiceResult = {
  critical: 0,
  extreme: 0,
  hard: 0,
  regular: 0,
  failure: 0,
  fumble: 0,
  sanSuccess: 0,
  sanFailure: 0,
};

const getNormalRollTotal = (stat: DiceResult) => stat.critical + stat.extreme + stat.hard + stat.regular + stat.failure + stat.fumble;
const getResultRate = (stat: DiceResult, key: ResultKey) => {
  const total = getNormalRollTotal(stat);
  return total === 0 ? 0 : stat[key] / total;
};
const sortCharacterNamesByRollCount = (characterNames: string[], stats: UserStats) =>
  [...characterNames].sort((a, b) => getNormalRollTotal(stats[b] ?? emptyDiceResult) - getNormalRollTotal(stats[a] ?? emptyDiceResult) || a.localeCompare(b, 'ja'));

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string }>;
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="custom-tooltip">
      <p style={{ margin: 0 }}>{`${payload[0].name} : ${payload[0].value}回`}</p>
    </div>
  );
};

const ExportControls = ({
  cardRef,
  fileName,
}: {
  cardRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
}) => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const filterForExport = (node: HTMLElement) => !node.classList?.contains('export-controls');

  const resetCopyStatus = () => window.setTimeout(() => setCopyStatus('idle'), 2000);

  const handleCopy = async () => {
    if (!cardRef.current) return;

    try {
      const blob = await toBlob(cardRef.current, { filter: filterForExport });
      if (!blob) return;

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('success');
    } catch (error) {
      console.error('Copy failed:', error);
      setCopyStatus('error');
    } finally {
      resetCopyStatus();
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    try {
      const dataUrl = await toPng(cardRef.current, { filter: filterForExport });
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="export-controls">
      <button className={`export-btn ${copyStatus === 'success' ? 'success' : ''}`} onClick={handleCopy}>
        {copyStatus === 'success' ? 'Copied' : copyStatus === 'error' ? 'Failed' : 'Copy'}
      </button>
      <button className="export-btn" onClick={handleDownload}>
        Save
      </button>
    </div>
  );
};

const StatCard = ({
  charName,
  stat,
  entries,
  sanHistory = [],
  isTotal = false,
}: {
  charName: string;
  stat: DiceResult;
  entries: LogEntry[];
  sanHistory?: SanChange[];
  isTotal?: boolean;
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>('pie');

  const totalSuccess = stat.critical + stat.extreme + stat.hard + stat.regular;
  const totalFailure = stat.failure + stat.fumble;
  const totalNormalRolls = totalSuccess + totalFailure;
  const totalSanRolls = stat.sanSuccess + stat.sanFailure;
  const sanStart = sanHistory[0]?.from;
  const sanEnd = sanHistory.at(-1)?.to;
  const sanChange = sanStart === undefined || sanEnd === undefined ? undefined : sanEnd - sanStart;
  const rollBins = createRollBins(entries);
  const pieData = RESULT_LABELS.map(({ label, key, color }) => ({
    name: label,
    value: stat[key],
    color,
  })).filter((entry) => entry.value > 0);

  return (
    <div ref={cardRef} className={`stat-card ${isTotal ? 'total-card' : ''}`}>
      <div className="card-header">
        <div className="char-name">{charName}</div>
        <div className="total-rolls-badge">Total: {totalNormalRolls} Rolls</div>
      </div>

      <div className="card-body">
        <div className="chart-section">
          <div className="chart-type-toggle">
            <button className={`chart-toggle-btn ${chartType === 'pie' ? 'active' : ''}`} onClick={() => setChartType('pie')}>
              円グラフ
            </button>
            <button className={`chart-toggle-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>
              出目分布
            </button>
          </div>

          <div className="chart-container">
            {chartType === 'pie' ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rollBins} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="shortName" tick={{ fill: 'var(--text-secondary)', fontSize: 8 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#60a5fa" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="summary-stats">
            <div className="summary-item">
              <span className="summary-label">Success</span>
              <span className="summary-value success">{calculatePercentage(totalSuccess, totalNormalRolls)}</span>
              {sanChange !== undefined && (
                <div className={`san-summary ${sanChange < 0 ? 'loss' : sanChange > 0 ? 'recovery' : 'neutral'}`} aria-label={`SAN ${sanStart} から ${sanEnd}、${sanChange < 0 ? `${Math.abs(sanChange)} 減少` : sanChange > 0 ? `${sanChange} 回復` : '変化なし'}`}>
                  <span>{sanStart} → {sanEnd}</span>
                  <strong>{sanChange < 0 ? `総SAN減少 -${Math.abs(sanChange)}` : sanChange > 0 ? `総SAN回復 +${sanChange}` : 'SAN変化 0'}</strong>
                </div>
              )}
            </div>
            <div className="summary-item">
              <span className="summary-label">Failure</span>
              <span className="summary-value fail">{calculatePercentage(totalFailure, totalNormalRolls)}</span>
            </div>
          </div>
        </div>

        <div className="details-section">
          <div className="result-list">
            {RESULT_LABELS.map(({ label, key, className }, index) => (
              <React.Fragment key={key}>
                {index === 4 && <div className="result-divider" />}
                <div className="result-item">
                  <div className="label-group">
                    <span className={`indicator ${className}`} />
                    <span className="result-label">{label}</span>
                  </div>
                  <div className="value-group">
                    <span className="result-percentage">{calculatePercentage(stat[key], totalNormalRolls)}</span>
                    <span className="result-count">({stat[key]})</span>
                  </div>
                </div>
              </React.Fragment>
            ))}

            <div className="result-item san-header">SANITY CHECK</div>
            <div className="result-item san">
              <div className="label-group">
                <span className="indicator san" />
                <span className="result-label">成功</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.sanSuccess, totalSanRolls)}</span>
                <span className="result-count">({stat.sanSuccess})</span>
              </div>
            </div>
            <div className="result-item san">
              <div className="label-group">
                <span className="indicator failure" />
                <span className="result-label">失敗</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.sanFailure, totalSanRolls)}</span>
                <span className="result-count">({stat.sanFailure})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ExportControls cardRef={cardRef} fileName={`DiceLog_${charName}`} />
    </div>
  );
};

const GrowthCard = ({ charName, skills }: { charName: string; skills: string[] }) => {
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set());

  const toggleSkill = (skill: string) => {
    setCheckedSkills((current) => {
      const next = new Set(current);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  return (
    <div className="stat-card growth-card">
      <div className="card-header">
        <div className="char-name">{charName}</div>
        <div className="total-rolls-badge">成功技能: {skills.length}種</div>
      </div>
      <div className="growth-body">
        {skills.length > 0 ? (
          <div className="skill-list">
            {skills.map((skill) => {
              const isChecked = checkedSkills.has(skill);
              return (
                <label key={skill} className={`skill-item ${isChecked ? 'checked' : ''}`}>
                  <input className="skill-checkbox" type="checkbox" checked={isChecked} onChange={() => toggleSkill(skill)} />
                  <span className="skill-name">{skill}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="no-skills">一度も成功した技能がありません</div>
        )}
      </div>
    </div>
  );
};

const ScrollContainer = ({ children }: { children: React.ReactNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBy = (left: number) => scrollRef.current?.scrollBy({ left, behavior: 'smooth' });

  return (
    <div className="scroll-wrapper">
      <button className="scroll-btn left" onClick={() => scrollBy(-500)} aria-label="Scroll left">
        &lt;
      </button>
      <div className="characters-scroll" ref={scrollRef}>
        {children}
      </div>
      <button className="scroll-btn right" onClick={() => scrollBy(500)} aria-label="Scroll right">
        &gt;
      </button>
    </div>
  );
};

function App() {
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({});
  const [growthStats, setGrowthStats] = useState<GrowthStats>({});
  const [charLogs, setCharLogs] = useState<CharLogs>({});
  const [sanHistory, setSanHistory] = useState<SanHistory>({});
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stats');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [excludedTabs, setExcludedTabs] = useState<Set<string>>(new Set());
  const [excludeModifiedRolls, setExcludeModifiedRolls] = useState(true);
  const [excludedCharacters, setExcludedCharacters] = useState<Set<string>>(new Set());
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [characterSort, setCharacterSort] = useState<{ key: CharacterSortKey; direction: SortDirection }>({ key: 'rolls', direction: 'desc' });

  const applyAnalysis = (html: string, nextExcludedTabs = excludedTabs, nextExcludeModifiedRolls = excludeModifiedRolls) => {
    const parsed = parseDiceLog(html, {
      excludedTabs: nextExcludedTabs,
      excludeModifiedRolls: nextExcludeModifiedRolls,
    });

    setStats(parsed.stats);
    setGrowthStats(parsed.growthStats);
    setCharLogs(parsed.charLogs);
    setSanHistory(parsed.sanHistory);
    setAvailableTabs(parsed.availableTabs);
    setSelectedCharacter((current) => (current && parsed.stats[current] ? current : Object.keys(parsed.stats).sort()[0] ?? null));
  };

  const resetApp = () => {
    setRawHtml(null);
    setStats({});
    setGrowthStats({});
    setCharLogs({});
    setSanHistory({});
    setFileName(null);
    setActiveTab('stats');
    setAvailableTabs([]);
    setExcludedTabs(new Set());
    setExcludeModifiedRolls(true);
    setExcludedCharacters(new Set());
    setSelectedCharacter(null);
  };

  const toggleCharacterFilter = (charName: string) => {
    setExcludedCharacters((current) => {
      const next = new Set(current);
      if (next.has(charName)) {
        next.delete(charName);
      } else {
        next.add(charName);
      }
      return next;
    });
  };

  const changeCharacterSort = (key: CharacterSortKey) => {
    setCharacterSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }

      return { key, direction: key === 'character' ? 'asc' : 'desc' };
    });
  };

  const toggleTabFilter = (tab: string) => {
    const nextExcludedTabs = new Set(excludedTabs);
    if (nextExcludedTabs.has(tab)) {
      nextExcludedTabs.delete(tab);
    } else {
      nextExcludedTabs.add(tab);
    }
    setExcludedTabs(nextExcludedTabs);
    if (rawHtml) applyAnalysis(rawHtml, nextExcludedTabs);
  };

  const toggleExcludeModified = () => {
    const nextValue = !excludeModifiedRolls;
    setExcludeModifiedRolls(nextValue);
    if (rawHtml) applyAnalysis(rawHtml, excludedTabs, nextValue);
  };

  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const html = event.target?.result;
      if (typeof html !== 'string') return;

      setRawHtml(html);
      setExcludedTabs(new Set());
      setExcludedCharacters(new Set());
      applyAnalysis(html, new Set(), excludeModifiedRolls);
    };
    reader.readAsText(file);
  };

  const activeStats = Object.entries(stats).filter(([charName]) => !excludedCharacters.has(charName));
  const sortedCharacterNames = sortCharacterNamesByRollCount(Object.keys(stats), stats);
  const sortedActiveStats = [...activeStats].sort(([nameA, statA], [nameB, statB]) => {
    const direction = characterSort.direction === 'asc' ? 1 : -1;
    let comparison: number;

    if (characterSort.key === 'character') {
      comparison = nameA.localeCompare(nameB, 'ja');
    } else if (characterSort.key === 'rolls') {
      comparison = getNormalRollTotal(statA) - getNormalRollTotal(statB);
    } else {
      comparison = getResultRate(statA, characterSort.key) - getResultRate(statB, characterSort.key);
      if (comparison === 0) {
        comparison = statA[characterSort.key] - statB[characterSort.key];
      }
    }

    return comparison * direction || getNormalRollTotal(statB) - getNormalRollTotal(statA) || nameA.localeCompare(nameB, 'ja');
  });
  const hasStats = Object.keys(stats).length > 0;

  const renderStatsDashboard = () => {
    const totalStats = activeStats.reduce<DiceResult>(
      (total, [, stat]) => ({
        critical: total.critical + stat.critical,
        extreme: total.extreme + stat.extreme,
        hard: total.hard + stat.hard,
        regular: total.regular + stat.regular,
        failure: total.failure + stat.failure,
        fumble: total.fumble + stat.fumble,
        sanSuccess: total.sanSuccess + stat.sanSuccess,
        sanFailure: total.sanFailure + stat.sanFailure,
      }),
      emptyDiceResult,
    );
    const totalRolls = getNormalRollTotal(totalStats);
    const totalPieData = RESULT_LABELS.map(({ label, key, color }) => ({
      name: label,
      value: totalStats[key],
      color,
      key,
    })).filter((entry) => entry.value > 0);
    const totalSuccess = totalStats.critical + totalStats.extreme + totalStats.hard + totalStats.regular;
    const totalFailure = totalStats.failure + totalStats.fumble;
    const totalSanRolls = totalStats.sanSuccess + totalStats.sanFailure;
    const selectedEntry = sortedActiveStats.find(([charName]) => charName === selectedCharacter) ?? sortedActiveStats[0];

    return (
      <div className="dashboard list-dashboard">
        <div className="total-overview">
          <div className="total-chart-metric" aria-label="全体の判定結果内訳">
            <div className="total-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={totalPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={56} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false}>
                    {totalPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="total-chart-center">
                <strong>{totalRolls}</strong>
                <span>Rolls</span>
              </div>
            </div>
            <div className="total-chart-legend">
              {RESULT_LABELS.map(({ label, key, color }) => (
                <div key={key} className="total-legend-item">
                  <span className="total-legend-label"><i style={{ backgroundColor: color }} />{label}</span>
                  <span>{totalStats[key]} / {calculatePercentage(totalStats[key], totalRolls)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="total-result-rates" aria-label="判定結果ごとの割合">
            <div className="total-key-metric">
              <span>Success</span>
              <strong className="metric-success">{calculatePercentage(totalSuccess, totalRolls)}</strong>
              <small>{totalSuccess} rolls</small>
            </div>
            <div className="total-key-metric">
              <span>Failure</span>
              <strong className="metric-failure">{calculatePercentage(totalFailure, totalRolls)}</strong>
              <small>{totalFailure} rolls</small>
            </div>
            <div className="total-key-metric">
              <span>SANC</span>
              <strong>{calculatePercentage(totalStats.sanSuccess, totalSanRolls)}</strong>
              <small>{totalSanRolls} rolls</small>
            </div>
          </div>
        </div>

        {selectedEntry ? (
          <div className="dashboard-workbench">
            <section className="character-list-panel" aria-label="キャラクター一覧">
              <div className="panel-header">
                <div>
                  <span className="panel-eyebrow">Characters</span>
                  <h2>キャラクター一覧</h2>
                </div>
                <span className="panel-count">{sortedActiveStats.length}件</span>
              </div>
              <div className="character-table" role="table" aria-label="キャラクター別ダイス集計">
                <div className="character-table-body">
                  <div className="character-table-header" role="row">
                    <button
                      className={`character-sort-button ${characterSort.key === 'character' ? 'active' : ''}`}
                      type="button"
                      onClick={() => changeCharacterSort('character')}
                      aria-label={`キャラクター名で${characterSort.key === 'character' && characterSort.direction === 'asc' ? '降順' : '昇順'}に並び替え`}
                    >
                      <span>キャラクター</span>
                      {characterSort.key === 'character' && <span className="sort-indicator">{characterSort.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                    <button
                      className={`character-sort-button numeric ${characterSort.key === 'rolls' ? 'active' : ''}`}
                      type="button"
                      onClick={() => changeCharacterSort('rolls')}
                      aria-label={`ロール数で${characterSort.key === 'rolls' && characterSort.direction === 'desc' ? '昇順' : '降順'}に並び替え`}
                    >
                      <span>Rolls</span>
                      {characterSort.key === 'rolls' && <span className="sort-indicator">{characterSort.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                    {RESULT_LABELS.map(({ label, key }) => (
                      <button
                        key={key}
                        className={`character-sort-button numeric ${characterSort.key === key ? 'active' : ''}`}
                        type="button"
                        onClick={() => changeCharacterSort(key)}
                        aria-label={`${label}率で${characterSort.key === key && characterSort.direction === 'desc' ? '昇順' : '降順'}に並び替え`}
                      >
                        <span>{label}</span>
                        {characterSort.key === key && <span className="sort-indicator">{characterSort.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    ))}
                  </div>
                  {sortedActiveStats.map(([charName, stat]) => {
                    const rollTotal = getNormalRollTotal(stat);
                    const isSelected = selectedEntry[0] === charName;

                    return (
                      <button
                        key={charName}
                        className={`character-table-row ${isSelected ? 'selected' : ''}`}
                        type="button"
                        onClick={() => setSelectedCharacter(charName)}
                        role="row"
                        aria-pressed={isSelected}
                      >
                        <span className="character-cell-name" title={charName}>
                          {charName}
                        </span>
                        <span>{rollTotal}</span>
                        {RESULT_LABELS.map(({ key, color }) => (
                          <span key={key} style={{ color }}>{calculatePercentage(stat[key], rollTotal)}</span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="detail-panel" aria-label="選択キャラクター詳細">
              <StatCard charName={selectedEntry[0]} stat={selectedEntry[1]} entries={charLogs[selectedEntry[0]] ?? []} sanHistory={sanHistory[selectedEntry[0]]} />
            </section>
          </div>
        ) : (
          <div className="empty-state">表示対象のキャラクターがありません。</div>
        )}
      </div>
    );
  };

  const renderGrowthChecker = () => (
    <div className="dashboard" style={{ alignItems: 'center' }}>
      <ScrollContainer>
        {sortCharacterNamesByRollCount(Object.keys(growthStats).filter((charName) => !excludedCharacters.has(charName)), stats)
          .map((charName) => (
            <GrowthCard key={charName} charName={charName} skills={Array.from(growthStats[charName])} />
          ))}
      </ScrollContainer>
    </div>
  );

  const renderLogViewer = () => (
    <div className="dashboard">
      <ScrollContainer>
        {sortCharacterNamesByRollCount(Object.keys(charLogs).filter((charName) => !excludedCharacters.has(charName)), stats)
          .map((charName) => {
            const entries = charLogs[charName];
            const sanCount = entries.filter((entry) => entry.isSan).length;
            const normalCount = entries.length - sanCount;

            return (
              <div key={charName} className="stat-card log-card">
                <div className="card-header">
                  <div className="char-name">{charName}</div>
                  <div className="total-rolls-badge">
                    {normalCount} Rolls / {sanCount} SANc
                  </div>
                </div>
                <div className="log-body">
                  <div className="log-table-header">
                    <span>Tab</span>
                    <span>技能</span>
                    <span>判定 / 出目</span>
                    <span>結果</span>
                  </div>
                  {entries.map((entry, index) => (
                    <div key={`${entry.command}-${index}`} className={`log-row ${entry.isSuccess ? 'success-row' : 'fail-row'}`}>
                      <span className="log-tab">[{entry.tab}]</span>
                      <span className="log-skill">
                        {entry.skill}
                        {entry.isSan ? ' [SAN]' : ''}
                        {entry.isModified ? ' *' : ''}
                      </span>
                      <span className="log-command">
                        {entry.command}
                        {entry.rollValue ? <span className="log-roll-value"> ＞ {entry.rollValue}</span> : null}
                      </span>
                      <span className="log-result" style={{ color: RESULT_COLORS[entry.result] }}>
                        {entry.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </ScrollContainer>
    </div>
  );

  return (
    <div className="app-container">
      <header>
        <h1 className="header-title">DiceLog</h1>
        <p className="header-subtitle">Analyzer for ccfolia logs</p>
        {hasStats && fileName && <div className="room-name-badge">{getRoomName(fileName)}</div>}
      </header>

      <main className="main-content">
        {hasStats && (
          <div className="controls-header">
            <div className="tabs-container">
              <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
                Dashboard
              </button>
              <button className={`tab-btn ${activeTab === 'growth' ? 'active' : ''}`} onClick={() => setActiveTab('growth')}>
                Growth Checker
              </button>
              <button className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
                Log
              </button>
              <button className="tab-btn reset-btn" onClick={resetApp}>
                Reset File
              </button>
            </div>

            {availableTabs.length > 0 && (
              <div className="filter-container">
                <span className="filter-label">解析対象タブ:</span>
                <div className="filter-options">
                  {availableTabs.map((tab) => {
                    const isExcluded = excludedTabs.has(tab);
                    return (
                      <label key={tab} className={`filter-chip ${isExcluded ? 'excluded' : 'included'}`}>
                        <input type="checkbox" checked={!isExcluded} onChange={() => toggleTabFilter(tab)} />
                        [{tab}]
                      </label>
                    );
                  })}
                </div>
                {activeTab === 'growth' && (
                  <>
                    <span className="filter-divider">|</span>
                    <label className={`filter-chip ${excludeModifiedRolls ? 'included' : 'excluded'}`}>
                      <input type="checkbox" checked={excludeModifiedRolls} onChange={toggleExcludeModified} />
                      補正ロール除外
                    </label>
                  </>
                )}
              </div>
            )}

          </div>
        )}

        {!hasStats && (
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (event.dataTransfer.files.length > 0) {
                handleFileUpload(event.dataTransfer.files[0]);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
          >
            <input className="file-input" type="file" accept=".html" onChange={(event) => event.target.files?.[0] && handleFileUpload(event.target.files[0])} />
            <div className="upload-content">
              <div className="upload-icon">⚲</div>
              <h3>Drag & Drop log file</h3>
              <p>Click to browse</p>
            </div>
          </div>
        )}

        {hasStats && (
          <div className="analysis-layout">
            <aside className="character-filter-sidebar" aria-label="表示キャラクターフィルター">
              <div className="sidebar-header">
                <div>
                  <span className="panel-eyebrow">Character Filter</span>
                  <h2>表示キャラクター</h2>
                </div>
                <span className="panel-count">{activeStats.length}/{sortedCharacterNames.length}</span>
              </div>
              <div className="sidebar-actions">
                <button className="filter-action-btn" onClick={() => setExcludedCharacters(new Set())}>全選択</button>
                <button className="filter-action-btn" onClick={() => setExcludedCharacters(new Set(Object.keys(stats)))}>全解除</button>
              </div>
              <div className="character-filter-list">
                {sortedCharacterNames.map((charName) => {
                  const isExcluded = excludedCharacters.has(charName);
                  return (
                    <label key={charName} className={`character-filter-option ${isExcluded ? 'excluded' : 'included'}`}>
                      <input type="checkbox" checked={!isExcluded} onChange={() => toggleCharacterFilter(charName)} />
                      <span className="character-filter-name" title={charName}>{charName}</span>
                      <span className="character-filter-rolls">{getNormalRollTotal(stats[charName])}</span>
                    </label>
                  );
                })}
              </div>
            </aside>
            <div className="analysis-content">
              {activeTab === 'stats' && renderStatsDashboard()}
              {activeTab === 'growth' && renderGrowthChecker()}
              {activeTab === 'log' && renderLogViewer()}
            </div>
          </div>
        )}

        {!hasStats && fileName && <div className="empty-state">対象となるダイスログが見つかりませんでした。</div>}
      </main>
    </div>
  );
}

export default App;
