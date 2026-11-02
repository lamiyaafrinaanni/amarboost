import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Layout, LayoutDashboard, ShoppingCart, List, History, Wallet, Moon, Sun, Menu, X, Bell, LogOut, 
  ChevronRight, Search, Info, AlertTriangle, Send, MessageCircle, Facebook, Instagram, Youtube, Building, 
  Twitter, Music, MessageSquare, Globe, Play, Users, User as UserIcon, Heart, Eye, Share2, Copy, Check, Headphones, Settings, Trash2, Plus, Edit2, EyeOff, CreditCard, CheckCircle2, Key,
  Link as LinkIcon, ExternalLink, RefreshCw, HelpCircle, ChevronDown, Clock, Loader2, ShieldAlert, Activity, XCircle, Download, Receipt, Printer, Truck, Inbox, Calendar, Filter, Monitor, Megaphone, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast, { Toaster } from 'react-hot-toast';
import { GoogleGenAI } from "@google/genai";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import AdminUsersManager from './components/AdminUsersManager';
import UserProfile from './components/UserProfile';
import DeveloperApiKeys from './components/DeveloperApiKeys';
import OrderTracker from './components/OrderTracker';
import ResellerDashboard from './components/ResellerDashboard';

// Shared Currency Utilities
export let currentCurrency: 'USD' | 'BDT' = (localStorage.getItem('amarboost_currency') as 'USD' | 'BDT') || 'USD';
export let currentUsdToBdtRate = 120;

export const setGlobalCurrencyState = (currency: 'USD' | 'BDT', rate: number) => {
  currentCurrency = currency;
  currentUsdToBdtRate = rate;
};

const formatPrice = (price: number | string, currencyOverride?: 'USD' | 'BDT', rateOverride?: number) => {
  const p = typeof price === 'string' ? parseFloat(price) || 0 : (price || 0);
  const activeCurrency = currencyOverride || currentCurrency;
  const activeRate = rateOverride || currentUsdToBdtRate;

  if (activeCurrency === 'BDT') {
    const bdtAmount = p * activeRate;
    return `৳${bdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (num: number | string) => {
  const n = typeof num === 'string' ? parseInt(num) : num;
  return n.toLocaleString();
};

interface SearchResult {
  score: number;
  matches: boolean;
}

const getSearchScore = (name: string, category: string, serviceId: string | number, searchQuery: string): SearchResult => {
  if (!searchQuery) {
    return { score: 1, matches: true };
  }

  const query = searchQuery.trim().toLowerCase();
  const lowerName = (name || '').toLowerCase();
  const lowerCategory = (category || '').toLowerCase();
  const idStr = serviceId !== undefined && serviceId !== null ? String(serviceId) : '';

  // 1. Direct match with ID is the highest priority
  if (idStr && idStr === query) {
    return { score: 10000, matches: true };
  }
  if (idStr && idStr.includes(query)) {
    return { score: 5000 + query.length, matches: true };
  }

  // 2. Direct exact phrase match in name or category
  const targetText = `${lowerName} ${lowerCategory}`;
  if (targetText.includes(query)) {
    return { score: 1000 + query.length, matches: true };
  }

  // 3. Word-based match (tokenized search)
  const queryWords = query.split(/[\s|,\-\/+\|]+/).filter(w => w.length > 0);
  if (queryWords.length === 0) {
    return { score: 1, matches: true };
  }

  let matchedWordsCount = 0;
  let score = 0;

  // Helper to check synonyms / abbreviations
  const checkWordMatch = (word: string): boolean => {
    if (targetText.includes(word)) return true;
    
    // Abbreviations handling
    if (word === 'hq' && (targetText.includes('high quality') || targetText.includes('high-quality') || targetText.includes('highquality'))) return true;
    if ((word === 'high' || word === 'quality') && targetText.includes('hq')) return true;
    
    if (word === 'fb' && targetText.includes('facebook')) return true;
    if (word === 'facebook' && targetText.includes('fb')) return true;

    if (word === 'ig' && targetText.includes('instagram')) return true;
    if (word === 'instagram' && targetText.includes('ig')) return true;

    if (word === 'yt' && targetText.includes('youtube')) return true;
    if (word === 'youtube' && targetText.includes('yt')) return true;

    if (word === 'tk' && targetText.includes('tiktok')) return true;
    if (word === 'tiktok' && targetText.includes('tk')) return true;

    return false;
  };

  for (const word of queryWords) {
    if (checkWordMatch(word)) {
      matchedWordsCount++;
      // Exact word match vs substring match
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedWord}\\b`);
      if (wordRegex.test(targetText)) {
        score += 10;
      } else {
        score += 5;
      }
    }
  }

  let matches = false;
  if (queryWords.length === 1) {
    matches = matchedWordsCount >= 1;
  } else if (queryWords.length === 2) {
    matches = matchedWordsCount >= 1;
  } else {
    // If 3 or more words, require at least 2 words or 30% of words (whichever is smaller)
    const minRequired = Math.min(2, queryWords.length);
    matches = matchedWordsCount >= minRequired;
  }

  if (matches) {
    score += (matchedWordsCount / queryWords.length) * 100;
  }

  return { score, matches };
};

const salvageText = (raw: string): string => {
  try {
    const textIdx = raw.indexOf('"text"');
    if (textIdx !== -1) {
      const colonIdx = raw.indexOf(':', textIdx);
      if (colonIdx !== -1) {
        let quoteChar = '';
        let startQuoteIdx = -1;
        for (let i = colonIdx + 1; i < raw.length; i++) {
          if (raw[i] === '"' || raw[i] === "'") {
            quoteChar = raw[i];
            startQuoteIdx = i;
            break;
          }
        }
        if (startQuoteIdx !== -1) {
          let textValue = '';
          let escaped = false;
          for (let i = startQuoteIdx + 1; i < raw.length; i++) {
            if (escaped) {
              if (raw[i] === 'n') textValue += '\n';
              else if (raw[i] === 't') textValue += '\t';
              else textValue += raw[i];
              escaped = false;
            } else if (raw[i] === '\\') {
              escaped = true;
            } else if (raw[i] === quoteChar) {
              return textValue;
            } else {
              textValue += raw[i];
            }
          }
          return textValue;
        }
      }
    }
  } catch (e) {
    // Ignore and fallback
  }
  return raw;
};

export interface MarketingDetails {
  categoryType: string;
  description: string;
  benefits: string[];
  requirements: string[];
}

export function getServiceMarketingDetails(name: string, category: string): MarketingDetails {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();

  // IG followers
  if ((n.includes('instagram') || c.includes('instagram')) && (n.includes('follower') || c.includes('follower'))) {
    return {
      categoryType: 'Instagram Followers',
      description: 'Supercharge your Instagram profile presence with high-retention followers delivered through our premium distributor networks. Ideal for scaling brand credibility, building consumer trust, and organically bootstrapping your target audience engagement metrics.',
      benefits: [
        '🚀 Amplifies immediate profile trust and real-time social authority score.',
        '📈 Enhances discoverability within Instagram Search indices and Explore algorithms.',
        '🛡️ Safe, reliable delivery patterns matching native flow updates with refill protection.'
      ],
      requirements: [
        '🔗 Provide your exact, full profile link (e.g., https://instagram.com/your_username)',
        '🔓 Target account profile settings MUST survive as fully PUBLIC during delivery.',
        '🚫 Do NOT modify your handle/username or toggle private mode while the order is processing.'
      ]
    };
  }

  // IG Likes/Views
  if (n.includes('instagram') || c.includes('instagram')) {
    return {
      categoryType: 'Instagram Likes & Views',
      description: 'Add instant viral metrics to your Instagram publications. Secure likes, reach, and playback views for photos, feed videos, and Reels. Perfect for driving high-engagement signals that help rank posts on popular hashtags.',
      benefits: [
        '🔥 Boosts individual post rankings, driving wider hashtag discoverability.',
        '📊 Optimizes feed performance by generating strong algorithmic impression-to-like ratios.',
        '⚡ Prompt automated delivery activation starting shortly after order submission.'
      ],
      requirements: [
        '🔗 Provide the direct, specific post or Reels publication link URL.',
        '🔓 Post and associated account MUST be set to globally public status.',
        '⏳ Avoid deleting the post or converting the profile to private during fulfillment.'
      ]
    };
  }

  // FB Page Followers & Likes
  if ((n.includes('facebook') || c.includes('facebook')) && (n.includes('page') || n.includes('follower') || c.includes('page') || c.includes('follower') || n.includes('fan') || n.includes('group'))) {
    return {
      categoryType: 'Facebook Followers & Page Likes',
      description: 'Develop highly authoritative, business-safe page likes and profile followers. Perfect for modern brands, online startups, and public figures seeking a professional digital footprint backed by strong social proof.',
      benefits: [
        '💼 Instantly triggers enterprise-grade consumer trust and brand credibility.',
        '📈 Boosts initial indexing ranking within Facebook and search engine directories.',
        '🛡️ Secured non-drop delivery using active distributor nodes.'
      ],
      requirements: [
        '🔗 Provide page link (e.g., https://facebook.com/yourpage) or Profile URL.',
        '🔓 Confirm page details have absolutely no country restrictions, age gates, or hidden modes.',
        '🚫 Do not place duplicate concurrent orders for the same link to prevent network status overlaps.'
      ]
    };
  }

  // FB Likes
  if (n.includes('facebook') || c.includes('facebook')) {
    return {
      categoryType: 'Facebook Likes & post interactions',
      description: 'Strengthen social media interaction rates and post exposure using premium Facebook post reactions, shares, and likes. Tailored to trigger high organic reach rankings inside users news feeds.',
      benefits: [
        '🌟 Encourages high-quality, continuous user comments and conversations.',
        '🎨 Select from diverse reactions (Love, Care, Haha, Wow) for clean social integration.',
        '📈 Boosts overall content authority and sharing multiplier scores.'
      ],
      requirements: [
        '🔗 Enter direct public post or photo URL link specifically.',
        '🔓 Post visibility MUST be configured to Public (visible to Everyone globally).',
        '⏳ Do not change post privacy settings while the SMM server delivers likes.'
      ]
    };
  }

  // YT Views
  if ((n.includes('youtube') || c.includes('youtube')) && (n.includes('view') || c.includes('view') || n.includes('play') || n.includes('watch'))) {
    return {
      categoryType: 'YouTube Views',
      description: 'Sustainably grow your YouTube audience retention and video plays. Sourced from authentic desktop and mobile view nodes, perfect for indexing algorithms and YouTube Partner Program guidelines.',
      benefits: [
        '🎥 Increases watch-hour parameters to accelerate monetization approvals.',
        '📈 Enhances search term rankings, making videos appear more often in lateral feeds.',
        '🛡️ Compliant with modern AdSense guidelines, steady non-drop fulfillment.'
      ],
      requirements: [
        '🔗 Paste the specific, individual YouTube Video URL link only.',
        '🚫 Do NOT use private paths, location restricted feeds, or raw playlist URLs.',
        '⏳ Verify the video exists and allows playback embedding globally.'
      ]
    };
  }

  // YT Subscribers/Channel
  if (n.includes('youtube') || c.includes('youtube')) {
    return {
      categoryType: 'YouTube Subscribers & Channel Growth',
      description: 'Accelerate channel milestones with active, high-retention YouTube subscribers. Perfect for launching content creator channels, stabilizing audience trust levels, and hitting important monetization target bounds.',
      benefits: [
        '🥇 Channel roadmap milestone support towards 1k subscribers monetize standards.',
        '📈 Elevates entire channel social authority score in YouTube searches.',
        '🔒 Safe execution spacing delivered in steady daily intervals to avoid spam alerts.'
      ],
      requirements: [
        '🔗 Provide exact channel URL link (e.g., https://youtube.com/channel/ChannelID).',
        '🔓 Channel setting subscriber count MUST be set to PUBLIC display.',
        '⏳ Maintain channel public settings until all subscribers are fully dispatched.'
      ]
    };
  }

  // TikTok Followers
  if ((n.includes('tiktok') || c.includes('tiktok')) && (n.includes('follower') || c.includes('follower'))) {
    return {
      categoryType: 'TikTok Followers',
      description: 'Unlock key professional creator attributes on TikTok, such as dynamic LIVE streaming and biological homepage URL redirection, by safely boosting your subscriber followers metric.',
      benefits: [
        '🦄 Access interactive capabilities such as LIVE feeds and clickable external links.',
        '🚀 Heightens base authority to help propel videos into the TikTok For You Page feed.',
        '⚡ Fast triggering sequence with automated tracking parameters.'
      ],
      requirements: [
        '🔗 Enter complete TikTok profile page URL (e.g., https://tiktok.com/@yourprofile).',
        '🔓 Profile settings must remain fully Public during the entire boost.',
        '🚫 Do not modify your username tag or toggle private settings during delivery.'
      ]
    };
  }

  // TikTok Views/Plays
  if (n.includes('tiktok') || c.includes('tiktok')) {
    return {
      categoryType: 'TikTok Plays & Shares',
      description: 'Drive high-tempo play count loops, views, and post shares on your TikTok entries. Perfect for sending high-traction interaction feedback loops to TikTok FYP algorithms.',
      benefits: [
        '🔥 Boosts content algorithmic prioritization by inflating quick initial viewer indices.',
        '📈 Maximizes engagement levels to turn standard uploads into trending assets.',
        '⚡ Extremely high speed, almost instant trigger capabilities.'
      ],
      requirements: [
        '🔗 Must supply direct TikTok Video share link URL.',
        '🔓 Target video permissions must be set to allow views globally by Everyone.',
        '⏳ Avoid making video private or deleted while numbers are being added.'
      ]
    };
  }

  // Telegram Members
  if (n.includes('telegram') || c.includes('telegram')) {
    return {
      categoryType: 'Telegram Members',
      description: 'Populate your Telegram channels and supergroups with genuine looking, high-integrity member records. Ideal for crypto ventures, news networks, and signal providers hoping to showcase immediate professional scale.',
      benefits: [
        '📣 Encourages real community conversion rates by showing immediate trust and scale.',
        '🛡️ Stable, non-drop membership records with full active channel support.',
        '🔒 Safe delivery needing only the channel/group link—no administrator roles needed.'
      ],
      requirements: [
        '🔗 Provide standard public channel link (e.g., https://t.me/yourgroupusername).',
        '🔓 Channel or Group must be PUBLIC. Private join links are not supported.',
        '🚫 Ensure the channel allows global user membership entries and search queries.'
      ]
    };
  }

  // Web/Traffic
  if (n.includes('website') || c.includes('website') || n.includes('traffic') || c.includes('traffic') || n.includes('visit') || n.includes('visitor') || c.includes('visitor')) {
    return {
      categoryType: 'Website Traffic & SEO',
      description: 'Direct high-retention global or targeted visitor sessions straight to your landing page or portal. Configured to align with modern SEO rules by tracking organic reference metrics safely.',
      benefits: [
        '🌐 Improves desktop/mobile alexa and search engine ranking coefficients.',
        '📊 Fully traceable inside Google Analytics dashboard interfaces.',
        '🚀 Safe, stable session timers that lower bounce rates.'
      ],
      requirements: [
        '🔗 Enter complete landing URL path, starting with http:// or https://.',
        '🚫 Do NOT provide redirect URLs, pages triggering malware alerts, or adult portals.',
        '⏳ Ensure target server can scale up to handle sudden, high concurrent hits.'
      ]
    };
  }

  // X/Twitter
  if (n.includes('twitter') || c.includes('twitter') || n.includes(' x ') || c.includes(' x ')) {
    return {
      categoryType: 'Twitter (X) Boosts',
      description: 'Sustain corporate stature and opinion leadership on X / Twitter. Secure premium target audience followers, retweets, and likes to shape trending, public topics.',
      benefits: [
        '🐦 Establishes professional thought-leadership footprint instantly.',
        '📊 Expands organic impressions and real-time interactive reach.',
        '🛡️ Secured methods fully compliant with Twitter API policy bounds.'
      ],
      requirements: [
        '🔗 Enter exact Profile page URL for followers, or direct Post link for tweet reactions.',
        '🔓 Target account must stay public during delivery.'
      ]
    };
  }

  // Default / Other SMM
  return {
    categoryType: 'Premium SMM Operations',
    description: 'Elevate your online influence across all modern web networks. Our expert social delivery channels ensure secure fulfillment, robust safety records, and premium support throughout.',
    benefits: [
      '📈 Elevates overall organic brand perception and footprint.',
      '⚡ Multi-node server nodes ensure rapid activation metrics.',
      '🔒 Fully anonymous and safe operations keeping your accounts protected.'
    ],
    requirements: [
      '🔗 Supply the exact, direct URL link (e.g. no cropped tags or unsearchable names).',
      '🔓 Make sure target settings are public to let delivery network process the entry.'
    ]
  };
}

export function OrderStatusBadge({ status }: { status: string }) {
  const normalizedStatus = (status || '').toLowerCase().replace('_', '');

  let bgClass = 'bg-slate-50 dark:bg-slate-800/50';
  let borderClass = 'border border-slate-200 dark:border-slate-700/50';
  let textClass = 'text-slate-600 dark:text-slate-400';
  let label = status.replace('_', ' ');
  let Icon: any = HelpCircle;
  let pulseDotColor = '';

  switch (normalizedStatus) {
    case 'completed':
    case 'success':
      bgClass = 'bg-emerald-50 dark:bg-emerald-950/20';
      borderClass = 'border border-emerald-200/80 dark:border-emerald-800/40';
      textClass = 'text-emerald-700 dark:text-emerald-400';
      Icon = CheckCircle2;
      label = 'Completed';
      break;

    case 'pending':
      bgClass = 'bg-amber-50 dark:bg-amber-950/20';
      borderClass = 'border border-amber-200/80 dark:border-amber-800/40';
      textClass = 'text-amber-700 dark:text-amber-400';
      Icon = Clock;
      label = 'Pending';
      pulseDotColor = 'bg-amber-500';
      break;

    case 'inprogress':
    case 'in_progress':
      bgClass = 'bg-blue-50 dark:bg-blue-950/20';
      borderClass = 'border border-blue-200/80 dark:border-blue-800/40';
      textClass = 'text-blue-700 dark:text-blue-400';
      Icon = RefreshCw;
      label = 'In Progress';
      pulseDotColor = 'bg-blue-500';
      break;

    case 'processing':
      bgClass = 'bg-indigo-50 dark:bg-indigo-950/20';
      borderClass = 'border border-indigo-200/80 dark:border-indigo-800/40';
      textClass = 'text-indigo-700 dark:text-indigo-400';
      Icon = Activity;
      label = 'Processing';
      pulseDotColor = 'bg-indigo-500';
      break;

    case 'awaitingadmin':
    case 'awaiting_admin':
      bgClass = 'bg-violet-50 dark:bg-violet-950/25';
      borderClass = 'border border-violet-200/80 dark:border-violet-800/40';
      textClass = 'text-violet-700 dark:text-violet-400';
      Icon = ShieldAlert;
      label = 'Awaiting';
      pulseDotColor = 'bg-violet-500';
      break;

    case 'partial':
      bgClass = 'bg-sky-50 dark:bg-sky-950/20';
      borderClass = 'border border-sky-200/80 dark:border-sky-800/40';
      textClass = 'text-sky-700 dark:text-sky-400';
      Icon = Info;
      label = 'Partial';
      break;

    case 'canceled':
    case 'cancelled':
      bgClass = 'bg-slate-50 dark:bg-slate-800/80';
      borderClass = 'border border-slate-200/80 dark:border-slate-700/50';
      textClass = 'text-slate-500 dark:text-slate-400';
      Icon = XCircle;
      label = 'Canceled';
      break;

    case 'fail':
    case 'failed':
    case 'rejected':
      bgClass = 'bg-rose-50 dark:bg-rose-950/20';
      borderClass = 'border border-rose-250/80 dark:border-rose-800/40';
      textClass = 'text-red-700 dark:text-red-400';
      Icon = AlertTriangle;
      label = 'Failed';
      break;

    default:
      bgClass = 'bg-slate-50 dark:bg-slate-800/50';
      borderClass = 'border border-slate-200 dark:border-slate-700/30';
      textClass = 'text-slate-600 dark:text-slate-400';
      Icon = HelpCircle;
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider shadow-xs select-none ${bgClass} ${borderClass} ${textClass}`}>
      {pulseDotColor && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseDotColor}`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${pulseDotColor}`}></span>
        </span>
      )}
      <Icon size={14} className={`${normalizedStatus === 'inprogress' || normalizedStatus === 'processing' ? 'animate-spin' : ''} shrink-0`} style={normalizedStatus === 'inprogress' || normalizedStatus === 'processing' ? { animationDuration: '3s' } : undefined} />
      <span>{label}</span>
    </span>
  );
}

const calculateOrderProgress = (order: Order) => {
  const status = (order.status || '').toLowerCase().replace('_', '');
  
  if (status === 'completed' || status === 'success') {
    return { percentage: 100, label: 'Completed', showBar: true };
  }
  
  if (status === 'canceled' || status === 'cancelled' || status === 'fail' || status === 'failed' || status === 'rejected') {
    const remains = order.remains !== null && order.remains !== undefined ? parseInt(order.remains) : null;
    if (remains !== null && remains > 0 && order.quantity > 0) {
      const delivered = Math.max(0, order.quantity - remains);
      const percentage = Math.min(100, Math.round((delivered / order.quantity) * 100));
      return { percentage, label: `Canceled (${percentage}%)`, showBar: true, isCanceled: true };
    }
    return { percentage: 0, label: 'Canceled', showBar: false, isCanceled: true };
  }

  if (status === 'pending' || status === 'awaitingadmin') {
    return { percentage: 0, label: 'Pending', showBar: true };
  }

  // Inprogress, processing, partial, etc.
  const remains = order.remains !== null && order.remains !== undefined ? parseInt(order.remains) : null;
  const qty = order.quantity || 1;

  if (remains !== null && remains >= 0) {
    if (remains > qty) {
      return { percentage: 0, label: 'Initializing', showBar: true };
    }
    const delivered = Math.max(0, qty - remains);
    const percentage = Math.min(100, Math.round((delivered / qty) * 100));
    return { percentage, label: `${percentage}% Active`, showBar: true };
  }

  if (status === 'inprogress' || status === 'processing' || status === 'partial') {
    return { percentage: 50, label: 'Active', showBar: true, isEstimated: true };
  }

  return { percentage: 0, label: 'Pending', showBar: false };
};

export function OrderProgressBar({ order }: { order: Order }) {
  const { percentage, label, showBar, isCanceled, isEstimated } = calculateOrderProgress(order);
  if (!showBar) return null;

  const barColor = isCanceled 
    ? 'bg-slate-400 dark:bg-slate-500' 
    : percentage === 100 
      ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' 
      : 'bg-indigo-600 dark:bg-indigo-500';

  return (
    <div className="w-full mt-1.5 select-none text-left">
      <div className="flex justify-between items-center text-[9px] mb-1 font-black uppercase tracking-wider">
        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span>{label}</span>
          {isEstimated && <span className="lowercase text-[8px] opacity-75 font-normal">(estimated)</span>}
        </span>
        <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{percentage}%</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Visual Timeline Stepper */}
      <div className="flex justify-between items-center mt-1.5 text-[8px] font-black uppercase tracking-widest px-0.5 text-slate-400">
        <div className="flex flex-col items-start gap-0.5">
          <span className={percentage >= 0 ? "text-indigo-600 dark:text-indigo-400" : ""}>● Ordered</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className={percentage > 0 && percentage < 100 ? "text-indigo-500 animate-pulse font-extrabold" : percentage >= 100 ? "text-emerald-500 font-extrabold" : ""}>
            {percentage > 0 && percentage < 100 ? "🏃 Active" : "● Active"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={percentage === 100 ? "text-emerald-500" : ""}>
            {percentage === 100 ? "✓ Success" : "● Success"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function OrderProgressBarMini({ order }: { order: Order }) {
  const { percentage, showBar, isCanceled } = calculateOrderProgress(order);
  if (!showBar) return null;

  const barColor = isCanceled 
    ? 'bg-slate-400 dark:bg-slate-500' 
    : percentage === 100 
      ? 'bg-emerald-500' 
      : 'bg-indigo-600 dark:bg-indigo-500';

  return (
    <div className="w-full select-none" title={`Progress: ${percentage}%`}>
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-[8px] text-center font-bold text-slate-400 mt-0.5 font-mono">{percentage}%</div>
    </div>
  );
}

function LogoPreloader() {
  return (
    <div className="flex flex-col items-center justify-center p-12 min-h-[420px] animate-fade-in">
      <div className="relative flex items-center justify-center mb-6">
        {/* Animated concentric rings */}
        <div className="absolute w-20 h-20 rounded-full border-2 border-indigo-600/10 border-t-indigo-600 animate-spin" style={{ animationDuration: '0.8s' }}></div>
        <div className="absolute w-16 h-16 rounded-full border-2 border-dashed border-violet-500/20 border-t-violet-500 animate-spin" style={{ animationDuration: '1.4s', animationDirection: 'reverse' }}></div>
        
        {/* Center glowing element */}
        <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-indigo-500/30 dark:shadow-none animate-pulse">
          A
        </div>
      </div>
      
      {/* Visual loader texts */}
      <div className="text-center space-y-2.5 max-w-xs">
        <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
          AmarBoost SMM Panel
        </h4>
        
        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold tracking-normal animate-pulse">
          পেজ লোড হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...
        </p>
        
        {/* Animated bounce dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '0ms' }}></span>
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
          <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
        </div>

        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold font-mono uppercase tracking-wider">
          Retrieving live panel ledger...
        </p>
      </div>
    </div>
  );
}

// Brand SVG Components for a more "real" look
const BrandLogo = ({ name, size = 18, className = "" }: { name: string, size?: number, className?: string }) => {
  const logos: Record<string, React.ReactNode> = {
    facebook: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
    youtube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    tiktok: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.98-.23-2.81.36-.72.51-1.1 1.4-1.1 2.24-.01 1.01.55 1.98 1.44 2.46.48.27 1.01.39 1.56.4.83-.01 1.61-.38 2.09-1.05.39-.54.59-1.2.59-1.87-.02-3.38-.01-6.76-.01-10.14z" />
      </svg>
    ),
    telegram: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0C5.346 0 0 5.346 0 11.944c0 6.598 5.346 11.944 11.944 11.944 6.598 0 11.944-5.346 11.944-11.944C23.888 5.346 18.542 0 11.944 0zm5.83 8.163l-2.03 9.57c-.15.67-.55.83-1.11.51l-3.1-2.28-1.5 1.44c-.17.17-.31.31-.63.31l.22-3.16 5.75-5.2c.25-.22-.05-.35-.39-.13l-7.11 4.48-3.06-1c-.67-.21-.68-.67.14-.99l11.96-4.61c.55-.2.1.25-.18.47z" />
      </svg>
    ),
    whatsapp: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    spotify: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.508 17.302c-.216.354-.675.465-1.028.249-2.815-1.72-6.358-2.107-10.531-1.154-.404.092-.812-.162-.904-.565-.092-.403.162-.812.565-.904 4.569-1.044 8.486-.6 11.65 1.333.353.216.464.675.248 1.029zm1.469-3.262c-.272.44-.847.583-1.287.311-3.222-1.98-8.133-2.556-11.946-1.4c-.492.15-1.015-.128-1.164-.62-.149-.492.128-1.015.62-1.164 4.356-1.322 9.776-.67 13.48 1.606.44.272.583.847.311 1.287zm.128-3.395c-3.863-2.294-10.246-2.507-13.935-1.387-.593.18-1.22-.154-1.4-.747-.18-.593.154-1.22.747-1.4 4.232-1.284 11.285-1.03 15.68 1.58.533.317.707 1.005.39 1.538-.317.533-1.005.707-1.538.39z" />
      </svg>
    ),
    discord: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.682 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.29a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.196.373.29a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
    bkash: (
      <svg width={size} height={size} viewBox="0 0 400 300" fill="none">
        <path d="M217.4,17.2l-105.7,85l-71.1-23l53.9,64.2l-51.5,58.7l158.4-44.1l43.2,95l47.5-122.9l80.5-18l-79-51.9L217.4,17.2z" fill="#E2136E" />
      </svg>
    ),
    nagad: (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" fill="url(#nagad-grad-main)" />
        {/* Stylized runner figure with mail bag & lantern */}
        <path d="M48,32 c1.5,0 2.5,-1 2.5,-2.5 s-1,-2.5 -2.5,-2.5 s-2.5,1 -2.5,2.5 s1,2.5 2.5,2.5 z M45,36 l-5,10 l-4,-2 l-1.5,3 l6.5,3.5 l3,-7.5 l3.5,4 l-1.5,12 h3.5 l2,-13.5 l-3,-4 l2.5,-5.5 z" fill="white" />
        <path d="M43,47.5 l-0.5,2 h1 l-0.5,-2" stroke="white" strokeWidth="0.5" fill="none" />
        <path d="M40.5,39 c-1.5,1 -2,3 -1,4.5 s3,2 4.5,1" fill="white" opacity="0.9" />
        <defs>
          <linearGradient id="nagad-grad-main" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F89E20" />
            <stop offset="40%" stopColor="#EE4036" />
            <stop offset="100%" stopColor="#ED1C24" />
          </linearGradient>
        </defs>
      </svg>
    ),
    rocket: (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="20" fill="#8C3494" />
        {/* DBBL Rocket paper airplane design */}
        <path d="M22,54 L78,22 L56,74 L48,56 L22,54 Z M48,56 L58,38 L38,48 L48,56 Z" fill="white" />
      </svg>
    ),
    bank: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="22" x2="21" y2="22"></line>
        <line x1="6" y1="18" x2="6" y2="11"></line>
        <line x1="10" y1="18" x2="10" y2="11"></line>
        <line x1="14" y1="18" x2="14" y2="11"></line>
        <line x1="18" y1="18" x2="18" y2="11"></line>
        <polygon points="12 2 2 7 22 7 12 2"></polygon>
      </svg>
    ),
  };

  if (logos[name]) return <div className={className}>{logos[name]}</div>;
  
  // Fallback to Lucide icons if brand logo not defined
  const LucideIcon = (LayoutDashboard as any); // Default fallback
  return <LucideIcon size={size} className={className} />;
};

function ServiceHealthIndicator({ serviceId, token, layout = 'inline' }: { serviceId: string; token: string; layout?: 'inline' | 'box' }) {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{
    status: 'healthy' | 'degraded' | 'unreachable';
    latency: number;
    reachable: boolean;
    provider_name: string;
    type: string;
    error?: string | null;
    checked_at?: string;
  } | null>(null);

  const checkHealth = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/health`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setHealth({
        status: 'unreachable',
        latency: 0,
        reachable: false,
        provider_name: 'Unknown',
        type: 'api',
        error: 'Failed to connect to health service'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, [serviceId]);

  if (layout === 'inline') {
    return (
      <div className="flex items-center gap-1 text-[11px] font-bold" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <span className="flex items-center gap-1 text-slate-400">
            <RefreshCw size={10} className="animate-spin" />
            Checking...
          </span>
        ) : health ? (
          <button
            onClick={checkHealth}
            title={health.error || `Recheck (Checked ${health.checked_at ? new Date(health.checked_at).toLocaleTimeString() : ''})`}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all text-[10px] ${
              health.status === 'healthy'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30'
                : health.status === 'degraded'
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30'
                : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-200/50 dark:border-red-800/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              health.status === 'healthy' ? 'bg-emerald-500' : health.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            {health.status === 'healthy' ? 'Healthy' : health.status === 'degraded' ? 'Degraded' : 'Unreachable'}
            <span className="opacity-60 text-[9px] font-mono">({health.latency}ms)</span>
          </button>
        ) : (
          <button 
            onClick={checkHealth}
            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Activity size={10} /> Check Status
          </button>
        )}
      </div>
    );
  }

  // Box layout for NewOrder details
  return (
    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-lg ${
          loading 
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' 
            : !health 
            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500'
            : health.status === 'healthy'
            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500'
            : health.status === 'degraded'
            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-500'
            : 'bg-red-50 dark:bg-red-950/20 text-red-500'
        }`}>
          <Activity size={16} className={loading ? 'animate-pulse' : ''} />
        </div>
        <div>
          <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Provider Connection</div>
          <div className="text-[11px] font-bold dark:text-white flex items-center gap-1.5">
            {loading ? (
              <span className="text-slate-400">Verifying endpoint reachability...</span>
            ) : !health ? (
              <span>Pending Check</span>
            ) : (
              <>
                <span className={`w-2 h-2 rounded-full ${
                  health.status === 'healthy' ? 'bg-emerald-500' : health.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                }`} />
                <span className="capitalize font-black">{health.status}</span>
                <span className="text-[10px] text-slate-400 font-normal">({health.provider_name} SMM API)</span>
              </>
            )}
          </div>
          {health && health.error && (
            <div className="text-[9px] text-red-500 font-bold mt-0.5">{health.error}</div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={checkHealth}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
          loading
            ? 'bg-slate-50 text-slate-400 dark:bg-slate-800'
            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:hover:bg-indigo-950/60'
        }`}
      >
        <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Testing...' : 'Test Connection'}
      </button>
    </div>
  );
}

