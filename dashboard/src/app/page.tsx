'use client';

import AnalyticsDashboard from './analytics/page';

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

// ---------- Types & Configuration ----------

const CATEGORIES = [
  'Drama',
  'Gaming',
  'Anime',
  'Movies',
  'Comedy',
  'Cooking',
  'Aesthetic',
  'Singing',
  'Battle',
  'Cosplay',
] as const;

export type MediaItem = {
  id: string;
  index: number;
  category: string;
  title: string;
  gifPath: string;
  video_path: string;
  score?: number;
  affinity_score?: number;
  ucb_bonus?: number;
};

// Fixed relative media paths targeting 30 isolated public media files
const BASE_MEDIA: MediaItem[] = Array.from({ length: 30 }, (_, i) => {
  const category = CATEGORIES[i % 10];
  const instanceNum = Math.floor(i / 10) + 1;
  return {
    id: `item_${i}.gif`,
    index: i,
    category,
    title: `${category} Clip #${instanceNum}`,
    gifPath: `/media/item_${i}.gif`,
    video_path: `/public/media/item_${i}.gif`,
  };
});

function getCategoryForItemId(itemId?: string) {
  if (!itemId || itemId === 'None') return null;
  const match = itemId.match(/item_(\d+)/);
  if (match) {
    const idx = parseInt(match[1], 10);
    if (idx >= 0 && idx < 30) {
      return CATEGORIES[idx % 10];
    }
  }
  return null;
}

