'use client';

import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import {
  PlayIcon,
  PauseIcon,
  PresentationChartLineIcon,
  ChartBarIcon,
  TableCellsIcon,
  ChevronDownIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import {
  UserTelemetry,
  fetchAvailableUsers,
  fetchUserTelemetry
} from '../../data/telemetryData';

// Static English-first translations for the granular raw KuaiRand event tags
// shown in the ingestion table (a much larger, ad-hoc vocabulary than the 8
// canonical categories). Not exhaustive — untranslated raw tags fall back to
// their original Chinese text wherever this map is consulted.
const RAW_KUAIRAND_TAG_MAP: Record<string, string> = {
  '喜剧': 'Comedy (喜剧)',
  '喜剧段子': 'Comedy (喜剧段子)',
  '美食吃播': 'Food Stream (美食吃播)',
  '美食探店': 'Food Review (美食探店)',
  '美食日常': 'Daily Food (美食日常)',
  '军事': 'Military (军事)',
  '魔术': 'Magic (魔术)',
  '动植物与微生物': 'Animals & Nature (动植物与微生物)',
  '生活日常记录': 'Vlog (生活日常记录)',
  '电视剧': 'Drama (电视剧)',
  '欧洲生活': 'European Life (欧洲生活)',
  '武器装备': 'Weapons & Gear (武器装备)',
  '物理化学与材料科学': 'Science & Chem (物理化学与材料科学)',
  '自然地理': 'Geography (自然地理)',
  '少儿动画': 'Kids Anime (少儿动画)',
  '搞笑配音': 'Funny Dubbing (搞笑配音)',
  '武术': 'Martial Arts (武术)',
  '二次元': 'ACGN / Anime (二次元)',
  '壁纸头像': 'Aesthetic (壁纸头像)',
  '青少年动画': 'Anime (青少年动画)',
  '明星娱乐': 'Celebrity News (明星娱乐)',
  '娱乐八卦': 'Celebrity Gossip (娱乐八卦)',
  '小说': 'Fiction/Novels (小说)',
  '颜值': 'Looks (颜值)',
  '颜值随拍': 'Looks Snapshot (颜值随拍)',
  '自拍': 'Selfies (自拍)',
  '宠物狗': 'Pet Dogs (宠物狗)',
  '社会事件': 'Social Events (社会事件)',
  '影视综': 'Film & TV Variety (影视综)',
  '美妆': 'Beauty & Makeup (美妆)',
  '美发': 'Hair & Styling (美发)',
  '搞笑短剧': 'Comedy Skits (搞笑短剧)',
  '景物摄影': 'Scenery Photography (景物摄影)',
  '舞蹈': 'Dance (舞蹈)',
  '饭制': 'Fan-Made Video (饭制)'
};

// "喜剧段子 (Comedy)" -> "Comedy (喜剧段子)". Falls back to the original string
// if it doesn't match the "<Chinese> (<English>)" shape the backend sends.
function toEnglishFirstLabel(fullName: string): string {
  const match = fullName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return fullName;
  const [, chinese, english] = match;
  return `${english} (${chinese})`;
}

export default function AnalyticsDashboard() {
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [telemetry, setTelemetry] = useState<UserTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStepLimit, setCurrentStepLimit] = useState<number>(25);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  const currentUserData = telemetry ?? {
  user_id: '',
  total_interactions: 0,
  dominant_category: '',
  model_convergence_rate: 0,
  category_probability_shift: [],
  recent_events: [],
  score_distribution: []
};

  const recentEvents = currentUserData.recent_events ?? [];

  // Canonical 8 KuaiRand top-categories, keyed the same way as the
  // category_probability_shift dataKeys (e.g. "喜剧段子 (Comedy)").
  // Falls back to reading the keys off the first shift step if score_distribution is empty.
  const categories =
    currentUserData.score_distribution && currentUserData.score_distribution.length > 0
      ? currentUserData.score_distribution.map((s) => s.full_name ?? s.category)
      : Object.keys(currentUserData.category_probability_shift?.[0] ?? {}).filter(
          (key) => !['step', 'item_id', 'category', 'action'].includes(key)
        );

  // Maps the full dataKey ("喜剧段子 (Comedy)") to an English-first display name
  // ("Comedy (喜剧段子)") for legend/tooltip/filter labels, sourced from score_distribution.
  const categoryLabelMap: Record<string, string> = Object.fromEntries(
    (currentUserData.score_distribution ?? []).map((s) => [
      s.full_name ?? s.category,
      toEnglishFirstLabel(s.full_name ?? s.category)
    ])
  );

  // Lookup for the raw, granular KuaiRand event tags shown in the ingestion
  // table (e.g. "喜剧") — a much larger vocabulary than the 8 canonical
  // categories above. Combines the curated static dictionary with a dynamic
  // fallback derived from score_distribution; any tag in neither source falls
  // back to its original Chinese text.
  const rawCategoryLabelMap: Record<string, string> = {
    ...Object.fromEntries(
      (currentUserData.score_distribution ?? []).map((s) => [s.category, toEnglishFirstLabel(s.full_name ?? s.category)])
    ),
    ...RAW_KUAIRAND_TAG_MAP
  };

  const scoreDistributionDisplay = (currentUserData.score_distribution ?? []).map((s) => ({
    ...s,
    category: toEnglishFirstLabel(s.full_name ?? s.category)
  }));

  const CATEGORY_COLORS: Record<string, string> = categories.reduce(
    (acc, category, index) => {
      const palette = [
        '#38bdf8',
        '#a78bfa',
        '#34d399',
        '#f59e0b',
        '#f472b6',
        '#f87171',
        '#22d3ee',
        '#c084fc'
      ];
      acc[category] = palette[index % palette.length];
      return acc;
    },
    {} as Record<string, string>
  );

  const rawMeta = recentEvents[currentStepLimit - 1] || null;
  const currentStepMeta = rawMeta
    ? {
        step: currentStepLimit,
        action: rawMeta.is_click ? 'Click' : rawMeta.long_view ? 'Long View' : 'Impression'
      }
    : null;

  // Plot the real, backend-computed category probabilities instead of
  // deriving a fake one-hot signal from recent_events (which uses a
  // different, unnormalized category vocabulary than category_probability_shift).
  const slicedProbabilityData = (currentUserData.category_probability_shift ?? [])
    .slice(0, currentStepLimit)
    .map((entry, idx) => ({ ...entry, step: idx + 1 }));

  // Auto-play stream control loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStepLimit((prev) => {
          if (prev >= 25) {
            setIsPlaying(false);
            return 25;
          }
          return prev + 1;
        });
      }, 600);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Initial mount: load active user list
  useEffect(() => {
    async function initUsers() {
      try {
        setLoading(true);
        const userList = await fetchAvailableUsers();

        // Ensure userList is an array and filter out metadata keys
        const candidateIds: string[] = Array.isArray(userList)
          ? userList.filter((u: string) => u && u !== "stream_source" && u !== "live_ingestion_pipeline")
          : [];

        // Only show users with real, demonstrable signal: fetch each candidate's
        // telemetry and keep the ones with actual interactions AND a non-flat
        // score_distribution (max - min adapted_score > 0). A flat spread means
        // none of their events mapped to a canonical category, so their charts
        // would just be a flat line — not worth surfacing in the selector.
        const telemetryResults = await Promise.all(
          candidateIds.map(async (uid) => {
            try {
              return await fetchUserTelemetry(uid);
            } catch {
              return null;
            }
          })
        );

        const activeUsers = candidateIds.filter((uid, idx) => {
          const t = telemetryResults[idx];
          if (!t) return false;
          const hasInteractions = (t.total_interactions ?? 0) > 0;
          const scores = (t.score_distribution ?? []).map((s) => s.adapted_score);
          const spread = scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0;
          return hasInteractions && spread > 0;
        });

        // Fallback: if nothing clears the bar, show everything rather than an empty selector.
        const finalUsers = activeUsers.length > 0 ? activeUsers : candidateIds;

        setUsers(finalUsers);

        if (finalUsers.length > 0) {
          setSelectedUserId(finalUsers[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize user selector.');
      } finally {
        setLoading(false);
      }
    }
    initUsers();
  }, []);

  // Fetch individual user telemetry on selector state change
  useEffect(() => {
    if (!selectedUserId) return;

    async function loadTelemetry() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchUserTelemetry(selectedUserId);
        setTelemetry(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load user telemetry data.');
      } finally {
        setLoading(false);
      }
    }
    loadTelemetry();
  }, [selectedUserId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Top row: user selection */}
      <div className="flex items-center gap-2 flex-wrap border-b border-zinc-800 pb-4">
        {users.map((uid) => (
          <button
            key={uid}
            onClick={() => setSelectedUserId(uid)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              selectedUserId === uid
                ? 'bg-cyan-500 text-zinc-950 font-bold'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {uid}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[400px] border border-zinc-800/80 rounded-xl bg-zinc-900/40">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-mono text-zinc-400">Fetching telemetry from DynamoDB...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="p-4 border border-red-500/30 rounded-xl bg-red-950/20 text-red-400 text-sm font-mono flex items-center justify-between">
          <span>Error: {error}</span>
          <button
            onClick={() => setSelectedUserId(selectedUserId)}
            className="px-3 py-1 bg-red-900/40 hover:bg-red-900/60 rounded text-xs text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && telemetry && (
        <main className="space-y-6">
          {/* Top KPI Row — 2 cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#0e1322] border border-slate-800/80 rounded-2xl p-4 shadow-lg">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Interactions</div>
              <div className="text-2xl font-black text-white mt-1 font-mono">
                {currentUserData.total_interactions} <span className="text-xs font-normal text-slate-500">events</span>
              </div>
            </div>
            <div className="bg-[#0e1322] border border-slate-800/80 rounded-2xl p-4 shadow-lg">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dominant Category</div>
              <div className="text-2xl font-black text-indigo-400 mt-1 truncate">{toEnglishFirstLabel(currentUserData.dominant_category)}</div>
            </div>
          </section>

          {/* Controls */}
          <div className="bg-[#090d17] p-3 rounded-xl border border-slate-800/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (currentStepLimit >= 25 && !isPlaying) {
                    setCurrentStepLimit(1);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play Stream'}</span>
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepLimit(25);
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-all"
              >
                All Steps
              </button>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300 pl-1">
                <span>Step:</span>
                <span className="text-indigo-400 font-bold">
                  Step {currentStepMeta ? currentStepMeta.step : currentStepLimit} of 25
                </span>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-4">
              <span className="text-[11px] font-mono text-slate-500">Step 1</span>
              <input
                type="range"
                min="1"
                max="25"
                value={currentStepLimit}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStepLimit(Number(e.target.value));
                }}
                className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="text-[11px] font-mono text-slate-500">Step 25</span>
            </div>
          </div>

          {/* Visualizer 1 — Hero */}
          <div className="bg-[#0e1322] border border-indigo-500/30 ring-1 ring-indigo-500/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <PresentationChartLineIcon className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Category Probability Shift (Step 1 → Step 25)
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tracks category-probability shifts as historical KuaiRand engagement events are replayed step by step
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Step Focus:</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                  Step {currentStepMeta ? currentStepMeta.step : currentStepLimit}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Action:</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-medium">
                  {currentStepMeta?.action || 'Impression'}
                </span>
              </div>
            </div>

            <div className="h-110 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slicedProbabilityData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <defs>
                    {categories.map((cat) => {
                      // Guard against undefined category strings
                      const safeCat = cat ? String(cat) : 'default';
                      const gradientId = `color_${safeCat.replace(/\s|\(|\)/g, '_')}`;

                      return (
                        <linearGradient
                          key={safeCat}
                          id={gradientId}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={CATEGORY_COLORS[cat]} stopOpacity={0.8} />
                          <stop offset="100%" stopColor={CATEGORY_COLORS[cat]} stopOpacity={0.1} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataPoint = payload[0]?.payload;
                        return (
                          <div className="bg-[#0b0f19] border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-2 max-w-xs">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                              <span className="font-bold text-white font-mono">Step {label}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                {dataPoint?.action}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Video: <span className="text-slate-200 font-mono font-medium">{dataPoint?.item_id}</span> ({dataPoint?.category ? (rawCategoryLabelMap[dataPoint.category] ?? dataPoint.category) : 'Unknown'})
                            </div>
                            <div className="space-y-1 pt-1 max-h-36 overflow-y-auto pr-1">
                              {payload.map((entry: any) => (
                                <div key={entry.name} className="flex items-center justify-between gap-4 text-[11px]">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                    <span className="text-slate-300 truncate">{entry.name}</span>
                                  </div>
                                  <span className="font-mono font-bold text-white">
                                    {Number(entry.value).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {categories.map((cat) => {
                    const safeCat = cat ? String(cat) : 'default';
                    const gradientId = `color_${safeCat.replace(/\s|\(|\)/g, '_')}`;

                    return (
                      <Area
                        key={safeCat}
                        type="monotone"
                        dataKey={cat}
                        name={categoryLabelMap[cat] ?? cat}
                        stroke={CATEGORY_COLORS[cat]}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill={`url(#${gradientId})`}
                        hide={activeCategoryFilter !== null && activeCategoryFilter !== cat}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
              <button
                onClick={() => setActiveCategoryFilter(null)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                  activeCategoryFilter === null
                    ? 'bg-slate-200 text-slate-900 font-semibold'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(activeCategoryFilter === cat ? null : cat)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 border ${
                    activeCategoryFilter === cat
                      ? 'border-white text-white font-semibold'
                      : 'border-slate-800/80 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                  <span>{categoryLabelMap[cat] ?? cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Score Distribution */}
          <div className="bg-[#0e1322] border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <ChartBarIcon className="w-4 h-4 text-purple-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Score Distribution (Pre vs Post)
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Uniform Baseline vs Online-Adapted Scores
              </p>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistributionDisplay} margin={{ top: 10, right: 15, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="category" stroke="#64748b" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="%" domain={[0, 30]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0]?.payload;
                        return (
                          <div className="bg-[#0b0f19] border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-1.5">
                            <div className="font-bold text-white border-b border-slate-800 pb-1">{item.category}</div>
                            <div className="flex items-center justify-between gap-4 text-slate-400">
                              <span>Initial Uniform Score:</span>
                              <span className="font-mono text-slate-300 font-bold">{item.initial_score}%</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-indigo-400 font-medium">
                              <span>Online Adapted Score:</span>
                              <span className="font-mono text-indigo-300 font-bold">{item.adapted_score}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} verticalAlign="top" />
                  <Bar dataKey="initial_score" name="Initial Score (Uniform 12.5%)" fill="#475569" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="adapted_score" name="Online Adapted Score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
              <span>Top Adaptive Lift:</span>
              <span className="font-mono text-indigo-300 font-semibold">
                +{(((scoreDistributionDisplay?.[0]?.adapted_score ?? 12.5) - 12.5)).toFixed(1)}% on {currentUserData?.dominant_category ? toEnglishFirstLabel(currentUserData.dominant_category) : 'General'}
              </span>
            </div>
          </div>

          {/* Collapsible: Raw Ingestion Logs — closed by default */}
          <details className="group bg-[#0e1322] border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between p-5 select-none">
              <div className="flex items-center gap-2">
                <TableCellsIcon className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  View Raw Ingestion Logs (25 Steps)
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                  Showing {slicedProbabilityData.length} of 25 Steps
                </span>
                <ChevronDownIcon className="w-4 h-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
              </div>
            </summary>
            <div className="px-5 pb-5 pt-1 border-t border-slate-800/60">
            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090d16] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Step</th>
                    <th className="px-4 py-3 font-semibold">Video ID</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Interactions</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {recentEvents.slice(0, currentStepLimit).map((ev, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        idx === currentStepLimit - 1 ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-300">Step {idx + 1}</td>
                      <td className="px-4 py-2.5 text-indigo-300">{ev.video_id}</td>
                      <td className="px-4 py-2.5 font-sans text-slate-200">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-700">
                          {rawCategoryLabelMap[ev.category] ?? ev.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-sans">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {ev.is_click && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              Click
                            </span>
                          )}
                          {ev.is_like && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                              <HeartIcon className="w-3 h-3" /> Like
                            </span>
                          )}
                          {ev.is_comment && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              <ChatBubbleLeftIcon className="w-3 h-3" /> Comment
                            </span>
                          )}
                          {ev.is_forward && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              <ShareIcon className="w-3 h-3" /> Share
                            </span>
                          )}
                          {ev.long_view && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <ClockIcon className="w-3 h-3" /> Long View
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-emerald-400 text-[11px]">Ingested</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </details>
        </main>
      )}
    </div>
  );
}