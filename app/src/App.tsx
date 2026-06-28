import React, { useState, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { toPng, toBlob } from 'html-to-image';
import './App.css';

type DiceResult = {
  critical: number;
  extreme: number;
  hard: number;
  regular: number;
  failure: number;
  fumble: number;
  sanSuccess: number;
  sanFailure: number;
};

type UserStats = Record<string, DiceResult>;
type GrowthStats = Record<string, Set<string>>;

type LogEntry = {
  tab: string;
  skill: string;
  command: string;
  rollValue: string;
  result: string;
  isSuccess: boolean;
  isSan: boolean;
  isModified: boolean;
};
type CharLogs = Record<string, LogEntry[]>;

const calculatePercentage = (count: number, total: number) => {
  if (total === 0) return '0.0%';
  return ((count / total) * 100).toFixed(1) + '%';
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p style={{ margin: 0 }}>{`${payload[0].name} : ${payload[0].value}回`}</p>
      </div>
    );
  }
  return null;
};

// 共通のエクスポートボタンコンポーネント
const ExportControls = ({ cardRef, fileName }: { cardRef: React.RefObject<HTMLDivElement | null>, fileName: string }) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const filterForExport = (node: HTMLElement) => {
    return !node.classList?.contains('export-controls');
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;
    try {
      const blob = await toBlob(cardRef.current, { filter: filterForExport as any });
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopyStatus('success');
        setTimeout(() => setCopyStatus('idle'), 2000);
      }
    } catch (e) {
      console.error('Copy failed:', e);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { filter: filterForExport as any });
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  return (
    <div className="export-controls">
      <button
        className={`export-btn ${copyStatus === 'success' ? 'success' : ''}`}
        onClick={handleCopy}
      >
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
  isTotal = false
}: {
  charName: string;
  stat: DiceResult;
  entries: LogEntry[];
  isTotal?: boolean;
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

  const totalSuccess = stat.critical + stat.extreme + stat.hard + stat.regular;
  const totalFailure = stat.failure + stat.fumble;
  const totalNormalRolls = totalSuccess + totalFailure;
  const totalSanRolls = stat.sanSuccess + stat.sanFailure;

  const pieData = [
    { name: 'クリティカル', value: stat.critical, color: '#fbbf24' },
    { name: 'イクストリーム', value: stat.extreme, color: '#34d399' },
    { name: 'ハード', value: stat.hard, color: '#60a5fa' },
    { name: 'レギュラー', value: stat.regular, color: '#e2e8f0' },
    { name: '失敗', value: stat.failure, color: '#94a3b8' },
    { name: 'ファンブル', value: stat.fumble, color: '#f87171' },
  ].filter(d => d.value > 0);

  // 1d100の出目分布を集計 (1-10, 11-20, ..., 91-100)
  const bins = [
    { name: '1-10', shortName: '1-10', value: 0 },
    { name: '11-20', shortName: '11-20', value: 0 },
    { name: '21-30', shortName: '21-30', value: 0 },
    { name: '31-40', shortName: '31-40', value: 0 },
    { name: '41-50', shortName: '41-50', value: 0 },
    { name: '51-60', shortName: '51-60', value: 0 },
    { name: '61-70', shortName: '61-70', value: 0 },
    { name: '71-80', shortName: '71-80', value: 0 },
    { name: '81-90', shortName: '81-90', value: 0 },
    { name: '91-100', shortName: '91-100', value: 0 },
  ];

  if (entries) {
    entries.forEach(entry => {
      if (entry.rollValue) {
        const values = entry.rollValue.split(/[\s,]+/).map(v => parseInt(v, 10));
        values.forEach(val => {
          if (!isNaN(val) && val >= 1 && val <= 100) {
            const binIndex = Math.min(Math.floor((val - 1) / 10), 9);
            bins[binIndex].value++;
          }
        });
      }
    });
  }

  return (
    <div ref={cardRef} className={`stat-card ${isTotal ? 'total-card' : ''}`}>
      <div className="card-header">
        <div className="char-name">{charName}</div>
        <div className="total-rolls-badge">Total: {totalNormalRolls} Rolls</div>
      </div>

      <div className="card-body">
        <div className="chart-section">
          {/* グラフ切り替えトグル */}
          <div className="chart-type-toggle">
            <button
              className={`chart-toggle-btn ${chartType === 'pie' ? 'active' : ''}`}
              onClick={() => setChartType('pie')}
            >
              円グラフ
            </button>
            <button
              className={`chart-toggle-btn ${chartType === 'bar' ? 'active' : ''}`}
              onClick={() => setChartType('bar')}
            >
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
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bins} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
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
            </div>
            <div className="summary-item">
              <span className="summary-label">Failure</span>
              <span className="summary-value fail">{calculatePercentage(totalFailure, totalNormalRolls)}</span>
            </div>
          </div>
        </div>

        <div className="details-section">
          <div className="result-list">
            <div className="result-item">
              <div className="label-group">
                <span className="indicator critical"></span>
                <span className="result-label">クリティカル</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.critical, totalNormalRolls)}</span>
                <span className="result-count">({stat.critical})</span>
              </div>
            </div>
            <div className="result-item">
              <div className="label-group">
                <span className="indicator extreme"></span>
                <span className="result-label">イクストリーム</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.extreme, totalNormalRolls)}</span>
                <span className="result-count">({stat.extreme})</span>
              </div>
            </div>
            <div className="result-item">
              <div className="label-group">
                <span className="indicator hard"></span>
                <span className="result-label">ハード</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.hard, totalNormalRolls)}</span>
                <span className="result-count">({stat.hard})</span>
              </div>
            </div>
            <div className="result-item">
              <div className="label-group">
                <span className="indicator regular"></span>
                <span className="result-label">レギュラー</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.regular, totalNormalRolls)}</span>
                <span className="result-count">({stat.regular})</span>
              </div>
            </div>
            <div className="result-divider"></div>
            <div className="result-item">
              <div className="label-group">
                <span className="indicator failure"></span>
                <span className="result-label">失敗</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.failure, totalNormalRolls)}</span>
                <span className="result-count">({stat.failure})</span>
              </div>
            </div>
            <div className="result-item">
              <div className="label-group">
                <span className="indicator fumble"></span>
                <span className="result-label">ファンブル</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.fumble, totalNormalRolls)}</span>
                <span className="result-count">({stat.fumble})</span>
              </div>
            </div>

            <div className="result-item san-header">
              SANITY CHECK
            </div>
            <div className="result-item san">
              <div className="label-group">
                <span className="indicator san"></span>
                <span className="result-label">成功</span>
              </div>
              <div className="value-group">
                <span className="result-percentage">{calculatePercentage(stat.sanSuccess, totalSanRolls)}</span>
                <span className="result-count">({stat.sanSuccess})</span>
              </div>
            </div>
            <div className="result-item san">
              <div className="label-group">
                <span className="indicator failure"></span>
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
    const newChecked = new Set(checkedSkills);
    if (newChecked.has(skill)) {
      newChecked.delete(skill);
    } else {
      newChecked.add(skill);
    }
    setCheckedSkills(newChecked);
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
            {skills.map(skill => {
              const isChecked = checkedSkills.has(skill);
              return (
                <label key={skill} className={`skill-item ${isChecked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="skill-checkbox"
                    checked={isChecked}
                    onChange={() => toggleSkill(skill)}
                  />
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

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -500, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 500, behavior: 'smooth' });
    }
  };

  return (
    <div className="scroll-wrapper">
      <button className="scroll-btn left" onClick={scrollLeft} aria-label="Scroll left">
        &lt;
      </button>
      <div className="characters-scroll" ref={scrollRef}>
        {children}
      </div>
      <button className="scroll-btn right" onClick={scrollRight} aria-label="Scroll right">
        &gt;
      </button>
    </div>
  );
};

function App() {
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({});
  const [growthStats, setGrowthStats] = useState<GrowthStats>({});
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'growth' | 'log'>('stats');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [excludedTabs, setExcludedTabs] = useState<Set<string>>(new Set());
  const [excludeModifiedRolls, setExcludeModifiedRolls] = useState(true);
  const [charLogs, setCharLogs] = useState<CharLogs>({});
  const [excludedCharacters, setExcludedCharacters] = useState<Set<string>>(new Set());

  const resetApp = () => {
    setRawHtml(null);
    setStats({});
    setGrowthStats({});
    setFileName(null);
    setActiveTab('stats');
    setAvailableTabs([]);
    setExcludedTabs(new Set());
    setExcludeModifiedRolls(true);
    setCharLogs({});
    setExcludedCharacters(new Set());
  };

  const toggleCharacterFilter = (charName: string) => {
    const newExcluded = new Set(excludedCharacters);
    if (newExcluded.has(charName)) {
      newExcluded.delete(charName);
    } else {
      newExcluded.add(charName);
    }
    setExcludedCharacters(newExcluded);
  };

  const selectAllCharacters = () => {
    setExcludedCharacters(new Set());
  };

  const deselectAllCharacters = () => {
    setExcludedCharacters(new Set(Object.keys(stats)));
  };

  const processHtml = (htmlContent: string, currentExcluded: Set<string>, excludeModified: boolean) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const paragraphs = doc.querySelectorAll('p');

    const newStats: UserStats = {};
    const newGrowth: GrowthStats = {};
    const newCharLogs: CharLogs = {};
    const tabsSet = new Set<string>();

    paragraphs.forEach((p) => {
      const spans = p.querySelectorAll('span');
      if (spans.length >= 3) {
        // Extract Tab Name
        const tabStr = spans[0].textContent?.trim() || '';
        const tabName = tabStr.replace(/[\[\]【】]/g, '');
        if (tabName) {
          tabsSet.add(tabName);
        }

        // If this tab is excluded, skip processing this roll
        if (tabName && currentExcluded.has(tabName)) {
          return;
        }

        const charName = spans[1].textContent?.trim() || '';
        const text = spans[2].textContent?.trim() || '';

        // 連続ダイス（x2など）の分割処理
        const isContinuous = text.includes('#1');
        const rollTexts: { text: string; index?: number }[] = [];

        if (isContinuous) {
          const parts = text.split(/#\d+\n?/);
          const cmdPart = parts[0] || '';
          const cleanCmd = cmdPart.replace(/^x\d+\s*/i, '').trim();

          for (let i = 1; i < parts.length; i++) {
            const part = parts[i] || '';
            const trimmedPart = part.trim();
            if (trimmedPart) {
              rollTexts.push({
                text: `${cleanCmd} ${trimmedPart}`,
                index: i
              });
            }
          }
        } else {
          rollTexts.push({ text });
        }

        rollTexts.forEach(({ text: rollText, index }) => {
          const isSanCheck = rollText.includes('【正気度ロール】');
          const isDiceRoll = rollText.match(/(s?CC(?:\d+|-?\d*)?<=|1[dD]100<=)/i);
          const resultMatch = rollText.match(/＞\s*(クリティカル|イクストリーム成功|ハード成功|レギュラー成功|成功|失敗|ファンブル)/);

          if (isDiceRoll && resultMatch) {
            const resultStr = resultMatch[1];

            if (!newStats[charName]) {
              newStats[charName] = {
                critical: 0, extreme: 0, hard: 0, regular: 0,
                failure: 0, fumble: 0, sanSuccess: 0, sanFailure: 0,
              };
            }
            if (!newGrowth[charName]) {
              newGrowth[charName] = new Set();
            }
            if (!newCharLogs[charName]) {
              newCharLogs[charName] = [];
            }

            const isSuccess = ['クリティカル', 'イクストリーム成功', 'ハード成功', 'レギュラー成功', '成功'].includes(resultStr);

            // 補正込み判定の検出
            // 1. ボーナス・ペナルティダイス(CC1<=, sCC2<=など)は補正ありとする
            const hasBonusDice = /^s?CC[1-9][0-9]*<=/i.test(rollText);
            // 2. 目標値の数式部分に 加算(+) や 乗算(*) が含まれる場合は補正ありとする（減算 - や 除算 / は通常ルールとして許容する）
            const formulaMatch = rollText.match(/^(?:s?CC\d*|1[dD]100)<=\(?([^\s【＜)]+)/i);
            const hasAddOrMul = formulaMatch ? /[\+\*]/.test(formulaMatch[1]) : false;
            const isModifiedRoll = hasBonusDice || hasAddOrMul;

            // ログエントリを記録（成功・失敗問わず全件）
            const skillMatch0 = rollText.match(/[【＜](.+?)[】＞]/);
            const skillLabel = skillMatch0 ? skillMatch0[1] : (isSanCheck ? '正気度ロール' : '-');
            const commandMatch = rollText.match(/^([sS]?[cC][cC][^\s【＜]*)/) || rollText.match(/^(\d+[dD]\d+[^\s【＜]*)/);
            let commandLabel = commandMatch ? commandMatch[1] : '';
            if (index !== undefined) {
              commandLabel += ` #${index}`;
            }
            const rollValueMatch = rollText.match(/＞\s*([\d,\s]+?)\s*＞\s*(?:クリティカル|イクストリーム成功|ハード成功|レギュラー成功|成功|失敗|ファンブル)/);
            const rollValue = rollValueMatch ? rollValueMatch[1].trim() : '';
            newCharLogs[charName].push({
              tab: tabName,
              skill: skillLabel,
              command: commandLabel,
              rollValue,
              result: resultStr,
              isSuccess,
              isSan: isSanCheck,
              isModified: isModifiedRoll,
            });

            // 成長チェック（成功時のみ）
            if (isSuccess) {
              const skillMatch = rollText.match(/[【＜](.+?)[】＞]/);
              if (skillMatch && skillMatch[1]) {
                const skillName = skillMatch[1];
                const upperSkill = skillName.toUpperCase();
                const excludedSkills = ['正気度ロール', 'STR', 'CON', 'POW', 'DEX', 'APP', 'INT', 'EDU', '幸運', 'アイデア', '知識', 'クトゥルフ神話', '信用'];
                if (!excludedSkills.includes(upperSkill) && !(excludeModified && isModifiedRoll)) {
                  newGrowth[charName].add(skillName);
                }
              }
            }

            if (isSanCheck) {
              if (isSuccess) {
                newStats[charName].sanSuccess++;
              } else {
                newStats[charName].sanFailure++;
              }
            } else {
              if (resultStr === 'クリティカル') newStats[charName].critical++;
              else if (resultStr === 'イクストリーム成功') newStats[charName].extreme++;
              else if (resultStr === 'ハード成功') newStats[charName].hard++;
              else if (resultStr === 'レギュラー成功' || resultStr === '成功') newStats[charName].regular++;
              else if (resultStr === '失敗') newStats[charName].failure++;
              else if (resultStr === 'ファンブル') newStats[charName].fumble++;
            }
          }
        });
      }
    });

    setAvailableTabs(Array.from(tabsSet));
    setStats(newStats);
    setGrowthStats(newGrowth);
    setCharLogs(newCharLogs);
  };

  const toggleTabFilter = (tab: string) => {
    const newExcluded = new Set(excludedTabs);
    if (newExcluded.has(tab)) {
      newExcluded.delete(tab);
    } else {
      newExcluded.add(tab);
    }
    setExcludedTabs(newExcluded);
    if (rawHtml) {
      processHtml(rawHtml, newExcluded, excludeModifiedRolls);
    }
  };

  const toggleExcludeModified = () => {
    const newVal = !excludeModifiedRolls;
    setExcludeModifiedRolls(newVal);
    if (rawHtml) {
      processHtml(rawHtml, excludedTabs, newVal);
    }
  };

  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const html = e.target.result as string;
        setRawHtml(html);
        setExcludedTabs(new Set());
        setExcludedCharacters(new Set());
        processHtml(html, new Set(), excludeModifiedRolls);
      }
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const renderStatsDashboard = () => {
    const activeStats = Object.entries(stats).filter(([charName]) => !excludedCharacters.has(charName));

    const totalStats: DiceResult = {
      critical: 0, extreme: 0, hard: 0, regular: 0,
      failure: 0, fumble: 0, sanSuccess: 0, sanFailure: 0
    };

    activeStats.forEach(([_, stat]) => {
      totalStats.critical += stat.critical;
      totalStats.extreme += stat.extreme;
      totalStats.hard += stat.hard;
      totalStats.regular += stat.regular;
      totalStats.failure += stat.failure;
      totalStats.fumble += stat.fumble;
      totalStats.sanSuccess += stat.sanSuccess;
      totalStats.sanFailure += stat.sanFailure;
    });

    const activeEntries = activeStats.flatMap(([charName]) => charLogs[charName] || []);

    return (
      <div className="dashboard">
        <div className="total-section">
          <StatCard charName="Total Overview" stat={totalStats} entries={activeEntries} isTotal={true} />
        </div>

        <ScrollContainer>
          {activeStats.map(([charName, stat]) =>
            <StatCard key={charName} charName={charName} stat={stat} entries={charLogs[charName] || []} isTotal={false} />
          )}
        </ScrollContainer>
      </div>
    );
  };

  const renderLogViewer = () => {
    const RESULT_COLORS: Record<string, string> = {
      'クリティカル': '#fbbf24',
      'イクストリーム成功': '#34d399',
      'ハード成功': '#60a5fa',
      'レギュラー成功': '#e2e8f0',
      '成功': '#e2e8f0',
      '失敗': '#94a3b8',
      'ファンブル': '#f87171',
    };
    const activeLogs = Object.entries(charLogs).filter(([charName]) => !excludedCharacters.has(charName));
    return (
      <div className="dashboard">
        <ScrollContainer>
          {activeLogs.map(([charName, entries]) => {
            const sanCount = entries.filter(e => e.isSan).length;
            const normalCount = entries.length - sanCount;
            return (
              <div key={charName} className="stat-card log-card">
                <div className="card-header">
                  <div className="char-name">{charName}</div>
                  <div className="total-rolls-badge">{normalCount} Rolls / {sanCount} SANc</div>
                </div>
                <div className="log-body">
                  <div className="log-table-header">
                    <span>Tab</span>
                    <span>技能</span>
                    <span>判定 / 出目</span>
                    <span>結果</span>
                  </div>
                  {entries.map((entry, i) => (
                    <div key={i} className={`log-row ${entry.isSuccess ? 'success-row' : 'fail-row'}`}>
                      <span className="log-tab">[{entry.tab}]</span>
                      <span className="log-skill">{entry.skill}{entry.isSan ? ' [SAN]' : ''}{entry.isModified ? ' *' : ''}</span>
                      <span className="log-command">{entry.command}{entry.rollValue ? <span className="log-roll-value"> ＞ {entry.rollValue}</span> : null}</span>
                      <span className="log-result" style={{ color: RESULT_COLORS[entry.result] || '#fff' }}>{entry.result}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </ScrollContainer>
      </div>
    );
  };

  const renderGrowthChecker = () => {
    const activeGrowth = Object.entries(growthStats).filter(([charName]) => !excludedCharacters.has(charName));
    return (
      <div className="dashboard" style={{ alignItems: 'center' }}>
        <ScrollContainer>
          {activeGrowth.map(([charName, skillsSet]) => {
            const skills = Array.from(skillsSet);
            return <GrowthCard key={charName} charName={charName} skills={skills} />;
          })}
        </ScrollContainer>
      </div>
    );
  };

  const hasStats = Object.keys(stats).length > 0;

  const getRoomName = (name: string | null) => {
    if (!name) return '';
    const match = name.match(/^(.*)\[.*\]\.html$/i) || name.match(/^(.*)\.html$/i);
    return match ? match[1] : name;
  };

  return (
    <div className="app-container">
      <header>
        <h1 className="header-title">DiceLog</h1>
        <p className="header-subtitle">Analyzer for ccfolia logs</p>
        {hasStats && fileName && (
          <div className="room-name-badge">{getRoomName(fileName)}</div>
        )}
      </header>

      <main style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '0.5rem' }}>

        {hasStats && (
          <div className="controls-header">
            <div className="tabs-container">
              <button
                className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                onClick={() => setActiveTab('stats')}
              >
                Dashboard
              </button>
              <button
                className={`tab-btn ${activeTab === 'growth' ? 'active' : ''}`}
                onClick={() => setActiveTab('growth')}
              >
                Growth Checker
              </button>
              <button
                className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                Log
              </button>
              <button className="tab-btn reset-btn" onClick={resetApp}>
                🔄 Reset File
              </button>
            </div>

            {availableTabs.length > 0 && (
              <div className="filter-container">
                <span className="filter-label">解析対象タブ:</span>
                <div className="filter-options">
                  {availableTabs.map(tab => {
                    const isExcluded = excludedTabs.has(tab);
                    return (
                      <label key={tab} className={`filter-chip ${isExcluded ? 'excluded' : 'included'}`}>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleTabFilter(tab)}
                        />
                        [{tab}]
                      </label>
                    );
                  })}
                </div>
                {activeTab === 'growth' && (
                  <>
                    <span className="filter-divider">|</span>
                    <label className={`filter-chip ${excludeModifiedRolls ? 'included' : 'excluded'}`}>
                      <input
                        type="checkbox"
                        checked={excludeModifiedRolls}
                        onChange={toggleExcludeModified}
                      />
                      補正ロール除外
                    </label>
                  </>
                )}
              </div>
            )}

            {Object.keys(stats).length > 0 && (
              <div className="filter-container" style={{ marginTop: '0.6rem' }}>
                <span className="filter-label">表示キャラクター:</span>
                <div className="filter-options" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                  <button className="filter-action-btn" onClick={selectAllCharacters}>全選択</button>
                  <button className="filter-action-btn" onClick={deselectAllCharacters}>全解除</button>
                  {Object.keys(stats).sort().map(charName => {
                    const isExcluded = excludedCharacters.has(charName);
                    return (
                      <label key={charName} className={`filter-chip ${isExcluded ? 'excluded' : 'included'}`}>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleCharacterFilter(charName)}
                        />
                        {charName}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!hasStats && (
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              type="file"
              accept=".html"
              className="file-input"
              onChange={onFileInputChange}
            />
            <div className="upload-content">
              <div className="upload-icon">⚲</div>
              <>
                <h3>Drag & Drop log file</h3>
                <p>Click to browse</p>
              </>
            </div>
          </div>
        )}

        {hasStats && activeTab === 'stats' && renderStatsDashboard()}
        {hasStats && activeTab === 'growth' && renderGrowthChecker()}
        {hasStats && activeTab === 'log' && renderLogViewer()}

        {!hasStats && fileName && (
          <div className="empty-state" style={{ marginTop: '2rem' }}>
            対象となるダイスログが見つかりませんでした。
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