function rankMediaItems(userFeats: UserFeatures, candidates: MediaItem[] = BASE_MEDIA): MediaItem[] {
  const lastInteracted = userFeats.last_interacted_item || 'None';
  const lastEvent = (userFeats.last_interacted_event || '').toLowerCase();
  const lastCategory = userFeats.last_interacted_category || getCategoryForItemId(lastInteracted);
  const totalImpressions = Math.max(userFeats.impressions_count || 0, 1);
  const likes = userFeats.likes_count || 0;
  const clicks = userFeats.clicks_count || 0;
  const shares = userFeats.shares_count || 0;
  const comments = userFeats.comments_count || 0;
  const hates = userFeats.hates_count || 0;
  const isHateEvent = lastEvent === 'hate';
  const cParam = 0.5;

  return [...candidates]
    .map((cand) => {
      let affinityScore = 0;
      if (lastCategory) {
        if (isHateEvent) {
          if (cand.category === lastCategory) {
            affinityScore = -10.0 - 2.0 * Math.max(hates, 1);
          } else {
            affinityScore = 1.5 + 0.1 * likes + 0.05 * clicks;
          }
        } else {
          if (cand.category === lastCategory) {
            affinityScore = 2.0 + 0.2 * likes + 0.1 * clicks + 0.3 * shares + 0.15 * comments;
            if (hates > 0) affinityScore -= 0.5 * hates;
          } else {
            affinityScore = 0;
          }
        }
      }
      const ni = lastInteracted.includes(cand.id) ? 1 : 0;
      const ucbBonus = cParam * Math.sqrt(Math.log(totalImpressions + 1) / (ni + 1));
      const totalScore = parseFloat((affinityScore + ucbBonus).toFixed(4));
      return {
        ...cand,
        score: totalScore,
        affinity_score: parseFloat(affinityScore.toFixed(4)),
        ucb_bonus: parseFloat(ucbBonus.toFixed(4)),
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0) || a.index - b.index);
}

function queueUpcomingRecommendations(
  currentFeed: MediaItem[],
  currIdx: number,
  rankedCandidates: MediaItem[],
  lastInteractionType?: string
): MediaItem[] {
  const viewedHistory = currentFeed.slice(0, currIdx + 1);
  const viewedIds = new Set(viewedHistory.map((item) => item.id));

  let unviewedRanked = rankedCandidates.filter((item) => !viewedIds.has(item.id));
  const alreadyViewedRanked = rankedCandidates.filter((item) => viewedIds.has(item.id));

  const activeItem = currentFeed[currIdx];

  if (lastInteractionType === 'hate' && activeItem?.category && unviewedRanked.length > 0) {
    const nonHatedIdx = unviewedRanked.findIndex(
      (item) => item.category !== activeItem.category
    );

    if (nonHatedIdx !== -1) {
      const [topPick] = unviewedRanked.splice(nonHatedIdx, 1);
      unviewedRanked = [topPick, ...unviewedRanked];
    }
  }

  return [...viewedHistory, ...unviewedRanked, ...alreadyViewedRanked];
}

type UserFeatures = {
  last_interacted_item?: string;
  last_interacted_event?: string;
  last_interacted_category?: string;
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
  ranked_videos?: string[];
  recommendations?: MediaItem[];
} & UserFeatures;

const PIPELINE_STAGES = ['Event', 'Queue', 'Feature Store'] as const;
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
          {tab === 'demo' ? 'Live Demo' : 'Offline Model Replay'}
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
  const [mediaFeed, setMediaFeed] = useState<MediaItem[]>(BASE_MEDIA);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; item: string; status: number; error?: boolean } | null>(
    null
  );
  const [pipelineActiveStage, setPipelineActiveStage] = useState<PipelineStage | null>(null);

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
    last_interacted_event: 'impression',
    last_interacted_category: 'None',
  });

  const localFeaturesRef = useRef(localFeatures);
  localFeaturesRef.current = localFeatures;

  const watchStartRef = useRef<number>(Date.now());
  const pipelineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const currentItem = mediaFeed[currentIndex] || mediaFeed[0] || BASE_MEDIA[0];
  const nextItem = mediaFeed[currentIndex + 1];

  const getFormattedUserId = (val: string) => (val.startsWith('usr_') ? val : `usr_${val.padStart(6, '0')}`);

  const fetchUserProfile = async (rawUserId: string, resetQueue = false) => {
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
        const defaultFeats: UserFeatures = {
          impressions_count: 0,
          clicks_count: 0,
          long_views_count: 0,
          likes_count: 0,
          comments_count: 0,
          shares_count: 0,
          hates_count: 0,
          total_watch_time_ms: 0,
          last_interacted_item: 'None',
          last_interacted_event: 'impression',
          last_interacted_category: 'None',
        };
        setData({ user_id: formattedUserId, features: defaultFeats });
        setLocalFeatures(defaultFeats);
        localFeaturesRef.current = defaultFeats;
        const ranked = rankMediaItems(defaultFeats);
        if (resetQueue) {
          setMediaFeed(ranked);
          setCurrentIndex(0);
        } else {
          setMediaFeed((prev) => queueUpcomingRecommendations(prev, currentIndexRef.current, ranked));
        }
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: FeedResponse = await res.json();
      setData(payload);
      const fetched = payload.events || payload.features || payload || {};

      const currentLocal = localFeaturesRef.current;
      // Impressions/clicks still accumulate from backend + session (they feed the UCB1
      // exploration/affinity scoring) but are no longer shown in the Feature Store Profile panel.
      // The five displayed counters below always start at 0 on a fresh load or user switch —
      // the panel only reflects this session's live interactions, never persisted backend counts.
      const updatedFeats: UserFeatures = {
        impressions_count: Math.max(fetched.impressions_count ?? 0, currentLocal.impressions_count ?? 0),
        clicks_count: Math.max(fetched.clicks_count ?? 0, currentLocal.clicks_count ?? 0),
        long_views_count: resetQueue ? 0 : Math.max(fetched.long_views_count ?? 0, currentLocal.long_views_count ?? 0),
        likes_count: resetQueue ? 0 : Math.max(fetched.likes_count ?? 0, currentLocal.likes_count ?? 0),
        comments_count: resetQueue ? 0 : Math.max(fetched.comments_count ?? 0, currentLocal.comments_count ?? 0),
        shares_count: resetQueue ? 0 : Math.max(fetched.shares_count ?? 0, currentLocal.shares_count ?? 0),
        hates_count: resetQueue ? 0 : Math.max(fetched.hates_count ?? 0, currentLocal.hates_count ?? 0),
        total_watch_time_ms: Math.max(fetched.total_watch_time_ms ?? 0, currentLocal.total_watch_time_ms ?? 0),
        // On a fresh load / user switch (resetQueue), these always start clean —
        // no carrying over the previously-selected user's last item/event/category.
        last_interacted_item: resetQueue
          ? 'None'
          : (currentLocal.last_interacted_item && currentLocal.last_interacted_item !== 'None'
              ? currentLocal.last_interacted_item
              : (fetched.last_interacted_item || 'None')),
        last_interacted_event: resetQueue
          ? 'impression'
          : (currentLocal.last_interacted_event && currentLocal.last_interacted_event !== 'impression'
              ? currentLocal.last_interacted_event
              : (fetched.last_interacted_event || 'impression')),
        last_interacted_category: resetQueue
          ? 'None'
          : (currentLocal.last_interacted_category && currentLocal.last_interacted_category !== 'None'
              ? currentLocal.last_interacted_category
              : (fetched.last_interacted_category || getCategoryForItemId(fetched.last_interacted_item) || 'None')),
      };
      setLocalFeatures(updatedFeats);
      localFeaturesRef.current = updatedFeats;

      const ranked = rankMediaItems(updatedFeats, BASE_MEDIA);

      if (resetQueue) {
        setMediaFeed(ranked);
        setCurrentIndex(0);
      } else {
        setMediaFeed((prev) => queueUpcomingRecommendations(prev, currentIndexRef.current, ranked));
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerPipelinePulse = () => {
    if (pipelineTimerRef.current) clearTimeout(pipelineTimerRef.current);
    const stages: PipelineStage[] = ['Event', 'Queue', 'Feature Store'];
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

  const updateLocalFeature = (eventType: string, itemId: string, extraMs = 0) => {
    const itemCat = getCategoryForItemId(itemId) || 'None';
    
    setLocalFeatures((prev) => {
      const isPassiveExit = (eventType === 'impression' || eventType === 'long_view') && prev.last_interacted_item === itemId;
      const effectiveEvent = isPassiveExit && prev.last_interacted_event ? prev.last_interacted_event : eventType;

      const updated: UserFeatures = {
        ...prev,
        last_interacted_item: itemId,
        last_interacted_event: effectiveEvent,
        last_interacted_category: itemCat,
      };
      
      if (eventType === 'impression') updated.impressions_count = (prev.impressions_count || 0) + 1;
      if (eventType === 'click') updated.clicks_count = (prev.clicks_count || 0) + 1;
      if (eventType === 'long_view') updated.long_views_count = (prev.long_views_count || 0) + 1;
      if (eventType === 'like') updated.likes_count = (prev.likes_count || 0) + 1;
      if (eventType === 'comment') updated.comments_count = (prev.comments_count || 0) + 1;
      if (eventType === 'share') updated.shares_count = (prev.shares_count || 0) + 1;
      if (eventType === 'hate') updated.hates_count = (prev.hates_count || 0) + 1;
      if (extraMs > 0) updated.total_watch_time_ms = (prev.total_watch_time_ms || 0) + extraMs;
      
      localFeaturesRef.current = updated;
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
      localFeaturesRef.current = reverted;
      return reverted;
    });
  };

  const handleInteraction = async (eventType: string, itemId: string = currentItem.id, extraMs = 0) => {
    const formattedUserId = getFormattedUserId(selectedUserRaw);
    const endpoint = process.env.NEXT_PUBLIC_EVENTS_ENDPOINT || 'https://h0pe9irg1f.execute-api.us-east-2.amazonaws.com/v1/events';

    const currentLocal = localFeaturesRef.current;
    const isPassiveExit = (eventType === 'impression' || eventType === 'long_view') && currentLocal.last_interacted_item === itemId;
    const effectiveEvent = isPassiveExit && currentLocal.last_interacted_event ? currentLocal.last_interacted_event : eventType;

    updateLocalFeature(eventType, itemId, extraMs);
    triggerPipelinePulse();

    let nextFeed: MediaItem[] = [];

    setMediaFeed((prev) => {
      const itemCat = getCategoryForItemId(itemId) || 'None';
      const updatedFeats = localFeaturesRef.current;

      let candidatePool = BASE_MEDIA;
      if (effectiveEvent === 'hate' && itemCat !== 'None') {
        candidatePool = BASE_MEDIA.filter((m) => m.category !== itemCat);
      }

      const newlyRanked = rankMediaItems(updatedFeats, candidatePool);
      nextFeed = queueUpcomingRecommendations(prev, currentIndexRef.current, newlyRanked, effectiveEvent);
      return nextFeed;
    });

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
    } catch (err) {
      console.error('Failed to dispatch event:', err);
      revertLocalFeature(eventType, extraMs);
    }

    return nextFeed;
  };

  const navigateFeed = async (direction: 'next' | 'prev') => {
    const elapsedMs = Date.now() - watchStartRef.current;
    const activeItem = currentItem;

    if (direction === 'next') {
      setImgError(false);

      const updatedFeed = await handleInteraction('impression', activeItem.id, elapsedMs);
      if (elapsedMs > 5000) {
        await handleInteraction('long_view', activeItem.id);
      }

      setCurrentIndex((p) => Math.min(p + 1, updatedFeed.length > 0 ? updatedFeed.length - 1 : mediaFeed.length - 1));
    } else if (direction === 'prev' && currentIndex > 0) {
      setImgError(false);
      setCurrentIndex((p) => p - 1);
    }

    watchStartRef.current = Date.now();
  };

  useEffect(() => {
    fetchUserProfile(selectedUserRaw, true);
    watchStartRef.current = Date.now();
  }, [selectedUserRaw]);

  const feats = localFeatures;

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

        {/* Status Toast — Live Demo only */}
        {activeTab === 'demo' && lastEvent && (
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
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-medium text-cyan-400 bg-black/70 border border-cyan-500/30 px-2.5 py-1 rounded-full shadow-sm">
                        {currentItem.id}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        {currentItem.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentItem.score !== undefined && (
                        <span className="text-[10px] font-mono text-zinc-300 bg-black/60 border border-white/10 px-2 py-0.5 rounded">
                          Score: {currentItem.score.toFixed(2)}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-300 bg-black/40 border border-white/10 px-2.5 py-1 rounded-md">
                        {currentIndex + 1} / {mediaFeed.length}
                      </span>
                    </div>
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
                  <div className="relative z-10 p-5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
                          {currentItem.category}
                        </span>
                        {currentItem.affinity_score !== undefined && currentItem.affinity_score > 0 && (
                          <span className="text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                            Affinity Match
                          </span>
                        )}
                      </div>
                      {nextItem && (
                        <span className="text-[10px] font-mono text-zinc-400 bg-black/60 border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="text-zinc-500">Queued Next:</span>
                          <span className="text-cyan-300 font-medium">{nextItem.category}</span> ({nextItem.id})
                        </span>
                      )}
                    </div>
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

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-1">
                  <h4 className="text-xs font-mono font-semibold text-zinc-400 mb-3 uppercase tracking-wider">
                    Feature Store Profile
                  </h4>
                  <StatRow label="Likes" value={feats.likes_count || 0} accent={true} />
                  <StatRow label="Long Views (>5s)" value={feats.long_views_count || 0} />
                  <StatRow label="Shares" value={feats.shares_count || 0} />
                  <StatRow label="Comments" value={feats.comments_count || 0} />
                  <StatRow label="Hates" value={feats.hates_count || 0} />
                  <StatRow label="Last Category" value={feats.last_interacted_category || 'None'} />
                  <StatRow label="Last Event" value={feats.last_interacted_event || 'None'} />
                </div>
              </div>
            </section>
          </>
        ) : (
          /* TAB 2: ANALYTICS DASHBOARD */
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 shadow-sm">
            <AnalyticsDashboard />
          </div>
        )}

      </div>
    </div>
  );
}