// Helper to get Social Icon with Vibrant Colors and Real App Icon Look
const getSocialIcon = (category: string = '', name: string = '', size: number = 18) => {
  const text = (category + name).toLowerCase();
  
  const iconWrapper = (icon: React.ReactNode, bgColor: string) => (
    <div 
      className="flex items-center justify-center rounded-lg overflow-hidden relative shrink-0 border border-black/5 dark:border-white/10 shadow-sm" 
      style={{ 
        width: size + 12, 
        height: size + 12, 
        background: bgColor,
      }}
    >
      <div className="relative z-10">
        {icon}
      </div>
    </div>
  );

  const iconProps = { 
    size: size * 0.8, 
    className: "text-white drop-shadow-sm" 
  };

  if (text.includes('facebook')) return iconWrapper(<BrandLogo name="facebook" size={size * 0.9} className="text-white" />, '#1877F2');
  if (text.includes('instagram')) return iconWrapper(<Instagram {...iconProps} />, 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2397 75%, #ad38e7 100%)');
  if (text.includes('youtube')) return iconWrapper(<BrandLogo name="youtube" size={size * 0.9} className="text-white" />, '#FF0000');
  if (text.includes('tiktok')) return iconWrapper(<BrandLogo name="tiktok" size={size * 0.9} className="text-white" />, '#000000');
  if (text.includes('twitter') || text.includes(' x ')) return iconWrapper(<Twitter {...iconProps} className="text-white fill-white" />, '#000000');
  if (text.includes('telegram')) return iconWrapper(<BrandLogo name="telegram" size={size * 0.9} className="text-white" />, '#26A5E4');
  if (text.includes('spotify')) return iconWrapper(<BrandLogo name="spotify" size={size * 0.9} className="text-white" />, '#1DB954');
  if (text.includes('discord')) return iconWrapper(<BrandLogo name="discord" size={size * 0.9} className="text-white" />, '#5865F2');
  if (text.includes('linkedin')) return iconWrapper(<Users {...iconProps} className="text-white fill-white" />, '#0077B5');
  if (text.includes('snapchat')) return iconWrapper(<MessageCircle {...iconProps} className="text-black" />, '#FFFC00');
  if (text.includes('threads')) return iconWrapper(<MessageSquare {...iconProps} />, '#000000');
  if (text.includes('pinterest')) return iconWrapper(<Heart {...iconProps} className="text-white fill-white" />, '#E60023');
  if (text.includes('twitch')) return iconWrapper(<Play {...iconProps} className="text-white fill-white" />, '#9146FF');
  if (text.includes('whatsapp')) return iconWrapper(<BrandLogo name="whatsapp" size={size * 0.9} className="text-white" />, '#25D366');
  if (text.includes('website') || text.includes('traffic')) return iconWrapper(<Globe {...iconProps} />, 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)');
  
  return iconWrapper(<Globe {...iconProps} />, 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)');
};

// Types
interface Service {
  service: string;
  name: string;
  type: string;
  category: string;
  rate: string;
  original_rate?: string;
  min: string;
  max: string;
  description: string;
  custom_margin?: number | null;
  custom_price?: number | null;
  custom_description?: string | null;
  custom_category?: string | null;
  is_hidden?: boolean;
  updated_at?: string | null;
  conflict?: {
    type: 'none' | 'loss' | 'override';
    message: string;
  } | null;
}

interface CustomLink {
  id: number;
  text: string;
  url: string;
  icon: string;
  is_active: number;
}

interface AutoRenewal {
  id: number;
  user_id: number;
  service_id: number;
  link: string;
  quantity: number;
  is_active: number;
  last_renewal: string | null;
}

interface Order {
  id: number;
  service_id: number;
  link: string;
  quantity: number;
  charge: number;
  status: string;
  created_at: string;
  user_id?: number;
  username?: string;
  email?: string;
  remains?: string | null;
  start_count?: string | null;
  note?: string | null;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  balance: number;
  whatsapp_number?: string;
  theme?: 'light' | 'dark';
}

interface ServiceSummaryItem {
  id: any;
  category: string;
  name: string;
  rate_bd: number;
  min: number;
  max: number;
}

const getAiSearchedServices = (userQuery: string, allServices: any[], history?: any[]): ServiceSummaryItem[] => {
  if (!allServices || allServices.length === 0) return [];

  // Helper to map text content to standardized platforms
  const mapPlatform = (text: string): string | null => {
    const t = text.toLowerCase();
    if (t.includes('instagram') || t.includes('insta') || t.includes('ইনস্টাগ্রাম') || t.includes('ইন্সটাগ্রাম') || t.includes('ইনস্টা') || t.includes('ইন্সটা')) return 'instagram';
    if (t.includes('facebook') || t.includes('fb') || t.includes('ফেসবুক') || t.includes('ফেইসবুক')) return 'facebook';
    if (t.includes('youtube') || t.includes('yt') || t.includes('ইউটিউব')) return 'youtube';
    if (t.includes('tiktok') || t.includes('টিকটক') || t.includes('টিক টক')) return 'tiktok';
    if (t.includes('telegram') || t.includes('tg') || t.includes('টেলিগ্রাম')) return 'telegram';
    if (t.includes('twitter') || t.includes(' x ') || t === 'x' || t.includes('টুইটার')) return 'twitter';
    if (t.includes('linkedin') || t.includes('লিংকডইন')) return 'linkedin';
    if (t.includes('spotify') || t.includes('স্পটিফাই')) return 'spotify';
    if (t.includes('twitch') || t.includes('টুইচ')) return 'twitch';
    if (t.includes('kick') || t.includes('কিক')) return 'kick';
    return null;
  };

  // Helper to identify a service's platform
  const getServicePlatform = (s: any): string | null => {
    if (s.platform) {
      const p = mapPlatform(s.platform);
      if (p) return p;
    }
    const catPlatform = mapPlatform(s.category || '');
    if (catPlatform) return catPlatform;
    const namePlatform = mapPlatform(s.name || '');
    if (namePlatform) return namePlatform;
    return null;
  };

  // Helper to normalize Bengali digits to English digits
  const convertBanglaDigits = (str: string): string => {
    const banglaToEnglish: { [key: string]: string } = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
      '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.replace(/[০-৯]/g, char => banglaToEnglish[char] || char);
  };

  // 1. CONTEXT & MEMORY: Detect active platform in discussion
  let activePlatform: string | null = mapPlatform(userQuery);
  if (!activePlatform && history && history.length > 0) {
    // Scan backwards through history to find the most recent platform mentioned by user or bot
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const text = msg.text || '';
      const plat = mapPlatform(text);
      if (plat) {
        activePlatform = plat;
        break;
      }
    }
  }
  
  // Normalize query to lowercase and extract words
  const normalizedQuery = userQuery.toLowerCase().trim();
  const normalizedDigitsQuery = convertBanglaDigits(normalizedQuery);

  // Extract alphanumeric sequences (words) supporting English, Bengali characters
  const queryWords = normalizedQuery
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .split(/\s+/)
    .filter(w => w.trim().length > 1);

  // Common structural/conversational words to skip so we focus on high value keywords
  const stopWords = new Set([
     'ko', 'koro', 'korte', 'chaichi', 'chai', 'daor', 'dao', 'give', 'get', 'for', 'the', 'and', 'with', 'under', 'from', 'rate', 'price', 'bdt', 'tk', 'taka',
     'কত', 'দাম', 'চাই', 'অর্ডার', 'করুন', 'দাও', 'করো', 'আছে', 'কি', 'কোন', 'কোনটা', 'ভালো', 'বেস্ট', 'best', 'cheap', 'সস্তা', 'টাকা'
  ]);
  const informativeKeywords = queryWords.filter(w => !stopWords.has(w));

  // 2. SMART BUDGET EXTRACTION
  let budgetLimit: number | null = null;
  const budgetKeywords = ['টাকা', 'টাকার', 'টাকায়', 'বাজেট', 'বাজেটের', 'বাজেটে', 'tk', 'taka', 'bdt', 'budget', 'under', 'মধ্যে', 'কম', 'সীমা', 'রেঞ্জ', 'range'];
  const hasBudgetIntent = budgetKeywords.some(keyword => normalizedDigitsQuery.includes(keyword));

  if (hasBudgetIntent) {
    const numberMatches = normalizedDigitsQuery.match(/\b\d+(?:\.\d+)?\b/g);
    if (numberMatches) {
      const candidates = numberMatches.map(Number).filter(n => n > 0 && n < 5000 && n !== 1000);
      if (candidates.length > 0) {
        budgetLimit = candidates[0];
      }
    }
  }

  // If no informative keywords exist, default to first 10 matching budget or platform if possible
  if (informativeKeywords.length === 0) {
    let filtered = allServices;
    if (activePlatform) {
      filtered = filtered.filter(s => getServicePlatform(s) === activePlatform);
    }
    if (budgetLimit !== null) {
      filtered = filtered.filter(s => (s.rate || 0) <= (budgetLimit as number));
    }
    // Fallback if strictly filtered results are empty
    if (filtered.length === 0) {
      filtered = allServices;
    }
    return filtered.slice(0, 10).map(s => ({
      id: s.service || s.id,
      category: s.category || 'General',
      name: s.name || '',
      rate_bd: s.rate || 0,
      min: s.min || 10,
      max: s.max || 10000
    }));
  }
  // Score each service based on how many keywords match name/category/id, plus active platform and budget limits
  const scoredServices = allServices.map(s => {
    let score = 0;
    const catLower = (s.category || '').toLowerCase();
    const nameLower = (s.name || '').toLowerCase();
    const platLower = (s.platform || '').toLowerCase();
    const idStr = String(s.service || s.id || '').toLowerCase();
    const sPlatform = getServicePlatform(s);

    informativeKeywords.forEach(keyword => {
      // Platform / Category exact match (very high priority)
      if (catLower === keyword || platLower === keyword) {
        score += 80;
      } else if (catLower.includes(keyword)) {
        score += 35;
      }

      // Name exact word match vs substring match
      if (nameLower.includes(keyword)) {
        score += 25;
        // Prefix/exact word matches get bonus score
        if (nameLower.startsWith(keyword) || nameLower.includes(' ' + keyword)) {
          score += 15;
        }
      }

      // ID direct match
      if (idStr === keyword) {
        score += 120;
      }
    });

    // Active Platform Context Alignment (+150 for matching current discussion, -50 for other platforms)
    if (activePlatform) {
      if (sPlatform === activePlatform) {
        score += 150;
      } else {
        score -= 50;
      }
    }

    // Budget Limit Alignment (+100 for within budget, -150 for exceeding)
    if (budgetLimit !== null) {
      const rate = s.rate || 0;
      if (rate <= budgetLimit) {
        score += 100;
      } else {
        score -= 150;
      }
    }

    return { service: s, score };
  });

  // Filter services with score > 0 and sort by score desc
  let matched = scoredServices
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.service);

  // If budget limit is active, try to strictly filter out over-budget items from matched list if possible
  if (budgetLimit !== null) {
    const withinBudgetMatched = matched.filter(s => (s.rate || 0) <= (budgetLimit as number));
    if (withinBudgetMatched.length > 0) {
      matched = withinBudgetMatched;
    }
  }

  // If active platform is set, try to strictly filter for active platform items from matched list if possible
  if (activePlatform) {
    const samePlatformMatched = matched.filter(s => getServicePlatform(s) === activePlatform);
    if (samePlatformMatched.length > 0) {
      matched = samePlatformMatched;
    }
  }

  const finalItems: any[] = [...matched];
  const matchedIds = new Set(finalItems.map(s => s.service || s.id));
  
  // Pad the list with popular/first default services up to 10 total items, matching active platform and budget first!
  if (activePlatform) {
    for (const s of allServices) {
      if (finalItems.length >= 10) break;
      const sId = s.service || s.id;
      if (!matchedIds.has(sId) && getServicePlatform(s) === activePlatform) {
        if (budgetLimit !== null && (s.rate || 0) > budgetLimit) continue;
        finalItems.push(s);
        matchedIds.add(sId);
      }
    }
  }

  if (budgetLimit !== null) {
    for (const s of allServices) {
      if (finalItems.length >= 10) break;
      const sId = s.service || s.id;
      if (!matchedIds.has(sId) && (s.rate || 0) <= budgetLimit) {
        finalItems.push(s);
        matchedIds.add(sId);
      }
    }
  }

  // Universal padding fallback
  for (const s of allServices) {
    if (finalItems.length >= 10) break;
    const sId = s.service || s.id;
    if (!matchedIds.has(sId)) {
      finalItems.push(s);
    }
  }

  return finalItems.map(s => ({
    id: s.service || s.id,
    category: s.category || 'General',
    name: s.name || '',
    rate_bd: s.rate || 0,
    min: s.min || 10,
    max: s.max || 10000
  }));
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('amarboost_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('amarboost_token'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tabLoading, setTabLoading] = useState(false);

  const handleTabChange = (tabId: string) => {
    setTabLoading(true);
    setActiveTab(tabId);
    setTimeout(() => {
      setTabLoading(false);
    }, 450); // Generates a smooth, responsive, premium transition preloader effect
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  
  type ThemeMode = 'system' | 'light' | 'dark';
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('amarboost_theme_mode') as ThemeMode) || 'system';
  });

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'BDT'>(() => {
    return (localStorage.getItem('amarboost_currency') as 'USD' | 'BDT') || 'USD';
  });

  const [usdToBdtRate, setUsdToBdtRate] = useState<number>(120);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Sync global currency state
  useEffect(() => {
    setGlobalCurrencyState(selectedCurrency, usdToBdtRate);
    localStorage.setItem('amarboost_currency', selectedCurrency);
  }, [selectedCurrency, usdToBdtRate]);

  // Fetch Admin-configured conversion rate on initialization
  useEffect(() => {
    fetch('/api/conversion-rate')
      .then(res => res.json())
      .then(data => {
        if (data && data.conversion_rate) {
          const rateVal = parseFloat(data.conversion_rate) || 120;
          setUsdToBdtRate(rateVal);
          setGlobalCurrencyState(selectedCurrency, rateVal);
        }
      })
      .catch(err => console.error("Rate fetch error:", err));
  }, []);

  // 3-Way Theme Switcher Logic (System / Light / Dark)
  useEffect(() => {
    localStorage.setItem('amarboost_theme_mode', themeMode);

    const applyThemeMode = (isDark: boolean) => {
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    if (themeMode === 'dark') {
      applyThemeMode(true);
    } else if (themeMode === 'light') {
      applyThemeMode(false);
    } else {
      // System mode (matches OS/device theme preference)
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyThemeMode(mediaQuery.matches);

      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        applyThemeMode(e.matches);
      };
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }
  }, [themeMode]);

  const toggleTheme = () => {
    const nextMode: ThemeMode = isDarkMode ? 'light' : 'dark';
    setThemeMode(nextMode);
    localStorage.setItem('amarboost_theme_mode', nextMode);
    toast.success(`Theme set to ${nextMode === 'dark' ? 'Dark' : 'Light'} Mode`, {
      icon: nextMode === 'dark' ? '🌙' : '☀️',
      duration: 1500
    });
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem('amarboost_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('amarboost_user');
    }
  }, [user]);
  const [balance, setBalance] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSyncingBalance, setIsSyncingBalance] = useState(false);

  const handleSyncBalance = async () => {
    if (!token) return;
    setIsSyncingBalance(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch('/api/balance', { headers });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.balance !== undefined) {
          setBalance(data.balance || 0);
          toast.success(`Success: Balance verified via API! Current balance is ${formatPrice(data.balance || 0)}`);
        } else {
          toast.error("Failed to parse balance from server");
        }
      } else {
        toast.error("Failed to fetch balance from API");
      }
    } catch (error: any) {
      console.warn("Notice: Balance fetch temporary network delay:", error?.message || error);
      toast.error("Connection error while syncing balance. Please try again.");
    } finally {
      setIsSyncingBalance(false);
    }
  };
  const [providerInfo, setProviderInfo] = useState<{ name: string, email: string, balance: string } | null>(null);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const currentUserRef = useRef(user);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [notifiedDepositIds, setNotifiedDepositIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('amarboost_notified_deposits');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('amarboost_notified_deposits', JSON.stringify(notifiedDepositIds));
  }, [notifiedDepositIds]);

  useEffect(() => {
    if (user && user.role === 'admin' && token) {
      const checkPendingDeposits = async () => {
        try {
          const res = await fetch('/api/admin/deposits/pending', {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null);
          if (res && res.ok) {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const pendingList: any[] = await res.json().catch(() => []);
              if (Array.isArray(pendingList) && pendingList.length > 0) {
                setNotifiedDepositIds(prev => {
                  const nextNotified = [...prev];
                  let hasNew = false;
                  
                  pendingList.forEach(dep => {
                    if (!nextNotified.includes(dep.id)) {
                      nextNotified.push(dep.id);
                      hasNew = true;
                      
                      toast.custom((t) => (
                        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-slate-900 shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-indigo-150 dark:border-indigo-900/40 p-4`}>
                          <div className="flex-1 w-0">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 pt-0.5 animate-bounce">
                                <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-950/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <Wallet size={20} />
                                </div>
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                  New Manual Deposit Alert!
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  User <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{dep.username}</span> ({dep.email}) has requested ৳{dep.amount} via {dep.method}.
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0 flex items-center">
                            <button
                              onClick={() => {
                                setActiveTab('deposits');
                                toast.dismiss(t.id);
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      ), { duration: 15000 });
                    }
                  });

                  return hasNew ? nextNotified : prev;
                });
              }
            } else {
              console.warn("Expected JSON response but received non-JSON payload from pending deposits endpoint during check.");
            }
          }
        } catch (error) {
          // Silent catch for background polling during transient offline state
        }
      };

      checkPendingDeposits();
      const pollInterval = setInterval(checkPendingDeposits, 15000); // Poll every 15 seconds to ensure real-time alerts
      return () => clearInterval(pollInterval);
    }
  }, [user, token]);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`amarboost_favorites_${user.id}`);
      setFavorites(saved ? JSON.parse(saved) : []);
    } else {
      setFavorites([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && favorites.length >= 0) {
      localStorage.setItem(`amarboost_favorites_${user.id}`, JSON.stringify(favorites));
    }
  }, [favorites, user?.id]);

  useEffect(() => {
    if (user) {
      fetchData();
      if (user.role === 'admin') {
        fetchProviderInfo();
      }
      const interval = setInterval(() => {
        fetchData();
        if (user.role === 'admin') fetchProviderInfo();
      }, 120000); // Refresh every 2 mins
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    // Handle path-based routing for payment simulation
    const path = window.location.pathname;
    if (path === '/payment-simulation') {
      setActiveTab('payment-simulation');
    }
  }, []);

  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  useEffect(() => {
    const checkDb = async () => {
      try {
        const res = await fetch('/api/health').catch(() => null);
        if (!res || !res.ok) {
          setDbStatus('disconnected');
          return;
        }
        const data = await res.json().catch(() => null);
        setDbStatus(data && data.database === 'connected' ? 'connected' : 'disconnected');
      } catch (e) {
        setDbStatus('disconnected');
      }
    };
    checkDb();
    const interval = setInterval(checkDb, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Pre-load public services immediately on startup so Service Catalog is instantly populated
  useEffect(() => {
    fetch('/api/services')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setServices(data);
        }
      })
      .catch(err => console.warn("Notice: Initial services pre-fetch:", err));
  }, []);

  const fetchData = async () => {
    if (!user || !token) return;
    setApiError(null);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const safeFetch = async (url: string) => {
        try {
          return await fetch(url, { headers });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Network connection offline or server restarting" }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      };

      const [balanceRes, servicesRes, ordersRes] = await Promise.all([
        safeFetch('/api/balance'),
        safeFetch('/api/services'),
        safeFetch('/api/orders')
      ]);
      
      const checkJson = async (res: Response) => {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          console.warn(`Non-JSON response from ${res.url}:`, text.substring(0, 200));
          return { error: "Invalid response from server" };
        }
      };

      if (balanceRes.status === 401 || servicesRes.status === 401 || ordersRes.status === 401 ||
          balanceRes.status === 403 || servicesRes.status === 403 || ordersRes.status === 403) {
        handleLogout();
        return;
      }

      const balanceData = await checkJson(balanceRes);
      const servicesData = await checkJson(servicesRes);
      const ordersData = await checkJson(ordersRes);

      if (servicesRes.ok && Array.isArray(servicesData) && servicesData.length > 0) {
        setServices(servicesData);
      }
      if (balanceRes.ok && balanceData && balanceData.balance !== undefined) {
        setBalance(balanceData.balance || 0);
      }
      if (ordersRes.ok && Array.isArray(ordersData)) {
        setOrders(ordersData);
      }

      if (!servicesRes.ok && !balanceRes.ok && !ordersRes.ok) {
        setApiError(balanceData?.error || servicesData?.error || ordersData?.error || "Service temporarily unavailable. Retrying...");
      }
    } catch (error) {
      setApiError("Failed to connect to the server. Retrying shortly...");
    } finally {
      setLoading(false);
    }
  };

  const fetchProviderInfo = async () => {
    if (!user || user.role !== 'admin' || !token) return;
    try {
      const res = await fetch('/api/admin/provider-info', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json().catch(() => null);
      if (data) setProviderInfo(data);
    } catch (error) {
      // Quiet fail
    }
  };

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    setToken(token);
    localStorage.setItem('amarboost_token', token);
    localStorage.setItem('amarboost_user', JSON.stringify(userData));
    setLoading(true);

    if (userData.theme) {
      setIsDarkMode(userData.theme === 'dark');
    } else {
      const currentTheme = isDarkMode ? 'dark' : 'light';
      fetch('/api/user/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme: currentTheme })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const updatedUser = { ...userData, theme: currentTheme as 'light' | 'dark' };
          setUser(updatedUser);
          localStorage.setItem('amarboost_user', JSON.stringify(updatedUser));
        }
      })
      .catch(err => console.error("Failed to initial-sync theme on login:", err));
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('amarboost_token');
    localStorage.removeItem('amarboost_user');
    setBalance(0);
    setOrders([]);
    setFavorites([]);
    setProviderInfo(null);
    setApiError(null);
    setActiveTab('dashboard');
    toast.success('Logged out successfully');
  };

  // Sync dark mode selection to database if authenticated and server preference differs
  useEffect(() => {
    if (token && user) {
      const currentTheme = isDarkMode ? 'dark' : 'light';
      if (user.theme !== currentTheme) {
        fetch('/api/user/theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ theme: currentTheme })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const updatedUser = { ...user, theme: currentTheme as 'light' | 'dark' };
            setUser(updatedUser);
            localStorage.setItem('amarboost_user', JSON.stringify(updatedUser));
          }
        })
        .catch(err => {
          console.error("Failed to sync theme preference to database:", err);
        });
      }
    }
  }, [isDarkMode, token, user]);

  // Fetch the latest profile data on startup or token restoration
  useEffect(() => {
    if (token) {
      const fetchProfileOnStartup = async () => {
        try {
          const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
          }
          if (res.ok) {
            const profile = await res.json();
            setUser(profile);
            localStorage.setItem('amarboost_user', JSON.stringify(profile));
            if (profile.theme) {
              setIsDarkMode(profile.theme === 'dark');
            }
          }
        } catch (err) {
          console.error("Failed to restore startup user profile:", err);
        }
      };
      fetchProfileOnStartup();
    }
  }, [token]);

  if (!user || !token) {
    return <Login onLogin={handleLogin} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />;
  }

function AdsAndGrowthCenter({ user, services, setActiveTab, token }: { user: User, services: Service[], setActiveTab: (tab: string) => void, token: string }) {
  const [adAccounts] = useState([
    { id: 'meta-1', name: 'Meta Business Suite (Facebook & Instagram Ads)', platform: 'Meta', status: 'Active', budgetUsd: 250, spentUsd: 184.50, impressions: '428.5K', clicks: '18.4K', conversions: '1,240' },
    { id: 'google-1', name: 'Google Ads Search & YouTube Ads Center', platform: 'Google', status: 'Active', budgetUsd: 400, spentUsd: 310.20, impressions: '612.0K', clicks: '29.1K', conversions: '2,890' },
    { id: 'tiktok-1', name: 'TikTok Ads Manager Hub', platform: 'TikTok', status: 'Active', budgetUsd: 150, spentUsd: 95.00, impressions: '215.3K', clicks: '12.8K', conversions: '840' }
  ]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-indigo-200 mb-3 border border-white/10">
            <Megaphone size={14} className="text-amber-400" /> Advertising & Growth Hub
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
            Ad Manager & Growth Center
          </h1>
          <p className="text-indigo-100 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Manage your Google Ads, Meta (Facebook/Instagram) Ads, and TikTok Ad accounts in one central dashboard. Scale your business campaigns and amplify growth with our integrated SMM Panel Add-On services.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-400 text-xs font-extrabold uppercase tracking-wider mb-1">Total Ad Spend</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatPrice(589.70)}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">↑ +14.2% from last month</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-400 text-xs font-extrabold uppercase tracking-wider mb-1">Total Impressions</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">1,255.8K</div>
          <div className="text-[10px] text-indigo-500 font-bold mt-1">Across 3 Ad Networks</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-400 text-xs font-extrabold uppercase tracking-wider mb-1">Total Conversions</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">4,970</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">Avg Cost per Conversion: {formatPrice(0.12)}</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-slate-400 text-xs font-extrabold uppercase tracking-wider mb-1">SMM Panel Add-On</div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold mb-2">Boost your ad CTR & social proof instantly</div>
          </div>
          <button 
            onClick={() => setActiveTab('new-order')}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart size={14} /> Place SMM Order
          </button>
        </div>
      </div>

      {/* Connected Ad Accounts */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Globe size={18} className="text-indigo-600" /> Connected Ad Accounts & Platforms
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {adAccounts.map((acc) => (
            <div key={acc.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-start justify-between">
                <div className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{acc.name}</div>
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold rounded-full uppercase">
                  {acc.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-extrabold">Total Spent</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400">{formatPrice(acc.spentUsd)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-extrabold">Conversions</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{acc.conversions}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

  const tabs = user.role === 'admin' 
    ? [
        { id: 'dashboard', label: 'Admin Overview', icon: LayoutDashboard },
        { id: 'reseller', label: 'Reseller Panel', icon: Key },
        { id: 'users', label: 'User Accounts', icon: Users },
        { id: 'ads-growth', label: 'Ads & Growth Center', icon: Megaphone },
        { id: 'new-order', label: 'SMM Order Engine', icon: ShoppingCart },
        { id: 'orders', label: 'All Orders & Logs', icon: History },
        { id: 'track-order', label: 'Track Order', icon: Activity },
        { id: 'deposits', label: 'Deposits & Gateways', icon: Wallet },
        { id: 'services', label: 'Service Catalog', icon: List },
        { id: 'support', label: 'Support Center', icon: Headphones },
        { id: 'settings', label: 'System Settings & Rates', icon: Settings },
        { id: 'profile', label: 'My Profile', icon: UserIcon },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'reseller', label: 'Reseller Panel', icon: Key },
        { id: 'ads-growth', label: 'Ads & Growth Center', icon: Megaphone },
        { id: 'new-order', label: 'Instant Order Panel', icon: ShoppingCart },
        { id: 'orders', label: 'My Orders', icon: History },
        { id: 'track-order', label: 'Order Telemetry Tracker', icon: Activity },
        { id: 'services', label: 'Service Catalog', icon: List },
        { id: 'auto-renewals', label: 'Auto-Renewals', icon: RefreshCw },
        { id: 'transactions', label: 'Transactions', icon: CreditCard },
        { id: 'api-management', label: 'Developer API', icon: Key },
        { id: 'support', label: 'Support Center', icon: Headphones },
        { id: 'profile', label: 'My Profile', icon: UserIcon },
      ];

  const renderContent = () => {
    if (user.role === 'admin') {
      switch (activeTab) {
        case 'dashboard': return <AdminDashboard providerInfo={providerInfo} orders={orders} services={services} token={token || ''} setActiveTab={handleTabChange} />;
        case 'reseller': return <ResellerDashboard user={user} services={services} balance={balance} orders={orders} token={token || ''} onUpdate={fetchData} />;
        case 'users': return <AdminUsersManager token={token || ''} onUpdate={fetchData} />;
        case 'ads-growth': return <AdsAndGrowthCenter user={user} services={services} setActiveTab={handleTabChange} token={token || ''} />;
        case 'new-order': return <NewOrder services={services} balance={balance} onOrderPlaced={fetchData} initialServiceId={selectedServiceId} onClearInitial={() => setSelectedServiceId(null)} token={token || ''} />;
        case 'orders': return <Orders orders={orders} services={services} isAdmin={true} onUpdate={fetchData} token={token || ''} />;
        case 'track-order': return <OrderTracker orders={orders} services={services} token={token || ''} onUpdate={fetchData} />;
        case 'deposits': return <AdminDeposits onUpdate={fetchData} token={token || ''} />;
        case 'services': return <ServicesList services={services} isAdmin={true} onUpdate={fetchData} favorites={favorites} setFavorites={setFavorites} setActiveTab={handleTabChange} setSelectedServiceId={setSelectedServiceId} token={token || ''} />;
        case 'support': return <SupportCenter user={user} orders={orders} services={services} token={token || ''} onOrderPlaced={fetchData} setActiveTab={handleTabChange} />;
        case 'settings': return <AdminSettings onUpdate={fetchData} token={token || ''} />;
        case 'profile': return <UserProfile user={user} token={token || ''} balance={balance} orders={orders} onUpdate={fetchData} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onUserUpdate={(updatedUser) => {
          setUser(updatedUser);
          localStorage.setItem('amarboost_user', JSON.stringify(updatedUser));
        }} />;
        default: return <AdminDashboard providerInfo={providerInfo} orders={orders} services={services} token={token || ''} setActiveTab={handleTabChange} />;
      }
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard balance={balance} orders={orders} services={services} setActiveTab={handleTabChange} favorites={favorites} setFavorites={setFavorites} setSelectedServiceId={setSelectedServiceId} setIsAddFundsOpen={setIsAddFundsOpen} token={token || ''} onUpdate={fetchData} onSyncBalance={handleSyncBalance} isSyncingBalance={isSyncingBalance} />;
      case 'reseller': return <ResellerDashboard user={user} services={services} balance={balance} orders={orders} token={token || ''} onUpdate={fetchData} />;
      case 'ads-growth': return <AdsAndGrowthCenter user={user} services={services} setActiveTab={handleTabChange} token={token || ''} />;
      case 'new-order': return <NewOrder services={services} balance={balance} onOrderPlaced={fetchData} initialServiceId={selectedServiceId} onClearInitial={() => setSelectedServiceId(null)} token={token || ''} />;
      case 'orders': return <Orders orders={orders} services={services} onUpdate={fetchData} token={token || ''} />;
      case 'track-order': return <OrderTracker orders={orders} services={services} token={token || ''} onUpdate={fetchData} />;
      case 'transactions': return <Transactions token={token || ''} />;
      case 'services': return <ServicesList services={services} isAdmin={false} onUpdate={fetchData} favorites={favorites} setFavorites={setFavorites} setActiveTab={handleTabChange} setSelectedServiceId={setSelectedServiceId} token={token || ''} />;
      case 'auto-renewals': return <AutoRenewals token={token || ''} services={services} onUpdate={fetchData} />;
      case 'api-management': return <DeveloperApiKeys token={token || ''} />;
      case 'support': return <SupportCenter user={user} orders={orders} services={services} token={token || ''} onOrderPlaced={fetchData} setActiveTab={handleTabChange} />;
      case 'payment-simulation': return <PaymentSimulation />;
      case 'profile': return <UserProfile user={user} token={token || ''} balance={balance} orders={orders} onUpdate={fetchData} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onUserUpdate={(updatedUser) => {
        setUser(updatedUser);
        localStorage.setItem('amarboost_user', JSON.stringify(updatedUser));
      }} />;
      default: return <Dashboard balance={balance} orders={orders} services={services} setActiveTab={handleTabChange} favorites={favorites} setFavorites={setFavorites} setSelectedServiceId={setSelectedServiceId} setIsAddFundsOpen={setIsAddFundsOpen} token={token || ''} onUpdate={fetchData} onSyncBalance={handleSyncBalance} isSyncingBalance={isSyncingBalance} />;
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#1e293b',
          color: '#fff',
          fontSize: '12px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)'
        }
      }} />
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col h-screen ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">A</div>
            <span className="text-xl font-bold tracking-tight">{user.role === 'admin' ? 'Admin Panel' : 'AmarBoost Panel'}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <nav className="mt-4 px-3 space-y-1 flex-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { handleTabChange(tab.id); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === tab.id 
                  ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                  : 'text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 font-semibold'
              }`}
            >
              <tab.icon size={18} />
              <span className="text-sm">{tab.label}</span>
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-all mt-2"
          >
            <LogOut size={18} />
            <span className="text-sm">Logout</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-3">
            <div className="flex justify-between items-center mb-1 border-b border-dashed border-slate-200 dark:border-slate-700/80 pb-1 w-full text-slate-500 dark:text-slate-400">
              <span className="text-[10px] uppercase font-bold tracking-wider">
                {user.role === 'admin' ? 'Total User Balance' : 'Your Balance'}
              </span>
              <button 
                onClick={handleSyncBalance}
                disabled={isSyncingBalance}
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-all"
                title="Sync Balance with API"
              >
                <RefreshCw size={12} className={isSyncingBalance ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-[#20ff00]">{formatPrice(balance)}</div>
          </div>
          {user.role === 'user' && (
            <button 
              onClick={() => setIsAddFundsOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <Wallet size={16} />
              Add Funds
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:ml-64 min-h-screen transition-all duration-300`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-3 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <Menu size={20} />
          </button>
          
          <div className="flex-1 flex justify-end items-center gap-1.5 lg:gap-3">
            {/* Header Balance Display */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all ${dbStatus === 'connected' ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/60 shadow-xs' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'}`}>
              <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${dbStatus === 'connected' ? 'animate-pulse' : ''}`} title={`Database: ${dbStatus}`}></div>
              <Wallet size={13} className={dbStatus === 'connected' ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500'} />
              <div 
                onClick={() => setIsAddFundsOpen(true)}
                className="text-xs sm:text-[13px] font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums cursor-pointer hover:underline decoration-emerald-500/50 underline-offset-2 transition-all"
                title="Account Balance • Click to Add Funds"
              >
                {formatPrice(balance)}
              </div>
              <button 
                onClick={handleSyncBalance}
                disabled={isSyncingBalance}
                className="p-1 -mr-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/60 dark:hover:bg-slate-800 rounded-md transition-all cursor-pointer"
                title="Sync Balance with API"
              >
                <RefreshCw size={11} className={isSyncingBalance ? "animate-spin text-indigo-600" : ""} />
              </button>
            </div>

            {/* Prominent Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-700 dark:text-amber-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl transition-all shadow-2xs hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer group"
              title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode (currently ${isDarkMode ? 'Dark' : 'Light'})`}
              aria-label="Toggle Theme"
            >
              {isDarkMode ? (
                <Sun size={17} className="transition-transform group-hover:rotate-45 text-amber-400" />
              ) : (
                <Moon size={17} className="transition-transform group-hover:-rotate-12 text-indigo-600" />
              )}
            </button>

            {/* Unified Controls Dropdown */}
            <div className="relative">
                <button
                  onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                  className="p-1.5 text-slate-700 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  <Settings size={16} />
                </button>
                <AnimatePresence>
                  {isHeaderMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-50"
                    >
                      <div className="space-y-3">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 mb-1">Currency</div>
                          <div className="grid grid-cols-2 gap-1">
                            <button onClick={() => { setSelectedCurrency('USD'); setIsHeaderMenuOpen(false); }} className={`px-2 py-1.5 rounded-md text-[11px] font-bold ${selectedCurrency === 'USD' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>USD ($)</button>
                            <button onClick={() => { setSelectedCurrency('BDT'); setIsHeaderMenuOpen(false); }} className={`px-2 py-1.5 rounded-md text-[11px] font-bold ${selectedCurrency === 'BDT' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>BDT (৳)</button>
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 dark:bg-slate-700" />
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 mb-1">Theme</div>
                          <div className="flex flex-col gap-1">
                            <button onClick={() => { setThemeMode('system'); setIsHeaderMenuOpen(false); }} className={`px-2 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-2 ${themeMode === 'system' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}><Monitor size={12}/>System</button>
                            <button onClick={() => { setThemeMode('light'); setIsHeaderMenuOpen(false); }} className={`px-2 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-2 ${themeMode === 'light' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}><Sun size={12}/>Light</button>
                            <button onClick={() => { setThemeMode('dark'); setIsHeaderMenuOpen(false); }} className={`px-2 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-2 ${themeMode === 'dark' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}><Moon size={12}/>Dark</button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>


            <div className="relative">
              <button 
                onClick={() => {
                  const notifications = [
                    "Welcome to AmarBoost!",
                    "New services added recently.",
                    "Extra balance on deposits over ৳1000."
                  ];
                  notifications.forEach((msg, i) => {
                    setTimeout(() => toast(msg, { icon: '🔔' }), i * 300);
                  });
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full border border-white dark:border-slate-900"></span>
              </button>
            </div>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Logout">
              <LogOut size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{user.username}</div>
              </div>
              <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 rounded-lg flex items-center justify-center font-bold text-xs">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {apiError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-3 text-xs font-bold border border-red-100 dark:border-red-900/30">
              <AlertTriangle size={16} />
              <div>
                <div className="uppercase text-[9px] tracking-widest opacity-70 mb-0.5">Provider Error</div>
                {apiError}
              </div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {loading || tabLoading ? (
                <LogoPreloader />
              ) : renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Support Chat */}
      <SupportChat user={user} onUpdateUser={setUser} token={token || ''} services={services} orders={orders} onOrderPlaced={fetchData} setActiveTab={setActiveTab} />
      
      {/* Add Funds Modal */}
      <AddFundsModal isOpen={isAddFundsOpen} onClose={() => setIsAddFundsOpen(false)} token={token || ''} />
    </div>
  );
}

function PaymentSimulation() {
  const [params, setParams] = useState<any>({});
  const [gateway, setGateway] = useState<'bkash' | 'nagad'>('bkash');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Number, 2: OTP, 3: PIN, 4: Success
  const [walletNo, setWalletNo] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setParams({
      token: urlParams.get('token'),
      amount: urlParams.get('amount')
    });
  }, []);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!walletNo || walletNo.length !== 11 || !walletNo.startsWith('01')) {
      setError('Please enter a valid 11-digit Bangladeshi mobile number.');
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setStep(2);
    }, 1000);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length < 4) {
      setError('Please enter a valid OTP code.');
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setStep(3);
    }, 1000);
  };

  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pin.length < 4) {
      setError('Please enter your valid transaction PIN.');
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      window.location.href = `/api/deposits/auto/callback?status=success&token=${params.token}`;
    }, 2000);
  };

  const colors = {
    bkash: {
      primary: '#E2136E',
      bgLight: 'bg-[#ffebf4]',
      bgDark: 'dark:bg-[#2c0016]',
      logo: 'bKash'
    },
    nagad: {
      primary: '#F7941D',
      bgLight: 'bg-[#fff5eb]',
      bgDark: 'dark:bg-[#341600]',
      logo: 'Nagad'
    }
  };

  const activeColor = colors[gateway];

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
      >
        {/* Gateway Selection Tabs */}
        {step < 4 && (
          <div className="flex bg-slate-100 dark:bg-slate-950/60 p-1 border-b border-slate-150 dark:border-slate-800/80">
            <button
              onClick={() => { if(step === 1) setGateway('bkash'); }}
              disabled={step > 1}
              className={`flex-1 py-3 text-center rounded-t-xl text-xs font-black uppercase tracking-wider transition-all bg-transparent border-none outline-none cursor-pointer ${
                gateway === 'bkash' 
                  ? 'bg-white dark:bg-slate-900 border-b-2 border-[#E2136E] text-[#E2136E]' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              bKash Wallet
            </button>
            <button
              onClick={() => { if(step === 1) setGateway('nagad'); }}
              disabled={step > 1}
              className={`flex-1 py-3 text-center rounded-t-xl text-xs font-black uppercase tracking-wider transition-all bg-transparent border-none outline-none cursor-pointer ${
                gateway === 'nagad' 
                  ? 'bg-white dark:bg-slate-900 border-b-2 border-[#F7941D] text-[#F7941D]' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Nagad Wallet
            </button>
          </div>
        )}

        {/* Dynamic Branded Header */}
        <div 
          className="p-6 text-center text-white relative transition-colors duration-300 flex flex-col items-center justify-center gap-2"
          style={{ background: activeColor.primary }}
        >
          {/* Logo element with real graphic */}
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center p-2.5 shadow-md select-none transform hover:scale-105 transition-transform">
            {gateway === 'bkash' ? (
              <img src="https://upload.wikimedia.org/wikipedia/commons/8/8c/Bkash_logo.svg" alt="bKash" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <img src="https://upload.wikimedia.org/wikipedia/commons/8/8b/Nagad_logo.svg" alt="Nagad" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            )}
          </div>

          <div className="text-lg font-black italic tracking-tight flex items-center justify-center gap-1.5">
            <span className="font-extrabold">{activeColor.logo}</span>
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-white/20 rounded-full">Sandbox PG</span>
          </div>
          <div className="text-[9px] opacity-80 uppercase tracking-widest font-black">Secure Merchant Gateway Checkout</div>
          
          {/* Wave effect */}
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-white dark:bg-slate-900 rounded-t-[16px] transform translate-y-2"></div>
        </div>

        {/* Content area */}
        <div className="p-6 pt-4 text-center">
          {/* Amount to pay */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl mb-6">
            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Payable Amount</span>
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatPrice(params.amount || '0')} BDT</span>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 rounded-xl text-xs font-bold text-center mb-4 transition-all">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="text-left space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Your SMM Wallet Number</label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 font-mono font-bold text-slate-400 text-xs">+880</div>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={walletNo}
                    onChange={(e) => setWalletNo(e.target.value.replace(/\D/g, ''))}
                    placeholder="01XXXXXXXXX"
                    className="w-full pl-16 pr-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm font-bold tracking-widest outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="text-[9px] text-slate-400 leading-normal">
                  By clicking Proceed, you agree to the terms and privacy rules of {activeColor.logo} Merchant agreements.
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => window.location.href = '/'}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 text-white font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: activeColor.primary }}
                >
                  {processing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Proceed'}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2Submit} className="space-y-4">
              <div className="text-left space-y-1.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800/50 rounded-xl text-center mb-2">
                  <p className="text-[10px] text-slate-500 font-bold">Simulated OTP Sent to</p>
                  <p className="font-mono text-xs font-black text-slate-700 dark:text-slate-300 tracking-wider">xxxxx-xxxx-xx</p>
                </div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification Code (simulated OTP)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1 2 3  4 5 6"
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm font-bold tracking-widest text-center outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 text-white font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: activeColor.primary }}
                >
                  {processing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Verify Code'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleStep3Submit} className="space-y-4">
              <div className="text-left space-y-1.5">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100/40 rounded-xl text-center mb-2">
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">Account validation succeeded!</p>
                  <p className="text-[9px] text-slate-400 font-medium">Verify transaction by placing your secure wallet PIN below.</p>
                </div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Secure PIN Number</label>
                <input
                  type="password"
                  required
                  maxLength={5}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="&bull; &bull; &bull; &bull; &bull;"
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-lg font-bold text-center tracking-[0.5em] outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 text-white font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: activeColor.primary }}
                >
                  {processing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                    <>
                      <CheckCircle2 size={14} />
                      Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-850/60 text-[9px] text-slate-400 leading-normal">
            Secure Payment Gateway checkout powered by SSL/Sandbox encryption protocol. Never share your wallet transaction PIN with anyone.
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SupportCenter({ user, orders, services, token, onOrderPlaced, setActiveTab }: { user: User, orders: Order[], services: Service[], token: string, onOrderPlaced?: () => void, setActiveTab?: (tab: string) => void }) {
  const [activeSupportTab, setActiveSupportTab] = useState<'tickets' | 'faq'>('tickets');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [ticketDetails, setTicketDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // AI Chat State
  const [aiModel, setAiModel] = useState('gemini-3.5-flash');
  const [chatMessage, setChatMessage] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState<{ role: 'user' | 'model', text: string, action?: any, rawJson?: string }[]>([
    { role: 'model', text: 'স্বাগতম! আমি অমরবুস্টের পাওয়ারফুল এবং ইন্টেলিজেন্ট এআই এজেন্ট। আমি আপনাকে সার্ভিস ও প্রাইস ডিটেলস জানাতে পারি অথবা আপনার নির্দেশনা অনুযায়ী যেকোনো সার্ভিস অর্ডার করে দিতে পারি। কিভাবে সাহায্য করব বলুন?' }
  ]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const availableModels = [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' }
  ];

  useEffect(() => {
    if (activeSupportTab === 'tickets') {
      fetchTickets();
    }
  }, [activeSupportTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChatHistory]);

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await fetch('/api/tickets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Failed to load tickets');
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchTicketDetails = async (id: number) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTicketDetails(data);
    } catch (e) {
      toast.error('Failed to load ticket details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) return;
    setCreatingTicket(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ subject: ticketSubject, message: ticketMessage })
      });
      if (res.ok) {
        toast.success('Ticket created successfully');
        setTicketSubject('');
        setTicketMessage('');
        fetchTickets();
      }
    } catch (e) {
      toast.error('Failed to create ticket');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage || !ticketDetails) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/tickets/${ticketDetails.ticket.id}/message`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: replyMessage })
      });
      if (res.ok) {
        setReplyMessage('');
        fetchTicketDetails(ticketDetails.ticket.id);
      }
    } catch (e) {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const executeOrder = async (action: any) => {
    setIsAiTyping(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ serviceId: action.serviceId, link: action.link, quantity: action.quantity })
      });
      const result = await res.json();
      if (result.success) {
        toast.success('অর্ডার প্লেস করা হয়েছে!');
        setAiChatHistory(prev => [
          ...prev,
          { 
            role: 'model', 
            text: `🎉 **অর্ডার সফলভাবে সম্পন্ন হয়েছে!**\n- **অর্ডার আইডি:** #${result.orderId}\n- **সার্ভিস:** ${action.serviceName || 'নির্বাচিত সার্ভিস'}\n- **পরিমাণ:** ${action.quantity}\n- **টার্গেট লিঙ্ক:** ${action.link}\n\nআপনার ব্যালেন্স থেকে মোট চার্জ কেটে নেওয়া হয়েছে এবং সার্ভিসটি অতি শীঘ্রই ডেলিভারি শুরু হবে। নতুন কোনো সাহায্যের প্রয়োজন হলে জানান।`,
            action: null
          }
         ]);
         if (onOrderPlaced) onOrderPlaced();
      } else {
        toast.error(result.error || 'অর্ডার করতে সমস্যা হয়েছে');
        setAiChatHistory(prev => [
          ...prev,
          { role: 'model', text: `⚠️ **অর্ডার ব্যর্থ হয়েছে!**\nকারণ: ${result.error || 'ব্যালেন্স অপ্রতুল বা প্রোভাইডার ত্রুটি।'}`, action: null }
        ]);
      }
    } catch (err) {
      toast.error('Network Error during order execution');
      setAiChatHistory(prev => [
        ...prev,
        { role: 'model', text: `❌ নেটওয়ার্ক ত্রুটির কারণে অর্ডার প্রসেস করা সম্ভব হয়নি। পুনরায় চেষ্টা করুন।`, action: null }
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const executeCreateTicket = async (action: any) => {
    setIsAiTyping(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ subject: action.subject || 'SMM AI Help', message: action.message || 'Customer requested support via SMM AI Agent' })
      });
      if (res.ok) {
        toast.success('Support ticket created successfully!');
        setAiChatHistory(prev => [
          ...prev,
          { 
            role: 'model', 
            text: `🎫 **সাপোর্ট টিকিট সফলভাবে তৈরি হয়েছে!**\n\nআমরা ইতিপূর্বে একটি সাপোর্ট টিকিট ওপেন করেছি। আমাদের কাস্টমার রিলেশন টিম খুবই শীঘ্রই টিকিটটির উত্তর দেবে। আপনি যেকোনো সময় অন্য টিকিটের সাথে এটির স্ট্যাটাস দেখতে পারবেন।`,
            action: null
          }
         ]);
      } else {
        toast.error('টিকিট তৈরি করতে কোনো সমস্যা হয়েছে।');
      }
    } catch (err) {
      toast.error('Network Error during ticket creation');
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendAiMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || isAiTyping) return;

    const userMessage = chatMessage.trim();
    setChatMessage('');
    const newHistory = [...aiChatHistory, { role: 'user', text: userMessage }] as any;
    setAiChatHistory(newHistory);
    setIsAiTyping(true);

    try {
      const serviceSummary = getAiSearchedServices(userMessage, services, newHistory);

      const systemContext = `
        You are a highly intelligent, powerful, and friendly Autonomous SMM Panel Agent for AmarBoost.
        Your main goal is to execute the following 5 core support capabilities (the 5 points of action) perfectly on behalf of the user.

        ADVANCE SEARCH SERVICE ACTIVATED:
        To protect context limits, SMM services have been pre-filtered using a high-fidelity semantic keyword matching index directly matching the user's latest query ("${userMessage.substring(0, 50)}...").
        Always lookup packages from the AVAILABLE SERVICES LIST. If the user asks for secondary search options or cannot find specific tools, instruct them to write specific service keywords (e.g., "YouTube Watch Time 4000 Hour" or "Facebook organic followers BDT") to automatically seed relevant services into your active context!

        FIVE CORE SUPPORT CAPABILITIES (FIVE POINTS OF ACTION):
        Point 1: [CHECK_BALANCE] Check user balance, user profile, or transaction scale.
          - If the user asks "আমার ব্যালেন্স কত?", "আমার প্রোফাইল দেখাও", "চেক ব্যালেন্স", "ব্যালেন্স কত আছে?" or profile questions.
          - Action payload: { "type": "CHECK_BALANCE" }
          
        Point 2: [FIND_SERVICE] Find services, categories, or check prices, and showcase recommendations.
          - If the user searches for services, prices, options, or categories (e.g., "Facebook profile followers", "YouTube watch time", "TikTok views rate কত?").
          - Always search inside the AVAILABLE SERVICES LIST below, match relevant services, and return them inside the 'showcase' object with layout 'carousel' (for 3+ results) or 'grid' (for 1-2 results) and the matched service string IDs list.
          
        Point 3: [PROPOSE_ORDER & EXECUTE_ORDER] Place orders directly inside the chat conversational stream.
          - Stage A: User mentions wanting to order some service (e.g. YouTube subs, TikTok views, etc.). Locate the matching service from the SERVICES LIST. Ask for target URL/link and quantity if not already provided.
          - Stage B: Once you have the exact serviceId, link, and quantity: Calculate the charge, verify user has enough balance. Respond with a friendly Bengali explanation of the order summary and set the action payload to:
            { "type": "PROPOSE_ORDER", "serviceId": "STRING_ID", "serviceName": "NAME", "link": "LINK", "quantity": NUMBER, "charge": NUMBER }
          - Stage C: Once the user confirms with "yes" / "হ্যাঁ" / "Confirm" / "অর্ডার করো" / "হ্যাঁ করো" or clicks confirm button: Transition to EXECUTE_ORDER keeping exact fields:
            { "type": "EXECUTE_ORDER", "serviceId": "STRING_ID", "serviceName": "NAME", "link": "LINK", "quantity": NUMBER }
          - Stage D: If user cancels ("না", "বাতিল করো", etc.), reset action to null.
          
        Point 4: [TRACK_ORDER] Track order statuses and view Live Progress.
          - If the user asks about order status (e.g., "আমার অর্ডারের কি অবস্থা?", "অর্ডার ট্র্যাক করো", "আইডি #131 কিসের?", "স্ট্যাটাস কি?").
          - Extract the order ID if specified, or default to the most recent active order otherwise.
          - Action payload: { "type": "TRACK_ORDER", "orderId": "NUMBER_OR_STRING_IF_GIVEN" }
          
        Point 5: [CREATE_TICKET] Create support tickets for issues, payment complaints, or manual queries.
          - If the user complains, states they have paid but balance has not added yet, or explicitly requests "সাপোর্ট টিকিট খোলো", "আমার একটি টিকিট ওপেন করো", or has server/order issues that require manual help.
          - Generate a clear 'subject' and 'message' description based on their conversation.
          - Action payload: { "type": "CREATE_TICKET", "subject": "CLEAR_TICKET_SUBJECT", "message": "DETAILED_TICKET_MESSAGE" }

        USER INFO:
        - Username: ${user.username}
        - Current Balance: ${formatPrice(user.balance)} ($${user.balance})
        - Active Orders: ${orders.slice(0, 5).map(o => `#${o.id}(Status: ${o.status}, Service: ${o.service_id})`).join(', ')}

        AVAILABLE SERVICES LIST:
        ${JSON.stringify(serviceSummary)}

        CRITICAL OPERATIONAL RULES:
        1. Always output a valid JSON and ONLY a valid JSON. DO NOT wrap with markdown code blocks like 'triple-backticks-json'. Return pure JSON string matching this exact TypeScript interface:
           interface AIResponse {
             text: string; // Dynamic conversational Bengali (or English if user writes in English) to explain actions, balance checking, pricing description or order details. Explain things warmly!
             action: null | {
               type: 'PROPOSE_ORDER' | 'EXECUTE_ORDER' | 'CHECK_BALANCE' | 'TRACK_ORDER' | 'CREATE_TICKET';
               serviceId?: string;
               serviceName?: string;
               link?: string;
               quantity?: number;
               charge?: number;
               orderId?: string | number;
               subject?: string;
               message?: string;
             };
             showcase?: null | {
               layout: 'grid' | 'carousel';
               serviceIds: string[]; // List of specific service string IDs to showcase as beautiful interactive products
             }
           }
        2. Help users check prices, find services, and details about AmarBoost SMM panel. Always default to the 5 points action matrix when applicable.
        3. When explaining service charges, clearly note they are calculated by quantity * (rate / 1000). For example: 500 Views for a service rated 100 Taka per 1000 will cost 50 Taka.
        4. If balance is insufficient, gently warn the user and explain they can use the "Add Funds" button in the sidebar or dashboard.
      `;

      const apiMessages = newHistory.map((h: any) => ({
        role: h.role,
        text: h.role === 'model' && h.rawJson ? h.rawJson : h.text
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: apiMessages,
          context: systemContext
        })
      });

      const data = await res.json();
      if (data.text) {
        let cleanText = data.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
        let parsed: any;
        try {
          parsed = JSON.parse(cleanText);
        } catch (e) {
          const salvaged = salvageText(cleanText);
          parsed = { text: salvaged, action: null };
        }

        const updatedHistory = [...newHistory, { 
          role: 'model', 
          text: parsed.text || "আমি প্রস্তুত, আপনার নির্দেশনা বলুন।", 
          action: parsed.action,
          showcase: parsed.showcase,
          rawJson: data.text 
        }] as any;

        setAiChatHistory(updatedHistory);

        // If AI triggers an immediate EXECUTE_ORDER, run backend execution helper
        if (parsed.action && parsed.action.type === 'EXECUTE_ORDER') {
          executeOrder(parsed.action);
        } else if (parsed.action && parsed.action.type === 'CREATE_TICKET') {
          executeCreateTicket(parsed.action);
        }
      } else {
        throw new Error(data.error || 'Failed to get AI response');
      }
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      toast.error(error.message || 'AI is currently unavailable');
      setAiChatHistory(prev => [...prev, { role: 'model', text: 'আমি অত্যন্ত দুঃখিত, সিস্টেম সংযোগে সাময়িক জটিলতা দেখা দিয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।' }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const faqs = [
    { q: "How long does an order take?", a: "Most orders start within minutes, but some high-quality services might take up to 24 hours to begin." },
    { q: "Can I cancel an order?", a: "Orders can only be cancelled if they haven't started processing. Go to your orders list to check the status." },
    { q: "What is your refund policy?", a: "Refunds are issued to your panel balance if an order fails to deliver as promised." },
    { q: "How do I add funds?", a: "Click the 'Add Funds' button in the sidebar. We support automatic and manual payment methods." }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight dark:text-white">Support Center</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Get help via manual tickets or FAQ</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button 
            onClick={() => setActiveSupportTab('tickets')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSupportTab === 'tickets' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Tickets
          </button>
          <button 
            onClick={() => setActiveSupportTab('faq')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSupportTab === 'faq' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            FAQ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2">
          {activeSupportTab === 'tickets' && (
            <div className="space-y-6">
              {!selectedTicket ? (
                <>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <Plus size={16} className="text-indigo-600" />
                        Create New Ticket
                      </h3>
                    </div>
                    <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Subject</label>
                        <input 
                          type="text"
                          value={ticketSubject}
                          onChange={(e) => setTicketSubject(e.target.value)}
                          placeholder="e.g. Order #123 issue"
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description</label>
                        <textarea 
                          value={ticketMessage}
                          onChange={(e) => setTicketMessage(e.target.value)}
                          placeholder="Describe your issue in detail..."
                          rows={4}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-600 transition-all resize-none"
                        ></textarea>
                      </div>
                      <button 
                        type="submit"
                        disabled={creatingTicket || !ticketSubject || !ticketMessage}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {creatingTicket ? 'Submitting...' : 'Submit Support Ticket'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <History size={16} className="text-indigo-600" />
                        Your Recent Tickets
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loadingTickets ? (
                        <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                      ) : tickets.length > 0 ? (
                        tickets.map((t) => (
                          <button 
                            key={t.id} 
                            onClick={() => { setSelectedTicket(t); fetchTicketDetails(t.id); }}
                            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                t.status === 'open' ? 'bg-amber-100 text-amber-600' :
                                t.status === 'answered' ? 'bg-indigo-100 text-indigo-600' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                <MessageSquare size={14} />
                              </div>
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-tight leading-none">{t.subject}</div>
                                <div className="text-[9px] text-slate-500 mt-1">{new Date(t.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                                t.status === 'open' ? 'bg-amber-100 text-amber-600' :
                                t.status === 'answered' ? 'bg-indigo-100 text-indigo-600' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {t.status}
                              </span>
                              <ChevronRight size={16} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] opacity-30">No tickets found</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm h-[600px] flex flex-col">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button onClick={() => setSelectedTicket(null)} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors">
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Back to List</span>
                    </button>
                    <div className="text-center">
                      <div className="text-xs font-black uppercase tracking-tight">{selectedTicket.subject}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Ticket ID: #{selectedTicket.id}</div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                      selectedTicket.status === 'open' ? 'bg-amber-100 text-amber-600' :
                      selectedTicket.status === 'answered' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedTicket.status}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Initial Message */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black">
                        {user.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-tight">{user.username}</span>
                          <span className="text-[10px] text-slate-400">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800">
                          {selectedTicket.message}
                        </div>
                      </div>
                    </div>

                    {/* Replies */}
                    {loadingDetails ? (
                      <div className="flex items-center justify-center p-8"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : ticketDetails?.messages.map((m: any) => (
                      <div key={m.id} className={`flex gap-4 ${m.is_admin ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black ${m.is_admin ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>
                          {m.is_admin ? 'A' : (m.username?.substring(0, 2).toUpperCase() || 'U')}
                        </div>
                        <div className={`space-y-1 ${m.is_admin ? 'text-right' : ''}`}>
                          <div className={`flex items-center gap-2 ${m.is_admin ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-black uppercase tracking-tight">
                              {m.is_admin ? 'Support Agent' : m.username}
                            </span>
                            <span className="text-[10px] text-slate-400">{new Date(m.created_at).toLocaleString()}</span>
                          </div>
                          <div className={`text-xs p-4 rounded-2xl border ${
                            m.is_admin 
                              ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30 text-indigo-900 dark:text-indigo-200 rounded-tr-none' 
                              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-none'
                          }`}>
                            {m.message}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTicket.status !== 'closed' && (
                    <form onSubmit={handleSendReply} className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex gap-3">
                        <input 
                          type="text"
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Type your reply..."
                          className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium"
                        />
                        <button 
                          type="submit"
                          disabled={sendingReply || !replyMessage.trim()}
                          className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {sendingReply ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send size={18} />}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSupportTab === 'faq' && (
            <div className="space-y-4">
              {faqs.map((f, i) => (
                <div key={`ticket-${i}`} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-all hover:shadow-md">
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg flex items-center justify-center">
                        <HelpCircle size={16} />
                      </div>
                      <h4 className="text-sm font-black dark:text-white uppercase tracking-tight">{f.q}</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-11">
                      {f.a}
                    </p>
                  </div>
                </div>
              ))}
              <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 text-center">
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Didn't find your answer?</div>
                <p className="text-[10px] text-slate-500 mb-4">Open a manual ticket for support or use the floating AI assistant.</p>
                <button 
                  onClick={() => setActiveSupportTab('tickets')}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all font-black"
                >
                  Create Ticket
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info Area */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Headphones size={14} />
              Manual Contact
            </h4>
            <div className="space-y-4">
              <a href="https://wa.me/01642832777" target="_blank" rel="noreferrer" className="flex items-center gap-4 group">
                <div className="w-10 h-10 bg-[#25D366] text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-none transition-transform group-hover:scale-110">
                  <BrandLogo name="whatsapp" size={20} />
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">WhatsApp Support</div>
                  <div className="text-xs font-black dark:text-white mt-1">01642832777</div>
                </div>
              </a>
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none transition-transform group-hover:scale-110">
                  <Send size={18} />
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Telegram Support</div>
                  <div className="text-xs font-black dark:text-white mt-1">@amarboost_support</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                <Info size={20} />
              </div>
              <h4 className="text-sm font-black uppercase tracking-tight mb-2">Support Policy</h4>
              <ul className="text-[10px] space-y-2 text-indigo-100 font-medium list-disc ml-3">
                <li>Response time: 10 mins to 12 hours</li>
                <li>Holidays: Limited support available</li>
                <li>Provide Order ID for faster resolution</li>
                <li>Keep conversation respectful</li>
              </ul>
            </div>
            {/* Background elements */}
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <HelpCircle size={80} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin, isDarkMode, setIsDarkMode }: { onLogin: (user: User, token: string) => void, isDarkMode: boolean, setIsDarkMode: (val: boolean) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email Verification Sub-States
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [mockCode, setMockCode] = useState('');
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (showVerification) {
      try {
        const res = await fetch('/api/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: verificationEmail, code: verificationCode })
        });
        const data = await res.json();
        if (data.success) {
          toast.success('Email verified successfully!');
          onLogin(data.user, data.token);
        } else {
          toast.error(data.error || 'Verification failed');
          setError(data.error || 'Verification failed');
        }
      } catch (err) {
        toast.error('Network error');
        setError('Network error');
      } finally {
        setLoading(false);
      }
      return;
    }

    const endpoint = isRegister ? '/api/register' : '/api/login';
    const body = isRegister ? { username, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.requiresVerification) {
        setVerificationEmail(data.email);
        setMockCode(data.mockCode || '');
        setError('');
        setShowVerification(true);
        toast.success('Verification code required!');
      } else if (data.success) {
        toast.success(isRegister ? 'Account created!' : 'Welcome back!');
        onLogin(data.user, data.token);
      } else {
        toast.error(data.error || 'Invalid credentials');
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      toast.error('Network error');
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Verification code resent!');
        setMockCode(data.mockCode || '');
      } else {
        toast.error(data.error || 'Failed to resend code');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDarkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-lg text-white font-bold text-xl mb-4">A</div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">
            {showVerification ? 'Verify Your Email' : isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {showVerification 
              ? `Enter the verification code sent to ${verificationEmail}` 
              : isRegister ? 'Join AmarBoost today' : 'Sign in to your AmarBoost account'}
          </p>
        </div>

        {showVerification ? (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in text-left">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center gap-3 text-sm font-medium">
                  <AlertTriangle size={18} />
                  {error}
                </div>
              )}

              {mockCode && (
                <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-start gap-2.5 text-xs border border-blue-100 dark:border-blue-900/30">
                  <Info size={16} className="shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <span className="font-extrabold uppercase tracking-wide text-[9px] block mb-0.5">Simulated Verification Email</span>
                    We simulated sending an email code. Your OTP is: <span className="font-mono font-black text-sm bg-blue-100 dark:bg-blue-900/35 px-1.5 py-0.5 rounded select-all tracking-wider text-blue-700 dark:text-blue-300">{mockCode}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">6-Digit OTP Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-widest font-mono text-2xl px-5 py-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all dark:text-white"
                  placeholder="000000"
                />
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length < 6}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Verify Email'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
              <button
                type="button"
                disabled={resending}
                onClick={handleResendCode}
                className="text-indigo-600 hover:underline cursor-pointer disabled:opacity-50"
              >
                {resending ? 'Resending...' : 'Resend Code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowVerification(false);
                  setError('');
                  setMockCode('');
                  setVerificationCode('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center gap-3 text-sm font-medium">
                  <AlertTriangle size={18} />
                  {error}
                </div>
              )}

              {isRegister && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all dark:text-white"
                    placeholder="johndoe"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all dark:text-white"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all dark:text-white"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (isRegister ? 'Sign Up' : 'Sign In')}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2">
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
                {!isRegister && <a href="#" className="text-indigo-600 font-bold hover:underline">Forgot Password?</a>}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 text-center space-y-4">
          <div className="text-slate-400 text-sm">
            {isRegister ? 'Already have an account?' : "Don't have an account?"} <button onClick={() => setIsRegister(!isRegister)} className="text-indigo-600 font-bold hover:underline">{isRegister ? 'Sign In' : 'Sign Up'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-800 dark:text-white max-w-sm text-xs">
        <p className="font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-[9px] mb-1">{data.category}</p>
        <p className="font-bold text-slate-800 dark:text-slate-100 mb-2 leading-tight">{data.fullName}</p>
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 mt-2 gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Service ID:</span>
          <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{data.serviceId}</span>
        </div>
        <div className="flex items-center justify-between mt-1 gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Total Volume:</span>
          <span className="font-extrabold text-indigo-600 dark:text-emerald-400 flex items-center gap-1">
            {data.orders} {data.orders === 1 ? 'Order' : 'Orders'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

function AdminDashboard({ providerInfo, orders, services, token, setActiveTab }: { providerInfo: any, orders: Order[], services: Service[], token: string, setActiveTab: (tab: string) => void }) {
  const [settings, setSettings] = useState<any[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [newLink, setNewLink] = useState({ text: '', url: '', icon: '' });
  const [isAddingLink, setIsAddingLink] = useState(false);

  const fetchCustomLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-links');
      const data = await res.json();
      if (Array.isArray(data)) setCustomLinks(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchCustomLinks();
  }, [token, fetchCustomLinks]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSettings(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const handleAddLink = async () => {
    if (!newLink.text || !newLink.url) return;
    try {
      const res = await fetch('/api/admin/custom-links', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(newLink)
      });
      if (res.ok) {
        setNewLink({ text: '', url: '', icon: '' });
        setIsAddingLink(false);
        fetchCustomLinks();
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteLink = async (id: number) => {
    if (!confirm('Are you sure you want to delete this link?')) return;
    try {
      const res = await fetch(`/api/admin/custom-links/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchCustomLinks();
    } catch (e) { console.error(e); }
  };

  const profitMargin = settings.find(s => s.key === 'profit_margin')?.value || '10';

  const [useSampleData, setUseSampleData] = useState(orders.length === 0);

  // Synchronize state if orders state changes
  useEffect(() => {
    if (orders.length > 0) {
      setUseSampleData(false);
    } else {
      setUseSampleData(true);
    }
  }, [orders.length]);

  const chartData = React.useMemo(() => {
    if (orders.length > 0 && !useSampleData) {
      const counts: Record<string, number> = {};
      orders.forEach(order => {
        const sId = String(order.service_id);
        counts[sId] = (counts[sId] || 0) + 1;
      });

      const data = Object.entries(counts).map(([sId, count]) => {
        const service = services.find(s => String(s.service) === sId);
        const rawName = service ? service.name : `Service #${sId}`;
        const name = rawName.length > 30 ? rawName.substring(0, 30) + '...' : rawName;
        return {
          serviceId: sId,
          fullName: rawName,
          name,
          category: service ? service.category : 'General',
          orders: count,
        };
      });

      return data.sort((a, b) => b.orders - a.orders).slice(0, 8);
    } else {
      const sampleServices = services.slice(0, 6);
      const mockCounts = [142, 98, 85, 64, 51, 39];
      const fallbackServices = [
        "TikTok Video Views (Instant/Non-drop)",
        "Facebook Page Likes/Followers - Premium",
        "YouTube Watch Time - 4000 Hours",
        "Instagram Organic Growth Followers",
        "Telegram Post Views - Super Fast",
        "Spotify Track Premium Plays"
      ];
      
      const results = [];
      for (let idx = 0; idx < 6; idx++) {
        const service = sampleServices[idx];
        const rawName = service ? service.name : (fallbackServices[idx] || `SMM Package #${idx + 1}`);
        const name = rawName.length > 30 ? rawName.substring(0, 30) + '...' : rawName;
        results.push({
          serviceId: service ? service.service : String(6000 + idx),
          fullName: rawName,
          name,
          category: service ? service.category : "Social Media",
          orders: mockCounts[idx] || (20 - idx * 3),
        });
      }
      return results;
    }
  }, [orders, services, useSampleData]);

  const stats = [
    { label: 'Provider Balance', value: providerInfo ? formatPrice(providerInfo.balance) : 'Loading...', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/20' },
    { label: 'Total Orders', value: orders.length, icon: History, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { label: 'Active Services', value: services.length, icon: List, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
    { label: 'Pending Orders', value: orders.filter(o => o.status === 'pending').length, icon: ChevronRight, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/20' },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight dark:text-white">Admin Overview</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Platform performance and provider status</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              const res = await fetch('/api/admin/services/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await res.json();
              if (data.success) {
                toast.success('Services synced with provider!');
              } else {
                toast.error(data.error || 'Failed to sync services');
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <RefreshCw size={14} />
            Sync Services
          </button>
          <button 
            onClick={() => setActiveTab('new-order')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none hover:-translate-y-0.5 active:translate-y-0"
          >
            <ShoppingCart size={16} />
            Create New Order
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map((stat, i) => (
          <div key={`stat-${i}`} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center shrink-0`}>
                <stat.icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-slate-500 text-[9px] font-bold uppercase tracking-wider truncate">{stat.label}</div>
                <div className="text-base font-black mt-0.5 tracking-tight">{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Popular Services Demand Insights Chart */}
      <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-black dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
              Popular Services Analytics
            </h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
              Service demand based on incoming order count
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {orders.length > 0 && (
              <button
                onClick={() => setUseSampleData(!useSampleData)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest transition-all border ${
                  useSampleData 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20' 
                    : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100'
                }`}
              >
                {useSampleData ? '⚠️ Previewing Demo Data' : '✨ Showing Live Data'}
              </button>
            )}
            
            {orders.length === 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest">
                <Info size={12} />
                Demo Insights Mode (No Live Orders Yet)
              </span>
            )}
          </div>
        </div>

        {/* Recharts Bar Chart UI */}
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
            >
              <defs>
                <linearGradient id="colorOrdersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0.4}/>
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                vertical={false} 
                className="stroke-slate-100 dark:stroke-slate-800/80"
              />
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 14)}...` : value}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
              />
              <Bar 
                dataKey="orders" 
                radius={[6, 6, 0, 0]}
                maxBarSize={45}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill="url(#colorOrdersGradient)" 
                    className="hover:opacity-85 transition-opacity cursor-pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Settings Table placeholder for now or move existing if any */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
              <Settings size={16} className="text-indigo-600" />
              General Settings
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {settings.map((s) => (
              <div key={s.key} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.key.replace(/_/g, ' ')}</div>
                  <div className="text-xs font-black dark:text-white mt-0.5">{s.value}</div>
                </div>
              </div>
            ))}
            {settings.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic text-[10px] uppercase font-bold tracking-widest opacity-30">
                No custom settings found
              </div>
            )}
          </div>
        </div>

        {/* Custom Links Management */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
              <LinkIcon size={16} className="text-indigo-600" />
              Custom Links
            </h3>
            <button 
              onClick={() => setIsAddingLink(!isAddingLink)}
              className="p-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="p-4">
            {isAddingLink && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Link Text</label>
                    <input 
                      type="text" 
                      value={newLink.text}
                      onChange={(e) => setNewLink({ ...newLink, text: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs focus:ring-1 focus:ring-indigo-600"
                      placeholder="e.g. WhatsApp Group"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">URL</label>
                    <input 
                      type="text" 
                      value={newLink.url}
                      onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs focus:ring-1 focus:ring-indigo-600"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddLink}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all uppercase tracking-widest"
                  >
                    Add Link
                  </button>
                  <button 
                    onClick={() => setIsAddingLink(false)}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              {customLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-indigo-600 shadow-sm">
                      <ExternalLink size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-black dark:text-white leading-none">{link.text}</div>
                      <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[150px] md:max-w-[300px]">{link.url}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteLink(link.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {customLinks.length === 0 && !isAddingLink && (
                <div className="p-8 text-center text-slate-400 text-[10px] uppercase font-bold tracking-widest opacity-30">
                  No custom links added yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {providerInfo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">SMM Provider Gateways</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Real-time status and API balances of your configured gateways</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providerInfo.providers && providerInfo.providers.map((p: any) => (
              <div key={p.id} className={`bg-gradient-to-br ${p.is_active ? 'from-indigo-600 to-violet-700 text-white shadow-sm' : 'from-slate-50 to-slate-100 border border-slate-200 dark:from-slate-900 dark:to-slate-950 dark:border-slate-800 text-slate-900 dark:text-slate-100'} p-5 rounded-xl relative overflow-hidden transition-all hover:translate-y-[-2px]`}>
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 ${p.is_active ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'} rounded-lg flex items-center justify-center font-bold text-xs`}>
                          API
                        </div>
                        <div>
                          <h4 className="text-sm font-bold tracking-tight">{p.name}</h4>
                          <p className={`text-[9px] font-mono truncate max-w-[170px] ${p.is_active ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{p.url}</p>
                        </div>
                      </div>
                      <div>
                        {p.is_active ? (
                          <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase rounded tracking-wider shadow-sm">ACTIVE</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-500 text-[8px] font-black uppercase rounded tracking-wider">OFFLINE</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
                    <span className={`text-[9px] uppercase font-bold tracking-wider ${p.is_active ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>Provider Balance</span>
                    <span className="text-xl font-black tabular-nums">{formatPrice(p.balance)}</span>
                  </div>
                </div>
                {p.is_active && (
                  <>
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl"></div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold mb-4">System Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-xs font-bold">Profit Margin</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-bold">{profitMargin}%</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-xs font-bold">Auto-Sync Services</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded text-[10px] font-bold">Enabled</span>
            </div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
            <div className="flex items-center gap-2 mb-2">
              <Info size={16} className="text-indigo-600" />
              <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-100">Admin Tip</h4>
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
              When a user places an order, the system automatically charges them based on your profit margin and places the order with AmarBoost using your provider balance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportChat({ user, onUpdateUser, token, services, orders, onOrderPlaced, setActiveTab }: { user: User, onUpdateUser: (user: User) => void, token: string, services: Service[], orders: Order[], onOrderPlaced?: () => void, setActiveTab?: (tab: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string, action?: any, showcase?: any, rawJson?: string }[]>([
    { role: 'model', text: 'হ্যালো! অমরবুস্ট এআই সাপোর্ট সেন্টারে আপনাকে স্বাগতম। আপনি যেকোনো সার্ভিস সম্পর্কে জানতে বা সরাসরি অর্ডার করতে আমার সাথে চ্যাট করতে পারেন।' }
  ]);
  const [step, setStep] = useState<'whatsapp' | 'confirm' | 'chat'>('whatsapp');
  const [whatsappInput, setWhatsappInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // New inline service ordering states inside Chat window
  const [selectedServiceIdToOrder, setSelectedServiceIdToOrder] = useState<string | null>(null);
  const [inlineLink, setInlineLink] = useState('');
  const [inlineQuantity, setInlineQuantity] = useState<number | ''>('');
  const [inlineMsgIndex, setInlineMsgIndex] = useState<number | null>(null);

  const handleInlineSubmitOrder = async (service: Service) => {
    if (!inlineLink.trim()) {
      toast.error('দয়া করে লিঙ্ক প্রবেশ করান');
      return;
    }
    const qty = Number(inlineQuantity);
    if (isNaN(qty) || qty < Number(service.min) || qty > Number(service.max)) {
      toast.error(`পরিমাণ অবশ্যই ${service.min} এবং ${service.max} এর মধ্যে হতে হবে`);
      return;
    }

    const rate = parseFloat(service.rate);
    const charge = qty * (rate / 1000);

    if (user.balance < charge) {
      toast.error('আপনার ব্যালেন্স অপর্যাপ্ত! দয়া করে ফান্ড এড করুন।');
      return;
    }

    setIsAiTyping(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ serviceId: service.service, link: inlineLink, quantity: qty })
      });
      const result = await res.json();
      if (result.success) {
        toast.success('অর্ডার প্লেস করা হয়েছে!');
        setChatHistory(prev => [
          ...prev,
          { 
            role: 'model', 
            text: `🎉 **অর্ডার সফলভাবে সম্পন্ন হয়েছে!**\n- **অর্ডার আইডি:** #${result.orderId}\n- **সার্ভিস:** ${service.name}\n- **পরিমাণ:** ${qty}\n- **টার্গেট লিঙ্ক:** ${inlineLink}\n\nআপনার ব্যালেন্স থেকে মোট চার্জ ${formatPrice(charge)} কেটে নেওয়া হয়েছে। ধন্যবাদ!`,
            action: null
          }
         ]);
        // Reset states
        setSelectedServiceIdToOrder(null);
        setInlineLink('');
        setInlineQuantity('');
        setInlineMsgIndex(null);
        
        if (onOrderPlaced) onOrderPlaced();
      } else {
        toast.error(result.error || 'অর্ডার করতে সমস্যা হয়েছে');
      }
    } catch (err) {
      toast.error('নেটওয়ার্ক ত্রুটির কারণে অর্ডার প্রсеস করা সম্ভব হয়নি।');
    } finally {
      setIsAiTyping(false);
    }
  };

  useEffect(() => {
    if (user.whatsapp_number) {
      setStep('confirm');
      setWhatsappInput(user.whatsapp_number);
    } else {
      setStep('whatsapp');
    }
  }, [user.whatsapp_number]);

  useEffect(() => {
    if (isOpen && step === 'chat') {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [chatHistory, isOpen, step]);

  const handleSaveWhatsapp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!whatsappInput.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/user/whatsapp', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ whatsapp_number: whatsappInput })
      });
      const data = await res.json();
      if (data.success) {
        onUpdateUser({ ...user, whatsapp_number: whatsappInput });
        setStep('chat');
        toast.success("WhatsApp number saved!");
      }
    } catch (error) {
      console.error("Failed to save WhatsApp number");
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeOrder = async (action: any) => {
    setIsAiTyping(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ serviceId: action.serviceId, link: action.link, quantity: action.quantity })
      });
      const result = await res.json();
      if (result.success) {
        toast.success('অর্ডার প্লেস করা হয়েছে!');
        setChatHistory(prev => [
          ...prev,
          { 
            role: 'model', 
            text: `🎉 **অর্ডার সফলভাবে সম্পন্ন হয়েছে!**\n- **অর্ডার আইডি:** #${result.orderId}\n- **সার্ভিস:** ${action.serviceName || 'নির্বাচিত সার্ভিস'}\n- **পরিমাণ:** ${action.quantity}\n- **টার্গেট লিঙ্ক:** ${action.link}\n\nআপনার ব্যালেন্স থেকে মোট চার্জ কেটে নেওয়া হয়েছে এবং সার্ভিসটি অতি শীঘ্রই ডেলিভারি শুরু হবে। নতুন কোনো সাহায্যের প্রয়োজন হলে জানান।`,
            action: null
          }
         ]);
         if (onOrderPlaced) onOrderPlaced();
      } else {
        toast.error(result.error || 'অর্ডার করতে সমস্যা হয়েছে');
        setChatHistory(prev => [
          ...prev,
          { role: 'model', text: `⚠️ **অর্ডার ব্যর্থ হয়েছে!**\nকারণ: ${result.error || 'ব্যালেন্স অপ্রতুল বা প্রোভাইডার ত্রুটি।'}`, action: null }
        ]);
      }
    } catch (err) {
      toast.error('Network Error during order execution');
      setChatHistory(prev => [
        ...prev,
        { role: 'model', text: `❌ নেটওয়ার্ক ত্রুটির কারণে অর্ডার প্রসেস করা সম্ভব হয়নি। পুনরায় চেষ্টা করুন।`, action: null }
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const executeCreateTicket = async (action: any) => {
    setIsAiTyping(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ subject: action.subject || 'SMM AI Help', message: action.message || 'Customer requested support via SMM AI Agent' })
      });
      if (res.ok) {
        toast.success('Support ticket created successfully!');
        setChatHistory(prev => [
          ...prev,
          { 
            role: 'model', 
            text: `🎫 **সাপোর্ট টিকিট সফলভাবে তৈরি হয়েছে!**\n\nআমরা ইতিপূর্বে একটি সাপোর্ট টিকিট ওপেন করেছি। আমাদের কাস্টমার রিলেশন টিম খুবই শীঘ্রই টিকিটটির উত্তর দেবে। আপনি যেকোনো সময় অন্য টিকিটের সাথে এটির স্ট্যাটাস দেখতে পারবেন।`,
            action: null
          }
         ]);
      } else {
        toast.error('টিকিট তৈরি করতে কোনো সমস্যা হয়েছে।');
      }
    } catch (err) {
      toast.error('Network Error during ticket creation');
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isAiTyping) return;

    const userMessage = message.trim();
    setMessage('');
    const newHistory = [...chatHistory, { role: 'user', text: userMessage }] as any;
    setChatHistory(newHistory);
    setIsAiTyping(true);

    try {
      // Serialize services for AI mapping using the semantic search indexer
      const serviceSummary = getAiSearchedServices(userMessage, services, newHistory);

      const systemContext = `
        You are a highly intelligent and powerful Autonomous SMM Panel Agent for AmarBoost.
        You can control and place orders on behalf of users, check prices, explain services, and reply in fluent warm Bengali (or English if the user writes in English).

        ADVANCE SEARCH SERVICE ACTIVATED:
        To ensure maximum precision and optimize response sizes, SMM service options are index-filtered based on the user's latest query ("${userMessage.substring(0, 50)}...").
        Always search the AVAILABLE SERVICES LIST. If the user asks for secondary options or cannot locate specific platforms initially, advise them to write specific, target keywords (such as "Telegram channel members" or "Instagram custom comments BDT") so the search engine can instantly retrieve and present those packages within the current chat context!

        USER INFO:
        - Username: ${user.username}
        - Current Balance: ${formatPrice(user.balance)} ($${user.balance})
        - Active Orders: ${orders.slice(0, 5).map(o => `#${o.id}(Status: ${o.status}, Service: ${o.service_id})`).join(', ')}

        AVAILABLE SERVICES LIST:
        ${JSON.stringify(serviceSummary)}

        CRITICAL OPERATIONAL RULES:
        1. Always output a valid JSON and ONLY a valid JSON. DO NOT wrap with markdown code blocks like 'triple-backticks-json'. Return pure JSON string matching this exact TypeScript interface:
           interface AIResponse {
             text: string; // The user-facing conversational text (Bengali/English). Explain service details or explain what needs to be confirmed/processed.
             action: null | {
               type: 'PROPOSE_ORDER' | 'EXECUTE_ORDER';
               serviceId: string;
               serviceName: string;
               link: string;
               quantity: number;
               charge: number; // Calculate charge = quantity * (service.rate / 1000)
             };
             showcase?: null | {
               layout: 'grid' | 'carousel';
               serviceIds: string[]; // List of specific service string IDs to showcase as beautiful interactive products (e.g., ["5937", "5436", "5465"]) when the user asks for service options, pricing list, or recommendation.
             }
           }
        2. Help users check prices, find services, and details about AmarBoost SMM panel.
        3. ORDERING FLOW STATE MACHINE:
           - Stage A: User mentions wanting to order some service (e.g. YouTube subs, TikTok views, etc.).
             - Action: Locate the matching service from the SERVICES LIST above. Ask for target URL/link and quantity if not already provided.
           - Stage B: Once you have the exact serviceId, link, and quantity:
             - Action: Calculate the charge, verify if the user has enough balance.
             - Respond with a friendly Bengali explanation of the order summary and set the "action" payload with type "PROPOSE_ORDER".
           - Stage C: User checks and says "Yes" / "হ্যাঁ" / "Confirm" / "করো" or clicks confirmation:
             - Action: Match the previous PROPOSE_ORDER details from history. Output the "action" with type "EXECUTE_ORDER", keeping the exact serviceId, link, and quantity.
             - Explain to the user that we are finalizing and placing their order right now!
           - Stage D: User says "No" / "না" / "Cancel":
             - Confirm cancel, nullify action, and say order is cancelled.
        4. When explaining service charges, clearly note they are calculate by quantity * (rate / 1000). For example: 500 Views for a service rated 100 Taka per 1000 will cost 50 Taka.
        5. If balance is insufficient, gently warn the user and explain they can use the "Add Funds" button in the sidebar or dashboard.
        6. When the user asks for service options, pricing list, or recommendations (for example, Bangladeshi Facebook followers packages), identify the appropriate service string IDs from the SERVICES LIST, and return them inside the 'showcase' object. Use 'grid' layout for showing 1-2 items, or 'carousel' layout for 3+ items so customers get an immersive shopping slider inside their chat! Always return the correct matching string ID.
      `;

      // Pass exact JSON string messages so model sees previous state-actions perfectly
      const apiMessages = newHistory.map((h: any) => ({
        role: h.role,
        text: h.role === 'model' && h.rawJson ? h.rawJson : h.text
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          messages: apiMessages,
          context: systemContext
        })
      });

      const data = await res.json();
      if (data.text) {
        let cleanText = data.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
        let parsed: any;
        try {
          parsed = JSON.parse(cleanText);
        } catch (e) {
          const salvaged = salvageText(cleanText);
          parsed = { text: salvaged, action: null };
        }

        const updatedHistory = [...newHistory, { 
          role: 'model', 
          text: parsed.text || "আমি প্রস্তুত, আপনার নির্দেশনা বলুন।", 
          action: parsed.action,
          showcase: parsed.showcase,
          rawJson: data.text 
        }] as any;

        setChatHistory(updatedHistory);

        // If AI triggers an immediate EXECUTE_ORDER, run backend execution helper
        if (parsed.action && parsed.action.type === 'EXECUTE_ORDER') {
          executeOrder(parsed.action);
        } else if (parsed.action && parsed.action.type === 'CREATE_TICKET') {
          executeCreateTicket(parsed.action);
        }
      } else {
        throw new Error(data.error || 'Failed to get AI response');
      }
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      toast.error(error.message || 'AI is currently unavailable');
      setChatHistory(prev => [...prev, { role: 'model', text: 'আমি অত্যন্ত দুঃখিত, সিস্টেম সংযোগে সাময়িক জটিলতা দেখা দিয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।' }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50 animate-bounce"
        style={{ animationDuration: '3s' }}
      >
        <MessageSquare size={20} />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border border-white rounded-full flex items-center justify-center text-[8px] font-bold">1</span>
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 lg:inset-auto lg:bottom-20 lg:right-4 lg:w-80 lg:h-[500px] bg-white dark:bg-slate-900 shadow-xl z-[60] lg:rounded-xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-fade-in"
          >
            {/* Header */}
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Headphones size={16} />
                </div>
                <div>
                  <div className="font-bold text-sm">Support Center [AI]</div>
                  <div className="text-[10px] opacity-80 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                    Online
                  </div>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsOpen(false)} 
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50 dark:bg-slate-950/50">
              {step === 'whatsapp' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-4 animate-fade-in">
                  <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center">
                    <BrandLogo name="whatsapp" size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">WhatsApp Verification</h4>
                    <p className="text-xs text-slate-500 mt-1">Please enter your WhatsApp number to start a conversation with our support team.</p>
                  </div>
                  <form onSubmit={handleSaveWhatsapp} className="w-full space-y-3">
                    <input 
                      type="text"
                      required
                      placeholder="Enter WhatsApp Number"
                      value={whatsappInput}
                      onChange={(e) => setWhatsappInput(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-bold text-center"
                    />
                    <div className="flex justify-center">
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all text-xs disabled:opacity-50 shadow-md cursor-pointer"
                      >
                        {isSubmitting ? 'Processing...' : 'Start Conversation'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : step === 'confirm' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-4 animate-fade-in">
                  <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center">
                    <BrandLogo name="whatsapp" size={32} />
                  </div>
                  <div className="w-full">
                    <h4 className="font-bold text-slate-900 dark:text-white">Welcome Back!</h4>
                    <p className="text-xs text-slate-500 mt-1">Your saved WhatsApp number:</p>
                    
                    <div className="mt-3 max-w-xs mx-auto space-y-2">
                      <input 
                        type="text"
                        required
                        placeholder="Enter WhatsApp Number"
                        value={whatsappInput}
                        onChange={(e) => setWhatsappInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-bold text-center text-indigo-600 dark:text-indigo-400"
                      />
                      {whatsappInput !== user.whatsapp_number && (
                        <button
                          type="button"
                          onClick={() => handleSaveWhatsapp()}
                          disabled={isSubmitting}
                          className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md block mx-auto cursor-pointer"
                        >
                          {isSubmitting ? 'Updating...' : 'Update Number'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full space-y-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setStep('chat')}
                      className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md text-xs cursor-pointer"
                    >
                      Continue to Chat
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setStep('whatsapp');
                        setWhatsappInput('');
                      }}
                      className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs cursor-pointer"
                    >
                      Use Different Number
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 space-y-3 overflow-y-auto p-1 custom-scrollbar">
                  {chatHistory.map((chat, i) => (
                    <div key={`log-${i}`} className="space-y-2 animate-fade-in">
                      <div className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-2.5 rounded-xl text-xs break-words ${
                          chat.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-100 dark:border-slate-700 rounded-tl-none'
                        }`}>
                          <div className="whitespace-pre-wrap">{chat.text}</div>
                        </div>
                      </div>
                      
                      {chat.role === 'model' && chat.action && chat.action.type === 'PROPOSE_ORDER' && (
                        <div className="flex justify-start animate-fade-in">
                          <div className="w-full max-w-[85%] p-2.5 bg-indigo-50/85 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-2 shadow-sm">
                            <div className="flex items-center gap-1.5 pb-1 border-b border-indigo-100/50 dark:border-indigo-900/20">
                              <ShoppingCart size={12} className="text-indigo-600 animate-pulse shrink-0" />
                              <span className="text-[9px] font-black uppercase text-indigo-900 dark:text-indigo-200 tracking-wider">অর্ডার বিবরণী (Order Summary)</span>
                            </div>
                            <div className="text-[10px] space-y-1 text-slate-700 dark:text-slate-300">
                              <div className="flex justify-between gap-4"><span className="font-bold opacity-60 shrink-0">সার্ভিস নাম:</span> <span className="font-black text-slate-900 dark:text-white truncate text-right">{chat.action.serviceName}</span></div>
                              <div className="flex justify-between gap-4"><span className="font-bold opacity-60 shrink-0">টার্গেট লিঙ্ক:</span> <span className="font-medium text-indigo-600 dark:text-indigo-400 break-all select-all font-mono text-[9px] text-right">{chat.action.link}</span></div>
                              <div className="flex justify-between gap-4"><span className="font-bold opacity-60 shrink-0">পরিমাণ:</span> <span className="font-black text-slate-900 dark:text-white text-right">{chat.action.quantity}</span></div>
                              <div className="flex justify-between gap-4"><span className="font-bold opacity-60 shrink-0">মোট খরচ:</span> <span className="font-black text-indigo-600 dark:text-indigo-400 text-xs text-right">{formatPrice(chat.action.charge)}</span></div>
                            </div>
                            <div className="pt-1.5 flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const userYesMsg = "হ্যাঁ, অর্ডার কনফার্ম করো।";
                                  const nextHistory = [...chatHistory, { role: 'user', text: userYesMsg }];
                                  setChatHistory(nextHistory);
                                  executeOrder(chat.action);
                                }}
                                className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[8px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 transition-all shadow-md active:scale-95 cursor-pointer animate-pulse"
                              >
                                <Check size={10} />
                                হ্যাঁ (Yes)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setChatHistory(prev => [
                                    ...prev,
                                    { role: 'user', text: 'না, বাতিল করো।' },
                                    { role: 'model', text: 'অর্ডারটি বাতিল করা হয়েছে। নতুন কোনো সাহায্য লাগলে বলুন।', action: null }
                                  ] as any);
                                }}
                                className="flex-1 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-black text-[8px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                              >
                                <X size={10} />
                                না (No)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {chat.role === 'model' && chat.action && chat.action.type === 'CHECK_BALANCE' && (
                        <div className="flex justify-start animate-fade-in">
                          <div className="w-full max-w-[85%] p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-150/40 dark:border-indigo-900/30 space-y-2.5 shadow-sm text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-2 pb-1.5 border-b border-indigo-100/50 dark:border-indigo-900/20">
                              <Wallet size={14} className="text-indigo-600 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-200">ইউজার প্রোফাইল ও ব্যালেন্স (User Balance)</span>
                            </div>
                            <div className="text-[10px] space-y-1">
                              <div className="flex justify-between"><span className="opacity-60">ইউজারনেম:</span> <span className="font-bold text-slate-900 dark:text-white">{user.username}</span></div>
                              <div className="flex justify-between"><span className="opacity-60">বর্তমান ব্যালেন্স:</span> <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-xs">{formatPrice(user.balance)}</span></div>
                              <div className="flex justify-between"><span className="opacity-60">মোট অর্ডার:</span> <span className="font-bold text-slate-900 dark:text-white">{orders.length} টি</span></div>
                            </div>
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsOpen(false);
                                  if (setActiveTab) setActiveTab('add-funds');
                                }}
                                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[8px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                              >
                                <Plus size={10} />
                                ফান্ড এড করুন (Add Funds)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {chat.role === 'model' && chat.action && chat.action.type === 'TRACK_ORDER' && (() => {
                        const targetId = chat.action.orderId ? parseInt(String(chat.action.orderId)) : null;
                        const matchedOrder = targetId ? orders.find(o => o.id === targetId) : orders[0];
                        
                        return (
                          <div className="flex justify-start animate-fade-in">
                            <div className="w-full max-w-[85%] p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-sm text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">
                                <Truck size={14} className="text-indigo-600 shrink-0" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">অর্ডার ট্র্যাকিং বিবরণ (Order Tracking)</span>
                              </div>
                              
                              {matchedOrder ? (
                                <>
                                  <div className="text-[10px] space-y-1">
                                    <div className="flex justify-between"><span className="opacity-60">অর্ডার আইডি:</span> <span className="font-bold font-mono">#{matchedOrder.id}</span></div>
                                    <div className="flex justify-between"><span className="opacity-60">পরিমাণ:</span> <span className="font-bold">{matchedOrder.quantity}</span></div>
                                    <div className="flex justify-between"><span className="opacity-60">স্ট্যাটাস:</span> <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                      matchedOrder.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/35 dark:text-green-300' :
                                      matchedOrder.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300' :
                                      matchedOrder.status === 'processing' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/35 dark:text-indigo-300' :
                                      'bg-slate-100 text-slate-700 dark:bg-slate-705 dark:text-slate-300'
                                    }`}>{matchedOrder.status}</span></div>
                                  </div>
                                  
                                  <div className="pt-1.5 flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsOpen(false);
                                        if (setActiveTab) setActiveTab('orders');
                                      }}
                                      className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[8px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                                    >
                                      <Eye size={10} />
                                      লাইভ ট্র্যাক (Track Live)
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center py-2">
                                  {chat.action.orderId ? `অর্ডার আইডি #${chat.action.orderId} খুঁজে পাওয়া যায়নি` : 'আপনার কোনো একটিভ অর্ডার নেই'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {chat.role === 'model' && chat.action && chat.action.type === 'CREATE_TICKET' && (
                        <div className="flex justify-start animate-fade-in">
                          <div className="w-full max-w-[85%] p-3 bg-emerald-50/80 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30 space-y-2 shadow-sm text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-100/50 dark:border-emerald-950/10">
                              <Inbox size={14} className="text-emerald-600 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-950 dark:text-emerald-200">টিকিট তথ্য (Support Ticket)</span>
                            </div>
                            <div className="text-[10px] space-y-1">
                              <div className="flex justify-between"><span className="opacity-60">টিকিট বিষয়:</span> <span className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">{chat.action.subject || 'SMM Issue'}</span></div>
                              <div className="flex justify-between"><span className="opacity-60">বার্তা:</span> <span className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">{chat.action.message || 'Help requested'}</span></div>
                            </div>
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsOpen(false);
                                  if (setActiveTab) setActiveTab('support');
                                }}
                                className="w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[8px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                              >
                                <Inbox size={10} />
                                টিকিট বক্সে যান (Go to Tickets)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {chat.role === 'model' && chat.showcase && (
                        <div className="flex flex-col gap-2 mt-2 w-full animate-fade-in">
                          {(() => {
                            const showLayout = chat.showcase.layout || 'carousel';
                            const serviceIds = chat.showcase.serviceIds || [];
                            // Find matching services from list
                            const matchedServices = serviceIds
                              .map((id: string) => services.find(s => String(s.service) === String(id)))
                              .filter(Boolean) as Service[];

                            if (matchedServices.length === 0) return null;

                            return (
                              <div className="space-y-2 w-full">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">🌟 স্পেশাল অফার (Special Offers)</span>
                                  <span className="text-[8px] font-bold text-slate-400 capitalize">{showLayout} layout</span>
                                </div>

                                {showLayout === 'grid' ? (
                                  <div className="grid grid-cols-1 gap-2">
                                    {matchedServices.map((srv) => (
                                      <div key={srv.service} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-750 shadow-xs transition-all hover:border-indigo-400 dark:hover:border-indigo-700 flex flex-col justify-between gap-2.5">
                                        <div>
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded text-[8px] font-bold uppercase tracking-wider truncate max-w-[120px]">{srv.category}</span>
                                            <span className="text-[8px] font-mono text-slate-400">ID: {srv.service}</span>
                                          </div>
                                          <h5 className="font-bold text-slate-800 dark:text-white text-[10.5px] mt-1 leading-snug line-clamp-2">{srv.name}</h5>
                                          <div className="flex items-baseline gap-1 mt-1">
                                            <span className="text-indigo-600 dark:text-indigo-400 text-xs font-black">{formatPrice(srv.rate)}</span>
                                            <span className="text-[8px] text-slate-400">প্রতি ১,০০০ (per 1k)</span>
                                          </div>
                                        </div>
                                        
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedServiceIdToOrder(srv.service);
                                            setInlineMsgIndex(i);
                                            setInlineLink('');
                                            setInlineQuantity(parseInt(srv.min) || 100);
                                          }}
                                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                                        >
                                          <ShoppingCart size={10} />
                                          অর্ডার করুন (Order)
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  /* CAROUSEL FLOW */
                                  <div className="flex gap-2 overflow-x-auto pb-2 snap-x scroll-smooth scrollbar-thin scrollbar-thumb-indigo-200">
                                    {matchedServices.map((srv) => (
                                      <div key={srv.service} className="snap-start shrink-0 w-[180px] p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-750 shadow-xs transition-all hover:border-indigo-400 dark:hover:border-indigo-700 flex flex-col justify-between gap-2">
                                        <div>
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded text-[7px] font-bold uppercase tracking-wider truncate max-w-[80px]">{srv.category}</span>
                                            <span className="text-[7px] font-mono text-slate-400">ID: {srv.service}</span>
                                          </div>
                                          <h5 className="font-bold text-slate-800 dark:text-white text-[10px] mt-1 leading-snug line-clamp-2 h-[28px]">{srv.name}</h5>
                                          <div className="flex items-baseline gap-1 mt-1">
                                            <span className="text-indigo-600 dark:text-indigo-400 text-[10.5px] font-black">{formatPrice(srv.rate)}</span>
                                            <span className="text-[7.5px] text-slate-400">প্রতি ১k</span>
                                          </div>
                                        </div>
                                        
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedServiceIdToOrder(srv.service);
                                            setInlineMsgIndex(i);
                                            setInlineLink('');
                                            setInlineQuantity(parseInt(srv.min) || 100);
                                          }}
                                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                                        >
                                          <ShoppingCart size={10} />
                                          অর্ডার করুন
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Inline purchase configurator drawer */}
                                {selectedServiceIdToOrder && inlineMsgIndex === i && (() => {
                                  const activeSrv = matchedServices.find(s => s.service === selectedServiceIdToOrder);
                                  if (!activeSrv) return null;

                                  const rate = parseFloat(activeSrv.rate);
                                  const quantityNum = Number(inlineQuantity) || 0;
                                  const costVal = quantityNum * (rate / 1000);

                                  return (
                                    <div className="p-3 bg-indigo-50/90 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-2.5 animate-fade-in text-slate-800 dark:text-slate-200 w-full shadow-inner">
                                      <div className="flex items-center justify-between pb-1.5 border-b border-indigo-100/40 dark:border-indigo-900/10">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-none" />
                                          <span className="text-[9px] font-black uppercase text-indigo-950 dark:text-indigo-300 truncate tracking-wide">১-ক্লিক অর্ডার সেটআপ - ID: {activeSrv.service}</span>
                                        </div>
                                        <button 
                                          type="button"
                                          onClick={() => {
                                            setSelectedServiceIdToOrder(null);
                                            setInlineMsgIndex(null);
                                          }}
                                          className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>

                                      <div className="space-y-2">
                                        <div>
                                          <label className="block text-[8px] font-black uppercase text-slate-400 tracking-wider mb-1">টার্গেটেড লিঙ্ক (Target URL/Link)</label>
                                          <input 
                                            type="text"
                                            value={inlineLink}
                                            onChange={(e) => setInlineLink(e.target.value)}
                                            placeholder="যেমন: https://facebook.com/page-link"
                                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-indigo-600 text-[10px] font-bold"
                                          />
                                        </div>

                                        <div>
                                          <div className="flex items-center justify-between mb-1">
                                            <label className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">পরিমাণ (Quantity)</label>
                                            <span className="text-[7.5px] text-slate-400 font-bold">মিনিমাম: {activeSrv.min} | ম্যাক্সিমাম: {formatNumber(activeSrv.max)}</span>
                                          </div>
                                          <input 
                                            type="number"
                                            value={inlineQuantity}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setInlineQuantity(v === '' ? '' : parseInt(v));
                                            }}
                                            placeholder={`যেমন: ${activeSrv.min}`}
                                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-indigo-600 text-[10px] font-mono font-black"
                                          />
                                        </div>

                                        <div className="p-2 bg-white/50 dark:bg-slate-900/30 rounded-lg flex items-center justify-between text-[9.5px] border border-indigo-100/30">
                                          <span className="font-bold text-slate-500">হিসাবকৃত মোট মূল্য:</span>
                                          <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-xs">{formatPrice(costVal)}</span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        disabled={isAiTyping || !inlineLink.trim() || !inlineQuantity}
                                        onClick={() => handleInlineSubmitOrder(activeSrv)}
                                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md disabled:opacity-45"
                                      >
                                        {isAiTyping ? 'অর্ডার প্রসেসিং হচ্ছে...' : 'অর্ডার সাবমিট করুন (Confirm)'}
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                  {isAiTyping && (
                    <div className="flex justify-start animate-fade-in">
                      <div className="bg-white dark:bg-slate-800 text-slate-500 max-w-[85%] p-2 rounded-xl border border-slate-100 dark:border-slate-800 rounded-tl-none flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input Area (Only in Chat step) */}
            {step === 'chat' && (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    disabled={isAiTyping}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none text-xs transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isAiTyping || !message.trim()}
                    className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Sub-components
function Dashboard({ balance, orders, services, setActiveTab, favorites, setFavorites, setSelectedServiceId, setIsAddFundsOpen, token, onUpdate, onSyncBalance, isSyncingBalance }: { balance: number, orders: Order[], services: Service[], setActiveTab: (tab: string) => void, favorites: string[], setFavorites: (favs: string[]) => void, setSelectedServiceId: (id: string) => void, setIsAddFundsOpen: (open: boolean) => void, token: string, onUpdate?: () => void, onSyncBalance?: () => void, isSyncingBalance?: boolean }) {
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);

  const [threshold, setThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('balance_warning_threshold');
      return saved ? parseFloat(saved) : 50;
    } catch {
      return 50;
    }
  });
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(threshold));

  useEffect(() => {
    setThresholdInput(String(threshold));
  }, [threshold]);

  const handleSaveThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(thresholdInput);
    if (!isNaN(val) && val >= 0) {
      setThreshold(val);
      try {
        localStorage.setItem('balance_warning_threshold', String(val));
      } catch (err) {
        console.error(err);
      }
      setIsEditingThreshold(false);
      toast.success(`Warning threshold updated to ${formatPrice(val)}`);
    } else {
      toast.error('Please enter a valid threshold amount');
    }
  };

  useEffect(() => {
    if (balance < threshold) {
      toast.error(`⚠️ Low Balance Reminder: Your balance (${formatPrice(balance)}) has dropped below your threshold of ${formatPrice(threshold)}. Please top up your account!`, {
        id: 'low-balance-toast',
        duration: 6000
      });
    }
  }, [balance, threshold]);

  useEffect(() => {
    if (!token) return;
    setLoadingTx(true);
    fetch('/api/transactions', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRecentTx(data.slice(0, 5));
        }
      })
      .catch(console.error)
      .finally(() => setLoadingTx(false));
  }, [token]);

  useEffect(() => {
    fetch('/api/custom-links')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setCustomLinks(data);
      })
      .catch(console.error);
  }, []);

  const stats = React.useMemo(() => [
    { label: 'Total Orders', value: orders.length, icon: History, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    { label: 'Completed', value: orders.filter(o => o.status === 'completed').length, icon: ChevronRight, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/20' },
    { label: 'Pending', value: orders.filter(o => o.status === 'pending').length, icon: ChevronRight, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/20' },
    { label: 'Cancel Order', value: orders.filter(o => o.status === 'canceled' || o.status === 'cancelled').length, icon: X, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/20' },
  ], [orders]);

  const favoriteServices = React.useMemo(() => services.filter(s => favorites.includes(s.service)), [services, favorites]);

  return (
    <div className="space-y-4 lg:space-y-6 col-span-1">
      {/* Low Balance Warning Banner */}
      <AnimatePresence mode="wait">
        {balance < threshold && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/10 dark:from-amber-500/5 dark:to-amber-600/5 border border-amber-500/20 dark:border-amber-500/10 rounded-xl p-4 lg:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-start md:items-center gap-3 w-full md:w-auto">
                <div className="p-2.5 bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-500" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-wider leading-none mb-1">
                    Low Balance Warning
                  </h4>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold opacity-90">
                    Your current balance is <span className="font-extrabold text-amber-900 dark:text-amber-100">{formatPrice(balance)}</span>, which has fallen below your warning threshold of <span className="font-extrabold text-amber-900 dark:text-amber-100">{formatPrice(threshold)}</span>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto self-stretch md:self-auto justify-end">
                {isEditingThreshold ? (
                  <form onSubmit={handleSaveThreshold} className="flex items-center gap-1.5 w-full sm:w-auto">
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 text-xs text-slate-500 font-black">৳</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(e.target.value)}
                        className="w-24 pl-5 pr-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-black dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="50"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="p-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-xs font-black shadow-sm transition-all flex items-center justify-center active:scale-95"
                      title="Save Alert Threshold"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingThreshold(false);
                        setThresholdInput(String(threshold));
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-xs font-black transition-all active:scale-95"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditingThreshold(true)}
                      className="px-3 py-1.5 bg-amber-500/10 dark:bg-amber-505/10 text-white border border-amber-500/20 hover:bg-amber-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                      style={{ color: '#ffffff' }}
                    >
                      <Settings size={12} className="text-white" />
                      Threshold: {formatPrice(threshold)}
                    </button>
                    <button
                      onClick={() => setIsAddFundsOpen(true)}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-amber-600/10 transition-all flex items-center gap-1.5 active:scale-95"
                      style={{ color: '#ffffff' }}
                    >
                      <Wallet size={12} />
                      Add Funds
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large Balance Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 lg:p-8 rounded-xl text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Wallet size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Current Balance</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="text-3xl lg:text-4xl font-black tracking-tighter">
              {formatPrice(balance)}
            </div>
            {/* Integrated Payment Gateways Badges */}
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 self-start sm:self-auto">
              <span className="text-[9px] font-black uppercase tracking-wider opacity-85 mr-1">Secure Gateways:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#E2136E] text-white shadow-sm shadow-[#E2136E]/20">bKash</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#F7941D] text-white shadow-sm shadow-[#F7941D]/20 font-sans">Nagad</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#8C3494] text-white shadow-sm shadow-[#8C3494]/20">Rocket</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-3 lg:mt-4">
            <button 
              onClick={() => setActiveTab('new-order')} 
              className="px-4 py-2 bg-white text-indigo-700 rounded-lg font-black uppercase tracking-widest hover:bg-indigo-50 hover:-translate-y-0.5 transition-all flex items-center gap-2 text-[10px] shadow-xl shadow-indigo-950/20 active:translate-y-0"
            >
              <ShoppingCart size={14} />
              Place Order
            </button>
            <button 
              onClick={() => setIsAddFundsOpen(true)}
              className="px-4 py-2 bg-indigo-500/40 backdrop-blur-xl border border-indigo-400/40 text-white rounded-lg font-black uppercase tracking-widest hover:bg-indigo-500/60 hover:-translate-y-0.5 transition-all flex items-center gap-2 text-[10px] active:translate-y-0"
            >
              <Wallet size={14} />
              Add Funds
            </button>
            {onSyncBalance && (
              <button 
                onClick={onSyncBalance}
                disabled={isSyncingBalance}
                className="px-4 py-2 bg-indigo-900/30 backdrop-blur-xl border border-indigo-500/40 text-white rounded-lg font-black uppercase tracking-widest hover:bg-indigo-900/50 hover:-translate-y-0.5 transition-all flex items-center gap-2 text-[10px] active:translate-y-0"
                title="Calling balance() method of SMM API provider"
              >
                <RefreshCw size={14} className={isSyncingBalance ? "animate-spin text-white" : ""} />
                {isSyncingBalance ? "Syncing API..." : "Sync API Balance"}
              </button>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all hover:rotate-180 duration-500"
              title="Refresh Page"
            >
              <History size={14} />
            </button>
          </div>
        </div>
        {/* Decorative Circles */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl"></div>
      </div>

      {/* Prominent Add Funds CTA */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center p-5 lg:p-6 gap-4 group hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
      >
        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 transition-transform group-hover:scale-110 shrink-0">
          <CreditCard size={24} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">Ready to boost your presence?</h3>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 opacity-70">Add funds instantly to start your next campaign</p>
        </div>
        <button 
          onClick={() => setIsAddFundsOpen(true)}
          className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/10 dark:hover:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2 text-xs"
        >
          <Wallet size={16} />
          Add Funds Now
        </button>
      </motion.div>

      {/* 2x2 Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3">
        {stats.map((stat, i) => (
          <div key={`benefit-${i}`} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <div className={`p-1.5 rounded-md ${stat.bg} ${stat.color}`}>
                <stat.icon size={14} />
              </div>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wider">{stat.label}</div>
            <div className="text-lg font-black mt-0.5 tracking-tight text-slate-800 dark:text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Custom Links Section */}
      {customLinks.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {customLinks.map(link => (
            <a 
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-xl hover:shadow-indigo-500/10 transition-all group bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800"
            >
              <div className="w-10 h-10 shrink-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shadow-sm">
                <BrandLogo name={link.icon || 'website'} size={20} />
              </div>
              <div className="overflow-hidden">
                <div className="text-[11px] font-black uppercase tracking-tight text-slate-700 dark:text-slate-200 truncate group-hover:text-indigo-600 transition-colors">{link.text}</div>
                <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest opacity-80 truncate">Visit Page</div>
              </div>
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600">
                <ChevronRight size={14} />
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Favorites Section */}
      {favoriteServices.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Heart size={18} className="text-red-500 fill-red-500" />
              Favorite Services
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {favoriteServices.map(service => (
                <div key={service.service} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between group">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="p-1 px-1.5 bg-white dark:bg-slate-800 rounded shrink-0">
                      {getSocialIcon(service.category, service.name, 14)}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-[11px] font-bold truncate">{service.name}</div>
                      <div className="text-[10px] text-indigo-600 font-bold">{formatPrice(service.rate)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => {
                        setSelectedServiceId(service.service);
                        setActiveTab('new-order');
                      }}
                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <ShoppingCart size={12} />
                    </button>
                    <button 
                      onClick={() => setFavorites(favorites.filter(f => f !== service.service))}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Heart size={12} className="fill-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Processing Times Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Info size={18} className="text-indigo-600" />
            Typical Processing Times
          </h3>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1 bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded-lg">
            <AlertTriangle size={10} />
            Varies by Service
          </span>
        </div>
        <div className="p-3 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            {[
              { cat: 'Instagram', time: '0-6h', icon: <Instagram size={12} /> },
              { cat: 'TikTok', time: '0-2h', icon: <Music size={12} /> },
              { cat: 'Facebook', time: '1-12h', icon: <Facebook size={12} /> },
              { cat: 'YouTube', time: '12-48h', icon: <Youtube size={12} /> },
              { cat: 'Twitter / X', time: '1-6h', icon: <Twitter size={12} /> },
              { cat: 'Telegram', time: '0-1h', icon: <Send size={12} /> }
            ].map((p, idx) => (
              <div key={p.cat} className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center group hover:border-indigo-500 transition-all">
                <div className="p-1 bg-slate-50 dark:bg-slate-900 rounded-md text-slate-400 group-hover:text-indigo-600 transition-colors mb-1.5">
                  {p.icon}
                </div>
                <div className="text-[9px] font-black uppercase tracking-tight text-slate-500 dark:text-slate-400">{p.cat}</div>
                <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{p.time}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2.5 p-2.5 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
            <Info size={12} className="text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[9px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
              Processing times listed above are averages based on normal operation. 
              <span className="font-bold text-indigo-600 dark:text-indigo-400"> Please note: </span> 
              Actual delivery times may vary significantly during platform updates or high-traffic periods.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Orders</h3>
            <button onClick={() => setActiveTab('orders')} className="text-indigo-600 text-xs font-bold hover:underline">View All</button>
          </div>
          {/* Recent Orders - List view for mobile, Table for Desktop */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 block sm:hidden">
            {orders.slice(0, 5).map((order) => {
              const service = services.find(s => s.service === order.service_id.toString());
              return (
                <div key={order.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-400">#{order.id}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                      {getSocialIcon(service?.category, service?.name, 14)}
                    </div>
                    <div className="text-xs font-bold truncate flex-1">
                      {service?.name || `Service ID: ${order.service_id}`}
                    </div>
                    <div className="text-xs font-black text-indigo-600">{formatPrice(order.charge)}</div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] text-slate-400 italic">Quick Tracker</span>
                    <button
                      type="button"
                      onClick={() => setTrackingOrderId(order.id)}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all duration-150 font-bold"
                    >
                      <Activity size={10} className="text-indigo-600 dark:text-indigo-400" />
                      <span>Track</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-[10px] uppercase font-bold tracking-widest opacity-30">No orders yet</div>
            )}
          </div>

          <div className="w-full overflow-x-auto hidden sm:block">
            <table className="w-full text-left min-w-[500px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Charge</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.slice(0, 5).map((order, idx) => {
                  const service = services.find(s => s.service === order.service_id.toString());
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-[10px]">#{order.id}</td>
                      <td className="px-4 py-3" style={idx === 0 ? { color: '#87f639' } : undefined}>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                            {getSocialIcon(service?.category, service?.name, 14)}
                          </div>
                          <div className="text-xs font-bold">
                            {service?.name || `Service ID: ${order.service_id}`}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-600 text-xs">{formatPrice(order.charge)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setTrackingOrderId(order.id)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all duration-150 font-bold"
                          title="Track order live progress"
                        >
                          <Activity size={10} className="text-indigo-600 dark:text-indigo-400" />
                          <span>Track</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-xs italic">No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {/* Recent Transactions card on Dashboard */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <CreditCard size={16} className="text-indigo-600" />
                Recent Financial Activity
              </h3>
              <button 
                onClick={() => setActiveTab('transactions')} 
                className="text-[10px] uppercase font-black text-indigo-600 hover:underline tracking-widest"
              >
                View Ledger
              </button>
            </div>
            
            {loadingTx ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Loading ledger...</div>
            ) : (
              <div className="space-y-2.5">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-850/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-[11px] hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all">
                    <div className="overflow-hidden pr-2">
                      <div className="font-bold truncate text-slate-800 dark:text-slate-200 max-w-[150px]" title={tx.description}>
                        {tx.description}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{new Date(tx.date).toLocaleDateString()}</div>
                    </div>
                    <div className={`font-black tracking-tight shrink-0 ${tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)}
                    </div>
                  </div>
                ))}
                {recentTx.length === 0 && (
                  <div className="py-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider opacity-40">No transactions yet</div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold mb-3 text-slate-900 dark:text-white">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setActiveTab('new-order')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group">
                <ShoppingCart className="mx-auto mb-1 text-slate-400 group-hover:text-indigo-600" size={20} />
                <div className="text-[10px] font-bold">New Order</div>
              </button>
              <button onClick={() => setActiveTab('services')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group">
                <List className="mx-auto mb-1 text-slate-400 group-hover:text-indigo-600" size={20} />
                <div className="text-[10px] font-bold">Services</div>
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-xl text-white shadow-sm">
            <h3 className="text-lg font-bold mb-1">Need Help?</h3>
            <p className="text-indigo-100 text-xs mb-4">Our SMM support agents are available 24/7 to resolve problems.</p>
            <button onClick={() => setActiveTab('support')} className="w-full py-2.5 bg-white text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 transition-colors text-xs">Contact Support</button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {trackingOrderId && (
          <LiveOrderTrackingModal
            orderId={trackingOrderId}
            services={services}
            onClose={() => setTrackingOrderId(null)}
            token={token}
            onUpdate={onUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NewOrder({ services, balance, onOrderPlaced, initialServiceId, onClearInitial, token }: { services: Service[], balance: number, onOrderPlaced: () => void, initialServiceId?: string | null, onClearInitial?: () => void, token: string }) {
  const [platform, setPlatform] = useState('All');
  const [category, setCategory] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc'>('default');

  useEffect(() => {
    if (initialServiceId) {
      const service = services.find(s => s.service === initialServiceId);
      if (service) {
        setPlatform('All');
        setCategory(service.category);
        setServiceId(service.service);
        if (onClearInitial) onClearInitial();
      }
    }
  }, [initialServiceId, services]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const platforms = [
    { id: 'All', icon: <LayoutDashboard size={22} />, color: '#6366f1', shadow: 'rgba(99, 102, 241, 0.4)' },
    { id: 'Facebook', icon: <BrandLogo name="facebook" size={22} className="text-white" />, color: '#1877F2', shadow: 'rgba(24, 119, 242, 0.4)' },
    { id: 'Instagram', icon: <Instagram size={22} />, color: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2397 75%, #ad38e7 100%)', shadow: 'rgba(220, 39, 67, 0.4)' },
    { id: 'Youtube', icon: <BrandLogo name="youtube" size={22} className="text-white" />, color: '#FF0000', shadow: 'rgba(255, 0, 0, 0.4)' },
    { id: 'Tiktok', icon: <BrandLogo name="tiktok" size={22} className="text-white" />, color: '#000000', shadow: 'rgba(0, 0, 0, 0.4)' },
    { id: 'Twitter', icon: <Twitter size={22} className="fill-white" />, color: '#000000', shadow: 'rgba(0, 0, 0, 0.4)' },
    { id: 'Telegram', icon: <BrandLogo name="telegram" size={22} className="text-white" />, color: '#26A5E4', shadow: 'rgba(38, 165, 228, 0.4)' },
    { id: 'Spotify', icon: <BrandLogo name="spotify" size={22} className="text-white" />, color: '#1DB954', shadow: 'rgba(29, 185, 84, 0.4)' },
    { id: 'Discord', icon: <BrandLogo name="discord" size={22} className="text-white" />, color: '#5865F2', shadow: 'rgba(88, 101, 242, 0.4)' },
    { id: 'Website', icon: <Globe size={22} />, color: '#6366f1', shadow: 'rgba(99, 102, 241, 0.4)' },
  ];

  const categories = React.useMemo(() => Array.from(new Set(services
    .filter(s => platform === 'All' || s.category.toLowerCase().includes(platform.toLowerCase()))
    .map(s => s.category)
  )), [services, platform]);
  
  const filteredServices = React.useMemo(() => {
    const listWithScores = services
      .filter(s => {
        const matchesCategory = category ? s.category === category : true;
        const matchesPlatform = platform === 'All' || s.category.toLowerCase().includes(platform.toLowerCase());
        return matchesPlatform && matchesCategory;
      })
      .map(s => {
        const searchResult = getSearchScore(s.name, s.category, s.service, search);
        return { service: s, ...searchResult };
      })
      .filter(item => item.matches);

    if (sortBy === 'price-asc') {
      listWithScores.sort((a, b) => parseFloat(String(a.service.rate)) - parseFloat(String(b.service.rate)));
    } else if (sortBy === 'price-desc') {
      listWithScores.sort((a, b) => parseFloat(String(b.service.rate)) - parseFloat(String(a.service.rate)));
    } else if (search) {
      listWithScores.sort((a, b) => b.score - a.score);
    }

    return listWithScores.map(item => item.service);
  }, [services, platform, category, search, sortBy]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  const selectedService = React.useMemo(() => services.find(s => s.service === serviceId), [services, serviceId]);

  const calculateCharge = React.useCallback(() => {
    if (!selectedService || !quantity) return 0;
    return (parseFloat(selectedService.rate) / 1000) * parseInt(quantity);
  }, [selectedService, quantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!serviceId || !link || !quantity) {
      setError('Please fill all fields');
      return;
    }

    const qty = parseInt(quantity);
    if (selectedService) {
      if (qty < parseInt(selectedService.min)) {
        setError(`Minimum quantity for this service is ${selectedService.min}`);
        return;
      }
      if (qty > parseInt(selectedService.max)) {
        setError(`Maximum quantity for this service is ${selectedService.max}`);
        return;
      }
    }

    const charge = calculateCharge();
    if (charge > balance) {
      setError('Insufficient balance in your account');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ serviceId, link, quantity: qty, note: orderNote })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Order placed successfully!');
        setSuccess(`Order received successfully! ID: #${data.orderId} - ${selectedService?.name}`);
        setLink('');
        setQuantity('');
        setOrderNote('');
        onOrderPlaced();
      } else {
        // Handle specific provider errors more gracefully
        let errorMessage = data.error || 'Failed to place order';
        if (errorMessage.toLowerCase().includes('not enough funds')) {
          errorMessage = 'Provider is currently out of stock/balance. Please try again later or contact support.';
        } else if (errorMessage.toLowerCase().includes('quantity less than minimal')) {
          errorMessage = `Quantity is less than the minimum required by the provider.`;
        }
        setError(errorMessage);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-32 lg:pb-0">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        
        <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-3 text-[10px] font-bold">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg flex items-center gap-3 text-[10px] font-bold">
              <ChevronRight size={14} />
              {success}
            </div>
          )}

          <div className="space-y-4">
            {/* Platform Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">1. Select Platform</label>
              <div className="flex lg:grid lg:grid-cols-10 gap-2 overflow-x-auto pb-2 lg:pb-0 custom-scrollbar snap-x">
                {platforms.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setPlatform(p.id); setCategory(''); setServiceId(''); }}
                    className={`flex-shrink-0 w-11 h-11 lg:w-full lg:aspect-square rounded-xl border-2 transition-all flex items-center justify-center overflow-hidden snap-start ${
                      platform === p.id 
                        ? 'border-indigo-600 dark:border-indigo-400 ring-4 ring-indigo-600/20 scale-105 shadow-md shadow-indigo-100 dark:shadow-none' 
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 hover:scale-102'
                    }`}
                    title={p.id}
                  >
                    <div 
                      className="w-full h-full flex items-center justify-center text-white relative transition-all duration-200"
                      style={{ background: p.color, opacity: platform === p.id ? 1 : 0.85 }}
                    >
                      <div className="relative z-10 drop-shadow-sm flex items-center justify-center">
                        {p.icon}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Global Service Search & Price Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search service..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-600 outline-none transition-all"
                />
              </div>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-600 outline-none transition-all font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <option value="default">Default Sort</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Category List */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">2. Select Category</label>
              <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {categories.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-[10px] italic">
                    No categories found
                  </div>
                ) : (
                  categories.map(cat => (
                    <div 
                      key={cat}
                      onClick={() => { setCategory(cat); setServiceId(''); }}
                      className={`p-2.5 rounded-lg border-2 transition-all cursor-pointer flex items-center gap-2.5 ${
                        category === cat 
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' 
                          : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="shrink-0 p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                        {getSocialIcon(cat, '', 14)}
                      </div>
                      <div className="text-xs font-bold uppercase tracking-tight">
                        {cat}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Service Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">3. Select Service</label>
              </div>
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                {(!category && !search) ? (
                  <div className="p-4 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-[10px] italic">
                    Select a category or search
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-[10px] italic">
                    No services found
                  </div>
                ) : (
                  filteredServices.map(s => (
                    <div 
                      key={s.service}
                      onClick={() => setServiceId(s.service)}
                      className={`p-2.5 rounded-lg border-2 transition-all cursor-pointer flex items-center gap-2.5 ${
                        serviceId === s.service 
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' 
                          : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="shrink-0">
                        {getSocialIcon(s.category, s.name, 14)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="text-xs font-bold pr-2">{s.name}</div>
                          <div 
                            onClick={(e) => { e.stopPropagation(); handleCopy(s.service); }}
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono text-slate-500 shrink-0"
                          >
                            #{s.service}
                            {copiedId === s.service ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                          </div>
                        </div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">{formatPrice(s.rate)} / 1000</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedService && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <Info className="text-indigo-600" size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-indigo-900 dark:text-indigo-100 uppercase tracking-widest mb-1">Service Information</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">{selectedService.name}</div>
                    
                    {(() => {
                      const marketing = getServiceMarketingDetails(selectedService.name || '', selectedService.category || '');
                      const displayDesc = selectedService.description || marketing.description;
                      return (
                        <div className="space-y-3">
                          <div className="text-[10px] text-indigo-700 dark:text-indigo-300 whitespace-pre-line leading-relaxed bg-white/50 dark:bg-slate-800/50 p-3 rounded-lg border border-indigo-100/50 dark:border-indigo-800/50 font-semibold">
                            {displayDesc}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[10px]">
                            <div className="p-3 rounded-lg bg-green-500/5 dark:bg-green-500/10 border border-green-500/10 dark:border-green-800/30">
                              <span className="block text-[8px] uppercase tracking-wider text-green-600 dark:text-green-400 font-extrabold mb-1.5">📈 KEY BENEFITS</span>
                              <ul className="space-y-1.5">
                                {marketing.benefits.map((benefit, bIdx) => (
                                  <li key={bIdx} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{benefit}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-800/30">
                              <span className="block text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-extrabold mb-1.5">⚠️ SERVICE REQUIREMENTS</span>
                              <ul className="space-y-1.5">
                                {marketing.requirements.map((req, rIdx) => (
                                  <li key={rIdx} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{req}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-indigo-100 dark:border-indigo-800">
                  <div className="p-2 bg-white/40 dark:bg-slate-800/40 rounded-lg">
                    <div className="text-[8px] uppercase font-bold text-indigo-400 mb-0.5">Service ID</div>
                    <div className="text-[10px] font-bold">#{selectedService.service}</div>
                  </div>
                  <div className="p-2 bg-white/40 dark:bg-slate-800/40 rounded-lg">
                    <div className="text-[8px] uppercase font-bold text-indigo-400 mb-0.5">Rate per 1k</div>
                    <div className="text-[10px] font-bold text-indigo-600">{formatPrice(selectedService.rate)}</div>
                  </div>
                  <div className="p-2 bg-white/40 dark:bg-slate-800/40 rounded-lg">
                    <div className="text-[8px] uppercase font-bold text-indigo-400 mb-0.5">Min Order</div>
                    <div className="text-[10px] font-bold">{formatNumber(selectedService.min)}</div>
                  </div>
                  <div className="p-2 bg-white/40 dark:bg-slate-800/40 rounded-lg">
                    <div className="text-[8px] uppercase font-bold text-indigo-400 mb-0.5">Max Order</div>
                    <div className="text-[10px] font-bold">{formatNumber(selectedService.max)}</div>
                  </div>
                </div>

                {/* Dynamic details from API if available */}
                {(selectedService.type || (selectedService as any).dripfeed !== undefined || (selectedService as any).refill !== undefined) && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedService.type && (
                      <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded text-[8px] font-bold uppercase">Type: {selectedService.type}</span>
                    )}
                    {(selectedService as any).refill && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded text-[8px] font-bold uppercase">Refill Available</span>
                    )}
                    {(selectedService as any).dripfeed && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded text-[8px] font-bold uppercase">Drip-feed Supported</span>
                    )}
                  </div>
                )}
                
                {/* Real-time SMM Provider Endpoint Health Check */}
                <div className="pt-2">
                  <ServiceHealthIndicator serviceId={selectedService.id} token={token} layout="box" />
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">4. Link</label>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-600 transition-all outline-none text-xs text-slate-800 dark:text-slate-100 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">5. Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Min: 100"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-600 transition-all outline-none text-xs text-slate-800 dark:text-slate-100 font-semibold"
                />
              </div>
            </div>

            {/* Optional Order Note */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">6. Order Note (Optional)</label>
              <textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Include any specific details or preferences for this order..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-600 transition-all outline-none text-xs text-slate-800 dark:text-slate-100 font-semibold resize-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Total Charge</div>
                <div className="text-lg font-black text-indigo-600 dark:text-emerald-400">{formatPrice(calculateCharge())}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Available</div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatPrice(balance)}</div>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Submit Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Orders({ orders, services, isAdmin, onUpdate, token }: { orders: Order[], services: Service[], isAdmin?: boolean, onUpdate?: () => void, token: string }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'id' | 'date' | 'charge'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [processing, setProcessing] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Order | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [quickTrackInput, setQuickTrackInput] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [isBulkRetriggering, setIsBulkRetriggering] = useState(false);

  // Advanced Filters state variables
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Extract unique services from actual orders
  const uniqueServicesInOrders = React.useMemo(() => {
    const serviceIds = Array.from(new Set(orders.map(o => o.service_id.toString())));
    return serviceIds.map(id => {
      const s = services.find(serv => serv.service === id);
      return {
        id,
        name: s ? s.name : `Service #${id}`
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, services]);

  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'clear') => {
    const today = new Date();
    if (preset === 'today') {
      const start = new Date();
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(start.toISOString().split('T')[0]);
    } else if (preset === 'yesterday') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(start.toISOString().split('T')[0]);
    } else if (preset === '7days') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === '30days') {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
      setSelectedServiceId('all');
    }
  };

  useEffect(() => {
    if (onUpdate) {
      onUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredOrders = React.useMemo(() => orders
    .filter(o => {
      const searchStr = search.trim().toLowerCase();
      const service = services.find(s => s.service === o.service_id.toString());
      const serviceName = service?.name?.toLowerCase() || '';
      
      // Main Search Bar Match
      const matchSearch = o.id.toString().includes(searchStr) || 
                          o.link.toLowerCase().includes(searchStr) || 
                          serviceName.includes(searchStr) ||
                          (o.username && o.username.toLowerCase().includes(searchStr)) ||
                          (o.email && o.email.toLowerCase().includes(searchStr));
      if (!matchSearch) return false;

      // Status Tab Filter
      if (statusFilter !== 'all') {
        const orderStatusNorm = (o.status || '').replace('_', '').toLowerCase();
        const filterStatusNorm = statusFilter.replace('_', '').toLowerCase();
        if (orderStatusNorm !== filterStatusNorm) return false;
      }

      // Advanced Service Name Selector Filter
      if (selectedServiceId !== 'all') {
        if (o.service_id.toString() !== selectedServiceId) return false;
      }

      // Advanced Date Range Filters
      if (startDate) {
        const orderDate = new Date(o.created_at);
        const filterStart = new Date(startDate);
        filterStart.setHours(0, 0, 0, 0);
        if (orderDate < filterStart) return false;
      }
      if (endDate) {
        const orderDate = new Date(o.created_at);
        const filterEnd = new Date(endDate);
        filterEnd.setHours(23, 59, 59, 999);
        if (orderDate > filterEnd) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'id') comparison = a.id - b.id;
      else if (sortBy === 'date') comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortBy === 'charge') comparison = a.charge - b.charge;
      return sortOrder === 'desc' ? -comparison : comparison;
    }), [orders, search, statusFilter, sortBy, sortOrder, startDate, endDate, selectedServiceId, services]);

  const handleToggleSelectOrder = (id: number) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAllSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredIds = filteredOrders.map(o => o.id);
      setSelectedOrderIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      const filteredIds = filteredOrders.map(o => o.id);
      setSelectedOrderIds(prev => {
        const nextSelect = [...prev];
        filteredIds.forEach(id => {
          if (!nextSelect.includes(id)) {
            nextSelect.push(id);
          }
        });
        return nextSelect;
      });
    }
  };

  const handleExportSelectedCSV = () => {
    const selectedOrders = filteredOrders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) {
      toast.error("Please select some orders first");
      return;
    }
    
    const headers = [
      'Order ID',
      'Service ID',
      'Category',
      'Service Name',
      'Link',
      'Quantity',
      'Charge ($)',
      'Start Count',
      'Remains',
      'Status',
      'Date Created'
    ];

    const rows = selectedOrders.map(order => {
      const service = services.find(s => s.service === order.service_id.toString());
      return {
        id: order.id,
        service_id: order.service_id,
        category: service?.category || 'N/A',
        service_name: service?.name || 'N/A',
        link: order.link,
        quantity: order.quantity,
        charge: order.charge,
        start_count: order.start_count ?? '0',
        remains: order.remains ?? '0',
        status: order.status,
        created_at: new Date(order.created_at).toLocaleString()
      };
    });

    const keys = [
      'id',
      'service_id',
      'category',
      'service_name',
      'link',
      'quantity',
      'charge',
      'start_count',
      'remains',
      'status',
      'created_at'
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => keys.map(key => {
        const val = (row as any)[key];
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_selected_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${selectedOrders.length} selected orders successfully!`);
  };

  const handleBulkRetrigger = async () => {
    const selectedOrders = filteredOrders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) {
      toast.error("Please select some orders first");
      return;
    }

    const allowableStatuses = ['pending', 'failed', 'fail', 'canceled', 'cancelled', 'awaiting_admin'];
    const eligibleOrders = selectedOrders.filter(o => allowableStatuses.includes((o.status || '').toLowerCase()));

    if (eligibleOrders.length === 0) {
      toast.error("None of the selected orders can be re-triggered. (Only Pending, Canceled, Failed, or Awaiting Admin orders are eligible)");
      return;
    }

    const confirmMsg = `Are you sure you want to re-trigger / retry ${eligibleOrders.length} eligible order(s)?`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkRetriggering(true);
    let successCount = 0;
    let failCount = 0;

    toast.loading(`Bulk re-triggering ${eligibleOrders.length} orders...`, { id: 'bulk-retrigger' });

    for (const order of eligibleOrders) {
      try {
        const res = await fetch(`/api/orders/${order.id}/retry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    toast.dismiss('bulk-retrigger');
    if (successCount > 0) {
      toast.success(`Successfully re-triggered ${successCount} order(s)!`);
      if (onUpdate) onUpdate();
      setSelectedOrderIds([]);
    }
    if (failCount > 0) {
      toast.error(`Failed to re-trigger ${failCount} order(s). Check statuses and try again.`);
    }

    setIsBulkRetriggering(false);
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error("No orders available to export");
      return;
    }

    const headers = [
      'Order ID',
      'Service ID',
      'Category',
      'Service Name',
      'Link',
      'Quantity',
      'Charge ($)',
      'Start Count',
      'Remains',
      'Status',
      'Date Created'
    ];

    const rows = filteredOrders.map(order => {
      const service = services.find(s => s.service === order.service_id.toString());
      return {
        id: order.id,
        service_id: order.service_id,
        category: service?.category || 'N/A',
        service_name: service?.name || 'N/A',
        link: order.link,
        quantity: order.quantity,
        charge: order.charge,
        start_count: order.start_count ?? '0',
        remains: order.remains ?? '0',
        status: order.status,
        created_at: new Date(order.created_at).toLocaleString()
      };
    });

    const keys = [
      'id',
      'service_id',
      'category',
      'service_name',
      'link',
      'quantity',
      'charge',
      'start_count',
      'remains',
      'status',
      'created_at'
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => keys.map(key => {
        const val = (row as any)[key];
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredOrders.length} orders successfully!`);
  };

  const handleAdminAction = async (id: number, action: 'release' | 'reject') => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/${action}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Order ${action === 'release' ? 'released' : 'rejected'} successfully`);
        if (onUpdate) onUpdate();
      } else {
        toast.error(data.error || `Failed to ${action} order`);
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const handleCancelOrder = async (id: number) => {
    if (!window.confirm("Are you sure you want to cancel this order? The charged amount will be fully refunded to your balance.")) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Order canceled successfully!");
        if (onUpdate) onUpdate();
      } else {
        toast.error(data.error || "Failed to cancel order");
      }
    } catch (err) {
      toast.error("Network error while trying to cancel order");
    } finally {
      setProcessing(null);
    }
  };

  const statusTabs = [
    { id: 'all', label: 'All Orders' },
    { id: 'pending', label: 'Pending' },
    { id: 'inprogress', label: 'In Progress' },
    { id: 'processing', label: 'Processing' },
    { id: 'awaiting_admin', label: 'Awaiting' },
    { id: 'completed', label: 'Completed' },
    { id: 'partial', label: 'Partial' },
    { id: 'canceled', label: 'Canceled' },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight dark:text-white">Order History</h2>
          <p className="text-slate-500 text-xs mt-1">Manage and track your service orders</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex gap-1.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search ID, Link, or Service name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 transition-all outline-none text-xs font-medium dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`px-3 py-2.5 rounded-xl border transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                showAdvanced || startDate || endDate || selectedServiceId !== 'all'
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50' 
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Toggle Advanced Filters"
            >
              <Filter size={14} />
              <span className="hidden sm:inline">Filters</span>
              {(startDate || endDate || selectedServiceId !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
              )}
            </button>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white sm:hidden"
            >
              {statusTabs.map(tab => (
                <option key={tab.id} value={tab.id}>{tab.label}</option>
              ))}
            </select>
            <select 
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as [any, any];
                setSortBy(field);
                setSortOrder(order);
              }}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="charge-desc">Highest Charge</option>
              <option value="charge-asc">Lowest Charge</option>
              <option value="id-desc">ID Descending</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                const tid = toast.loading("Fetching real-time status updates...");
                if (onUpdate) {
                  await onUpdate();
                }
                toast.success("Order statuses updated in real-time!", { id: tid });
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
              title="Refresh and sync order statuses in real-time"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              id="export-orders-csv-btn"
              onClick={handleExportCSV}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-indigo-100/30 dark:border-indigo-900/30 shrink-0"
              title="Export filtered records to a CSV file"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Filter className="text-indigo-600 dark:text-indigo-400" size={16} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Advanced Filters
                  </h3>
                </div>
                {(startDate || endDate || selectedServiceId !== 'all') && (
                  <button
                    type="button"
                    onClick={() => applyPreset('clear')}
                    className="text-[10px] font-bold text-red-500 hover:text-red-600 dark:hover:text-red-400 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Service Name Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Service Name
                  </label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 transition-all outline-none text-xs font-medium dark:text-white"
                  >
                    <option value="all">All Services ({uniqueServicesInOrders.length})</option>
                    {uniqueServicesInOrders.map(srv => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    From Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 transition-all outline-none text-xs font-medium dark:text-white"
                    />
                  </div>
                </div>

                {/* End Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    To Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 transition-all outline-none text-xs font-medium dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Date Presets Quick Bars */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
                    Quick Dates:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset('today')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      startDate && endDate && startDate === endDate && startDate === new Date().toISOString().split('T')[0]
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('yesterday')}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('7days')}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('30days')}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                  >
                    Last 30 Days
                  </button>
                </div>

                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-indigo-600 dark:text-indigo-400">{filteredOrders.length}</span> of {orders.length} orders
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Order Status Quick Tracker Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-900/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-indigo-400" />
            <h3 className="text-sm font-black tracking-tight">Real-Time Order Tracking &amp; Status</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold">
              $api-&gt;status() &amp; $api-&gt;multiStatus()
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Query live order telemetry to fetch remains, charge, and start count, or batch sync order statuses.
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Enter Order ID..."
              value={quickTrackInput}
              onChange={(e) => setQuickTrackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const idNum = parseInt(quickTrackInput.trim());
                  if (idNum) {
                    setTrackingOrderId(idNum);
                  } else {
                    toast.error("Please enter a valid numeric Order ID");
                  }
                }
              }}
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const idNum = parseInt(quickTrackInput.trim());
              if (idNum) {
                setTrackingOrderId(idNum);
              } else {
                toast.error("Please enter a valid numeric Order ID");
              }
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all shrink-0"
          >
            <Activity size={13} />
            <span>Track Status</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const targetIds = orders.slice(0, 20).map(o => o.id);
              if (targetIds.length === 0) {
                toast.error("No orders available to sync");
                return;
              }
              const tid = toast.loading(`Syncing ${targetIds.length} orders via $api->multiStatus()...`);
              try {
                const res = await fetch('/api/orders/multi-status', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ order_ids: targetIds })
                });
                const resData = await res.json();
                if (resData.success) {
                  toast.success(`Synced ${resData.count} orders via $api->multiStatus()!`, { id: tid });
                  if (onUpdate) onUpdate();
                } else {
                  toast.error(resData.error || 'Failed to sync statuses', { id: tid });
                }
              } catch (e: any) {
                toast.error('Network error during multi-status sync', { id: tid });
              }
            }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-all shrink-0"
            title="Batch sync recent orders using $api->multiStatus()"
          >
            <RefreshCw size={13} />
            <span>Sync Recent ($api-&gt;multiStatus)</span>
          </button>
        </div>
      </div>

      <div className="hidden sm:flex gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit overflow-x-auto">
        {statusTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              statusFilter === tab.id 
                ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedOrderIds.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 bg-indigo-600 text-white flex items-center justify-center rounded-lg text-[10px] font-black">
              {selectedOrderIds.length}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">স্মার্ট বাল্ক অ্যাকশন অ্যাক্টিভ</p>
              <p className="text-[10px] text-slate-500 font-medium">{selectedOrderIds.length}টি অর্ডার সিলেক্ট করা হয়েছে</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              id="bulk-btn-retrigger"
              onClick={handleBulkRetrigger}
              disabled={isBulkRetriggering}
              className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition-all text-[11px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-150 dark:shadow-none disabled:opacity-50 cursor-pointer"
            >
              <Activity size={12} />
              Re-trigger Selected
            </button>
            <button
              type="button"
              id="bulk-btn-multistatus"
              onClick={async () => {
                const tid = toast.loading(`Syncing ${selectedOrderIds.length} orders via $api->multiStatus()...`);
                try {
                  const res = await fetch('/api/orders/multi-status', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ order_ids: selectedOrderIds })
                  });
                  const resData = await res.json();
                  if (resData.success) {
                    toast.success(`Updated ${resData.count} orders via $api->multiStatus()!`, { id: tid });
                    if (onUpdate) onUpdate();
                  } else {
                    toast.error(resData.error || 'Failed to sync statuses', { id: tid });
                  }
                } catch (e: any) {
                  toast.error('Network error during multi-status sync', { id: tid });
                }
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60 border border-indigo-700/50 transition-all text-[11px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} />
              Sync Status ($api-&gt;multiStatus)
            </button>
            <button
              type="button"
              id="bulk-btn-export"
              onClick={handleExportSelectedCSV}
              className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-[11px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download size={12} />
              Export Selected
            </button>
            <button
              type="button"
              id="bulk-btn-clear"
              onClick={() => setSelectedOrderIds([])}
              className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all text-[11px] font-bold uppercase cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Responsive Layout */}
        <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredOrders.map((order) => {
            const service = services.find(s => s.service === order.service_id.toString());
            return (
              <div key={order.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.includes(order.id)}
                      onChange={() => handleToggleSelectOrder(order.id)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span className="font-mono text-[10px] font-bold text-slate-400">#{order.id}</span>
                    {isAdmin && <span className="text-[9px] text-indigo-500 font-bold">UID: {order.user_id}</span>}
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0">
                    {getSocialIcon(service?.category, service?.name, 20)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold dark:text-white line-clamp-2 leading-tight">{service?.name || "Unknown Service"}</div>
                    <a href={order.link} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline truncate block mt-1">{order.link}</a>
                    {order.note && (
                      <div className="mt-1.5 text-[9px] bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-100/30 dark:border-amber-900/40 w-fit max-w-full break-words leading-tight">
                        <span className="font-bold uppercase tracking-wider text-[8px] mr-1">Note:</span>{order.note}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-800/50">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
                    <div>
                      <div className="text-[8px] uppercase font-bold text-slate-400">Quantity</div>
                      <div className="text-[11px] font-black dark:text-slate-300">{formatNumber(order.quantity)}</div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase font-bold text-slate-400">Charge</div>
                      <div className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{formatPrice(order.charge)}</div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase font-bold text-slate-400">Start Count</div>
                      <div className="text-[11px] font-mono font-bold dark:text-slate-300">
                        {order.start_count !== null && order.start_count !== undefined ? formatNumber(parseInt(order.start_count)) : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase font-bold text-slate-400">Remains</div>
                      <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {order.remains !== null && order.remains !== undefined ? formatNumber(parseInt(order.remains)) : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Individual Order Progress / Timeline tracker */}
                <div className="pt-2 border-t border-slate-50 dark:border-slate-800/50">
                  <OrderProgressBar order={order} />
                </div>

                <div className="flex items-center justify-between text-slate-400 text-[9px] pt-1 border-t border-slate-50 dark:border-slate-800/20 gap-2 flex-wrap">
                  <span>Ordered on {new Date(order.created_at).toLocaleDateString()} at {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="flex items-center gap-1.5">
                    {(order.status || '').toLowerCase() === 'pending' && (
                      <button
                        type="button"
                        disabled={processing === order.id}
                        onClick={() => handleCancelOrder(order.id)}
                        className="px-2 py-1 bg-red-50 hover:bg-red-600 hover:text-white dark:bg-red-950/20 text-red-600 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border border-red-100/30 dark:border-red-900/30 cursor-pointer transition-all shrink-0 disabled:opacity-50"
                      >
                        <span>Cancel Order</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTrackingOrderId(order.id)}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all shrink-0 font-bold"
                    >
                      <Activity size={10} className="text-indigo-600 dark:text-indigo-400" />
                      <span>Track</span>
                    </button>
                    {(order.status === 'completed' || order.status === 'success') && (
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(order)}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all shrink-0"
                      >
                        <Receipt size={10} />
                        <span>Receipt</span>
                      </button>
                    )}
                  </div>
                </div>
                
                {isAdmin && order.status === 'awaiting_admin' && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      disabled={processing === order.id}
                      onClick={() => handleAdminAction(order.id, 'release')}
                      className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      Release
                    </button>
                    <button
                      disabled={processing === order.id}
                      onClick={() => handleAdminAction(order.id, 'reject')}
                      className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredOrders.length === 0 && (
            <div className="p-8 text-center opacity-30">
              <History size={40} className="mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-bold">No matching orders</p>
            </div>
          )}
        </div>

        <div className="w-full overflow-x-auto hidden sm:block">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100 dark:border-slate-800">
                <th className="pl-6 pr-2 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={el => {
                      if (el) {
                        el.indeterminate = selectedOrderIds.length > 0 && !isAllSelected;
                      }
                    }}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4">Order ID</th>
                {isAdmin && <th className="px-6 py-4 text-left">Customer</th>}
                <th className="px-6 py-4">Service Details</th>
                <th className="px-6 py-4 text-center">Quantity</th>
                <th className="px-6 py-4 text-center">Start Count</th>
                <th className="px-6 py-4 text-center">Remains</th>
                <th className="px-6 py-4 text-center">Charge</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Date</th>
                <th className="px-6 py-4 text-right">Fulfillment & Actions</th>
                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {filteredOrders.map((order) => {
                const service = services.find(s => s.service === order.service_id.toString());
                return (
                  <tr key={order.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 pr-2 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => handleToggleSelectOrder(order.id)}
                        className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-slate-400">#{order.id}</span>
                        {isAdmin && <span className="text-[9px] text-indigo-500 font-bold mt-0.5">UID: {order.user_id}</span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-left">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                            {order.username || `User #${order.user_id}`}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400">
                            {order.email || 'N/A'}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
                          {getSocialIcon(service?.category, service?.name, 16)}
                        </div>
                        <div className="flex flex-col max-w-[200px]">
                          <div className="text-[11px] font-bold dark:text-white truncate">{service?.name || "Unknown Service"}</div>
                          <a href={order.link} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline truncate mt-0.5">{order.link}</a>
                          {order.note && (
                            <div className="mt-1 text-[9px] bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-100/30 dark:border-amber-900/40 w-fit max-w-[180px] break-words leading-tight" title={order.note}>
                              <span className="font-bold uppercase tracking-wider text-[8px] mr-1">Note:</span>{order.note}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs font-black dark:text-slate-300">{formatNumber(order.quantity)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs font-mono dark:text-slate-400">
                        {order.start_count !== null && order.start_count !== undefined ? formatNumber(parseInt(order.start_count)) : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center min-w-[120px]">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {order.remains !== null && order.remains !== undefined ? formatNumber(parseInt(order.remains)) : '-'}
                        </span>
                        <div className="w-20 mt-1">
                          <OrderProgressBarMini order={order} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{formatPrice(order.charge)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold dark:text-slate-400">{new Date(order.created_at).toLocaleDateString()}</span>
                        <span className="text-[9px] text-slate-500">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(order.status || '').toLowerCase() === 'pending' && (
                          <button
                            type="button"
                            disabled={processing === order.id}
                            onClick={() => handleCancelOrder(order.id)}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-650 hover:text-white dark:bg-red-950/20 text-red-600 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 border border-red-100/30 dark:border-red-900/30 cursor-pointer transition-all duration-150 disabled:opacity-50"
                            title="Cancel order and refund charge"
                          >
                            <span>Cancel Order</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTrackingOrderId(order.id)}
                          className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all duration-150 font-bold"
                          title="Track order live progress"
                        >
                          <Activity size={11} className="text-indigo-600 dark:text-indigo-400" />
                          <span>Track</span>
                        </button>
                        {(order.status === 'completed' || order.status === 'success') && (
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(order)}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/40 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border border-indigo-100/30 dark:border-indigo-900/30 cursor-pointer transition-all duration-150 font-bold"
                            title="Format order print receipt"
                          >
                            <Receipt size={11} />
                            <span>Receipt</span>
                          </button>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        {order.status === 'awaiting_admin' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={processing === order.id}
                              onClick={() => handleAdminAction(order.id, 'release')}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-md shadow-emerald-200 dark:shadow-none"
                            >
                              Release
                            </button>
                            <button
                              disabled={processing === order.id}
                              onClick={() => handleAdminAction(order.id, 'reject')}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-all disabled:opacity-50 shadow-md shadow-red-200 dark:shadow-none"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">No actions</div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 11 : 10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 opacity-30">
                      <History size={48} className="text-slate-400" />
                      <div>
                        <p className="text-sm font-bold">No matching orders</p>
                        <p className="text-xs">Try adjusting your filters or search terms</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Showing {filteredOrders.length} of {orders.length} orders</span>
          <div className="flex gap-2">
            {/* Pagination could be added here if needed */}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {selectedReceipt && (
          <OrderReceiptModal 
            order={selectedReceipt} 
            services={services} 
            onClose={() => setSelectedReceipt(null)} 
          />
        )}
        {trackingOrderId && (
          <LiveOrderTrackingModal
            orderId={trackingOrderId}
            services={services}
            onClose={() => setTrackingOrderId(null)}
            token={token}
            onUpdate={onUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface OrderReceiptModalProps {
  order: Order | null;
  services: Service[];
  onClose: () => void;
}

const downloadReceiptHTML = (order: Order, service: Service | undefined) => {
  const serviceName = service?.name || `SMM Service #${order.service_id}`;
  const serviceCategory = service?.category || 'SMM Service Category';
  const receiptNum = `REC-${order.id}-${new Date(order.created_at).getTime().toString().slice(-4)}`;
  
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt - AmarBoost Order #${order.id}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .receipt-card {
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
            width: 100%;
            max-width: 480px;
            padding: 32px;
            box-sizing: border-box;
            position: relative;
        }
        .header {
            text-align: center;
            border-bottom: 2px dashed #cbd5e1;
            padding-bottom: 24px;
            margin-bottom: 24px;
        }
        .logo-mark {
            width: 54px;
            height: 54px;
            background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
            color: white;
            border-radius: 12px;
            font-size: 24px;
            font-weight: 900;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
        }
        .title {
            font-size: 20px;
            font-weight: 850;
            letter-spacing: -0.5px;
            margin: 0;
            color: #0f172a;
        }
        .subtitle {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 750;
            margin-top: 4px;
            letter-spacing: 1.5px;
        }
        .meta-grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 16px;
            font-size: 11px;
            margin-bottom: 24px;
            background-color: #f1f5f9;
            padding: 12px 16px;
            border-radius: 12px;
        }
        .meta-label {
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
            font-size: 9px;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .meta-value {
            font-weight: 700;
            color: #334155;
        }
        .section-header {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 1px;
            color: #94a3b8;
            margin-bottom: 12px;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 4px;
        }
        .item-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 10px 0;
            border-bottom: 1px dashed #f1f5f9;
            font-size: 12.5px;
        }
        .item-label {
            font-weight: 500;
            color: #475569;
            max-width: 65%;
        }
        .item-value {
            font-weight: 700;
            color: #0f172a;
            text-align: right;
            word-wrap: break-word;
            word-break: break-all;
        }
        .total-section {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            padding: 16px;
            margin-top: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid #e2e8f0;
        }
        .total-label {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #475569;
            letter-spacing: 0.5px;
        }
        .total-value {
            font-size: 22px;
            font-weight: 900;
            color: #4f46e5;
        }
        .barcode-container {
            text-align: center;
            margin-top: 32px;
        }
        .barcode {
            font-family: 'Courier New', Courier, monospace;
            letter-spacing: 5px;
            font-size: 13px;
            font-weight: bold;
            color: #0f172a;
            user-select: none;
            opacity: 0.7;
        }
        .footer-note {
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            margin-top: 16px;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .btn-print {
            display: block;
            width: 100%;
            padding: 12px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 10px;
            font-weight: 800;
            font-size: 12px;
            cursor: pointer;
            text-align: center;
            margin-top: 24px;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
        }
        .btn-print:hover {
            background: #4338ca;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.25);
        }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .receipt-card {
                box-shadow: none;
                border: none;
                max-width: 100%;
                padding: 0;
            }
            .btn-print {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="receipt-card">
        <div class="header">
            <div class="logo-mark">A</div>
            <h1 class="title">AmarBoost SMM Panel</h1>
            <div class="subtitle">Official Fulfillment Ticket</div>
        </div>
        
        <div class="meta-grid">
            <div>
                <div class="meta-label">Receipt Code</div>
                <div class="meta-value">${receiptNum}</div>
            </div>
            <div>
                <div class="meta-label">Fulfillment Date</div>
                <div class="meta-value">${new Date().toLocaleDateString()}</div>
            </div>
            <div>
                <div class="meta-label">Order Reference</div>
                <div class="meta-value">#${order.id}</div>
            </div>
            <div>
                <div class="meta-label">Order Date</div>
                <div class="meta-value">${new Date(order.created_at).toLocaleDateString()}</div>
            </div>
        </div>

        <div class="section-header">Service Summary</div>
        
        <div class="item-row">
            <div class="item-label">SMM Service</div>
            <div class="item-value" style="color: #0f172a;">${serviceName}</div>
        </div>
        <div class="item-row">
            <div class="item-label">Category</div>
            <div class="item-value">${serviceCategory}</div>
        </div>
        <div class="item-row">
            <div class="item-label">Promotional Target</div>
            <div class="item-value" style="font-family: monospace; font-size: 11px; color: #4f46e5; text-align: right;">${order.link}</div>
        </div>
        <div class="item-row">
            <div class="item-label">Ordered Volume</div>
            <div class="item-value">${order.quantity.toLocaleString()} quantity</div>
        </div>
        <div class="item-row">
            <div class="item-label">System Start Count</div>
            <div class="item-value">${order.start_count !== null && order.start_count !== undefined ? Number(order.start_count).toLocaleString() : '0'}</div>
        </div>
        <div class="item-row">
            <div class="item-label">Fulfillment Status</div>
            <div class="item-value" style="color: #10b981; font-weight: 800; text-transform: uppercase;">${order.status}</div>
        </div>

        <div class="total-section">
            <div class="total-label">Total Charge</div>
            <div class="total-value">${formatPrice(order.charge)}</div>
        </div>

        <div class="barcode-container">
            <div class="barcode">||||| | ||| || ||| | |||</div>
            <div style="font-size: 8px; color: #94a3b8; font-family: monospace; margin-top: 4px; letter-spacing: 1px;">VERIFIED BLOCK LEDGER</div>
        </div>

        <div class="footer-note">SMM Reseller Network Fulfillment Success</div>
        <button class="btn-print" onclick="window.print()">Print This Receipt</button>
    </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Receipt_Order_${order.id}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('Offline HTML Billing Receipt downloaded!');
};

const downloadReceiptText = (order: Order, service: Service | undefined) => {
  const serviceName = service?.name || `SMM Service #${order.service_id}`;
  const serviceCategory = service?.category || 'SMM Service Category';
  const text = `===========================================
          AMARBOOST SMM PANEL RESELLER
        OFFICIAL TRANSACTION TRANSACTION RECEIPT
===========================================
Receipt No: REC-${order.id}-${new Date(order.created_at).getTime().toString().slice(-4)}
Date Generated: ${new Date().toLocaleString()}
-------------------------------------------
Order ID: #${order.id}
Order Date: ${new Date(order.created_at).toLocaleString()}
Fulfillment Status: ${order.status.toUpperCase()}
SMM Service ID: #${order.service_id}
SMM Category: ${serviceCategory}
SMM Service Selected: ${serviceName}
-------------------------------------------
Target Link: ${order.link}
Ordered Volume: ${order.quantity.toLocaleString()} items
Start Count: ${order.start_count || '0'}
Remains: ${order.remains || '0'}
-------------------------------------------
TOTAL CHARGE: ${formatPrice(order.charge)} [PAID]
===========================================
         SECURE BLOCKCHAIN-LEDGER ID
         102-SMM-TICKET-OK-0103-99120
===========================================
Thank you for using AmarBoost SMM Reseller Hub!
`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Receipt_Order_${order.id}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('Text docket downloaded successfully!');
};

interface LiveOrderTrackingModalProps {
  orderId: number;
  services: Service[];
  onClose: () => void;
  token: string;
  onUpdate?: () => void;
}

export function LiveOrderTrackingModal({ orderId, services, onClose, token, onUpdate }: LiveOrderTrackingModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchTrackingDetails = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/track`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Order tracking returned status ${response.status}`);
      }
      const resData = await response.json().catch(() => null);
      if (!resData) {
        throw new Error("Invalid response received from tracking service");
      }
      setData(resData);
    } catch (err: any) {
      console.warn("Live tracking info:", err?.message || err);
      setError(err?.message || "Failed to load real-time status tracker data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, token]);

  const handleRetryOrder = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to retry order');
      }
      toast.success(resData.message || 'Order successfully re-submitted and parameters sent to provider.');
      // Refresh current tracking modal details
      fetchTrackingDetails();
      // Inform the parent component to reload the orders list
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      console.error("Order retry failed:", err);
      toast.error(err.message || 'Error occurred during order retry/re-trigger');
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    fetchTrackingDetails();

    const interval = setInterval(() => {
      fetchTrackingDetails(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchTrackingDetails]);

  const service = services.find(s => s.service === data?.serviceId?.toString());
  const serviceName = service?.name || `Service #${data?.serviceId}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center text-indigo-605 dark:text-indigo-400">
              <Activity size={18} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Live SMM Status Tracker</h3>
              <p className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">Secure Ledger ID: #{orderId}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchTrackingDetails(true)}
              disabled={loading || refreshing}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-150 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh tracking data"
            >
              <RefreshCw size={14} className={`${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-150 dark:hover:bg-slate-800 transition-all cursor-pointer font-black"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Syncing with Provider Subsystems...</p>
            </div>
          ) : error ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center gap-3 bg-red-50/50 dark:bg-red-950/15 rounded-2xl border border-red-100 dark:border-red-900/20">
              <AlertTriangle className="text-red-500" size={32} />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400">Tracking Failed</p>
                <p className="text-[10px] text-slate-500 font-bold max-w-xs leading-normal">{error}</p>
              </div>
              <button
                onClick={() => fetchTrackingDetails()}
                className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-xs cursor-pointer transition-all active:scale-95"
              >
                Retry Connection
              </button>
            </div>
          ) : data ? (
            <>
              {/* Order Status Summary Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {service && getSocialIcon(service.category, service.name, 16)}
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-slate-800 dark:text-white truncate max-w-[200px]" title={serviceName}>
                        {serviceName}
                      </h4>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5 max-w-[220px] truncate">
                        <a href={data.link} target="_blank" rel="noreferrer" className="hover:underline text-indigo-600 dark:text-indigo-400 font-bold">{data.link}</a>
                      </div>
                    </div>
                  </div>
                  <div>
                    <OrderStatusBadge status={data.status} />
                  </div>
                </div>

                {data.username && (
                  <div className="bg-slate-100 dark:bg-slate-800/40 rounded-xl p-2.5 text-[10px] text-slate-700 dark:text-slate-300 leading-normal text-left border border-slate-200/50 dark:border-slate-850">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5 uppercase tracking-wider text-[8px]">Customer Information:</span>
                    <div className="flex justify-between items-center mt-0.5">
                      <span className="font-extrabold">{data.username}</span>
                      <span className="text-slate-400 text-[9px] font-mono">{data.email || 'N/A'}</span>
                    </div>
                  </div>
                )}

                {data.note && (
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-950/40 rounded-xl p-2.5 text-[10px] text-slate-705 dark:text-slate-300 leading-normal text-left">
                    <span className="font-bold text-amber-600 dark:text-amber-400 block mb-0.5 uppercase tracking-wider text-[8px]">Order Note:</span>
                    {data.note}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/40 text-center">
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Ordered</p>
                    <p className="text-xs font-black text-slate-800 dark:text-white font-mono">{formatNumber(data.quantity)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Start Count</p>
                    <p className="text-xs font-black text-slate-800 dark:text-white font-mono">
                      {data.start_count !== null && data.start_count !== undefined ? formatNumber(parseInt(data.start_count)) : '-'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Remains</p>
                    <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">
                      {data.remains !== null && data.remains !== undefined ? formatNumber(parseInt(data.remains)) : '-'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Paid Charge</p>
                    <p className="text-xs font-black text-indigo-600 dark:text-indigo-400">{formatPrice(data.charge)}</p>
                  </div>
                </div>
              </div>

              {/* Stuck / Failed Order Retry Action Panel */}
              {['pending', 'failed', 'fail', 'canceled', 'cancelled', 'awaiting_admin'].includes((data.status || '').toLowerCase()) && (
                <div className="p-4 bg-amber-500/5 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 transition-all duration-150">
                  <div className="text-center sm:text-left">
                    <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest flex items-center justify-center sm:justify-start gap-1">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                      Stuck or Failed Dispatch?
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-0.5 leading-snug">
                      Forces SMM parameter re-indexing and re-submits values to provider.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryOrder}
                    disabled={retrying}
                    className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600/20 dark:hover:bg-amber-600/30 text-white dark:text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 select-none transition-all duration-150 border border-amber-500/10 dark:border-amber-500/20 active:scale-95 font-bold whitespace-nowrap"
                  >
                    <RefreshCw size={11} className={retrying ? 'animate-spin' : ''} />
                    <span>{retrying ? 'Retrying...' : 'Retry / Re-trigger'}</span>
                  </button>
                </div>
              )}

              {/* Real-time Order Progress Card */}
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-xs">
                <OrderProgressBar order={{ ...data, service_id: data.serviceId }} />
              </div>

              {/* Status Log Timeline */}
              <div className="space-y-3.5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live API Telemetry Logs</h4>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                  {data.logs && data.logs.map((log: any, index: number) => {
                    const isDone = log.status === 'done';
                    const isActive = log.status === 'active';
                    const isWaiting = log.status === 'waiting';
                    const isCancelled = log.status === 'cancelled';

                    let dotColor = 'bg-slate-200 dark:bg-slate-850 border-slate-300 dark:border-slate-700';
                    if (isDone) dotColor = 'bg-emerald-500 border-white dark:border-slate-900 ring-4 ring-emerald-500/15';
                    if (isActive) dotColor = 'bg-indigo-600 border-white dark:border-slate-900 ring-4 ring-indigo-600/15 animate-pulse';
                    if (isWaiting) dotColor = 'bg-indigo-400 border-white dark:border-slate-900 ring-4 ring-indigo-400/15';
                    if (isCancelled) dotColor = 'bg-red-500 border-white dark:border-slate-900 ring-4 ring-red-500/15';

                    return (
                      <div key={`log-${index}`} className="relative select-none text-left">
                        {/* Bullet */}
                        <div className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 ${dotColor} z-10 transition-all`} />
                        
                        <div className="space-y-0.5">
                          <div className="flex items-baseline justify-between gap-4">
                            <h5 className={`text-xs font-black uppercase tracking-tight ${isDone ? 'text-slate-800 dark:text-slate-150' : isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                              {log.title}
                            </h5>
                            <span className="text-[8px] font-mono font-bold text-slate-400 shrink-0">
                              {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                            {log.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom API Sync Handshake Indicator */}
              <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/10 rounded-xl flex items-center justify-between text-[9px] font-bold text-emerald-600 dark:text-emerald-400 select-none">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="uppercase tracking-wider mr-1">APIs Subsystem Connected</span>
                </div>
                <span className="font-mono text-[8px] uppercase tracking-widest text-slate-400">AMARBOOST SYNC OK</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OrderReceiptModal({ order, services, onClose }: OrderReceiptModalProps) {
  if (!order) return null;

  const service = services.find(s => s.service === order.service_id.toString());
  const serviceName = service?.name || `SMM Service #${order.service_id}`;
  const serviceCategory = service?.category || 'SMM Service Category';
  const receiptNum = `REC-${order.id}-${new Date(order.created_at).getTime().toString().slice(-4)}`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window. Please allow popups or download the HTML Receipt.');
      return;
    }
    
    const printStyle = `
      body {
        font-family: system-ui, -apple-system, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 40px;
        display: flex;
        justify-content: center;
        background: white;
      }
      .receipt-card {
        border: 1px dashed #cbd5e1;
        width: 100%;
        max-width: 440px;
        padding: 24px;
        box-sizing: border-box;
      }
      .header {
        text-align: center;
        border-bottom: 2px dashed #cbd5e1;
        padding-bottom: 20px;
        margin-bottom: 24px;
      }
      .title {
        font-size: 20px;
        font-weight: 850;
        margin: 0;
      }
      .subtitle {
        font-size: 9px;
        color: #64748b;
        text-transform: uppercase;
        font-weight: 750;
        margin-top: 4px;
        letter-spacing: 1.5px;
      }
      .meta-grid {
        display: grid;
        grid-template-cols: 1fr 1fr;
        gap: 12px;
        font-size: 11px;
        margin-bottom: 24px;
        background-color: #f8fafc;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #f1f5f9;
      }
      .meta-label {
        color: #64748b;
        text-transform: uppercase;
        font-weight: 700;
        font-size: 8px;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }
      .meta-value {
        font-weight: 700;
        color: #334155;
      }
      .item-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px dashed #f1f5f9;
        font-size: 12px;
      }
      .item-label {
        color: #475569;
      }
      .item-value {
        font-weight: 700;
        text-align: right;
        word-break: break-all;
      }
      .total-section {
        background-color: #f8fafc;
        padding: 16px;
        margin-top: 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }
      .total-label {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .total-value {
        font-size: 20px;
        font-weight: 900;
        color: #4f46e5;
      }
      .barcode {
        font-family: monospace;
        letter-spacing: 4px;
        text-align: center;
        margin-top: 24px;
        opacity: 0.6;
        font-size: 11px;
      }
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt_Order_${order.id}</title>
        <style>${printStyle}</style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="header">
            <h1 class="title">AmarBoost SMM Panel</h1>
            <div class="subtitle">Official Fulfillment Ticket</div>
          </div>
          <div class="meta-grid">
            <div>
              <div class="meta-label">Receipt Code</div>
              <div class="meta-value">${receiptNum}</div>
            </div>
            <div>
              <div class="meta-label">Fulfillment Date</div>
              <div class="meta-value">${new Date().toLocaleDateString()}</div>
            </div>
            <div>
              <div class="meta-label">Order ID</div>
              <div class="meta-value">#${order.id}</div>
            </div>
            <div>
              <div class="meta-label">Order Date</div>
              <div class="meta-value">${new Date(order.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div class="item-row">
            <div class="item-label">Service</div>
            <div class="item-value">${serviceName}</div>
          </div>
          <div class="item-row">
            <div class="item-label">Category</div>
            <div class="item-value">${serviceCategory}</div>
          </div>
          <div class="item-row">
            <div class="item-label">Link Address</div>
            <div class="item-value" style="font-family: monospace; font-size: 11px;">${order.link}</div>
          </div>
          <div class="item-row">
            <div class="item-label">Volume Level</div>
            <div class="item-value">${order.quantity}</div>
          </div>
          <div class="item-row">
            <div class="item-label">Start Count</div>
            <div class="item-value">${order.start_count || '0'}</div>
          </div>
          <div class="item-row">
            <div class="item-label">Status</div>
            <div class="item-value" style="text-transform: uppercase;">${order.status}</div>
          </div>
          <div class="total-section">
            <div class="total-label">Fulfillment Charge</div>
            <div class="total-value">${formatPrice(order.charge)}</div>
          </div>
          <div class="barcode">||||| | ||| || ||| | |||</div>
        </div>
        <script>
          setTimeout(() => {
            window.print();
            window.close();
          }, 300);
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="text-indigo-600" size={18} />
            <h3 className="text-sm font-black uppercase tracking-tight dark:text-white">Order Receipt</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 lg:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Aesthetic Ticket Card Layout */}
          <div className="p-6 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm relative overflow-hidden text-left">
            {/* Horizontal Punch Hole Separator Effect */}
            <div className="absolute left-[-8px] right-[-8px] top-[148px] border-t-2 border-dashed border-slate-200 dark:border-slate-800 h-0 z-10"></div>
            <div className="absolute left-[-8px] top-[140px] w-4 h-4 bg-white dark:bg-slate-900 rounded-full border-r border-slate-200 dark:border-slate-800"></div>
            <div className="absolute right-[-8px] top-[140px] w-4 h-4 bg-white dark:bg-slate-900 rounded-full border-l border-slate-200 dark:border-slate-800"></div>

            <div className="flex flex-col items-center pb-2">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center font-black text-xl shadow-inner mb-2.5">
                A
              </div>
              <h4 className="text-sm font-black uppercase tracking-tight dark:text-white">AmarBoost SMM Panel</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Fulfillment Success Docket</p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-medium text-[10.5px] pb-6">
              <div>
                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Receipt No</span>
                <strong className="text-slate-800 dark:text-slate-200 font-mono select-all bg-slate-200/50 dark:bg-slate-800 px-1 py-0.2 rounded">{receiptNum}</strong>
              </div>
              <div>
                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Completed Date</span>
                <strong className="text-slate-800 dark:text-slate-200">{new Date(order.created_at).toLocaleDateString()}</strong>
              </div>
              <div>
                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Order Reference</span>
                <strong className="text-slate-800 dark:text-slate-200 font-mono">#{order.id}</strong>
              </div>
              <div>
                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Server Status</span>
                <strong className="text-emerald-500 font-black uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  SUCCESS
                </strong>
              </div>
            </div>

            {/* Service & Delivery specs details */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800/50 text-xs">
              <div className="flex justify-between items-start gap-4">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider shrink-0">SMM Service</span>
                <span className="font-extrabold text-slate-800 dark:text-slate-200 text-right">{serviceName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Category</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{serviceCategory}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider shrink-0">Target URL</span>
                <span className="font-mono text-[11px] text-indigo-650 dark:text-indigo-400 text-right break-all select-all font-bold">{order.link}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Delivered Amount</span>
                <span className="font-black text-slate-800 dark:text-slate-200">{formatNumber(order.quantity)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Start Counter</span>
                <span className="font-mono font-bold text-slate-705 dark:text-slate-295">{order.start_count || '0'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Remaining</span>
                <span className="font-mono font-bold text-slate-705 dark:text-slate-295">{order.remains || '0'}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 flex justify-between items-center bg-indigo-50/50 dark:bg-slate-900/60 p-3 rounded-xl border border-indigo-100/10">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">Final Charge Charged</span>
              <span className="text-xl font-black text-indigo-650 dark:text-indigo-400">{formatPrice(order.charge)}</span>
            </div>

            <div className="flex flex-col items-center pt-2">
              <div className="text-[13px] font-mono tracking-[4px] text-slate-450 select-none">||||| | ||| || ||| | |||</div>
              <span className="text-[7.5px] font-bold text-slate-400 tracking-widest uppercase mt-1">VERIFIED SYSTEM RECORD</span>
            </div>
          </div>

          {/* Interactive downloadable/printable receipt utilities panel */}
          <div className="space-y-2 pt-2 text-left">
            <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Download & Printing Resources</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => downloadReceiptHTML(order, service)}
                className="py-3 px-4 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Download size={14} />
                Download HTML Receipt
              </button>
              <button
                type="button"
                onClick={() => downloadReceiptText(order, service)}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-200/50 dark:border-slate-700/50"
              >
                <Copy size={14} />
                Download TXT Docket
              </button>
            </div>
            
            <button
              type="button"
              onClick={handlePrint}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer mt-1"
            >
              <Printer size={14} />
              Open Print Friendly Window
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
          >
            Close Receipt View
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ServicesList({ services, isAdmin, onUpdate, favorites, setFavorites, setActiveTab, setSelectedServiceId, token }: { services: Service[], isAdmin?: boolean, onUpdate?: () => void, favorites: string[], setFavorites: (favs: string[]) => void, setActiveTab: (tab: string) => void, setSelectedServiceId: (id: string) => void, token: string }) {
  const [localServices, setLocalServices] = useState<Service[]>(services || []);
  const [isLoadingServices, setIsLoadingServices] = useState<boolean>(!services || services.length === 0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc'>('default');
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [platform, setPlatform] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [customMargin, setCustomMargin] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoRenewals, setAutoRenewals] = useState<AutoRenewal[]>([]);
  const [configRenewal, setConfigRenewal] = useState<{serviceId: string, link: string, quantity: string} | null>(null);

  // Sync props services or fetch directly if not yet loaded
  useEffect(() => {
    if (services && services.length > 0) {
      setLocalServices(services);
      setIsLoadingServices(false);
    } else {
      setIsLoadingServices(true);
      fetch('/api/services')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setLocalServices(data);
          }
        })
        .catch(err => console.warn("Notice: Direct services load in ServicesList:", err))
        .finally(() => setIsLoadingServices(false));
    }
  }, [services]);

  const activeServices = localServices.length > 0 ? localServices : (services || []);

  useEffect(() => {
    setSelectedCategory('All');
  }, [platform]);

  useEffect(() => {
    if (editingService) {
      setCustomMargin(editingService.custom_margin?.toString() || '');
      setCustomPrice(editingService.custom_price?.toString() || '');
      setCustomDescription(editingService.custom_description || '');
      setCustomCategory(editingService.custom_category || '');
      setIsHidden(editingService.is_hidden || false);
    } else {
      setCustomMargin('');
      setCustomPrice('');
      setCustomDescription('');
      setCustomCategory('');
      setIsHidden(false);
    }
  }, [editingService]);

  const getServiceDetails = (service: Service) => {
    const nameLower = service.name.toLowerCase();
    const descLower = (service.description || '').toLowerCase();
    
    // 1. Determine Refill Policy
    let refillPolicy = "30 Days Manual Refill / Guarantee";
    if (nameLower.includes("no refill") || descLower.includes("no refill") || nameLower.includes("non refill") || nameLower.includes("no-refill") || nameLower.includes("no_refill")) {
      refillPolicy = "No Refill (Non-guaranteed / Drop likely)";
    } else if (nameLower.includes("lifetime") || descLower.includes("lifetime") || nameLower.includes("lft") || nameLower.includes("life-time")) {
      refillPolicy = "Lifetime Guarantee (Lifetime Automatic / Manual Refill)";
    } else if (nameLower.includes("non drop") || nameLower.includes("no drop") || descLower.includes("non-drop") || descLower.includes("no-drop")) {
      refillPolicy = "Non-Drop Premium Asset - Lifetime Protected";
    } else if (nameLower.includes("refill") || descLower.includes("refill") || nameLower.includes("r30") || nameLower.includes("r60")) {
      const daysMatch = nameLower.match(/r(\d+)/) || descLower.match(/refill\s*(\d+)\s*day/);
      refillPolicy = daysMatch ? `${daysMatch[1]} Days Professional Refill Protection` : "System Guaranteed Refill Support";
    }
    
    // 2. Determine Drip-feed Speed
    let dripSpeed = "Standard Speed (~5k to 15k / day)";
    if (nameLower.includes("instant") || descLower.includes("instant")) {
      dripSpeed = "Instant Trigger (Delivery begins in 1 to 10 mins)";
    } else if (nameLower.includes("fast") || nameLower.includes("speedy") || descLower.includes("super fast")) {
      dripSpeed = "Super Fast Fulfillment (~25k to 100k / day)";
    } else if (nameLower.includes("slow") || nameLower.includes("gradual") || descLower.includes("drip") || descLower.includes("slow")) {
      dripSpeed = "Organic / Gradual Drip (~200 to 1k / day)";
    } else if (nameLower.includes("real") || nameLower.includes("active")) {
      dripSpeed = "High Quality Organic Distribution (Starts in 1-4 hours)";
    }
    
    // 3. Average Start Time
    let startTime = "Start Time: 0 - 1 Hours (Instant Core Processed)";
    if (nameLower.includes("instant") || descLower.includes("instant")) {
      startTime = "Instant Activation (0 - 5 Minutes)";
    } else if (nameLower.includes("slow") || descLower.includes("slow")) {
      startTime = "Slow Startup Phase (2 - 6 Hours for safety limits)";
    }
    
    return { refillPolicy, dripSpeed, startTime };
  };

  const handleSyncServices = async () => {
    setSyncing(true);
    const toastId = toast.loading(isAdmin ? 'SMM API থেকে সার্ভিসগুলো সিঙ্ক হচ্ছে...' : 'সার্ভিস লিস্ট রিফ্রেশ হচ্ছে...');
    try {
      if (isAdmin) {
        const res = await fetch('/api/admin/services/sync', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Sync failed');
        }
      }
      if (onUpdate) {
        await onUpdate();
      }
      toast.success(isAdmin ? 'সার্ভিস লিস্ট সফলভাবে সিঙ্ক করা হয়েছে!' : 'সার্ভিস লিস্ট সফলভাবে আপডেট করা হয়েছে!', { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`আপডেট করতে ব্যর্থ হয়েছে: ${error.message || 'Error occurred'}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const fetchAutoRenewals = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auto-renewals', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setAutoRenewals(data);
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    fetchAutoRenewals();
  }, [fetchAutoRenewals]);

  const handleToggleAutoRenewal = async (serviceId: string, link: string, quantity: number, isActive: boolean) => {
    try {
      await fetch('/api/auto-renewals/toggle', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          service_id: serviceId,
          link,
          quantity,
          is_active: isActive
        })
      });
      fetchAutoRenewals();
      setConfigRenewal(null);
      toast.success(`Auto-renewal ${isActive ? 'enabled' : 'disabled'}`);
    } catch (e) { 
      toast.error('Failed to update auto-renewal');
      console.error(e); 
    }
  };

  const platforms = [
    { id: 'All', label: 'All', icon: <LayoutDashboard size={18} />, color: '#6366f1' },
    { id: 'Favorites', label: 'Saved', icon: <Heart size={18} className="fill-white" />, color: '#ef4444' },
    { id: 'Facebook', label: 'Facebook', icon: <BrandLogo name="facebook" size={18} className="text-white" />, color: '#1877F2' },
    { id: 'Instagram', label: 'Insta', icon: <Instagram size={18} />, color: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2397 75%, #ad38e7 100%)' },
    { id: 'Youtube', label: 'YouTube', icon: <BrandLogo name="youtube" size={18} className="text-white" />, color: '#FF0000' },
    { id: 'Tiktok', label: 'TikTok', icon: <BrandLogo name="tiktok" size={18} className="text-white" />, color: '#000000' },
    { id: 'Twitter', label: 'Twitter', icon: <Twitter size={18} className="fill-white" />, color: '#000000' },
    { id: 'Telegram', label: 'Telegram', icon: <BrandLogo name="telegram" size={18} className="text-white" />, color: '#26A5E4' },
    { id: 'Spotify', label: 'Spotify', icon: <BrandLogo name="spotify" size={18} className="text-white" />, color: '#1DB954' },
    { id: 'Discord', label: 'Discord', icon: <BrandLogo name="discord" size={18} className="text-white" />, color: '#5865F2' },
    { id: 'Website', label: 'Web', icon: <Globe size={18} />, color: '#6366f1' },
  ];

  const categories = React.useMemo(() => ['All', ...Array.from(new Set(services
    .filter(s => {
      if (platform === 'All') return true;
      if (platform === 'Favorites') return favorites.includes(s.service);
      return s.category.toLowerCase().includes(platform.toLowerCase());
    })
    .map(s => s.category)
  ))], [services, platform, favorites]);
  
  const filteredServices = React.useMemo(() => {
    const listWithScores = services
      .filter(s => {
        const matchesPlatform = platform === 'All' || 
          (platform === 'Favorites' ? favorites.includes(s.service) : s.category.toLowerCase().includes(platform.toLowerCase()));
        const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
        return matchesPlatform && matchesCategory;
      })
      .map(s => {
        const searchResult = getSearchScore(s.name, s.category, s.service, search);
        return { service: s, ...searchResult };
      })
      .filter(item => item.matches);

    if (sortBy === 'price-asc') {
      listWithScores.sort((a, b) => parseFloat(String(a.service.rate)) - parseFloat(String(b.service.rate)));
    } else if (sortBy === 'price-desc') {
      listWithScores.sort((a, b) => parseFloat(String(b.service.rate)) - parseFloat(String(a.service.rate)));
    } else if (search) {
      listWithScores.sort((a, b) => b.score - a.score);
    }

    return listWithScores.map(item => item.service);
  }, [services, platform, selectedCategory, search, favorites, sortBy]);

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);

  const toggleFavorite = (id: string) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(f => f !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const handleUpdateService = async (serviceId: string, directHide: boolean | null = null) => {
    setUpdating(true);
    try {
      const isServiceHidden = directHide !== null ? directHide : isHidden;
      await fetch('/api/admin/services/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          service_id: serviceId,
          custom_margin: customMargin ? parseFloat(customMargin) : null,
          custom_price: customPrice ? parseFloat(customPrice) : null,
          custom_description: customDescription || null,
          custom_category: customCategory || null,
          is_hidden: isServiceHidden
        })
      });
      setEditingService(null);
      if (onUpdate) onUpdate();
      toast.success("Service updated successfully!");
    } catch (error) {
      console.error("Failed to update service", error);
      toast.error("Failed to update service");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight dark:text-white">Professional Services</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">High quality social media boosting</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[150px] md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 transition-all outline-none text-xs shadow-sm"
            />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-600 outline-none text-xs shadow-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <option value="default">Default Sort</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
          <button 
            type="button"
            onClick={handleSyncServices}
            disabled={syncing}
            className={`p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 text-xs font-bold ${
              syncing 
                ? 'text-indigo-500 cursor-not-allowed opacity-80' 
                : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-100 dark:hover:border-indigo-900/30'
            }`}
            title={isAdmin ? "Sync services from Provider API" : "Refresh services list"}
          >
            <RefreshCw size={15} className={`${syncing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline text-[9px] font-black uppercase tracking-wider">
              {isAdmin ? 'Sync API' : 'Refresh'}
            </span>
          </button>
          <button 
            onClick={() => {
              setPlatform('All');
              setSelectedCategory('All');
              setSearch('');
              setSortBy('default');
            }}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 transition-colors shadow-sm cursor-pointer"
            title="Clear Filters"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 lg:gap-3">
        {platforms.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setPlatform(p.id); setSelectedCategory('All'); }}
            className={`flex-shrink-0 group flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl border ${
              platform === p.id 
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-400 ring-4 ring-indigo-500/10 shadow-md shadow-indigo-100 dark:shadow-none scale-102' 
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div 
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center text-white relative transition-all shadow-sm ${
                platform === p.id ? 'scale-105' : 'scale-90 group-hover:scale-100'
              }`}
              style={{ background: p.color }}
            >
              {p.icon}
            </div>
            <span className={`text-[9px] lg:text-[10px] font-extrabold uppercase tracking-tight transition-colors ${platform === p.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-350'}`}>
              {p.label}
            </span>
          </button>
        ))}
      </div>

      {/* Categories Dropdown/Grid Selection */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Category</label>
          <button 
            onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
            className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 hover:underline"
          >
            {isCategoryMenuOpen ? 'Hide Options' : `View ${categories.length} Categories`}
            <ChevronDown size={10} className={isCategoryMenuOpen ? 'rotate-180' : ''} />
          </button>
        </div>

        <AnimatePresence>
          {isCategoryMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0 }}
              style={{ originY: 0 }}
              className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-[400px] overflow-y-auto custom-scrollbar p-2"
            >
              <div className="grid grid-cols-1 gap-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-[11px] font-bold line-clamp-1">{cat}</span>
                    {selectedCategory === cat && <Check size={14} />}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.slice(0, 6).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-indigo-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {categories.length > 6 && (
                <button 
                  onClick={() => setIsCategoryMenuOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight bg-slate-50 dark:bg-slate-800 text-slate-400 border border-dashed border-slate-300 dark:border-slate-700"
                >
                  +{categories.length - 6} Others
                </button>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {configRenewal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-white/20"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter">Configure Auto-Renewal</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Set link and quantity for automatic reorders</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Destination Link</label>
                  <input
                    type="text"
                    value={configRenewal.link}
                    onChange={(e) => setConfigRenewal({ ...configRenewal!, link: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none text-xs font-bold dark:text-white"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Quantity</label>
                  <input
                    type="number"
                    value={configRenewal.quantity}
                    onChange={(e) => setConfigRenewal({ ...configRenewal!, quantity: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none text-xs font-bold dark:text-white"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleToggleAutoRenewal(configRenewal!.serviceId, configRenewal!.link, parseInt(configRenewal!.quantity), true)}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                  >
                    Enable Auto-Renewal
                  </button>
                  <button
                    onClick={() => setConfigRenewal(null)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Responsive Mobile Layout for ServicesList */}
        <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredServices.map((service) => (
            <div 
              key={service.service} 
              onClick={() => setExpandedServiceId(expandedServiceId === service.service ? null : service.service)}
              className={`p-4 space-y-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 cursor-pointer transition-all ${
                expandedServiceId === service.service ? 'bg-indigo-50/10 dark:bg-indigo-950/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0" onClick={(e) => e.stopPropagation()}>
                    {getSocialIcon(service.category, service.name, 20)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="text-[10px] font-mono text-slate-700 dark:text-slate-200 font-black">#{service.service}</div>
                      <span className="text-[8px] font-black bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 px-1 py-0.2 rounded uppercase tracking-widest flex items-center gap-0.5 select-none shrink-0">
                        Details
                        <ChevronDown size={8} className={`transition-transform duration-200 ${expandedServiceId === service.service ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                    <div className="text-[13px] font-bold dark:text-white leading-tight mt-0.5">{service.name}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>{service.category}</span>
                      <span className="opacity-40">•</span>
                      <ServiceHealthIndicator serviceId={service.id} token={token} layout="inline" />
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <span 
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 cursor-help" 
                          title={service.updated_at ? `Last synced: ${new Date(service.updated_at).toLocaleString()}` : 'Last synced: Recently'}
                        >
                          <RefreshCw size={8} className="text-indigo-500" />
                          Synced {service.updated_at ? new Date(service.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                        </span>
                        
                        {service.conflict && service.conflict.type !== 'none' && (
                          <span 
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border cursor-help ${
                              service.conflict.type === 'loss' 
                                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30' 
                                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30'
                            }`} 
                            title={service.conflict.message}
                          >
                            <AlertTriangle size={8} />
                            {service.conflict.type === 'loss' ? 'LOSS WARNING' : 'OVERRIDE'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(service.service); }}
                  className={`p-2 rounded-xl transition-all shrink-0 ${favorites.includes(service.service) ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-slate-400 bg-slate-100 dark:bg-slate-800 hover:text-red-500'}`}
                >
                  <Heart size={16} className={favorites.includes(service.service) ? 'fill-red-500' : ''} />
                </button>
              </div>

              {/* Collapsible Mobile details block */}
              <AnimatePresence initial={false}>
                {expandedServiceId === service.service && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Specifications grid */}
                    <div className="grid grid-cols-1 gap-2 text-[11px]">
                      <div className="flex items-center gap-2 p-2 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-lg">
                        <CheckCircle2 className="text-indigo-600 shrink-0" size={12} />
                        <span className="font-bold text-slate-700 dark:text-slate-350"><strong className="text-[9px] uppercase text-slate-400 tracking-wider font-extrabold mr-1">Refill:</strong>{getServiceDetails(service).refillPolicy}</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-orange-50/20 dark:bg-orange-950/10 rounded-lg">
                        <Activity className="text-orange-600 shrink-0" size={12} />
                        <span className="font-bold text-slate-700 dark:text-slate-350"><strong className="text-[9px] uppercase text-slate-400 tracking-wider font-extrabold mr-1">Speed:</strong>{getServiceDetails(service).dripSpeed}</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-lg">
                        <Clock className="text-emerald-600 shrink-0" size={12} />
                        <span className="font-bold text-slate-700 dark:text-slate-350"><strong className="text-[9px] uppercase text-slate-400 tracking-wider font-extrabold mr-1">Start:</strong>{getServiceDetails(service).startTime}</span>
                      </div>
                    </div>

                    {(() => {
                      const marketing = getServiceMarketingDetails(service.name || '', service.category || '');
                      const displayDesc = service.description || marketing.description;
                      return (
                        <div className="space-y-3 pt-1" onClick={(e) => e.stopPropagation()}>
                          <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800/40 rounded-lg">
                            <div className="text-[8px] uppercase font-extrabold text-indigo-500 dark:text-indigo-400 tracking-widest mb-1.5">Overview Description</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-semibold text-left">
                              {displayDesc}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-2 pt-1 text-[10px]">
                            <div className="p-3 bg-green-500/5 dark:bg-green-500/10 border border-green-500/10 dark:border-green-800/20 rounded-lg">
                              <div className="text-[8px] uppercase font-extrabold text-green-600 dark:text-green-400 tracking-widest mb-1.5">📈 Key Benefits</div>
                              <ul className="space-y-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 list-none pl-0">
                                {marketing.benefits.map((benefit, i) => (
                                  <li key={`benefit-${i}`} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{benefit}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-800/20 rounded-lg">
                              <div className="text-[8px] uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-widest mb-1.5">⚠️ Requirements</div>
                              <ul className="space-y-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 list-none pl-0">
                                {marketing.requirements.map((req, i) => (
                                  <li key={`req-${i}`} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{req}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-slate-800/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-4">
                  <div>
                    <div className="text-[8px] uppercase font-bold text-slate-400 tracking-wider">Selling Rate</div>
                    <div className="text-[12px] font-black text-indigo-600">{formatPrice(service.rate)}</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase font-bold text-slate-400 tracking-wider">Min/Max</div>
                    <div className="text-[10px] font-bold dark:text-slate-300">{formatNumber(service.min)} / {formatNumber(service.max)}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const existing = autoRenewals.find(ar => ar.service_id.toString() === service.service);
                      if (existing && existing.is_active) {
                        handleToggleAutoRenewal(service.service, existing.link, existing.quantity, false);
                      } else {
                        setConfigRenewal({
                          serviceId: service.service,
                          link: existing?.link || '',
                          quantity: existing?.quantity.toString() || service.min.toString()
                        });
                      }
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      autoRenewals.some(ar => ar.service_id.toString() === service.service && ar.is_active)
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600'
                    }`}
                    title="Toggle Auto-Renewal"
                  >
                    <RefreshCw size={14} className={autoRenewals.some(ar => ar.service_id.toString() === service.service && ar.is_active) ? 'animate-spin-slow' : ''} />
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingService(service);
                        setCustomMargin(service.custom_margin?.toString() || '');
                      }}
                      className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedServiceId(service.service);
                      setActiveTab('new-order');
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none font-bold text-xs flex items-center gap-2"
                  >
                    <ShoppingCart size={14} />
                    Order
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredServices.length === 0 && (
            <div className="p-12 text-center opacity-30">
              <List size={40} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-bold">No services found</p>
            </div>
          )}
        </div>

        <div className="w-full overflow-x-auto hidden sm:block">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-4 py-3 text-center w-12">Info</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3 min-w-[300px]">Service Name</th>
                {isAdmin && <th className="px-4 py-3">Original Rate</th>}
                <th className="px-4 py-3">Selling Rate</th>
                <th className="px-4 py-3">Min/Max</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredServices.map((service) => {
                const isExpanded = expandedServiceId === service.service;
                return (
                  <React.Fragment key={service.service}>
                    <tr 
                      onClick={() => setExpandedServiceId(isExpanded ? null : service.service)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors cursor-pointer ${
                        isExpanded ? 'bg-indigo-50/20 dark:bg-indigo-950/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <ChevronDown 
                          size={13} 
                          className={`text-slate-400 mx-auto transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
                          }`} 
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-700 dark:text-slate-200 font-black">#{service.service}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded" onClick={(e) => e.stopPropagation()}>
                            {getSocialIcon(service.category, service.name, 14)}
                          </div>
                          <div>
                            <div className="text-[13px] font-bold leading-tight dark:text-white">{service.name}</div>
                            <div className="text-[9px] text-slate-400 uppercase font-bold mt-0.5 flex items-center gap-1.5">
                              <span>{service.category}</span>
                              <span className="opacity-40">•</span>
                              <ServiceHealthIndicator serviceId={service.id} token={token} layout="inline" />
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                <span 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 cursor-help" 
                                  title={service.updated_at ? `Last synced: ${new Date(service.updated_at).toLocaleString()}` : 'Last synced: Recently'}
                                >
                                  <RefreshCw size={8} className="text-indigo-500" />
                                  Synced {service.updated_at ? new Date(service.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                                </span>
                                
                                {service.conflict && service.conflict.type !== 'none' && (
                                  <span 
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border cursor-help ${
                                      service.conflict.type === 'loss' 
                                        ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30' 
                                        : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30'
                                    }`} 
                                    title={service.conflict.message}
                                  >
                                    <AlertTriangle size={8} />
                                    {service.conflict.type === 'loss' ? 'LOSS WARNING' : 'OVERRIDE'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-xs font-bold text-slate-500">
                          {formatPrice(service.original_rate || '0')}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{formatPrice(service.rate)}</div>
                        {isAdmin && service.custom_margin && (
                          <div className="text-[9px] text-emerald-600 font-bold">Custom: {service.custom_margin}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-500 font-bold">
                        {formatNumber(service.min)} / {formatNumber(service.max)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const existing = autoRenewals.find(ar => ar.service_id.toString() === service.service);
                              if (existing && existing.is_active) {
                                handleToggleAutoRenewal(service.service, existing.link, existing.quantity, false);
                              } else {
                                setConfigRenewal({
                                  serviceId: service.service,
                                  link: existing?.link || '',
                                  quantity: existing?.quantity.toString() || service.min.toString()
                                });
                              }
                            }}
                            className={`p-1.5 rounded transition-all ${
                              autoRenewals.some(ar => ar.service_id.toString() === service.service && ar.is_active)
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600'
                            }`}
                            title="Toggle Auto-Renewal"
                          >
                            <RefreshCw size={14} className={autoRenewals.some(ar => ar.service_id.toString() === service.service && ar.is_active) ? 'animate-spin-slow' : ''} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(service.service); }}
                            className={`p-1.5 rounded transition-all ${favorites.includes(service.service) ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-slate-400 bg-slate-100 dark:bg-slate-800 hover:text-red-500'}`}
                          >
                            <Heart size={14} className={favorites.includes(service.service) ? 'fill-red-500' : ''} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedServiceId(service.service);
                              setActiveTab('new-order');
                            }}
                            className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                          >
                            <ShoppingCart size={14} />
                            Order
                          </button>
                          {isAdmin && (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingService(service);
                                  setCustomMargin(service.custom_margin?.toString() || '');
                                }}
                                className="p-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUpdateService(service.service, true); }}
                                className="p-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                              >
                                <EyeOff size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {/* Collapsible expanded detail sub-row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/40 dark:bg-slate-900/20">
                        <td colSpan={isAdmin ? 7 : 6} className="px-6 py-4 border-t border-b border-slate-100 dark:border-slate-800/40">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden space-y-4"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/20 dark:bg-indigo-950/15 border border-indigo-100/30 dark:border-indigo-900/10">
                                <CheckCircle2 className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" size={14} />
                                <div>
                                  <div className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">Refill Policy</div>
                                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{getServiceDetails(service).refillPolicy}</div>
                                </div>
                              </div>
                              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-orange-50/20 dark:bg-orange-950/15 border border-orange-100/30 dark:border-orange-900/10">
                                <Activity className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" size={14} />
                                <div>
                                  <div className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">Drip-feed Speed</div>
                                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{getServiceDetails(service).dripSpeed}</div>
                                </div>
                              </div>
                              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/15 border border-emerald-100/30 dark:border-emerald-900/10">
                                <Clock className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={14} />
                                <div>
                                  <div className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">Estimated Launch</div>
                                  <div className="font-bold text-slate-800 dark:text-slate-250 mt-0.5">{getServiceDetails(service).startTime}</div>
                                </div>
                              </div>
                            </div>
                            
                            {(() => {
                              const marketing = getServiceMarketingDetails(service.name || '', service.category || '');
                              const displayDesc = service.description || marketing.description;
                              return (
                                <div className="space-y-4 pt-1" onClick={(e) => e.stopPropagation()}>
                                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-150 dark:border-slate-800/40">
                                    <div className="text-[9px] uppercase font-extrabold text-indigo-500 dark:text-indigo-400 tracking-widest mb-1.5 font-black">Official Service Description & Guidelines</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold text-left">
                                      {displayDesc}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                                    <div className="p-4 rounded-xl bg-green-500/5 dark:bg-green-500/10 border border-green-500/10 dark:border-green-900/20 text-left">
                                      <div className="text-[9px] uppercase font-extrabold text-green-605 dark:text-green-400 tracking-wider mb-2 font-black">📈 Key Service Benefits</div>
                                      <ul className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300 list-none pl-0">
                                        {marketing.benefits.map((benefit, i) => (
                                          <li key={`benefit-${i}`} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{benefit}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="p-4 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-900/20 text-left">
                                      <div className="text-[9px] uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider mb-2 font-black">⚠️ Target Requirements & Conditions</div>
                                      <ul className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300 list-none pl-0">
                                        {marketing.requirements.map((req, i) => (
                                          <li key={`req-${i}`} className="text-slate-600 dark:text-slate-300 font-semibold text-[9px] list-none pl-0 leading-snug">{req}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredServices.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="p-12 text-center opacity-30">
                    <List size={40} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-bold">No services found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingService && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black dark:text-white flex items-center gap-2">
                <Edit2 size={18} className="text-indigo-600" />
                Customize Service
              </h3>
              <button 
                onClick={() => setEditingService(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-900">
              <p className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold leading-relaxed">
                <span className="font-bold text-slate-700 dark:text-slate-300">Name:</span> {editingService.name}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>ID: {editingService.service}</span>
                <span>•</span>
                <span>Original BDT Rate: ৳{editingService.original_rate || editingService.rate}</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Custom Price (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={customPrice}
                    onChange={(e) => {
                      setCustomPrice(e.target.value);
                      if (e.target.value) setCustomMargin(''); // clear margin if explicit price is set
                    }}
                    placeholder="e.g. 150.00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
                  />
                  <p className="text-[8px] text-slate-400 mt-1">Direct rate override (per 1k).</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Custom Margin (%)</label>
                  <input
                    type="number"
                    value={customMargin}
                    onChange={(e) => {
                      setCustomMargin(e.target.value);
                      if (e.target.value) setCustomPrice(''); // clear price if margin is set
                    }}
                    placeholder="e.g. 15"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
                  />
                  <p className="text-[8px] text-slate-400 mt-1">Used if Custom Price is empty.</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Custom Category</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Facebook Followers - VIP"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
                />
                <p className="text-[8px] text-slate-400 mt-1">Leave empty to use default category ({editingService.category}).</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Custom Description</label>
                <textarea
                  rows={3}
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="Enter details, speed, quality parameters..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs resize-none"
                />
                <p className="text-[8px] text-slate-400 mt-1">Provide clear specifications for reseller clients.</p>
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-900">
                <input
                  type="checkbox"
                  id="isHiddenCheckbox"
                  checked={isHidden}
                  onChange={(e) => setIsHidden(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="isHiddenCheckbox" className="text-[11px] font-bold text-slate-600 dark:text-slate-300 select-none cursor-pointer">
                  Hide this service from Catalog / Reseller Users
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setEditingService(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleUpdateService(editingService.service)}
                  disabled={updating}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow-indigo-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {updating ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Updating...
                    </>
                  ) : 'Save Configuration'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AdminSettings({ onUpdate, token }: { onUpdate: () => void, token: string }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [allSettings, setAllSettings] = useState<any[]>([]);
  const [globalMargin, setGlobalMargin] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [amarBoostKey, setAmarBoostKey] = useState('');
  const [depositAuto, setDepositAuto] = useState(true);
  const [depositManual, setDepositManual] = useState(true);
  
  // Dynamic Manual Gateways states
  const [manualGateways, setManualGateways] = useState<any[]>([]);
  const [isAddingGateway, setIsAddingGateway] = useState(false);
  const [editingGatewayId, setEditingGatewayId] = useState<number | null>(null);
  const [newGateway, setNewGateway] = useState({
    name: '',
    payment_type: 'personal', // 'personal' | 'agent'
    account_number: '',
    qr_code_url: '',
    min_amount: '10',
    max_amount: '25000',
    is_active: true
  });
  
  // Deposit edit detail states
  const [depositAutoDetails, setDepositAutoDetails] = useState('');
  const [depositBkashDetails, setDepositBkashDetails] = useState('');
  const [depositRocketDetails, setDepositRocketDetails] = useState('');
  const [depositNagadDetails, setDepositNagadDetails] = useState('');
  const [depositBankDetails, setDepositBankDetails] = useState('');

  const [newProvider, setNewProvider] = useState({ name: '', url: '', api_key: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Custom Links state
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLink, setNewLink] = useState({ text: '', url: '', icon: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [providersRes, settingsRes, linksRes, gatewaysRes] = await Promise.all([
        fetch('/api/admin/providers', { headers }),
        fetch('/api/admin/settings', { headers }),
        fetch('/api/custom-links'),
        fetch('/api/admin/manual-gateways', { headers })
      ]);
      const providersData = providersRes.ok ? await providersRes.json() : [];
      const settingsData = settingsRes.ok ? await settingsRes.json() : [];
      const linksData = linksRes.ok ? await linksRes.json() : [];
      const gatewaysData = gatewaysRes.ok ? await gatewaysRes.json() : [];
      
      const safeProviders = Array.isArray(providersData) ? providersData : [];
      const safeSettings = Array.isArray(settingsData) ? settingsData : [];

      setProviders(safeProviders);
      setAllSettings(safeSettings);
      if (Array.isArray(linksData)) setCustomLinks(linksData);
      if (Array.isArray(gatewaysData)) setManualGateways(gatewaysData);
      
      const amarBoost = safeProviders.find((p: any) => p.name === 'AmarBoost');
      if (amarBoost) setAmarBoostKey(amarBoost.api_key);

      const margin = safeSettings.find((s: any) => s.key === 'profit_margin');
      if (margin) setGlobalMargin(margin.value);
      
      const rate = safeSettings.find((s: any) => s.key === 'conversion_rate');
      if (rate) setConversionRate(rate.value);

      const dAuto = safeSettings.find((s: any) => s.key === 'deposit_auto_enabled');
      if (dAuto) setDepositAuto(dAuto.value === '1');

      const dManual = safeSettings.find((s: any) => s.key === 'deposit_manual_enabled');
      if (dManual) setDepositManual(dManual.value === '1');

      const dAutoDet = safeSettings.find((s: any) => s.key === 'deposit_auto_details');
      if (dAutoDet) setDepositAutoDetails(dAutoDet.value || '');

      const dBkashDet = safeSettings.find((s: any) => s.key === 'deposit_bkash_details');
      if (dBkashDet) setDepositBkashDetails(dBkashDet.value || '');

      const dRocketDet = safeSettings.find((s: any) => s.key === 'deposit_rocket_details');
      if (dRocketDet) setDepositRocketDetails(dRocketDet.value || '');

      const dNagadDet = safeSettings.find((s: any) => s.key === 'deposit_nagad_details');
      if (dNagadDet) setDepositNagadDetails(dNagadDet.value || '');

      const dBankDet = safeSettings.find((s: any) => s.key === 'deposit_bank_details');
      if (dBankDet) setDepositBankDetails(dBankDet.value || '');

    } catch (error) {
      console.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ key, value })
      });
      fetchSettings();
      onUpdate();
    } catch (error) {
      console.error("Failed to save setting");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAmarBoostKey = async () => {
    const amarBoost = Array.isArray(providers) ? providers.find((p: any) => p.name === 'AmarBoost') : null;
    if (!amarBoost) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/providers/${amarBoost.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: amarBoost.name, 
          url: amarBoost.url, 
          api_key: amarBoost.api_key === amarBoostKey ? amarBoost.api_key : amarBoostKey 
        })
      });
      if (res.ok) {
        fetchSettings();
        onUpdate();
        toast.success('API Key updated successfully!');
      }
    } catch (error) {
      console.error("Failed to update API key");
    } finally {
      setSaving(false);
    }
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newProvider)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Provider connected and added successfully!");
        setNewProvider({ name: '', url: '', api_key: '' });
        fetchSettings();
      } else {
        toast.error(data.error || "Connection failed. Please check provider details.");
      }
    } catch (error) {
      console.error("Failed to add provider", error);
      toast.error("Network error. Failed to add provider.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivateProvider = async (id: number) => {
    try {
      await fetch(`/api/admin/providers/${id}/activate`, { 
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchSettings();
      onUpdate();
    } catch (error) {
      console.error("Failed to activate provider");
    }
  };

  const handleDeactivateProvider = async (id: number) => {
    try {
      await fetch(`/api/admin/providers/${id}/deactivate`, { 
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchSettings();
      onUpdate();
    } catch (error) {
      console.error("Failed to deactivate provider");
    }
  };

  const handleDeleteProvider = async (id: number) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Provider deleted successfully");
        fetchSettings();
        onUpdate();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete provider");
      }
    } catch (error) {
      console.error("Failed to delete provider", error);
      toast.error("Failed to delete provider");
    }
  };

  const handleAddLink = async () => {
    if (!newLink.text || !newLink.url) return;
    setSaving(true);
    try {
      await fetch('/api/admin/custom-links', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newLink)
      });
      setNewLink({ text: '', url: '', icon: '' });
      setIsAddingLink(false);
      fetchSettings();
      toast.success('Link added successfully');
    } catch (error) {
      toast.error('Failed to add link');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      await fetch(`/api/admin/custom-links/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchSettings();
      toast.success('Link removed');
    } catch (error) {
      toast.error('Failed to remove link');
    }
  };

  const handleAddGateway = async () => {
    if (!newGateway.name || !newGateway.account_number) {
      toast.error("Gateway Name and Account Number are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/manual-gateways', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGateway.name,
          payment_type: newGateway.payment_type,
          account_number: newGateway.account_number,
          qr_code_url: newGateway.qr_code_url || null,
          min_amount: parseFloat(newGateway.min_amount) || 10,
          max_amount: parseFloat(newGateway.max_amount) || 25000
        })
      });
      
      if (res.ok) {
        toast.success("Manual gateway created successfully!");
        setIsAddingGateway(false);
        setNewGateway({
          name: '',
          payment_type: 'personal',
          account_number: '',
          qr_code_url: '',
          min_amount: '10',
          max_amount: '25000',
          is_active: true
        });
        fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create manual gateway");
      }
    } catch (err: any) {
      toast.error("Failed to add manual gateway: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGateway = async (id: number) => {
    if (!newGateway.name || !newGateway.account_number) {
      toast.error("Gateway Name and Account Number are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/manual-gateways/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGateway.name,
          payment_type: newGateway.payment_type,
          account_number: newGateway.account_number,
          qr_code_url: newGateway.qr_code_url || null,
          min_amount: parseFloat(newGateway.min_amount) || 10,
          max_amount: parseFloat(newGateway.max_amount) || 25000,
          is_active: newGateway.is_active
        })
      });
      
      if (res.ok) {
        toast.success("Manual gateway updated successfully!");
        setEditingGatewayId(null);
        setNewGateway({
          name: '',
          payment_type: 'personal',
          account_number: '',
          qr_code_url: '',
          min_amount: '10',
          max_amount: '25000',
          is_active: true
        });
        fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update manual gateway");
      }
    } catch (err: any) {
      toast.error("Failed to update manual gateway: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGateway = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this custom gateway?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/manual-gateways/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Gateway deleted successfully!");
        fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete gateway");
      }
    } catch (err: any) {
      toast.error("Failed to delete gateway: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGatewayActive = async (gw: any) => {
    try {
      await fetch(`/api/admin/manual-gateways/${gw.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: gw.name,
          payment_type: gw.payment_type,
          account_number: gw.account_number,
          qr_code_url: gw.qr_code_url,
          min_amount: gw.min_amount,
          max_amount: gw.max_amount,
          is_active: !gw.is_active
        })
      });
      fetchSettings();
      toast.success(`${gw.name} dynamic state toggled`);
    } catch (e: any) {
      toast.error("Failed to toggle gateway active state: " + e.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Global Settings */}
        <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-lg flex items-center justify-center">
              <Settings size={16} />
            </div>
            <h3 className="text-lg font-bold">General Settings</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Global Profit Margin (%)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={globalMargin}
                  onChange={(e) => setGlobalMargin(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-sm"
                  placeholder="e.g. 10"
                />
                <button 
                  onClick={() => handleUpdateSetting('profit_margin', globalMargin)}
                  disabled={saving}
                  className="px-6 bg-indigo-600 text-white rounded-lg font-bold text-xs hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">USD to BDT Rate</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-sm"
                  placeholder="e.g. 120"
                />
                <button 
                  onClick={() => handleUpdateSetting('conversion_rate', conversionRate)}
                  disabled={saving}
                  className="px-6 bg-indigo-600 text-white rounded-lg font-bold text-xs hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
             <div className="flex items-center justify-between">
                <div>
                   <div className="text-sm font-bold">Automatic Deposit</div>
                   <div className="text-[10px] text-slate-500">Toggle instant payment gateway</div>
                </div>
                <button 
                  onClick={() => handleUpdateSetting('deposit_auto_enabled', depositAuto ? '0' : '1')}
                  className={`w-12 h-6 rounded-full transition-all relative ${depositAuto ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${depositAuto ? 'left-7' : 'left-1'}`}></div>
                </button>
             </div>

             {depositAuto && (
               <div className="ml-4 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/30 space-y-2">
                 <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gateway Details / Instructions</label>
                 <div className="flex gap-2">
                   <input
                     type="text"
                     value={depositAutoDetails}
                     onChange={(e) => setDepositAutoDetails(e.target.value)}
                     className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-indigo-600 outline-none transition-all text-xs"
                     placeholder="Automatic payment gateway details..."
                   />
                   <button 
                     type="button"
                     onClick={() => handleUpdateSetting('deposit_auto_details', depositAutoDetails)}
                     className="px-3 bg-indigo-600 text-white rounded-lg font-bold text-[10px] hover:bg-indigo-700 transition-all"
                   >
                     Save
                   </button>
                 </div>
               </div>
             )}

             <div className="flex items-center justify-between">
                <div>
                   <div className="text-sm font-bold">Manual Deposit</div>
                   <div className="text-[10px] text-slate-500">Toggle Bkash, Nagad, etc.</div>
                </div>
                <button 
                  onClick={() => handleUpdateSetting('deposit_manual_enabled', depositManual ? '0' : '1')}
                  className={`w-12 h-6 rounded-full transition-all relative ${depositManual ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${depositManual ? 'left-7' : 'left-1'}`}></div>
                </button>
             </div>

             {depositManual && (
               <div className="ml-4 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-4">
                 {/* Heading & Add Gateway Action */}
                 <div className="flex items-center justify-between">
                   <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dynamic Manual Gateways</div>
                   {!isAddingGateway && editingGatewayId === null && (
                     <button
                       type="button"
                       onClick={() => {
                         setIsAddingGateway(true);
                         setEditingGatewayId(null);
                         setNewGateway({
                           name: '',
                           payment_type: 'personal',
                           account_number: '',
                           qr_code_url: '',
                           min_amount: '10',
                           max_amount: '25000',
                           is_active: true
                         });
                       }}
                       className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                     >
                       <Plus size={12} /> Add Gateway
                     </button>
                   )}
                 </div>

                 {/* List of Manual Gateways */}
                 <div className="space-y-3">
                   {manualGateways.length === 0 ? (
                     <div className="text-xs text-slate-500 italic py-2">No manual gateways configured yet. Click Add Gateway above to create one.</div>
                   ) : (
                     manualGateways.map((gw: any) => (
                       <div key={gw.id} className="p-3 bg-slate-50 dark:bg-slate-850/60 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-2">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                             <span className="text-xs font-bold">{gw.name}</span>
                             <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium uppercase tracking-wider">
                               {gw.payment_type}
                             </span>
                           </div>

                           <div className="flex items-center gap-3">
                             {/* Is Active Toggle */}
                             <button
                               type="button"
                               onClick={() => handleToggleGatewayActive(gw)}
                               className={`w-8 h-4.5 rounded-full transition-all relative ${gw.is_active === 1 || gw.is_active === true ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                             >
                               <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${gw.is_active === 1 || gw.is_active === true ? 'left-4' : 'left-0.5'}`}></div>
                             </button>

                             {/* Actions */}
                             <button
                               type="button"
                               onClick={() => {
                                 setEditingGatewayId(gw.id);
                                 setIsAddingGateway(false);
                                 setNewGateway({
                                   name: gw.name || '',
                                   payment_type: gw.payment_type || 'personal',
                                   account_number: gw.account_number || '',
                                   qr_code_url: gw.qr_code_url || '',
                                   min_amount: String(gw.min_amount || '10'),
                                   max_amount: String(gw.max_amount || '25000'),
                                   is_active: gw.is_active === 1 || gw.is_active === true
                                 });
                               }}
                               className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-all"
                             >
                               Edit
                             </button>
                             <button
                               type="button"
                               onClick={() => handleDeleteGateway(gw.id)}
                               className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-all"
                             >
                               Delete
                             </button>
                           </div>
                         </div>

                         {/* Details Grid */}
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-500 border-t border-slate-100 dark:border-slate-800/40 pt-2">
                           <div>
                             <span className="block text-slate-400">Account_number</span>
                             <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{gw.account_number}</span>
                           </div>
                           <div>
                             <span className="block text-slate-400">Min Amount</span>
                             <span className="font-semibold text-slate-700 dark:text-slate-300">{gw.min_amount} BDT</span>
                           </div>
                           <div>
                             <span className="block text-slate-400">Max Amount</span>
                             <span className="font-semibold text-slate-700 dark:text-slate-300">{gw.max_amount} BDT</span>
                           </div>
                           <div>
                             <span className="block text-slate-400">QR Code</span>
                             <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block max-w-full">
                               {gw.qr_code_url ? 'Configured ✅' : 'None'}
                             </span>
                           </div>
                         </div>
                       </div>
                     ))
                   )}
                 </div>

                 {/* Add/Edit Form Panel */}
                 {(isAddingGateway || editingGatewayId !== null) && (
                   <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                     <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                       {editingGatewayId !== null ? 'Edit Manual Gateway' : 'Add New Manual Gateway'}
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                       {/* Name */}
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Gateway Name</label>
                         <input
                           type="text"
                           value={newGateway.name}
                           onChange={(e) => setNewGateway({ ...newGateway, name: e.target.value })}
                           className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs focus:ring-1 focus:ring-indigo-600 outline-none animate-none"
                           placeholder="e.g. bKash, Nagad, Rocket..."
                         />
                       </div>

                       {/* Payment Type */}
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Account Type</label>
                         <select
                           value={newGateway.payment_type}
                           onChange={(e) => setNewGateway({ ...newGateway, payment_type: e.target.value })}
                           className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs focus:ring-1 focus:ring-indigo-600 outline-none"
                         >
                           <option value="personal">Personal</option>
                           <option value="agent">Agent</option>
                         </select>
                       </div>

                       {/* Account Number */}
                       <div className="space-y-1 col-span-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Account Number (Account_number)</label>
                         <input
                           type="text"
                           value={newGateway.account_number}
                           onChange={(e) => setNewGateway({ ...newGateway, account_number: e.target.value })}
                           className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs font-mono focus:ring-1 focus:ring-indigo-600 outline-none"
                           placeholder="Enter account_number..."
                         />
                       </div>

                       {/* QR Code Optional */}
                       <div className="space-y-1 col-span-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">QR Code URL (Optional)</label>
                         <input
                           type="text"
                           value={newGateway.qr_code_url}
                           onChange={(e) => setNewGateway({ ...newGateway, qr_code_url: e.target.value })}
                           className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs focus:ring-1 focus:ring-indigo-600 outline-none"
                           placeholder="Paste optional QR Code Image URL..."
                         />
                       </div>
                        {/* Limits */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Minimum Amount (BDT)</label>
                          <input
                            type="number"
                            value={newGateway.min_amount}
                            onChange={(e) => setNewGateway({ ...newGateway, min_amount: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs focus:ring-1 focus:ring-indigo-600 outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Maximum Amount (BDT)</label>
                          <input
                            type="number"
                            value={newGateway.max_amount}
                            onChange={(e) => setNewGateway({ ...newGateway, max_amount: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs focus:ring-1 focus:ring-indigo-600 outline-none"
                          />
                        </div>
                      </div>
                      {/* Action buttons inside form */}
                     <div className="flex gap-2 justify-end pt-2">
                       <button
                         type="button"
                         onClick={() => {
                           setIsAddingGateway(false);
                           setEditingGatewayId(null);
                         }}
                         className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-all"
                       >
                         Cancel
                       </button>

                       <button
                         type="button"
                         onClick={() => {
                           if (editingGatewayId !== null) {
                             handleUpdateGateway(editingGatewayId);
                           } else {
                             handleAddGateway();
                           }
                         }}
                         disabled={saving}
                         className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50"
                       >
                         {saving ? 'Saving...' : 'Save Gateway'}
                       </button>
                     </div>
                   </div>
                 )}
               </div>
             )}
          </div>
        </div>

        {/* Add Provider */}
        <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-lg flex items-center justify-center">
              <Plus size={16} />
            </div>
            <h3 className="text-lg font-bold">Add New Provider</h3>
          </div>
          
          <form onSubmit={handleAddProvider} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Site Name"
                value={newProvider.name}
                onChange={(e) => setNewProvider({...newProvider, name: e.target.value})}
                className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
              />
              <input
                type="text"
                required
                placeholder="Site URL"
                value={newProvider.url}
                onChange={(e) => setNewProvider({...newProvider, url: e.target.value})}
                className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
              />
            </div>
            <input
              type="text"
              required
              placeholder="API Key"
              value={newProvider.api_key}
              onChange={(e) => setNewProvider({...newProvider, api_key: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-xs"
            />
            <button 
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-lg font-bold text-xs hover:opacity-90 transition-all disabled:opacity-50"
            >
              Connect Provider
            </button>
          </form>
        </div>
      </div>

      {/* Providers List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold">SMM Providers</h3>
          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500">{providers.length} Total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Provider Name</th>
                <th className="px-6 py-3">Endpoint URL</th>
                <th className="px-6 py-3">API Key Balance</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {providers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    {p.is_active ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px] font-bold uppercase">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[9px] font-bold uppercase">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold">{p.name}</td>
                  <td className="px-6 py-4 text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{p.url}</td>
                  <td className="px-6 py-4 text-[10px] text-slate-500 font-mono">
                    <div className="flex flex-col gap-1">
                      <span className="opacity-95">••••{(p.api_key || '').slice(-4)}</span>
                      <span className="text-[9px] font-extrabold px-2 py-0.5 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-emerald-400 rounded-md border border-indigo-100/35 dark:border-slate-700/50 w-fit">
                        {p.balance || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.is_active ? (
                        <button 
                          onClick={() => handleDeactivateProvider(p.id)}
                          className="px-3 py-1 bg-amber-600 text-white rounded-lg text-[10px] font-bold hover:bg-amber-700 transition-all"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleActivateProvider(p.id)}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all"
                        >
                          Activate
                        </button>
                      )}
                      <button 
                        onClick={() => handleDeleteProvider(p.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dashboard Custom Links Management */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mt-6">
        <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <LinkIcon size={18} className="text-indigo-600" />
            Control Center Links
          </h3>
          <button 
            onClick={() => setIsAddingLink(!isAddingLink)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-bold shadow-sm"
          >
            <Plus size={12} />
            {isAddingLink ? 'Close' : 'Add Link'}
          </button>
        </div>

        <div className="p-4 lg:p-6">
          <AnimatePresence>
            {isAddingLink && (
              <motion.div 
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                style={{ originY: 0 }}
                className="mb-6 p-4 lg:p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Link Title</label>
                    <input 
                      type="text" 
                      value={newLink.text}
                      onChange={(e) => setNewLink({ ...newLink, text: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs font-medium focus:ring-2 focus:ring-indigo-600 transition-all"
                      placeholder="e.g. Official WhatsApp"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Destination URL</label>
                    <input 
                      type="text" 
                      value={newLink.url}
                      onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs font-medium focus:ring-2 focus:ring-indigo-600 transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Icon Identifier (optional)</label>
                    <input 
                      type="text" 
                      value={newLink.icon}
                      onChange={(e) => setNewLink({ ...newLink, icon: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs font-medium focus:ring-2 focus:ring-indigo-600 transition-all"
                      placeholder="e.g. message-circle, send"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setIsAddingLink(false)}
                    className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAddLink}
                    disabled={saving || !newLink.text || !newLink.url}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md shadow-indigo-100 dark:shadow-none"
                  >
                    Save Link
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {customLinks.map(link => (
              <div key={link.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 group hover:border-indigo-200 transition-all">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                    <BrandLogo name={link.icon || 'website'} size={16} />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[11px] font-black truncate leading-tight">{link.text}</div>
                    <div className="text-[9px] text-slate-400 truncate max-w-[120px]">{link.url}</div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteLink(link.id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                  title="Remove Link"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {customLinks.length === 0 && !isAddingLink && (
              <div className="col-span-full py-12 text-center">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <LinkIcon size={32} />
                </div>
                <h4 className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-widest">No Custom Links</h4>
                <p className="text-[10px] text-slate-500">Add useful links for your users to see on their dashboard.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddFundsModal({ isOpen, onClose, token }: { isOpen: boolean, onClose: () => void, token: string }) {
  const [method, setMethod] = useState<'automatic' | 'manual' | null>(null);
  const [manualGateways, setManualGateways] = useState<any[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState({ deposit_auto_enabled: true, deposit_manual_enabled: true });
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const [settingsRes, gatewaysRes] = await Promise.all([
        fetch('/api/settings/deposit', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/manual-gateways', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      const settingsData = await settingsRes.json();
      const gatewaysData = gatewaysRes.ok ? await gatewaysRes.json() : [];
      setSettings(settingsData);
      setManualGateways(gatewaysData);
    } catch (e) {
      console.error("Failed to fetch deposit settings and gateways");
    } finally {
      setLoadingSettings(false);
    }
  };

  const getGatewayColorAndIcon = (gwName: string) => {
    const lower = gwName.toLowerCase();
    if (lower.includes('bkash')) {
      return { 
        color: '#E2136E', 
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Bkash_logo.svg',
        icon: <BrandLogo name="bkash" size={24} className="text-white" /> 
      };
    } else if (lower.includes('rocket')) {
      return { 
        color: '#8C3494', 
        logoUrl: 'https://www.logo.wine/a/logo/Rocket_(Dutch-Bangla_Bank)/Rocket_(Dutch-Bangla_Bank)-Logo.wine.svg',
        icon: <BrandLogo name="rocket" size={24} className="text-white" /> 
      };
    } else if (lower.includes('nagad')) {
      return { 
        color: '#F7941D', 
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8b/Nagad_logo.svg',
        icon: <BrandLogo name="nagad" size={24} className="text-white" /> 
      };
    } else if (lower.includes('bank')) {
      return { 
        color: '#006A4E', 
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Dutch_Bangla_Bank_Logo.svg/640px-Dutch_Bangla_Bank_Logo.svg.png',
        icon: <BrandLogo name="bank" size={24} className="text-white" /> 
      };
    }
    return { 
      color: '#4F46E5', 
      logoUrl: '',
      icon: <Wallet size={24} className="text-white" /> 
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAutoDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/deposits/auto', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const data = await res.json();
      if (data.success && data.payment_url) {
        window.open(data.payment_url, '_blank');
        setSuccess('Redirecting to payment gateway... After successful payment, your balance will be updated automatically.');
      } else {
        setError(data.error || 'Failed to initiate automatic deposit');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !transactionId || !selectedGateway) {
      setError('Please fill in all required fields');
      return;
    }

    const amtVal = parseFloat(amount);
    if (selectedGateway) {
      if (amtVal < selectedGateway.min_amount) {
        setError(`You must deposit at least ${selectedGateway.min_amount} BDT for this gateway.`);
        return;
      }
      if (amtVal > selectedGateway.max_amount) {
        setError(`Maximum deposit amount for this gateway is ${selectedGateway.max_amount} BDT.`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const methodNameWithDetails = `${selectedGateway.name} (${selectedGateway.payment_type})`;
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amtVal,
          method: methodNameWithDetails,
          transaction_id: transactionId,
          proof_url: screenshot
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deposit request submitted!');
        setSuccess('Deposit request submitted successfully! Admin will review it shortly.');
        setTimeout(() => {
          onClose();
          setMethod(null);
          setSelectedGateway(null);
          setAmount('');
          setTransactionId('');
          setScreenshot(null);
          setSuccess('');
        }, 3000);
      } else {
        toast.error(data.error || 'Failed to submit deposit');
        setError(data.error || 'Failed to submit deposit');
      }
    } catch (err) {
      toast.error('Network error');
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xl font-bold">Add Funds</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : !method ? (
            <div className="grid grid-cols-1 gap-4">
              {settings.deposit_auto_enabled && (
                <button 
                  onClick={() => setMethod('automatic')}
                  className="p-6 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-indigo-600 transition-all flex items-center gap-4 group"
                >
                  <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Play size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-lg">Automatic Deposit</div>
                    <div className="text-xs text-slate-500">{(settings as any).deposit_auto_details || 'Instant balance update via payment gateway'}</div>
                  </div>
                </button>
              )}
              {settings.deposit_manual_enabled && (
                <button 
                  onClick={() => setMethod('manual')}
                  className="p-6 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-indigo-600 transition-all flex items-center gap-4 group"
                >
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <Wallet size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-lg">Manual Deposit</div>
                    <div className="text-xs text-slate-500">Bkash, Rocket, Nagad or dynamic local gateways</div>
                  </div>
                </button>
              )}
              {!settings.deposit_auto_enabled && !settings.deposit_manual_enabled && (
                <div className="text-center py-12">
                  <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
                  <p className="text-sm font-bold text-slate-500">Deposits are currently disabled by the admin.</p>
                </div>
              )}
            </div>
          ) : method === 'automatic' ? (
            <div className="space-y-4">
              <button onClick={() => setMethod(null)} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline mb-2">
                <ChevronRight size={14} className="rotate-180" /> Back to options
              </button>
              
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-center">
                 <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                   <Globe className="text-indigo-600" size={32} />
                 </div>
                 <h4 className="text-lg font-bold mb-1">Instant Payment</h4>
                 <p className="text-xs text-indigo-600 font-medium mb-6">Payment will be verified instantly</p>
                 
                 <div className="space-y-4 text-left">
                   {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold border border-red-100">{error}</div>}
                   {success && <div className="p-3 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold border border-green-100">{success}</div>}
                   
                   <div>
                     <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest text-center">Enter Amount (৳)</label>
                     <input 
                       type="number"
                       value={amount}
                       onChange={(e) => setAmount(e.target.value)}
                       placeholder="e.g. 500"
                       className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 text-center text-xl font-black"
                     />
                   </div>
                   
                   <button 
                     onClick={handleAutoDeposit}
                     disabled={submitting}
                     className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {submitting ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                       <>
                         <Send size={18} />
                         Proceed to Pay
                       </>
                     )}
                   </button>
                 </div>
              </div>
            </div>
          ) : !selectedGateway ? (
            <div className="space-y-4">
              <button onClick={() => setMethod(null)} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline mb-2">
                <ChevronRight size={14} className="rotate-180" /> Back to options
              </button>
              <div className="grid grid-cols-2 gap-3.5">
                {manualGateways.map(gw => {
                  const style = getGatewayColorAndIcon(gw.name);
                  const lower = gw.name.toLowerCase();
                  const isMfsOrBank = lower.includes('bkash') || lower.includes('nagad') || lower.includes('rocket') || lower.includes('bank');

                  return (
                    <button 
                      key={gw.id}
                      onClick={() => {
                        setSelectedGateway(gw);
                        setError('');
                      }}
                      className="p-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-600 dark:hover:border-indigo-500 rounded-2xl hover:shadow-md hover:scale-[1.02] transition-all flex flex-col items-center gap-3 select-none group"
                    >
                      {isMfsOrBank ? (
                        <div className="w-20 h-14 bg-slate-50 dark:bg-slate-850 rounded-xl flex items-center justify-center p-2 border border-slate-100 dark:border-slate-800 shadow-sm relative group-hover:scale-105 transition-transform duration-200">
                          {lower.includes('bkash') ? (
                            <img 
                              src="https://upload.wikimedia.org/wikipedia/commons/8/8c/Bkash_logo.svg" 
                              alt="bKash" 
                              className="w-full h-full object-contain" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : lower.includes('nagad') ? (
                            <img 
                              src="https://upload.wikimedia.org/wikipedia/commons/8/8b/Nagad_logo.svg" 
                              alt="Nagad" 
                              className="w-full h-full object-contain scale-110" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : lower.includes('rocket') ? (
                            <img 
                              src="https://www.logo.wine/a/logo/Rocket_(Dutch-Bangla_Bank)/Rocket_(Dutch-Bangla_Bank)-Logo.wine.svg" 
                              alt="Rocket" 
                              className="w-full h-[150%] object-contain scale-125" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-emerald-600">
                              <Building size={22} className="opacity-90" />
                              <span className="text-[7px] font-black tracking-widest mt-0.5 select-none uppercase">DBBL BANK</span>
                            </div>
                          )}
                          {/* absolute transparent overlay for pristine render inside hover states */}
                          <div className="absolute inset-0 bg-transparent" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm" style={{ background: style.color }}>
                          {style.icon}
                        </div>
                      )}
                      
                      <div className="text-center">
                        <div className="text-xs font-black text-slate-800 dark:text-slate-100 tracking-tight">{gw.name}</div>
                        <span className="text-[8px] uppercase font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mt-1 inline-block border border-slate-200/40 dark:border-slate-700/40">{gw.payment_type}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button 
                onClick={() => {
                  setSelectedGateway(null);
                  setError('');
                }} 
                className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
              >
                <ChevronRight size={14} className="rotate-180" /> Change payment method
              </button>

              {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold border border-red-100">{error}</div>}
              {success && <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-xs font-bold border border-green-100">{success}</div>}

              <div className="bg-slate-100/50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5">
                {/* Beautiful horizontal brand card header */}
                <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-805 shadow-sm">
                  {selectedGateway.name.toLowerCase().includes('bkash') ? (
                    <div className="w-14 h-10 bg-slate-50 dark:bg-slate-850 rounded-lg flex items-center justify-center p-1 border border-slate-100 dark:border-slate-800 shrink-0 select-none">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/8c/Bkash_logo.svg" alt="bKash" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                  ) : selectedGateway.name.toLowerCase().includes('nagad') ? (
                    <div className="w-14 h-10 bg-slate-50 dark:bg-slate-850 rounded-lg flex items-center justify-center p-0.5 border border-slate-100 dark:border-slate-800 shrink-0 select-none">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/8b/Nagad_logo.svg" alt="Nagad" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                  ) : selectedGateway.name.toLowerCase().includes('rocket') ? (
                    <div className="w-14 h-10 bg-slate-50 dark:bg-slate-850 rounded-lg flex items-center justify-center p-0.5 border border-slate-100 dark:border-slate-800 overflow-hidden shrink-0 select-none">
                      <img src="https://www.logo.wine/a/logo/Rocket_(Dutch-Bangla_Bank)/Rocket_(Dutch-Bangla_Bank)-Logo.wine.svg" alt="Rocket" className="w-[125%] h-[125%] object-contain" referrerPolicy="no-referrer" />
                    </div>
                  ) : selectedGateway.name.toLowerCase().includes('bank') ? (
                    <div className="w-14 h-10 bg-emerald-50 dark:bg-emerald-950/25 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100/40 select-none">
                      <Building className="text-emerald-700 dark:text-emerald-500" size={20} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: getGatewayColorAndIcon(selectedGateway.name).color }}>
                      {getGatewayColorAndIcon(selectedGateway.name).icon}
                    </div>
                  )}
                  
                  <div className="text-left">
                    <div className="text-xs font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase">{selectedGateway.name}</div>
                    <div className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 mt-0.5 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full inline-block">{selectedGateway.payment_type} Secure Wallet</div>
                  </div>
                </div>
                
                {/* Step 1: Payment target coordinates */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">1</div>
                    <span>Payment Coordinates & instructions:</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="block text-slate-400 font-bold uppercase">Account_number</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold font-mono text-xs">{selectedGateway.account_number}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold uppercase">Category / Type</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold uppercase text-xs">{selectedGateway.payment_type}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold uppercase">Min Limit</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold text-xs">{selectedGateway.min_amount} BDT</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold uppercase">Max Limit</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold text-xs">{selectedGateway.max_amount} BDT</span>
                      </div>
                    </div>

                    {selectedGateway.qr_code_url && (
                      <div className="flex flex-col items-center justify-center border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2.5">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Scan QR Code to Pay</span>
                        <div className="p-1 px bg-white rounded-lg border border-slate-200 inline-block">
                          <img 
                            src={selectedGateway.qr_code_url} 
                            alt="QR Code" 
                            className="w-28 h-28 object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                    )}

                    <button 
                      type="button"
                      onClick={() => { 
                        navigator.clipboard.writeText(selectedGateway.account_number || ''); 
                        toast.success('Account number copied!');
                      }}
                      className="w-full mt-2 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-100 dark:border-slate-850"
                    >
                      <Copy size={12} />
                      Copy Account Number
                    </button>
                  </div>
                </div>

                {/* Step 2: Enter deposit coordinates & proof details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">2</div>
                    <span>Enter Amount & Transaction Details:</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Amount (৳)</label>
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={`Min: ${selectedGateway.min_amount} BDT`}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Transaction ID / Sender Number</label>
                      <input 
                        type="text" 
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        placeholder="Enter TrxID or sender number"
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
                      />
                    </div>
                  </div>
                </div>


              </div>

              <button 
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Make Payment'}
                <ChevronRight size={18} />
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AdminDeposits({ onUpdate, token }: { onUpdate: () => void, token: string }) {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    try {
      const res = await fetch('/api/admin/deposits', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setDeposits(data);
    } catch (error) {
      console.error("Failed to fetch deposits");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/admin/deposits/${id}/${action}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchDeposits();
        onUpdate();
      }
    } catch (error) {
      console.error(`Failed to ${action} deposit`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading deposits...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight">Manage Deposits</h2>
        <div className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold">
          {deposits.filter(d => d.status === 'pending').length} Pending
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {deposits.map((d) => (
            <div key={d.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold dark:text-white">{d.username}</div>
                  <div className="text-[10px] text-slate-500">{d.email}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  d.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  d.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {d.status}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-800/50">
                <div>
                  <div className="text-[8px] uppercase font-bold text-slate-400">Amount</div>
                  <div className="text-sm font-bold text-indigo-600">{formatPrice(d.amount)}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase font-bold text-slate-400">Method</div>
                  <div className="text-[10px] font-bold uppercase dark:text-slate-400">{d.method}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[8px] uppercase font-bold text-slate-400">Transaction Details</div>
                <div className="text-[10px] font-mono dark:text-slate-400">{d.transaction_id || 'No TrxID'}</div>
                {d.proof_url && (
                  <button 
                    onClick={() => {
                      const win = window.open();
                      win?.document.write(`<img src="${d.proof_url}" style="max-width:100%">`);
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1 mt-1"
                  >
                    <Eye size={12} /> View Proof Screenshot
                  </button>
                )}
              </div>
              {d.status === 'pending' && (
                <div className="flex items-center gap-2 pt-2">
                  <button 
                    onClick={() => handleAction(d.id, 'approve')}
                    disabled={processingId === d.id}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleAction(d.id, 'reject')}
                    disabled={processingId === d.id}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {deposits.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic text-xs">No deposit requests found.</div>
          )}
        </div>

        <div className="w-full overflow-x-auto hidden sm:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">TrxID / Proof</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">{d.username}</div>
                    <div className="text-[10px] text-slate-500">{d.email}</div>
                  </td>
                  <td className="px-6 py-4 font-bold text-indigo-600">{formatPrice(d.amount)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold uppercase">{d.method}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[10px] font-mono mb-1">{d.transaction_id}</div>
                    {d.proof_url && (
                      <button 
                        onClick={() => {
                          const win = window.open();
                          win?.document.write(`<img src="${d.proof_url}" style="max-width:100%">`);
                        }}
                        className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Eye size={12} /> View Proof
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      d.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      d.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {d.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleAction(d.id, 'approve')}
                          disabled={processingId === d.id}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleAction(d.id, 'reject')}
                          disabled={processingId === d.id}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {deposits.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No deposit requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Transactions({ token }: { token: string }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [token]);

  const filteredTransactions = React.useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) || 
                            t.id.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || t.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [transactions, search, filterType]);

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No transactions available to export");
      return;
    }

    const headers = [
      'Transaction ID',
      'Type',
      'Statement Details',
      'Amount Change ($)',
      'Execution Date',
      'Status'
    ];

    const rows = filteredTransactions.map(t => ({
      id: t.id,
      type: t.type,
      description: t.description,
      amount: t.amount,
      date: new Date(t.date).toLocaleString(),
      status: t.status
    }));

    const keys = [
      'id',
      'type',
      'description',
      'amount',
      'date',
      'status'
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => keys.map(key => {
        const val = (row as any)[key];
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredTransactions.length} transactions successfully!`);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-add sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight dark:text-white flex items-center gap-2">
            <CreditCard className="text-indigo-600" size={18} />
            Financial Transactions & Ledgers
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Complete history of balance updates, orders, and fund deposits.</p>
        </div>
        <div className="flex items-center gap-2 select-none">
          <button 
            type="button"
            id="export-transactions-csv-btn"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 rounded-lg border border-indigo-100/30"
            title="Export Statement records to a CSV file"
          >
            <Download size={12} />
            Export CSV
          </button>

          <button 
            onClick={fetchTransactions}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50 rounded-lg border border-indigo-100/30"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh Registry
          </button>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <Wallet size={16} />
          </div>
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Deposited</div>
            <div className="text-sm font-black tracking-tight text-emerald-600">
              {formatPrice(transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0))}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950/20 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
            <ShoppingCart size={16} />
          </div>
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">SMM Order Spend</div>
            <div className="text-sm font-black tracking-tight text-rose-600">
              {formatPrice(Math.abs(transactions.filter(t => t.type === 'order').reduce((acc, curr) => acc + curr.amount, 0)))}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <RefreshCw size={16} />
          </div>
          <div>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Refunded</div>
            <div className="text-sm font-black tracking-tight text-blue-600">
              {formatPrice(transactions.filter(t => t.type === 'refund').reduce((acc, curr) => acc + curr.amount, 0))}
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'All Transactions' },
              { id: 'deposit', label: 'Deposits' },
              { id: 'order', label: 'Orders' },
              { id: 'refund', label: 'Refunds' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                  filterType === type.id 
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
            <input 
              type="text"
              placeholder="Search statements..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all font-medium w-full md:w-56 max-w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading history...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-950/20 text-[9px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-3.5">Reference ID / Type</th>
                  <th className="px-6 py-3.5">Statement Details</th>
                  <th className="px-6 py-3.5 text-right">Amount Change</th>
                  <th className="px-6 py-3.5">Execution Date</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300">
                {filteredTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-mono text-[9px] font-bold text-slate-400 uppercase">{t.id}</div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mt-1 ${
                        t.type === 'deposit' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                        t.type === 'refund' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-bold max-w-sm truncate text-slate-900 dark:text-white" title={t.description}>{t.description}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Automated System ledger record</div>
                    </td>
                    <td className={`px-6 py-3.5 text-right font-black text-[13px] select-all ${
                      t.amount > 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}>
                      {t.amount > 0 ? '+' : ''}{formatPrice(t.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-slate-400 font-mono text-[10px]">
                      {new Date(t.date).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                        t.status === 'approved' || t.status === 'completed' || t.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        t.status === 'pending' || t.status === 'awaiting_admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No ledger records found or search result empty.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoRenewals({ token, services, onUpdate }: { token: string, services: Service[], onUpdate?: () => void }) {
  const [renewals, setRenewals] = useState<AutoRenewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [search, setSearch] = useState('');
  
  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [targetLink, setTargetLink] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRenewals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auto-renewals', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRenewals(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load auto-renewal schedules');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRenewals();
  }, [fetchRenewals]);

  const handleToggle = async (ar: AutoRenewal) => {
    const updatingToast = toast.loading('Updating schedule status...');
    try {
      const isNowActive = ar.is_active === 1 ? 0 : 1;
      const res = await fetch('/api/auto-renewals/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          service_id: ar.service_id,
          link: ar.link,
          quantity: ar.quantity,
          is_active: isNowActive === 1
        })
      });

      if (res.ok) {
        toast.success(isNowActive === 1 ? 'Auto-renewal schedule enabled' : 'Auto-renewal schedule paused', { id: updatingToast });
        fetchRenewals();
        if (onUpdate) onUpdate();
      } else {
        toast.error('Failed to update schedule status', { id: updatingToast });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error connecting to server', { id: updatingToast });
    }
  };

  const handleRemove = async (id: number) => {
    if (!window.confirm('Are you sure you want to completely delete this auto-renewal schedule?')) return;
    const deleteToast = toast.loading('Deleting auto-renewal schedule...');
    try {
      const res = await fetch(`/api/auto-renewals/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Auto-renewal schedule removed successfully', { id: deleteToast });
        fetchRenewals();
        if (onUpdate) onUpdate();
      } else {
        toast.error('Failed to delete schedule', { id: deleteToast });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error connecting to server', { id: deleteToast });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) {
      toast.error('Please select an SMM Service');
      return;
    }
    if (!targetLink) {
      toast.error('Please enter targeted link address');
      return;
    }
    const targetService = services.find(s => String(s.service) === String(selectedServiceId));
    const qtyVal = Number(quantity);
    if (!quantity || isNaN(qtyVal) || qtyVal <= 0) {
      toast.error('Please enter a valid order quantity');
      return;
    }

    if (targetService) {
      const minVal = Number(targetService.min);
      const maxVal = Number(targetService.max);
      if (qtyVal < minVal || qtyVal > maxVal) {
        toast.error(`Quantity must be between ${minVal} and ${maxVal} for this service.`);
        return;
      }
    }

    setSubmitting(true);
    const createToast = toast.loading('Configuring recurring order schedule...');
    try {
      const res = await fetch('/api/auto-renewals/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          service_id: selectedServiceId,
          link: targetLink,
          quantity: qtyVal,
          is_active: true
        })
      });

      if (res.ok) {
        toast.success('Auto-renewal scheduled successfully!', { id: createToast });
        setIsCreating(false);
        setSelectedServiceId('');
        setTargetLink('');
        setQuantity('');
        fetchRenewals();
        if (onUpdate) onUpdate();
      } else {
        toast.error('Failed to configure auto-renewal schedule', { id: createToast });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error connecting to server', { id: createToast });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedServiceDetails = services.find(s => String(s.service) === String(selectedServiceId));

  const filteredRenewals = React.useMemo(() => {
    return renewals.filter(ar => {
      const matchedSvc = services.find(s => String(s.service) === String(ar.service_id));
      const svcName = matchedSvc ? matchedSvc.name.toLowerCase() : '';
      const svcCat = matchedSvc ? matchedSvc.category.toLowerCase() : '';
      
      const matchesSearch = svcName.includes(search.toLowerCase()) || 
                            svcCat.includes(search.toLowerCase()) || 
                            ar.link.toLowerCase().includes(search.toLowerCase()) ||
                            String(ar.service_id).includes(search);
      
      const matchesFilter = filter === 'all' || 
                            (filter === 'active' && ar.is_active === 1) || 
                            (filter === 'paused' && ar.is_active === 0);
      
      return matchesSearch && matchesFilter;
    });
  }, [renewals, services, search, filter]);

  const activeCount = renewals.filter(ar => ar.is_active === 1).length;
  const pausedCount = renewals.filter(ar => ar.is_active === 0).length;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight dark:text-white flex items-center gap-2">
            <RefreshCw className="text-indigo-600" size={18} />
            Automated Auto-Renewals Hub
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
            Configure automated daily orders for consistently high social media presence.
          </p>
        </div>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md self-start sm:self-center"
        >
          <Plus size={14} />
          {isCreating ? 'View Configurations' : 'Configure Auto-Renewal'}
        </button>
      </div>

      {isCreating ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 p-5 lg:p-7 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 max-w-xl mx-auto"
        >
          <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <h3 className="text-sm font-black uppercase tracking-tight dark:text-white">Configure New Auto-Renewal</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Schedules operate on a 24h recurrence loop automatically.</p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Select SMM Service</label>
              <select
                required
                value={selectedServiceId}
                onChange={(e) => {
                  setSelectedServiceId(e.target.value);
                  const s = services.find(s => String(s.service) === String(e.target.value));
                  if (s) setQuantity(s.min);
                }}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="">-- Choose an active service --</option>
                {services.map(s => (
                  <option key={s.service} value={s.service}>
                    [{s.category}] - {s.name} ({formatPrice(s.rate)} per 1K)
                  </option>
                ))}
              </select>
            </div>

            {selectedServiceDetails && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/30 rounded-lg space-y-1 text-xs"
              >
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400">
                  <span>Selected Service Stats</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono">ID: #{selectedServiceDetails.service}</span>
                </div>
                <div className="font-extrabold text-slate-900 dark:text-white">{selectedServiceDetails.name}</div>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[10px]">
                  <div>
                    <span className="text-slate-400">Min Order Limit:</span> <strong className="text-slate-700 dark:text-slate-300">{selectedServiceDetails.min}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Max Order Limit:</span> <strong className="text-slate-700 dark:text-slate-300">{selectedServiceDetails.max}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Cost/Rate:</span> <strong className="text-slate-700 dark:text-slate-300">{formatPrice(selectedServiceDetails.rate)} (1K)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Dripfeed Allowed:</span> <strong className="text-emerald-500 font-bold uppercase">Yes</strong>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Link (Username, URL, video ID)</label>
              <input 
                type="text"
                required
                placeholder="e.g., https://instagram.com/p/your_post_link"
                value={targetLink}
                onChange={(e) => setTargetLink(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Quantity</label>
              <input 
                type="number"
                required
                min={selectedServiceDetails ? Number(selectedServiceDetails.min) : 1}
                max={selectedServiceDetails ? Number(selectedServiceDetails.max) : 1000000}
                placeholder={selectedServiceDetails ? `e.g. Min ${selectedServiceDetails.min}` : 'Enter volume amount'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                  <>
                    <RefreshCw size={12} />
                    Schedule Auto-Renewal
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 animate-fade-in">
              <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                <RefreshCw size={16} />
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Schedules</div>
                <div className="text-sm font-black tracking-tight text-indigo-600 dark:text-indigo-400">
                  {renewals.length} configured
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Runs</div>
                <div className="text-sm font-black tracking-tight text-emerald-600">
                  {activeCount} active
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg flex items-center justify-center shrink-0 animate-fade-in">
                <Clock size={16} />
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Paused Schedules</div>
                <div className="text-sm font-black tracking-tight text-slate-500">
                  {pausedCount} paused
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All Schedules' },
                  { id: 'active', label: 'Active Only' },
                  { id: 'paused', label: 'Paused Only' }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setFilter(type.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      filter === type.id 
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/10'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                <input 
                  type="text"
                  placeholder="Search schedules..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border bg-transparent border-slate-150 dark:border-slate-800 border-none rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all font-medium w-full md:w-56 max-w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading schedules...</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-950/20 text-[9px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800 animate-fade-in">
                      <th className="px-6 py-3.5">Schedule ID / Service</th>
                      <th className="px-6 py-3.5 font-mono">Target Link</th>
                      <th className="px-6 py-3.5 text-right font-mono">Quantity</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Last Renewal Executed</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300">
                    {filteredRenewals.map(ar => {
                      const s = services.find(svc => String(svc.service) === String(ar.service_id));
                      const rateNum = s ? parseFloat(s.rate) : 0;
                      const estimatedCost = (ar.quantity / 1000) * rateNum;
                      
                      return (
                        <tr key={ar.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors animate-fade-in">
                          <td className="px-6 py-3.5">
                            <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-1.5 align-middle">
                              #{ar.id}
                            </span>
                            <div className="inline-block align-middle">
                              <div className="font-bold text-slate-900 dark:text-white max-w-xs truncate" title={s ? s.name : `SMM Service #${ar.service_id}`}>
                                {s ? s.name : `SMM Service #${ar.service_id}`}
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider font-bold">
                                {s ? s.category : 'SMM Service Category'}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[11px] select-all max-w-xs truncate" title={ar.link}>
                            <a 
                              href={ar.link.startsWith('http') ? ar.link : `https://${ar.link}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 inline-flex"
                            >
                              {ar.link}
                              <ExternalLink size={10} />
                            </a>
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono">
                            <div className="font-black text-slate-900 dark:text-white select-all">{formatNumber(ar.quantity)}</div>
                            <div className="text-[9px] text-slate-400 font-medium">Est. {formatPrice(estimatedCost)} per day</div>
                          </td>
                          <td className="px-6 py-3.5 select-none text-[10px]">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                              ar.is_active === 1 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ar.is_active === 1 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                              {ar.is_active === 1 ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-slate-400 font-mono text-[10px]">
                            {!ar.last_renewal || ar.last_renewal.startsWith('0000') ? (
                              <span className="text-[9px] bg-indigo-50 dark:bg-indigo-900/15 px-2 py-0.5 rounded text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">Awaiting Run</span>
                            ) : (
                              new Date(ar.last_renewal).toLocaleString()
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right select-none">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggle(ar)}
                                className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all ${
                                  ar.is_active === 1
                                    ? 'bg-amber-50 dark:bg-amber-950/10 text-amber-600 hover:bg-amber-600 hover:text-white border-amber-100/30 hover:border-transparent'
                                    : 'bg-emerald-50 dark:bg-emerald-950/10 text-emerald-600 hover:bg-emerald-600 hover:text-white border-emerald-100/30 hover:border-transparent'
                                }`}
                                title={ar.is_active === 1 ? 'Pause automated orders' : 'Resume automated orders'}
                              >
                                {ar.is_active === 1 ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                onClick={() => handleRemove(ar.id)}
                                className="p-1.5 text-slate-450 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/35 rounded-lg border border-transparent hover:border-red-100/30 transition-all"
                                title="Completely remove auto-renewal configuration"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRenewals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 items-center">
                          <Activity className="mx-auto text-slate-400/30 mb-3" size={32} />
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No auto-renewal configurations found</p>
                          <p className="text-[10px] text-slate-500 leading-normal max-w-md mx-auto mt-1">Configure your first automated recurring loop using the top-right button.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
