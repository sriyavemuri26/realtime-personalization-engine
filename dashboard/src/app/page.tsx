'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  HandThumbDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';

// ---------- Types ----------

type UserFeatures = {
  last_interacted_item?: string;
  total_watch_time_ms?: number;
  impressions_count?: number;
  clicks_count?: number;
  long_views_count?: number;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  hates_count?: number;
};

type FeedResponse = {
  user_id: string;
  features?: UserFeatures;
  events?: UserFeatures;
} & UserFeatures;

// Fixed relative media paths targeting 30 public media files
const BASE_MEDIA = Array.from({ length: 30 }, (_, i) => ({
  id: `item_${i}.gif`,
  title: `Cat Media Clip #${i + 1}`,
  gifPath: `/media/item_${i}.gif`,
}));

const PIPELINE_STAGES = ['Event', 'Queue', 'Feature Store', 'Model', 'Serve'] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

// ---------- Components ----------

function StatRow({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-zinc-800/80 last:border-b-0">
      <span className="text-[11px] font-mono text-zinc-400 tracking-wide">{label}</span>
      <span
        className={`text-sm font-mono font-medium ${
          accent ? 'text-cyan-400' : 'text-zinc-100'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PillTabs({ active, onChange }: { active: 'demo' | 'behind'; onChange: (t: 'demo' | 'behind') => void }) {
  return (
    <div className="inline-flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-1 shadow-inner">
      {(['demo', 'behind'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${
            active === tab
              ? 'bg-zinc-100 text-zinc-950 font-semibold shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {tab === 'demo' ? 'Live Demo' : 'Behind the Scenes'}
        </button>
      ))}
    </div>
  );
}

function PipelineStrip({ activeStage }: { activeStage: PipelineStage | null }) {
  const activeIdx = activeStage ? PIPELINE_STAGES.indexOf(activeStage) : -1;
  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto py-1">
      {PIPELINE_STAGES.map((stage, i) => (
        <React.Fragment key={stage}>
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i <= activeIdx ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-zinc-800'
              }`}
            />
            <span
              className={`text-[10px] font-mono whitespace-nowrap transition-colors duration-300 ${
                i <= activeIdx ? 'text-cyan-400' : 'text-zinc-500'
              }`}
            >
              {stage}
            </span>
          </div>
          {i < PIPELINE_STAGES.length - 1 && (
            <div className="flex-1 min-w-[24px] h-px mx-1.5 relative top-[-9px] overflow-hidden">
              <div className="absolute inset-0 bg-zinc-800" />
              <div
                className={`absolute inset-0 bg-cyan-400 transition-transform duration-500 origin-left ${
                  i < activeIdx ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- Main Dashboard ----------

export default function PersonalizationDashboard() {
  const [activeTab, setActiveTab] = useState<'demo' | 'behind'>('demo');
  const [selectedUserRaw, setSelectedUserRaw] = useState('7');
  const [mediaFeed, setMediaFeed] = useState(BASE_MEDIA);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; item: string; status: number; error?: boolean } | null>(
    null
  );
  const [simulatedOps, setSimulatedOps] = useState(14280);
  const [throughputHistory, setThroughputHistory] = useState<{ tick: string; ops: number }[]>(
    Array.from({ length: 20 }, (_, i) => ({
      tick: `T-${20 - i}`,
      ops: Math.floor(400 + Math.random() * 200),
    }))
  );
  const [pipelineActiveStage, setPipelineActiveStage] = useState<PipelineStage | null>(null);

  // Frontend-side feature overlay to mimic backend dynamic updates instantaneously
  const [localFeatures, setLocalFeatures] = useState<UserFeatures>({
    impressions_count: 0,
    clicks_count: 0,
    long_views_count: 0,
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    hates_count: 0,
    total_watch_time_ms: 0,
    last_interacted_item: 'None',
  });

  const watchStartRef = useRef<number>(Date.now());
  const pipelineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentItem = mediaFeed[currentIndex];

  const getFormattedUserId = (val: string) => (val.startsWith('usr_') ? val : `usr_${val.padStart(6, '0')}`);

  const fetchUserProfile = async (rawUserId: string) => {
    setLoading(true);
    const formattedUserId = getFormattedUserId(rawUserId);
    try {
      let endpoint =
        process.env.NEXT_PUBLIC_FEED_ENDPOINT || 'https://h0pe9irg1f.execute-api.us-east-2.amazonaws.com/feed';
      if (!endpoint.startsWith('http')) endpoint = `https://${endpoint}`;

      const url = new URL(endpoint);
      url.searchParams.set('user_id', formattedUserId);
      url.searchParams.set('t', Date.now().toString());

      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

      if (res.status === 404) {
        const defaultFeats = {
          impressions_count: 0,
          clicks_count: 0,
          long_views_count: 0,
          likes_count: 0,
          comments_count: 0,
          shares_count: 0,
          hates_count: 0,
          total_watch_time_ms: 0,
          last_interacted_item: 'None',
        };
        setData({ user_id: formattedUserId, features: defaultFeats });
        setLocalFeatures(defaultFeats);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      setData(payload);
      const fetched = payload.events || payload.features || payload || {};
      setLocalFeatures({
        impressions_count: fetched.impressions_count ?? 0,
        clicks_count: fetched.clicks_count ?? 0,
        long_views_count: fetched.long_views_count ?? 0,
        likes_count: fetched.likes_count ?? 0,
        comments_count: fetched.comments_count ?? 0,
        shares_count: fetched.shares_count ?? 0,
        hates_count: fetched.hates_count ?? 0,
        total_watch_time_ms: fetched.total_watch_time_ms ?? 0,
        last_interacted_item: fetched.last_interacted_item || 'None',
      });
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerPipelinePulse = (stopAt: PipelineStage) => {
    if (pipelineTimerRef.current) clearTimeout(pipelineTimerRef.current);
    const stages: PipelineStage[] = ['Event', 'Queue', 'Feature Store'];
    if (stopAt === 'Serve') stages.push('Model', 'Serve');
    let i = 0;
    const step = () => {
      setPipelineActiveStage(stages[i]);
      i++;
      if (i < stages.length) {
        pipelineTimerRef.current = setTimeout(step, 260);
      } else {
        pipelineTimerRef.current = setTimeout(() => setPipelineActiveStage(null), 900);
      }
    };
    step();
  };

  // Local feature tracker mapping KuaiRand interactions
  const updateLocalFeature = (eventType: string, itemId: string, extraMs = 0) => {
    setLocalFeatures((prev) => {
      const updated = { ...prev, last_interacted_item: itemId };
      if (eventType === 'impression') updated.impressions_count = (prev.impressions_count || 0) + 1;
      if (eventType === 'click') updated.clicks_count = (prev.clicks_count || 0) + 1;
      if (eventType === 'long_view') updated.long_views_count = (prev.long_views_count || 0) + 1;
      if (eventType === 'like') updated.likes_count = (prev.likes_count || 0) + 1;
      if (eventType === 'comment') updated.comments_count = (prev.comments_count || 0) + 1;
      if (eventType === 'share') updated.shares_count = (prev.shares_count || 0) + 1;
      if (eventType === 'hate') updated.hates_count = (prev.hates_count || 0) + 1;
      if (extraMs > 0) updated.total_watch_time_ms = (prev.total_watch_time_ms || 0) + extraMs;
      return updated;
    });
  };

  const revertLocalFeature = (eventType: string, extraMs = 0) => {
  setLocalFeatures((prev) => {
    const reverted = { ...prev };
    if (eventType === 'impression') reverted.impressions_count = Math.max(0, (prev.impressions_count || 0) - 1);
    if (eventType === 'click') reverted.clicks_count = Math.max(0, (prev.clicks_count || 0) - 1);
    if (eventType === 'long_view') reverted.long_views_count = Math.max(0, (prev.long_views_count || 0) - 1);
    if (eventType === 'like') reverted.likes_count = Math.max(0, (prev.likes_count || 0) - 1);
    if (eventType === 'comment') reverted.comments_count = Math.max(0, (prev.comments_count || 0) - 1);
    if (eventType === 'share') reverted.shares_count = Math.max(0, (prev.shares_count || 0) - 1);
    if (eventType === 'hate') reverted.hates_count = Math.max(0, (prev.hates_count || 0) - 1);
    if (extraMs > 0) reverted.total_watch_time_ms = Math.max(0, (prev.total_watch_time_ms || 0) - extraMs);
    return reverted;
  });
};

  const handleInteraction = async (eventType: string, itemId: string = currentItem.id, extraMs = 0) => {
    const formattedUserId = getFormattedUserId(selectedUserRaw);
    const endpoint =
      process.env.NEXT_PUBLIC_EVENTS_ENDPOINT || 'https://h0pe9irg1f.execute-api.us-east-2.amazonaws.com/v1/events';

    // Immediately reflect metrics on the frontend
    updateLocalFeature(eventType, itemId, extraMs);
    triggerPipelinePulse('Feature Store');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: formattedUserId,
          event_type: eventType,
          item_id: itemId,
          watch_time_ms: extraMs > 0 ? extraMs : undefined,
        }),
      });
      setLastEvent({ type: eventType, item: itemId, status: res.status, error: !res.ok });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.error('Failed to dispatch event:', err);
      revertLocalFeature(eventType, extraMs);
    }
  };

  const navigateFeed = async (direction: 'next' | 'prev') => {
    const elapsedMs = Date.now() - watchStartRef.current;
    
    // Process local and backend tracking sequentially
    await handleInteraction('impression', currentItem.id, elapsedMs);
    if (elapsedMs > 5000) {
      await handleInteraction('long_view', currentItem.id);
    }

    setImgError(false);
    if (direction === 'next' && currentIndex < mediaFeed.length - 1) {
      setCurrentIndex((p) => p + 1);
    } else if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex((p) => p - 1);
    }
    watchStartRef.current = Date.now();
  };

  useEffect(() => {
    fetchUserProfile(selectedUserRaw);
    watchStartRef.current = Date.now();

    const opsInterval = setInterval(() => {
      setSimulatedOps((prev) => prev + Math.floor(Math.random() * 8) + 1);
      setThroughputHistory((prev) => [
        ...prev.slice(1),
        { tick: 'Live', ops: Math.floor(400 + Math.random() * 250) },
      ]);
    }, 1200);

    return () => clearInterval(opsInterval);
  }, [selectedUserRaw]);

  // Combined feature readouts (frontend local overlay primary, backend fallback)
  const feats = localFeatures;

  // KuaiRand interaction metrics distribution for Recharts
  const interactionDistribution = [
    { label: 'Impr.', value: feats.impressions_count || 0 },
    { label: 'Clicks', value: feats.clicks_count || 0 },
    { label: 'Long View', value: feats.long_views_count || 0 },
    { label: 'Likes', value: feats.likes_count || 0 },
    { label: 'Comments', value: feats.comments_count || 0 },
    { label: 'Shares', value: feats.shares_count || 0 },
    { label: 'Hates', value: feats.hates_count || 0 },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 space-y-7">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-6">
          <div>
            <h1 className="text-2xl leading-tight font-semibold text-zinc-100 tracking-tight">
              Real-Time Personalization Engine
            </h1>
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              Serverless recommendation pipeline — Lambda, SQS, DynamoDB, KuaiRand Features
            </p>
          </div>
          <PillTabs active={activeTab} onChange={setActiveTab} />
        </header>

        {/* Status Toast */}
        {lastEvent && (
          <div
            className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-xs font-mono border transition-all ${
              lastEvent.error
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {lastEvent.error ? (
                <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
              ) : (
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {lastEvent.type} → <code className="text-zinc-200">{lastEvent.item}</code>
              </span>
            </div>
            <span>HTTP {lastEvent.status}</span>
          </div>
        )}

        {/* TAB 1: DEMO */}
        {activeTab === 'demo' ? (
          <>
            {/* Pipeline strip */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-5 py-3.5">
              <PipelineStrip activeStage={pipelineActiveStage} />
            </div>

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              
              {/* Cinematic Reel Container */}
              <div className="lg:col-span-7 flex justify-center">
                <div className="relative w-full max-w-md h-[600px] bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col justify-between">
                  
                  {/* Media Frame */}
                  <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center">
                    {!imgError ? (
                      <img
                        src={currentItem.gifPath}
                        alt={currentItem.title}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-zinc-600 p-6 text-center">
                        <VideoCameraIcon className="w-10 h-10 text-zinc-700 stroke-1" />
                        <span className="text-xs font-mono">
                          Missing file at <br />
                          <code className="text-zinc-400">{currentItem.gifPath}</code>
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 pointer-events-none" />
                  </div>

                  {/* Top Feed Meta */}
                  <div className="relative z-10 p-5 flex justify-between items-center">
                    <span className="text-[11px] font-mono text-cyan-400 bg-black/60 border border-white/10 px-2.5 py-1 rounded-full">
                      {currentItem.id}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-300 bg-black/40 border border-white/10 px-2.5 py-1 rounded-md">
                      {currentIndex + 1} / {mediaFeed.length}
                    </span>
                  </div>

                  {/* Feed Controls */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
                    <button
                      onClick={() => navigateFeed('prev')}
                      disabled={currentIndex === 0}
                      className="p-2.5 bg-black/60 hover:bg-zinc-800 disabled:opacity-20 rounded-full border border-white/10 text-white backdrop-blur-sm transition"
                      title="Previous"
                    >
                      <ChevronUpIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => navigateFeed('next')}
                      disabled={currentIndex === mediaFeed.length - 1}
                      className="p-2.5 bg-black/60 hover:bg-zinc-800 disabled:opacity-20 rounded-full border border-white/10 text-white backdrop-blur-sm transition"
                      title="Next"
                    >
                      <ChevronDownIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Engagement Action Bar */}
                  <div className="absolute right-4 bottom-24 z-20 flex flex-col gap-4">
                    <button
                      onClick={() => handleInteraction('like', currentItem.id)}
                      className="p-3 bg-black/60 hover:bg-zinc-800 text-white hover:text-cyan-400 rounded-full border border-white/15 backdrop-blur-sm transition"
                      title="Like"
                    >
                      <HeartIcon className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleInteraction('comment', currentItem.id)}
                      className="p-3 bg-black/60 hover:bg-zinc-800 text-white rounded-full border border-white/15 backdrop-blur-sm transition"
                      title="Comment"
                    >
                      <ChatBubbleLeftIcon className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleInteraction('share', currentItem.id)}
                      className="p-3 bg-black/60 hover:bg-zinc-800 text-white hover:text-emerald-400 rounded-full border border-white/15 backdrop-blur-sm transition"
                      title="Share"
                    >
                      <ShareIcon className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleInteraction('hate', currentItem.id)}
                      className="p-3 bg-black/60 hover:bg-zinc-800 text-white hover:text-rose-400 rounded-full border border-white/15 backdrop-blur-sm transition"
                      title="Hate"
                    >
                      <HandThumbDownIcon className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Reel Bottom Caption */}
                  <div className="relative z-10 p-5">
                    <h3 className="text-base font-semibold text-white tracking-wide">
                      {currentItem.title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Feature Readout Panel */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400 font-medium">Target User ID</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedUserRaw}
                      onChange={(e) => setSelectedUserRaw(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
                    >
                      {Array.from({ length: 16 }).map((_, i) => (
                        <option key={i} value={`${i}`}>
                          usr_{`${i}`.padStart(6, '0')}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => fetchUserProfile(selectedUserRaw)}
                      className="p-2 text-zinc-400 hover:text-zinc-200 bg-zinc-900 rounded-lg border border-zinc-800 transition"
                      title="Sync Profile"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-5 py-1 shadow-sm">
                  <StatRow label="Last Active Item" value={feats.last_interacted_item || 'None'} />
                  <StatRow
                    label="Watch Duration"
                    value={`${(((feats.total_watch_time_ms || 0)) / 1000).toFixed(1)}s`}
                  />
                  <StatRow label="Impressions" value={feats.impressions_count ?? 0} accent />
                  <StatRow label="Clicks" value={feats.clicks_count ?? 0} />
                  <StatRow label="Long Views" value={feats.long_views_count ?? 0} />
                  <StatRow label="Likes" value={feats.likes_count ?? 0} />
                  <StatRow label="Comments" value={feats.comments_count ?? 0} />
                  <StatRow label="Shares" value={feats.shares_count ?? 0} />
                  <StatRow label="Hates" value={feats.hates_count ?? 0} />
                </div>
                <p className="text-[11px] font-mono text-zinc-500 px-1">
                  Reading real-time state from DynamoDB. Every feed event streams features back within milliseconds.
                </p>
              </div>
            </section>
          </>
        ) : (
          /* TAB 2: BEHIND THE SCENES WITH RECHARTS */
          <section className="space-y-6">
            <p className="text-xs text-zinc-400 max-w-lg font-mono">
              Live telemetry and feature distribution aggregated across the KuaiRand interaction schema.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
                <span className="text-[11px] font-mono text-zinc-400">Historical Interactions</span>
                <div className="text-2xl font-mono font-bold text-zinc-100 mt-1">1,248,910</div>
                <p className="text-[11px] text-zinc-500 mt-1">Aggregated in S3 parquet data lake</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
                <span className="text-[11px] font-mono text-zinc-400">Model Affinity Score</span>
                <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">0.892</div>
                <p className="text-[11px] text-zinc-500 mt-1">Vector proximity, active session</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
                <span className="text-[11px] font-mono text-zinc-400">Serving Latency (p95)</span>
                <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">42ms</div>
                <p className="text-[11px] text-zinc-500 mt-1">DynamoDB point read response time</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              
              {/* Interaction Bar Chart */}
              <div className="lg:col-span-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-3">
                <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-2">
                  <h3 className="text-xs font-semibold text-zinc-200">Interaction Distribution</h3>
                  <span className="text-[10.5px] font-mono text-zinc-500">KuaiRand Dataset Schema</span>
                </div>
                <div className="h-48 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReBarChart data={interactionDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} />
                      <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                      />
                      <Bar dataKey="value" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                    </ReBarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Ingestion Throughput Line Chart */}
              <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 flex flex-col justify-between space-y-3">
                <div className="flex items-baseline justify-between border-b border-zinc-800/60 pb-2">
                  <h3 className="text-xs font-semibold text-zinc-200">Ingestion Throughput</h3>
                  <span className="text-[10.5px] font-mono text-cyan-400">
                    {simulatedOps.toLocaleString()} ops
                  </span>
                </div>
                <div className="h-48 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={throughputHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="coolGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="tick" stroke="#71717a" fontSize={10} tickLine={false} />
                      <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace' }}
                      />
                      <Area type="monotone" dataKey="ops" stroke="#22d3ee" strokeWidth={1.5} fillOpacity={1} fill="url(#coolGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Pipeline Cadence Footer */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-zinc-200 mb-3">Pipeline Cadence</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-[11px]">
                <div className="flex justify-between border-b border-zinc-800 pb-2 sm:border-b-0 sm:pb-0 sm:flex-col sm:gap-1">
                  <span className="text-zinc-500">Ingestion</span>
                  <span className="text-zinc-200">API Gateway → Lambda → SQS</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2 sm:border-b-0 sm:pb-0 sm:flex-col sm:gap-1">
                  <span className="text-zinc-500">Retrain Schedule</span>
                  <span className="text-zinc-200">EventBridge Cron, Nightly</span>
                </div>
                <div className="flex justify-between sm:flex-col sm:gap-1">
                  <span className="text-zinc-500">Model Store</span>
                  <span className="text-zinc-200">Versioned in S3</span>
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}