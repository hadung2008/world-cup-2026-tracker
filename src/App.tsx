import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Trophy, Save, Edit3, Users, Shuffle, ChevronLeft, ChevronRight, Home, Newspaper, Search, Filter, Sun, Moon, AlertTriangle, X, ArrowLeftRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initialTeams, initialMatches } from './data';
import { Match, Team, TeamStats, GroupAssignmentHistory, MatchAssignment } from './types';
import {
  supabaseEnabled,
  loadSnapshot,
  saveSnapshot,
  clearSnapshot,
  subscribeSnapshot,
  type AppSnapshot,
} from './supabase';

// Professional Colors
const COLORS = {
  primary: '#8A1538', // Qatar/FIFA Wine
  secondary: '#1C3C94', // Blue
  accent: '#EEAD19', // Gold
  bg: '#F8F9FA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#6C757D'
};

// Thứ tự các vòng knockout (dùng cho logic mở khoá tuần tự)
const KNOCKOUT_STAGES = [
  'Vòng 1/16',
  'Vòng 1/8',
  'Tứ kết',
  'Bán kết',
  'Tranh hạng 3',
  'Chung kết'
] as const;
type KnockoutStage = typeof KNOCKOUT_STAGES[number];

// Stage điều kiện tiên quyết để một vòng knockout được mở khoá.
// null = phụ thuộc vào việc vòng bảng đã finished hay chưa.
const KNOCKOUT_PREREQ: Record<KnockoutStage, KnockoutStage | null> = {
  'Vòng 1/16': null,
  'Vòng 1/8': 'Vòng 1/16',
  'Tứ kết': 'Vòng 1/8',
  'Bán kết': 'Tứ kết',
  'Tranh hạng 3': 'Bán kết',
  'Chung kết': 'Bán kết',
};

function shuffleAndSplit(players: string[]): MatchAssignment {
  const shuffled = [...players].sort(() => 0.5 - Math.random());
  const mid = Math.ceil(shuffled.length / 2);
  return {
    side1: shuffled.slice(0, mid),
    side2: shuffled.slice(mid),
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'players'>('matches');
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams] = useState<Team[]>(initialTeams);
  const [selectedGroup, setSelectedGroup] = useState<string>('A');
  const [matchView, setMatchView] = useState<'by_date' | 'by_group' | 'knockout'>('by_group');
  const [selectedKnockoutStage, setSelectedKnockoutStage] = useState<KnockoutStage>('Vòng 1/16');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [playersInput, setPlayersInput] = useState<string>('');
  const [players, setPlayers] = useState<string[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<Record<string, { group1: string[], group2: string[] }>>({});
  const [matchAssignments, setMatchAssignments] = useState<Record<string, MatchAssignment>>({});
  const [assignmentMode, setAssignmentMode] = useState<'by_group' | 'by_match'>(() => {
    const v = localStorage.getItem('wc2026_assignment_mode');
    return v === 'by_match' ? 'by_match' : 'by_group';
  });
  const [penalties, setPenalties] = useState({ win: 0, draw: 0, loss: 0 });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('wc2026_theme') === 'dark';
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const [assignmentHistories, setAssignmentHistories] = useState<GroupAssignmentHistory[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newSaveName, setNewSaveName] = useState('');
  const [showGroupBreakdown, setShowGroupBreakdown] = useState(false);

  // ---- Cloud sync (Supabase) ----
  const lastSnapshotRef = useRef<string>('');
  const cloudReadyRef = useRef<boolean>(false);
  const [cloudStatus, setCloudStatus] = useState<'off' | 'syncing' | 'synced' | 'error'>(
    supabaseEnabled ? 'syncing' : 'off'
  );

  const applyCloudSnapshot = (cloud: AppSnapshot) => {
    if (cloud.matches) {
      const merged = initialMatches.map(im => {
        const found = cloud.matches.find(p => p.id === im.id);
        return found ? { ...im, score1: found.score1, score2: found.score2, status: found.status } : im;
      });
      setMatches(merged);
    }
    if (Array.isArray(cloud.players)) {
      setPlayers(cloud.players);
      setPlayersInput(cloud.players.join('\n'));
    }
    if (cloud.groupAssignments) setGroupAssignments(cloud.groupAssignments);
    setMatchAssignments(cloud.matchAssignments ?? {});
    if (cloud.penalties) setPenalties(cloud.penalties);
    if (Array.isArray(cloud.assignmentHistories)) setAssignmentHistories(cloud.assignmentHistories);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('wc2026_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('wc2026_theme', 'light');
    }
  }, [isDarkMode]);
  
  // Load from local storage
  useEffect(() => {
    const savedMatches = localStorage.getItem('wc2026_matches');
    if (savedMatches) {
      const parsed = JSON.parse(savedMatches);
      const merged = initialMatches.map(im => {
        const found = parsed.find((p: Match) => p.id === im.id);
        if (found) {
          return { ...im, score1: found.score1, score2: found.score2, status: found.status };
        }
        return im;
      });
      setMatches(merged);
    } else {
      setMatches(initialMatches);
    }

    const savedPlayers = localStorage.getItem('wc2026_players');
    if (savedPlayers) {
      const parsedPlayers = JSON.parse(savedPlayers);
      setPlayers(parsedPlayers);
      setPlayersInput(parsedPlayers.join('\n'));
    }

    const savedAssignments = localStorage.getItem('wc2026_group_assignments');
    if (savedAssignments) {
      setGroupAssignments(JSON.parse(savedAssignments));
    }

    const savedMatchAssignments = localStorage.getItem('wc2026_match_assignments');
    if (savedMatchAssignments) {
      setMatchAssignments(JSON.parse(savedMatchAssignments));
    }

    const savedHistories = localStorage.getItem('wc2026_assignment_histories');
    if (savedHistories) {
      setAssignmentHistories(JSON.parse(savedHistories));
    }

    const savedPenalties = localStorage.getItem('wc2026_penalties');
    if (savedPenalties) {
      setPenalties(JSON.parse(savedPenalties));
    }
    
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('wc2026_penalties', JSON.stringify(penalties));
  }, [penalties, isLoaded]);

  // Save when matches change
  useEffect(() => {
    if (!isLoaded) return;
    if (matches.length > 0) {
      localStorage.setItem('wc2026_matches', JSON.stringify(matches));
    }
  }, [matches, isLoaded]);

  const handleResetData = () => {
    setShowResetModal(true);
  };

  const performReset = () => {
    setResetting(true);
    localStorage.removeItem('wc2026_matches');
    localStorage.removeItem('wc2026_group_assignments');
    localStorage.removeItem('wc2026_match_assignments');
    // Giữ lại danh sách tên người chơi (wc2026_players)
    if (supabaseEnabled) {
      clearSnapshot().finally(() => window.location.reload());
    } else {
      window.location.reload();
    }
  };

  // Save when players or assignments change
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('wc2026_players', JSON.stringify(players));
    localStorage.setItem('wc2026_group_assignments', JSON.stringify(groupAssignments));
    localStorage.setItem('wc2026_match_assignments', JSON.stringify(matchAssignments));
    localStorage.setItem('wc2026_assignment_mode', assignmentMode);
  }, [players, groupAssignments, matchAssignments, assignmentMode, isLoaded]);

  // Lấy assignment hiệu lực cho 1 trận: ưu tiên matchAssignments (per-match), fallback groupAssignments (per-group).
  const getMatchAssignment = (match: Match): { group1: string[]; group2: string[] } => {
    const m = matchAssignments[match.id];
    if (m) return { group1: m.side1, group2: m.side2 };
    const g = groupAssignments[match.group];
    if (g) return g;
    return { group1: [], group2: [] };
  };

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('wc2026_assignment_histories', JSON.stringify(assignmentHistories));
  }, [assignmentHistories, isLoaded]);

  // ---- Cloud: load on first ready, then subscribe to realtime ----
  useEffect(() => {
    if (!isLoaded || !supabaseEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const cloud = await loadSnapshot();
        if (cancelled) return;
        if (cloud) {
          applyCloudSnapshot(cloud);
          lastSnapshotRef.current = JSON.stringify(cloud);
        }
        cloudReadyRef.current = true;
        setCloudStatus('synced');
      } catch (e) {
        console.warn('[cloud] initial load failed', e);
        cloudReadyRef.current = true;
        setCloudStatus('error');
      }
    })();
    const unsub = subscribeSnapshot((cloud) => {
      const json = JSON.stringify(cloud);
      if (json === lastSnapshotRef.current) return;
      lastSnapshotRef.current = json;
      applyCloudSnapshot(cloud);
      setCloudStatus('synced');
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // ---- Cloud: debounced save whenever state changes ----
  useEffect(() => {
    if (!isLoaded || !supabaseEnabled || !cloudReadyRef.current) return;
    const snapshot: AppSnapshot = {
      matches: matches.map(m => ({ id: m.id, score1: m.score1, score2: m.score2, status: m.status })),
      players,
      groupAssignments,
      matchAssignments,
      penalties,
      assignmentHistories,
    };
    const json = JSON.stringify(snapshot);
    if (json === lastSnapshotRef.current) return;
    setCloudStatus('syncing');
    const t = setTimeout(async () => {
      try {
        await saveSnapshot(snapshot);
        lastSnapshotRef.current = json;
        setCloudStatus('synced');
      } catch (e) {
        console.warn('[cloud] save failed', e);
        setCloudStatus('error');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [matches, players, groupAssignments, matchAssignments, penalties, assignmentHistories, isLoaded]);

  const handleRandomizeAssignments = () => {
    const playerList = playersInput.split('\n').map(p => p.trim()).filter(p => p !== '');
    if (playerList.length === 0) {
      setPlayers([]);
      setGroupAssignments({});
      setMatchAssignments({});
      return;
    }
    setNewSaveName(`Lần chia ${assignmentMode === 'by_match' ? 'theo trận' : 'theo bảng'} ${assignmentHistories.length + 1}`);
    setShowSaveModal(true);
  };

  const confirmRandomize = () => {
    const playerList = playersInput.split('\n').map(p => p.trim()).filter(p => p !== '');
    setPlayers(playerList);
    
    if (playerList.length === 0) {
      setGroupAssignments({});
      setMatchAssignments({});
      setShowSaveModal(false);
      return;
    }

    const localGroupsList = Array.from(new Set(teams.map(t => t.group))).sort() as string[];
    const newAssignments: Record<string, { group1: string[], group2: string[] }> = {};
    const newMatchAssignments: Record<string, MatchAssignment> = {};

    if (assignmentMode === 'by_match') {
      // Mỗi trận có 1 cách chia riêng — áp dụng cho cả vòng bảng lẫn vòng knockout.
      matches.forEach(m => {
        newMatchAssignments[m.id] = shuffleAndSplit(playerList);
      });
    } else {
      // Mỗi bảng có 1 cách chia, áp dụng cho cả 3 trận.
      localGroupsList.forEach(group => {
        const split = shuffleAndSplit(playerList);
        newAssignments[group] = {
          group1: split.side1,
          group2: split.side2,
        };
      });
    }

    setGroupAssignments(newAssignments);
    // Bắt đầu chu kỳ mới: matchAssignments được tái khởi tạo (chứa per-match nếu mode by_match, ngược lại rỗng)
    setMatchAssignments(newMatchAssignments);
    setAssignmentHistories([...assignmentHistories, {
        id: Date.now().toString(),
        name: newSaveName,
        players: playerList,
        assignments: newAssignments,
        matchAssignments: newMatchAssignments,
        timestamp: Date.now()
    }]);
    setShowSaveModal(false);
  };

  // --- Knockout randomize helpers ---
  const isStageCompleted = (stageName: string) => {
    const stageMatches = matches.filter(m => m.group === stageName);
    return stageMatches.length > 0 && stageMatches.every(m => m.status === 'finished');
  };

  const isStageAssigned = (stageName: string) => {
    return matches.some(m => m.group === stageName && matchAssignments[m.id]);
  };

  const isStageUnlocked = (stage: KnockoutStage) => {
    const prereq = KNOCKOUT_PREREQ[stage];
    if (prereq === null) {
      // Vòng 1/16 cần toàn bộ vòng bảng đã finished
      const groupsList = Array.from(new Set(teams.map(t => t.group))) as string[];
      return groupsList.every(g => isStageCompleted(g));
    }
    return isStageCompleted(prereq);
  };

  const getNextKnockoutStage = (): KnockoutStage | null => {
    for (const stage of KNOCKOUT_STAGES) {
      if (!isStageAssigned(stage) && isStageUnlocked(stage)) return stage;
    }
    return null;
  };

  const handleRandomizeKnockoutStage = (stage: KnockoutStage) => {
    if (players.length === 0) return;
    const stageMatches = matches.filter(m => m.group === stage);
    if (stageMatches.length === 0) return;

    const updates: Record<string, MatchAssignment> = {};
    stageMatches.forEach(m => {
      updates[m.id] = shuffleAndSplit(players);
    });
    const merged = { ...matchAssignments, ...updates };
    setMatchAssignments(merged);

    // Cập nhật vào record history mới nhất (hoặc tạo mới nếu chưa có)
    setAssignmentHistories(prev => {
      if (prev.length === 0) {
        return [{
          id: Date.now().toString(),
          name: `Lần chia ${1}`,
          players: [...players],
          assignments: groupAssignments,
          matchAssignments: merged,
          timestamp: Date.now()
        }];
      }
      const last = prev[prev.length - 1];
      const updated: GroupAssignmentHistory = {
        ...last,
        matchAssignments: { ...(last.matchAssignments ?? {}), ...updates },
      };
      return [...prev.slice(0, -1), updated];
    });
  };

  const handleScoreChange = (matchId: string, team1Score: string, team2Score: string) => {
    setMatches(matches.map(m => {
      if (m.id === matchId) {
        const s1 = team1Score === '' ? null : parseInt(team1Score);
        const s2 = team2Score === '' ? null : parseInt(team2Score);
        const status = (s1 !== null && s2 !== null) ? 'finished' : 'pending';
        return { ...m, score1: s1, score2: s2, status };
      }
      return m;
    }));
  };

  const handleKnockoutTeamPick = (matchId: string, side: 'team1' | 'team2', teamId: string) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m;
      if (side === 'team1') return { ...m, team1Id: teamId || null };
      return { ...m, team2Id: teamId || null };
    }));
  };

  const handleMovePlayerBetweenGroups = (group: string, player: string, from: 'group1' | 'group2') => {
    setGroupAssignments(prev => {
      const data = prev[group];
      if (!data) return prev;
      const to = from === 'group1' ? 'group2' : 'group1';
      return {
        ...prev,
        [group]: {
          ...data,
          [from]: data[from].filter(p => p !== player),
          [to]: [...data[to], player],
        },
      };
    });
  };

  const getTeamName = (id: string | null, placeholder?: string, includeFlag = true) => {
    if (!id) return placeholder || 'Chưa xác định';
    const team = teams.find(t => t.id === id);
    return team ? `${includeFlag ? team.flag + ' ' : ''}${team.name}` : id;
  };

  const getGroupColor = (group: string) => {
    const colors: Record<string, { bg: string, text: string, border: string, from: string, to: string, icon: string, ring: string }> = {
      'A': { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-500/20', from: 'from-red-500', to: 'to-red-600', icon: 'text-red-500', ring: 'focus:ring-red-500/20' },
      'B': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-500/20', from: 'from-blue-500', to: 'to-blue-600', icon: 'text-blue-500', ring: 'focus:ring-blue-500/20' },
      'C': { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20', from: 'from-emerald-500', to: 'to-emerald-600', icon: 'text-emerald-500', ring: 'focus:ring-emerald-500/20' },
      'D': { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20', from: 'from-amber-500', to: 'to-amber-600', icon: 'text-amber-500', ring: 'focus:ring-amber-500/20' },
      'E': { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-500/20', from: 'from-violet-500', to: 'to-violet-600', icon: 'text-violet-500', ring: 'focus:ring-violet-500/20' },
      'F': { bg: 'bg-cyan-50 dark:bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-500/20', from: 'from-cyan-500', to: 'to-cyan-600', icon: 'text-cyan-500', ring: 'focus:ring-cyan-500/20' },
      'G': { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-500/20', from: 'from-orange-500', to: 'to-orange-600', icon: 'text-orange-500', ring: 'focus:ring-orange-500/20' },
      'H': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-200 dark:border-fuchsia-500/20', from: 'from-fuchsia-500', to: 'to-fuchsia-600', icon: 'text-fuchsia-500', ring: 'focus:ring-fuchsia-500/20' },
      'I': { bg: 'bg-lime-50 dark:bg-lime-500/10', text: 'text-lime-600 dark:text-lime-400', border: 'border-lime-200 dark:border-lime-500/20', from: 'from-lime-500', to: 'to-lime-600', icon: 'text-lime-500', ring: 'focus:ring-lime-500/20' },
      'J': { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-500/20', from: 'from-rose-500', to: 'to-rose-600', icon: 'text-rose-500', ring: 'focus:ring-rose-500/20' },
      'K': { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/20', from: 'from-indigo-500', to: 'to-indigo-600', icon: 'text-indigo-500', ring: 'focus:ring-indigo-500/20' },
      'L': { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-500/20', from: 'from-teal-500', to: 'to-teal-600', icon: 'text-teal-500', ring: 'focus:ring-teal-500/20' },
      'Vòng 1/16': { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-500/20', from: 'from-sky-500', to: 'to-sky-600', icon: 'text-sky-500', ring: 'focus:ring-sky-500/20' },
      'Vòng 1/8': { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/20', from: 'from-purple-500', to: 'to-purple-600', icon: 'text-purple-500', ring: 'focus:ring-purple-500/20' },
      'Tứ kết': { bg: 'bg-pink-50 dark:bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200 dark:border-pink-500/20', from: 'from-pink-500', to: 'to-pink-600', icon: 'text-pink-500', ring: 'focus:ring-pink-500/20' },
      'Bán kết': { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-500/20', from: 'from-orange-500', to: 'to-red-500', icon: 'text-orange-500', ring: 'focus:ring-orange-500/20' },
      'Tranh hạng 3': { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20', from: 'from-amber-600', to: 'to-yellow-700', icon: 'text-amber-600', ring: 'focus:ring-amber-500/20' },
      'Chung kết': { bg: 'bg-yellow-50 dark:bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-500/30', from: 'from-yellow-400', to: 'to-amber-600', icon: 'text-yellow-600', ring: 'focus:ring-yellow-500/20' },
    };
    
    if (colors[group]) return colors[group];
    return { bg: 'bg-[#8A1538]/10', text: 'text-[#8A1538] dark:text-[#D6284B]', border: 'border-[#8A1538]/20', from: 'from-[#8A1538]', to: 'to-[#D6284B]', icon: 'text-[#8A1538]', ring: 'focus:ring-[#8A1538]/10' };
  };

  const getTeamColor = (teamId: string | null) => {
    const defaultColor = { 
        bg: 'bg-slate-50 dark:bg-slate-800/20', 
        bgGradient: 'from-slate-100 to-white dark:from-[#2A2A2A] dark:to-[#1A1A1A]', 
        text: 'text-slate-900 dark:text-slate-100', 
        border: 'border-slate-200 dark:border-slate-800', 
        ring: 'focus:ring-slate-500/20 focus:border-slate-400',
        softText: 'text-slate-600 dark:text-slate-300'
    };
    if (!teamId) return defaultColor;

    const palettes = [
        { bg: 'bg-red-50 dark:bg-red-900/20', bgGradient: 'from-red-100 to-red-50 dark:from-red-900/30 dark:to-[#1A1A1A]', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800/50', ring: 'focus:border-red-500 focus:ring-red-500/20', softText: 'text-red-600 dark:text-red-400' },
        { bg: 'bg-blue-50 dark:bg-blue-900/20', bgGradient: 'from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-[#1A1A1A]', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800/50', ring: 'focus:border-blue-500 focus:ring-blue-500/20', softText: 'text-blue-600 dark:text-blue-400' },
        { bg: 'bg-emerald-50 dark:bg-emerald-900/20', bgGradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-[#1A1A1A]', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/50', ring: 'focus:border-emerald-500 focus:ring-emerald-500/20', softText: 'text-emerald-600 dark:text-emerald-400' },
        { bg: 'bg-amber-50 dark:bg-amber-900/20', bgGradient: 'from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-[#1A1A1A]', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/50', ring: 'focus:border-amber-500 focus:ring-amber-500/20', softText: 'text-amber-600 dark:text-amber-400' },
        { bg: 'bg-violet-50 dark:bg-violet-900/20', bgGradient: 'from-violet-100 to-violet-50 dark:from-violet-900/30 dark:to-[#1A1A1A]', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800/50', ring: 'focus:border-violet-500 focus:ring-violet-500/20', softText: 'text-violet-600 dark:text-violet-400' },
        { bg: 'bg-cyan-50 dark:bg-cyan-900/20', bgGradient: 'from-cyan-100 to-cyan-50 dark:from-cyan-900/30 dark:to-[#1A1A1A]', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800/50', ring: 'focus:border-cyan-500 focus:ring-cyan-500/20', softText: 'text-cyan-600 dark:text-cyan-400' },
        { bg: 'bg-orange-50 dark:bg-orange-900/20', bgGradient: 'from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-[#1A1A1A]', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800/50', ring: 'focus:border-orange-500 focus:ring-orange-500/20', softText: 'text-orange-600 dark:text-orange-400' },
        { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', bgGradient: 'from-fuchsia-100 to-fuchsia-50 dark:from-fuchsia-900/30 dark:to-[#1A1A1A]', text: 'text-fuchsia-700 dark:text-fuchsia-400', border: 'border-fuchsia-200 dark:border-fuchsia-800/50', ring: 'focus:border-fuchsia-500 focus:ring-fuchsia-500/20', softText: 'text-fuchsia-600 dark:text-fuchsia-400' },
        { bg: 'bg-lime-50 dark:bg-lime-900/20', bgGradient: 'from-lime-100 to-lime-50 dark:from-lime-900/30 dark:to-[#1A1A1A]', text: 'text-lime-700 dark:text-lime-400', border: 'border-lime-200 dark:border-lime-800/50', ring: 'focus:border-lime-500 focus:ring-lime-500/20', softText: 'text-lime-600 dark:text-lime-400' },
        { bg: 'bg-rose-50 dark:bg-rose-900/20', bgGradient: 'from-rose-100 to-rose-50 dark:from-rose-900/30 dark:to-[#1A1A1A]', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800/50', ring: 'focus:border-rose-500 focus:ring-rose-500/20', softText: 'text-rose-600 dark:text-rose-400' },
    ];

    let hash = 0;
    for (let i = 0; i < teamId.length; i++) {
        hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palettes[Math.abs(hash) % palettes.length];
  };

  const calculateStandings = (group: string): TeamStats[] => {
    const groupTeams = teams.filter(t => t.group === group);
    const statsMap: Record<string, TeamStats> = {};

    groupTeams.forEach((t) => {
      statsMap[t.id] = {
        teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
      };
    });

    const finishedGroupMatches = matches.filter(m => m.group === group && m.status === 'finished');

    finishedGroupMatches.forEach(m => {
      const t1 = statsMap[m.team1Id];
      const t2 = statsMap[m.team2Id];
      if (!t1 || !t2) return;

      const s1 = m.score1 || 0;
      const s2 = m.score2 || 0;

      t1.played++; t2.played++;
      t1.goalsFor += s1; t2.goalsFor += s2;
      t1.goalsAgainst += s2; t2.goalsAgainst += s1;

      if (s1 > s2) {
        t1.won++; t1.points += 3; t2.lost++;
      } else if (s1 < s2) {
        t2.won++; t2.points += 3; t1.lost++;
      } else {
        t1.drawn++; t2.drawn++;
        t1.points += 1; t2.points += 1;
      }
    });

    const statsList = Object.values(statsMap);
    statsList.forEach(s => s.goalDifference = s.goalsFor - s.goalsAgainst);

    // Xếp hạng: Điểm -> Hiệu số -> Số bàn thắng
    statsList.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    return statsList;
  };

  const groupsList: string[] = Array.from(new Set(teams.map(t => t.group))).sort() as string[];
  const knockoutStagesList = KNOCKOUT_STAGES as readonly string[] as string[];
  const allStages = [...groupsList, ...knockoutStagesList];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-slate-100 font-sans selection:bg-[#8A1538]/10 selection:text-[#8A1538]">
      {/* Premium Header */}
      <header className="bg-white/80 dark:bg-[#141414]/80 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8 lg:gap-12">
            <div
              className="flex items-center gap-3.5 cursor-pointer group select-none"
              onClick={() => setActiveTab('matches')}
            >
              <div className="relative">
                {/* Soft glow */}
                <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-[#8A1538] via-[#B91C4B] to-[#F59E0B] opacity-0 group-hover:opacity-40 blur-xl transition-opacity duration-500"></div>
                {/* Logo plaque */}
                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#A41A45] via-[#8A1538] to-[#5C0E25] p-[1.5px] shadow-[0_10px_30px_-8px_rgba(138,21,56,0.55)] group-hover:shadow-[0_14px_36px_-6px_rgba(138,21,56,0.7)] rotate-3 group-hover:rotate-0 transition-all duration-500">
                  <div className="relative w-full h-full rounded-[14px] bg-gradient-to-br from-[#8A1538] to-[#6B0F2A] flex items-center justify-center overflow-hidden">
                    {/* Subtle inner highlight */}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent"></div>
                    {/* Diagonal sheen on hover */}
                    <div className="absolute -inset-y-2 -left-10 w-8 bg-white/20 blur-md skew-x-[-20deg] -translate-x-full group-hover:translate-x-[140px] transition-transform duration-[900ms] ease-out"></div>
                    <Trophy className="relative w-6 h-6 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" strokeWidth={2.25} />
                  </div>
                </div>
                {/* Gold accent dot */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 ring-2 ring-white dark:ring-[#141414] shadow-md"></div>
              </div>
              <div className="leading-tight hidden sm:block">
                <div className="flex items-center gap-2">
                  <div className="font-display font-black text-[1.35rem] tracking-tight uppercase bg-gradient-to-br from-slate-900 via-slate-800 to-[#3a0a17] dark:from-white dark:via-slate-100 dark:to-rose-100 bg-clip-text text-transparent">
                    World Cup
                  </div>
                  <div className="font-display font-black text-[1.35rem] tracking-tight bg-gradient-to-br from-[#8A1538] via-[#B91C4B] to-amber-500 bg-clip-text text-transparent drop-shadow-sm">
                    2026
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="h-px w-4 bg-gradient-to-r from-transparent via-[#8A1538]/60 to-transparent"></span>
                  <span className="text-[9px] text-[#8A1538] dark:text-rose-300 uppercase font-black tracking-[0.32em]">Tournament Predictor</span>
                  <span className="h-px w-4 bg-gradient-to-r from-transparent via-[#8A1538]/60 to-transparent"></span>
                </div>
              </div>
            </div>
            
            <nav className="hidden md:flex items-center gap-1">
              {[
                { id: 'matches', label: 'Lịch thi đấu', icon: Calendar, activeIcon: 'text-[#8A1538]', idleIcon: 'text-rose-400/70 group-hover/nav:text-[#8A1538]', activeBg: 'bg-[#8A1538]/10 dark:bg-[#8A1538]/20' },
                { id: 'standings', label: 'Xếp hạng', icon: Trophy, activeIcon: 'text-amber-500', idleIcon: 'text-amber-400/70 group-hover/nav:text-amber-500', activeBg: 'bg-amber-500/10 dark:bg-amber-500/15' },
                { id: 'players', label: 'Người chơi', icon: Users, activeIcon: 'text-emerald-500', idleIcon: 'text-emerald-400/70 group-hover/nav:text-emerald-500', activeBg: 'bg-emerald-500/10 dark:bg-emerald-500/15' },
              ].map((item) => {
                const isActive = activeTab === item.id;
                
                return (
                  <button 
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`px-4 h-12 rounded-xl font-bold text-sm flex items-center gap-2.5 transition-all relative group/nav ${
                      isActive 
                        ? 'text-slate-900 dark:text-white' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <span className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                      isActive ? item.activeBg : 'bg-transparent'
                    }`}>
                      <item.icon className={`w-4 h-4 transition-colors ${
                        isActive ? item.activeIcon : item.idleIcon
                      }`} />
                    </span>
                    <span className="relative z-10">{item.label}</span>
                    {isActive && (
                      <motion.div 
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-white dark:bg-[#1A1A1A] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-700 -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {supabaseEnabled && (
              <button
                type="button"
                onClick={async () => {
                  setCloudStatus('syncing');
                  try {
                    const cloud = await loadSnapshot();
                    if (cloud) {
                      applyCloudSnapshot(cloud);
                      lastSnapshotRef.current = JSON.stringify(cloud);
                    }
                    setCloudStatus('synced');
                  } catch (e) {
                    console.warn('[cloud] manual reload failed', e);
                    setCloudStatus('error');
                  }
                }}
                title={
                  cloudStatus === 'synced'
                    ? 'Đã đồng bộ trên cloud — bấm để tải lại'
                    : cloudStatus === 'syncing'
                    ? 'Đang đồng bộ...'
                    : cloudStatus === 'error'
                    ? 'Lỗi đồng bộ — bấm để thử lại (xem Console để biết chi tiết)'
                    : 'Cloud sync tắt'
                }
                className="hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cloudStatus === 'synced'
                      ? 'bg-emerald-500'
                      : cloudStatus === 'syncing'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {cloudStatus === 'synced' ? 'Synced' : cloudStatus === 'syncing' ? 'Sync' : cloudStatus === 'error' ? 'Error' : 'Offline'}
                </span>
              </button>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 rounded-xl bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 hover:bg-amber-50 dark:hover:bg-slate-800 hover:border-amber-200 dark:hover:border-amber-500/30 transition-all shadow-sm active:scale-90 group"
            >
              {isDarkMode 
                ? <Sun className="w-4 h-4 text-amber-400 group-hover:text-amber-500 group-hover:rotate-45 transition-transform" /> 
                : <Moon className="w-4 h-4 text-indigo-500 group-hover:text-indigo-600 group-hover:-rotate-12 transition-transform" />}
            </button>

            <button
              onClick={handleResetData}
              title="Reset dữ liệu tỉ số & phân nhóm"
              className="flex items-center gap-2 px-3 sm:px-6 py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl font-bold text-xs transition-all hover:bg-slate-800 dark:hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-slate-200 dark:shadow-none group"
            >
              <Shuffle className="w-3.5 h-3.5 text-rose-300 dark:text-[#8A1538] group-hover:rotate-180 transition-transform duration-500" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'matches' && (
              <div className="space-y-8 sm:space-y-12">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 md:gap-8">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                       <span className="w-8 h-1 bg-[#8A1538] rounded-full"></span>
                       <span className="text-[10px] font-black uppercase text-[#8A1538] tracking-[0.3em]">Official Schedule</span>
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[0.9]">Lịch Thi Đấu</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium text-lg max-w-xl">Hành trình chinh phục vinh quang tại Bắc Mỹ 2026</p>
                  </div>

                  <div className="relative bg-gradient-to-br from-white to-slate-50 dark:from-[#141414] dark:to-[#0E0E0E] p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] grid grid-cols-3 sm:inline-flex gap-1 backdrop-blur-md w-full md:w-auto">
                    {[
                      { id: 'by_group', label: 'Theo Bảng', shortLabel: 'Bảng', sub: 'Group', icon: Trophy, iconColor: 'text-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-500/15', iconHoverBg: 'group-hover/tab:bg-amber-100 dark:group-hover/tab:bg-amber-500/25' },
                      { id: 'by_date', label: 'Theo Ngày', shortLabel: 'Ngày', sub: 'Daily', icon: Calendar, iconColor: 'text-sky-500', iconBg: 'bg-sky-50 dark:bg-sky-500/15', iconHoverBg: 'group-hover/tab:bg-sky-100 dark:group-hover/tab:bg-sky-500/25' },
                      { id: 'knockout', label: 'Loại Trực Tiếp', shortLabel: 'Loại', sub: 'Knockout', icon: Shuffle, iconColor: 'text-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-500/15', iconHoverBg: 'group-hover/tab:bg-emerald-100 dark:group-hover/tab:bg-emerald-500/25' }
                    ].map(view => {
                      const isActive = matchView === view.id;
                      const Icon = view.icon;
                      return (
                      <button
                        key={view.id}
                        onClick={() => setMatchView(view.id as any)}
                        className={`group/tab relative px-2 sm:px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 ${
                          isActive 
                            ? 'text-white' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {isActive && (
                          <motion.div 
                            layoutId="match-view-pill"
                            className="absolute inset-0 bg-gradient-to-br from-[#8A1538] via-[#A01B45] to-[#6F0F2A] rounded-xl shadow-[0_8px_20px_rgba(138,21,56,0.35)] ring-1 ring-white/10"
                            transition={{ type: "spring", bounce: 0.18, duration: 0.55 }}
                          />
                        )}
                        <span className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-lg transition-all shrink-0 ${
                          isActive ? 'bg-white/15 ring-1 ring-white/20' : `${view.iconBg} ${view.iconHoverBg}`
                        }`}>
                          <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-white drop-shadow' : view.iconColor}`} />
                        </span>
                        <span className="relative z-10 flex flex-col items-start leading-none min-w-0">
                          <span className="text-[10px] sm:text-[11px] font-black tracking-wider whitespace-nowrap">
                            <span className="sm:hidden">{view.shortLabel}</span>
                            <span className="hidden sm:inline">{view.label}</span>
                          </span>
                          <span className={`text-[8px] font-bold tracking-[0.25em] mt-0.5 hidden sm:inline ${isActive ? 'text-white/70' : 'text-slate-400 dark:text-slate-600'}`}>{view.sub}</span>
                        </span>
                      </button>
                      );
                    })}
                  </div>
                </div>

                {matchView === 'by_group' && (
                  <div className="space-y-8 sm:space-y-12">
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
                      {allStages.map(stage => {
                        const isGroup = groupsList.includes(stage);
                        const tabColor = getGroupColor(stage);
                        return (
                          <button
                            key={stage}
                            onClick={() => setSelectedGroup(stage)}
                            className={`flex-shrink-0 px-6 py-3 rounded-2xl border-2 font-bold text-sm transition-all snap-start ${
                              selectedGroup === stage
                                ? `bg-gradient-to-r ${tabColor.from} ${tabColor.to} text-white border-transparent shadow-[0_8px_16px_rgba(0,0,0,0.15)]`
                                : 'bg-white dark:bg-[#141414] text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1A1A1A]'
                            }`}
                          >
                            {isGroup ? `Bảng ${stage}` : stage}
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800"></div>
                        <h2 className={`font-display text-3xl font-bold ${getGroupColor(selectedGroup).text} uppercase tracking-wide px-4`}>
                          {groupsList.includes(selectedGroup) ? `Bảng ${selectedGroup}` : selectedGroup}
                        </h2>
                        <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {matches
                          .filter(m => m.group === selectedGroup)
                          .map(match => {
                            const date = new Date(match.date);
                            const groupAssignment = getMatchAssignment(match);
                            const groupColor = getGroupColor(match.group);
                            const t1Color = getTeamColor(match.team1Id);
                            const t2Color = getTeamColor(match.team2Id);
                            const isKnockoutCard = !groupsList.includes(match.group);
                            const team1 = teams.find(t => t.id === match.team1Id);
                            const team2 = teams.find(t => t.id === match.team2Id);
                            // Extract source-group letter(s) from placeholder "Nhì bảng A" / "Hạng ba bảng A/B/C/D/F" / "W M57" ...
                            const extractGroupLetters = (placeholder?: string): string[] => {
                              if (!placeholder) return [];
                              if (/^(Thắng|Thua)/i.test(placeholder)) return [];
                              // Chỉ nhận chuỗi chữ cái đứng ngay sau từ khóa "bảng" (tránh khu nhận nhầm H trong "Hạng", B trong "Bán"...)
                              const m = placeholder.match(/bảng\s+([A-L](?:\s*\/\s*[A-L])*)/i);
                              if (!m) return [];
                              return Array.from(new Set(m[1].split('/').map(s => s.trim().toUpperCase()).filter(Boolean)));
                            };
                            const extractToken = (placeholder?: string): string => {
                              if (!placeholder) return '?';
                              const tMatch = placeholder.match(/T(\d+)/i);
                              if (tMatch) return `T${tMatch[1]}`;
                              const ordMatch = placeholder.match(/(Tứ kết|Bán kết|Chung kết)\s+(\d+)/i);
                              if (ordMatch) {
                                const map: Record<string, string> = { 'tứ kết': 'TK', 'bán kết': 'BK', 'chung kết': 'CK' };
                                return `${map[ordMatch[1].toLowerCase()] || '?'}${ordMatch[2]}`;
                              }
                              const letters = extractGroupLetters(placeholder);
                              if (letters.length === 1) return letters[0];
                              if (letters.length > 1) return letters.length <= 3 ? letters.join('/') : `${letters.length}B`;
                              const w = placeholder.match(/M(\d+)/i);
                              if (w) return `M${w[1]}`;
                              return placeholder.slice(0, 2).toUpperCase();
                            };
                            const t1Token = team1 ? null : extractToken(match.team1Placeholder);
                            const t2Token = team2 ? null : extractToken(match.team2Placeholder);
                            const t1Letters = team1 ? [] : extractGroupLetters(match.team1Placeholder);
                            const t2Letters = team2 ? [] : extractGroupLetters(match.team2Placeholder);

                            const renderTeamMedallion = (
                              team: typeof team1,
                              token: string | null,
                              colorScheme: typeof t1Color,
                              side: 'left' | 'right',
                            ) => {
                              const canReset = !!team && isKnockoutCard && !!(side === 'left' ? match.team1Placeholder : match.team2Placeholder);
                              if (team) {
                                const medallion = (
                                  <div className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gradient-to-br ${colorScheme.bgGradient} rounded-full flex items-center justify-center text-2xl sm:text-3xl md:text-4xl shadow-[0_15px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_15px_30px_rgb(0,0,0,0.3)] ring-4 ring-white dark:ring-[#141414] group-hover/team:scale-110 transition-all duration-500`}>
                                    {team.flag}
                                  </div>
                                );
                                if (!canReset) return medallion;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleKnockoutTeamPick(match.id, side === 'left' ? 'team1' : 'team2', '')}
                                    title="Click để chọn lại đội"
                                    className="relative group/reset focus:outline-none focus:ring-4 focus:ring-[#8A1538]/20 rounded-full"
                                  >
                                    {medallion}
                                    <div className="absolute inset-0 rounded-full bg-slate-900/0 group-hover/reset:bg-slate-900/55 transition-colors duration-200 flex flex-col items-center justify-center opacity-0 group-hover/reset:opacity-100">
                                      <span className="text-white text-2xl font-black leading-none">×</span>
                                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/90 mt-0.5">Chọn lại</span>
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#8A1538] text-white text-[11px] font-black flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-[#141414] opacity-0 group-hover/reset:opacity-100 transition-opacity">×</div>
                                  </button>
                                );
                              }
                              const isLeft = side === 'left';
                              const ringGrad = isLeft
                                ? 'from-sky-500 to-blue-600'
                                : 'from-[#D6284B] to-[#8A1538]';
                              const innerGrad = isLeft
                                ? 'from-sky-50 to-blue-100 dark:from-sky-500/15 dark:to-blue-600/15'
                                : 'from-rose-50 to-pink-100 dark:from-rose-500/15 dark:to-pink-600/15';
                              const tokenText = isLeft
                                ? 'text-blue-600 dark:text-sky-300'
                                : 'text-[#8A1538] dark:text-rose-300';
                              const tbdText = isLeft
                                ? 'text-sky-500/80 dark:text-sky-400/80'
                                : 'text-[#8A1538]/70 dark:text-rose-400/80';
                              return (
                                <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24">
                                  <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${ringGrad} opacity-90 shadow-[0_15px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_30px_rgba(0,0,0,0.4)] p-[3px] ring-4 ring-white dark:ring-[#141414]`}>
                                    <div className={`w-full h-full rounded-full bg-gradient-to-br ${innerGrad} flex flex-col items-center justify-center group-hover/team:rotate-[8deg] transition-transform duration-500`}>
                                      <span className={`font-display font-black text-lg sm:text-xl md:text-2xl leading-none ${tokenText} drop-shadow-sm`}>{token}</span>
                                      <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.25em] ${tbdText} mt-0.5`}>TBD</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            };
                            
                            return (
                              <motion.div 
                                layout
                                key={match.id} 
                                className={`relative bg-white dark:bg-[#141414] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm hover:shadow-[0_20px_50px_rgb(0,0,0,0.06)] hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 group`}
                              >
                                <div className={`absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent dark:from-[#1A1A1A]/50 pointer-events-none transition-colors duration-300`}></div>
                                <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-80`}></div>
                                {isKnockoutCard && (
                                  <>
                                    <div className={`absolute top-6 left-0 w-8 h-[2px] bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-40`}></div>
                                    <div className={`absolute top-6 right-0 w-8 h-[2px] bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-40`}></div>
                                  </>
                                )}
                                
                                <div className="relative p-4 sm:p-6 md:p-8">
                                  <div className="flex items-center justify-between mb-5 sm:mb-8 gap-2 sm:gap-3">
                                    <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${groupColor.text} px-2 sm:px-3 py-1.5 rounded-full border ${groupColor.border} bg-white dark:bg-[#141414] shadow-sm`}>
                                      <span className={`${groupColor.bg} w-5 h-5 rounded-full flex items-center justify-center -ml-1.5`}>M{match.id.replace('M', '')}</span>
                                      <span className="truncate max-w-[80px] sm:max-w-[120px]">{match.location}</span>
                                    </div>
                                    {isKnockoutCard && (
                                      <div className="hidden sm:flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">
                                        <Trophy className="w-3 h-3" />
                                        Bracket
                                      </div>
                                    )}
                                    <div className={`text-[10px] font-bold ${groupColor.text} ${groupColor.bg} px-3 py-1 rounded-full uppercase tracking-widest border ${groupColor.border} whitespace-nowrap`}>
                                      {new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-11 items-center gap-2">
                                    {/* Team 1 */}
                                    <div className="col-span-4 flex flex-col items-center text-center gap-2 sm:gap-3 relative z-10 hover:-translate-y-1 transition-transform group/team">
                                      {renderTeamMedallion(team1, t1Token, t1Color, 'left')}
                                      <div className="space-y-1.5 mt-1 sm:mt-2 w-full">
                                        <div className={`font-display font-black text-sm sm:text-lg md:text-xl ${team1 ? t1Color.text : 'text-blue-700 dark:text-sky-200'} leading-tight tracking-tight drop-shadow-sm break-words`}>
                                          {getTeamName(match.team1Id, match.team1Placeholder, false)}
                                        </div>
                                        {!team1 && (() => {
                                          const sourceGroups = t1Letters;
                                          if (!sourceGroups.length) {
                                            return (
                                              <div className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-blue-600/80 dark:text-sky-400/80 bg-blue-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-full">
                                                <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></span>
                                                Chờ đối thủ
                                              </div>
                                            );
                                          }
                                          const labelText = sourceGroups.length === 1
                                            ? `Chọn đội bảng ${sourceGroups[0]}`
                                            : `Chọn từ ${sourceGroups.length} bảng (${sourceGroups.join('/')})`;
                                          return (
                                            <div className="relative inline-block">
                                              <select
                                                value=""
                                                onChange={(e) => handleKnockoutTeamPick(match.id, 'team1', e.target.value)}
                                                className="appearance-none text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-sky-300 bg-blue-50 dark:bg-sky-500/10 hover:bg-blue-100 dark:hover:bg-sky-500/20 border border-blue-200 dark:border-sky-500/30 pl-3 pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-sm max-w-[200px]"
                                              >
                                                <option value="">{labelText}</option>
                                                {sourceGroups.map(g => {
                                                  const list = teams.filter(t => t.group === g);
                                                  if (!list.length) return null;
                                                  return (
                                                    <optgroup key={g} label={`Bảng ${g}`}>
                                                      {list.map(t => (
                                                        <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                      ))}
                                                    </optgroup>
                                                  );
                                                })}
                                              </select>
                                              <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-500 rotate-90 pointer-events-none" />
                                            </div>
                                          );
                                        })()}
                                        {groupAssignment.group1.length > 0 && (
                                          <div className="flex flex-wrap justify-center gap-1.5">
                                            {groupAssignment.group1.map(p => (
                                              <span key={p} className="text-[10px] font-black text-white bg-blue-600/90 shadow-[0_4px_10px_rgba(37,99,235,0.3)] px-2.5 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Score/Time */}
                                    <div className="col-span-3 flex flex-col items-center justify-center pt-2">
                                      <div className="flex flex-col items-center gap-4">
                                        {match.status !== 'finished' && (
                                          <div className="font-mono text-xl font-black tracking-tight bg-slate-900 text-white px-5 py-2 rounded-2xl shadow-xl ring-4 ring-slate-100 dark:ring-white/5 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-[#8A1538] rounded-full animate-pulse"></span>
                                            {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(date)}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1 sm:gap-2 group/score">
                                          <input 
                                            type="number" 
                                            value={match.score1 ?? ''}
                                            className={`w-10 h-12 sm:w-14 sm:h-16 md:w-16 md:h-20 text-center bg-slate-100 dark:bg-[#0A0A0A] border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:border-[#8A1538] focus:ring-4 sm:focus:ring-8 focus:ring-[#8A1538]/5 focus:bg-white dark:focus:bg-[#111] outline-none font-display font-black text-xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white transition-all shadow-inner group-hover/score:shadow-lg`}
                                            placeholder="-"
                                            onChange={(e) => handleScoreChange(match.id, e.target.value, match.score2?.toString() || '')}
                                          />
                                          <span className="text-base sm:text-2xl text-slate-300 dark:text-slate-700 font-black animate-pulse">:</span>
                                          <input 
                                            type="number" 
                                            value={match.score2 ?? ''}
                                            className={`w-10 h-12 sm:w-14 sm:h-16 md:w-16 md:h-20 text-center bg-slate-100 dark:bg-[#0A0A0A] border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:border-[#8A1538] focus:ring-4 sm:focus:ring-8 focus:ring-[#8A1538]/5 focus:bg-white dark:focus:bg-[#111] outline-none font-display font-black text-xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white transition-all shadow-inner group-hover/score:shadow-lg`}
                                            placeholder="-"
                                            onChange={(e) => handleScoreChange(match.id, match.score1?.toString() || '', e.target.value)}
                                          />
                                        </div>
                                        {isKnockoutCard && (
                                          <div className="flex items-center gap-1.5 mt-1">
                                            <span className="h-[1px] w-3 bg-gradient-to-r from-transparent to-amber-500/60"></span>
                                            <span className="text-[9px] font-black uppercase tracking-[0.3em] bg-gradient-to-r from-amber-500 to-[#8A1538] bg-clip-text text-transparent">VS</span>
                                            <span className="h-[1px] w-3 bg-gradient-to-l from-transparent to-[#8A1538]/60"></span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Team 2 */}
                                    <div className="col-span-4 flex flex-col items-center text-center gap-2 sm:gap-3 relative z-10 hover:-translate-y-1 transition-transform group/team">
                                      {renderTeamMedallion(team2, t2Token, t2Color, 'right')}
                                      <div className="space-y-1.5 mt-1 sm:mt-2 w-full">
                                        <div className={`font-display font-black text-sm sm:text-lg md:text-xl ${team2 ? t2Color.text : 'text-[#8A1538] dark:text-rose-200'} leading-tight tracking-tight drop-shadow-sm break-words`}>
                                          {getTeamName(match.team2Id, match.team2Placeholder, false)}
                                        </div>
                                        {!team2 && (() => {
                                          const sourceGroups = t2Letters;
                                          if (!sourceGroups.length) {
                                            return (
                                              <div className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-[#8A1538]/80 dark:text-rose-400/80 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                                                <span className="w-1 h-1 rounded-full bg-[#8A1538] animate-pulse"></span>
                                                Chờ đối thủ
                                              </div>
                                            );
                                          }
                                          const labelText = sourceGroups.length === 1
                                            ? `Chọn đội bảng ${sourceGroups[0]}`
                                            : `Chọn từ ${sourceGroups.length} bảng (${sourceGroups.join('/')})`;
                                          return (
                                            <div className="relative inline-block">
                                              <select
                                                value=""
                                                onChange={(e) => handleKnockoutTeamPick(match.id, 'team2', e.target.value)}
                                                className="appearance-none text-[10px] font-black uppercase tracking-[0.2em] text-[#8A1538] dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 pl-3 pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-[#8A1538]/20 transition-all shadow-sm max-w-[200px]"
                                              >
                                                <option value="">{labelText}</option>
                                                {sourceGroups.map(g => {
                                                  const list = teams.filter(t => t.group === g);
                                                  if (!list.length) return null;
                                                  return (
                                                    <optgroup key={g} label={`Bảng ${g}`}>
                                                      {list.map(t => (
                                                        <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                      ))}
                                                    </optgroup>
                                                  );
                                                })}
                                              </select>
                                              <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8A1538] rotate-90 pointer-events-none" />
                                            </div>
                                          );
                                        })()}
                                        {groupAssignment.group2.length > 0 && (
                                          <div className="flex flex-wrap justify-center gap-1.5">
                                            {groupAssignment.group2.map(p => (
                                              <span key={p} className="text-[10px] font-black text-white bg-[#8A1538]/90 shadow-[0_4px_10px_rgba(138,21,56,0.3)] px-2.5 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
                
                {matchView === 'knockout' && (
                  <div className="space-y-10 py-8">
                    {/* Knockout round tab strip */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
                      {(knockoutStagesList as KnockoutStage[]).map((stage) => {
                        const isActive = selectedKnockoutStage === stage;
                        const tabColor = getGroupColor(stage);
                        return (
                          <button
                            key={stage}
                            type="button"
                            onClick={() => setSelectedKnockoutStage(stage)}
                            className={`flex-shrink-0 px-6 py-3 rounded-2xl border-2 font-bold text-sm transition-all snap-start ${
                              isActive
                                ? `bg-gradient-to-r ${tabColor.from} ${tabColor.to} text-white border-transparent shadow-[0_8px_16px_rgba(0,0,0,0.15)]`
                                : 'bg-white dark:bg-[#141414] text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1A1A1A]'
                            }`}
                          >
                            {stage}
                          </button>
                        );
                      })}
                    </div>

                    {knockoutStagesList.filter(stage => stage === selectedKnockoutStage).map((stage) => {
                      const sIdx = knockoutStagesList.indexOf(stage);
                      const stageMatches = matches.filter(m => m.group === stage);
                      const stageKey = stage as KnockoutStage;
                      const assigned = isStageAssigned(stage);
                      const unlocked = isStageUnlocked(stageKey);
                      const nextStage = getNextKnockoutStage();
                      const isNext = nextStage === stage;
                      const hasPlayers = players.length > 0;
                      const canRandomize = unlocked && isNext && hasPlayers;
                      const canReshuffle = assigned && isNext && hasPlayers;
                      const prereq = KNOCKOUT_PREREQ[stageKey];
                      const lockReason = !hasPlayers
                        ? 'Hãy nhập danh sách người chơi ở tab Người chơi'
                        : !unlocked
                        ? (prereq === null
                          ? 'Cần hoàn thành toàn bộ vòng bảng trước'
                          : `Cần hoàn thành ${prereq} trước`)
                        : !isNext && assigned
                        ? 'Đã chia. Mở khoá chia lại sau khi hóa về vòng kế tiếp'
                        : !isNext
                        ? 'Vòng trước đó cần được chia trước'
                        : '';
                      const stageColor = getGroupColor(stageKey);
                      return (
                        <motion.div
                          key={stage}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                          className="space-y-8"
                        >
                          <div className="flex flex-wrap items-center gap-4">
                             <div className={`w-12 h-12 bg-gradient-to-br ${stageColor.from} ${stageColor.to} rounded-2xl flex items-center justify-center text-white font-display font-bold text-lg shadow-lg rotate-3 group-hover:rotate-0`}>
                               {sIdx + 1}
                             </div>
                             <div>
                               <h2 className="font-display text-4xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">{stage}</h2>
                               <p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em]">Knockout Stage</p>
                             </div>
                             <div className="flex items-center gap-2 ml-auto">
                               <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                                 assigned
                                   ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                   : unlocked
                                   ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                   : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                               }`}>
                                 {assigned ? 'Đã chia' : unlocked ? 'Sẵn sàng chia' : 'Chưa mở'}
                               </span>
                               {!assigned && (
                                 <button
                                   type="button"
                                   onClick={() => canRandomize && handleRandomizeKnockoutStage(stageKey)}
                                   disabled={!canRandomize}
                                   title={canRandomize ? 'Chia ngẫu nhiên người chơi cho vòng này' : lockReason}
                                   className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                                     canRandomize
                                       ? 'bg-[#8A1538] text-white hover:bg-[#6e102c] shadow-lg shadow-[#8A1538]/20 active:scale-95'
                                       : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                   }`}
                                 >
                                   <Shuffle className="w-3.5 h-3.5" />
                                   Chia ngẫu nhiên
                                 </button>
                               )}
                               {canReshuffle && (
                                 <button
                                   type="button"
                                   onClick={() => handleRandomizeKnockoutStage(stageKey)}
                                   title="Chia lại vòng này"
                                   className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider bg-white dark:bg-[#1A1A1A] border-2 border-[#8A1538]/30 text-[#8A1538] hover:bg-[#8A1538]/5 active:scale-95 transition-all"
                                 >
                                   <Shuffle className="w-3.5 h-3.5" />
                                   Chia lại
                                 </button>
                               )}
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8">
                            {stageMatches.map(match => {
                              const date = new Date(match.date);
                              const groupAssignment = matchAssignments[match.id]
                                ? { group1: matchAssignments[match.id].side1, group2: matchAssignments[match.id].side2 }
                                : { group1: [] as string[], group2: [] as string[] };
                              const groupColor = getGroupColor(match.group);
                              const t1Color = getTeamColor(match.team1Id);
                              const t2Color = getTeamColor(match.team2Id);
                              const isKnockoutCard = true;
                              const team1 = teams.find(t => t.id === match.team1Id);
                              const team2 = teams.find(t => t.id === match.team2Id);
                              const extractGroupLetters = (placeholder?: string): string[] => {
                                if (!placeholder) return [];
                                // Knockout-source placeholders ("Thắng/Thua ...") không phải tham chiếu bảng
                                if (/^(Thắng|Thua)/i.test(placeholder)) return [];
                                const m = placeholder.match(/bảng\s+([A-L](?:\s*\/\s*[A-L])*)/i);
                                if (!m) return [];
                                return Array.from(new Set(m[1].split('/').map(s => s.trim().toUpperCase()).filter(Boolean)));
                              };
                              const extractToken = (placeholder?: string): string => {
                                if (!placeholder) return '?';
                                const tMatch = placeholder.match(/T(\d+)/i);
                                if (tMatch) return `T${tMatch[1]}`;
                                const ordMatch = placeholder.match(/(Tứ kết|Bán kết|Chung kết)\s+(\d+)/i);
                                if (ordMatch) {
                                  const map: Record<string, string> = { 'tứ kết': 'TK', 'bán kết': 'BK', 'chung kết': 'CK' };
                                  return `${map[ordMatch[1].toLowerCase()] || '?'}${ordMatch[2]}`;
                                }
                                const letters = extractGroupLetters(placeholder);
                                if (letters.length === 1) return letters[0];
                                if (letters.length > 1) return letters.length <= 3 ? letters.join('/') : `${letters.length}B`;
                                const w = placeholder.match(/M(\d+)/i);
                                if (w) return `M${w[1]}`;
                                return placeholder.slice(0, 2).toUpperCase();
                              };
                              const t1Token = team1 ? null : extractToken(match.team1Placeholder);
                              const t2Token = team2 ? null : extractToken(match.team2Placeholder);
                              const t1Letters = team1 ? [] : extractGroupLetters(match.team1Placeholder);
                              const t2Letters = team2 ? [] : extractGroupLetters(match.team2Placeholder);

                              // Resolve candidate teams from placeholders like
                              // "Thắng Vòng 1/16 - T73" / "Thắng Tứ kết 1" / "Thua Bán kết 2"
                              const resolveSourceCandidates = (placeholder?: string) => {
                                if (!placeholder) return { candidates: [] as typeof teams, label: '', sourceMatchId: '' };
                                const isLose = /^Thua/i.test(placeholder);
                                const verb = isLose ? 'Thua' : 'Thắng';
                                let sourceMatch: typeof match | null = null;
                                let sourceLabel = '';
                                const tMatch = placeholder.match(/T(\d+)/i);
                                if (tMatch) {
                                  const id = `M${tMatch[1]}`;
                                  sourceMatch = matches.find(m => m.id === id) || null;
                                  sourceLabel = `T${tMatch[1]}`;
                                } else {
                                  const ordMatch = placeholder.match(/(Tứ kết|Bán kết|Chung kết)\s+(\d+)/i);
                                  if (ordMatch) {
                                    const stageName = ordMatch[1];
                                    const ord = parseInt(ordMatch[2], 10);
                                    const stageMatches = matches
                                      .filter(m => m.group === stageName)
                                      .sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
                                    sourceMatch = stageMatches[ord - 1] || null;
                                    sourceLabel = `${stageName} ${ord}`;
                                  }
                                }
                                if (!sourceMatch) return { candidates: [] as typeof teams, label: '', sourceMatchId: '' };
                                const candidateIds = [sourceMatch.team1Id, sourceMatch.team2Id].filter(Boolean) as string[];
                                const cands = teams.filter(t => candidateIds.includes(t.id));
                                if (
                                  sourceMatch.status === 'finished' &&
                                  sourceMatch.score1 != null &&
                                  sourceMatch.score2 != null &&
                                  cands.length === 2 &&
                                  sourceMatch.score1 !== sourceMatch.score2
                                ) {
                                  const winnerId = sourceMatch.score1 > sourceMatch.score2 ? sourceMatch.team1Id : sourceMatch.team2Id;
                                  const preferredId = isLose
                                    ? (winnerId === sourceMatch.team1Id ? sourceMatch.team2Id : sourceMatch.team1Id)
                                    : winnerId;
                                  cands.sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : 0));
                                }
                                return { candidates: cands, label: `Chọn ${verb.toLowerCase()} ${sourceLabel}`, sourceMatchId: sourceMatch.id };
                              };
                              const t1Source = team1 ? { candidates: [] as typeof teams, label: '', sourceMatchId: '' } : resolveSourceCandidates(match.team1Placeholder);
                              const t2Source = team2 ? { candidates: [] as typeof teams, label: '', sourceMatchId: '' } : resolveSourceCandidates(match.team2Placeholder);

                              const renderTeamMedallion = (
                                team: typeof team1,
                                token: string | null,
                                colorScheme: typeof t1Color,
                                side: 'left' | 'right',
                              ) => {
                                const canReset = !!team && !!(side === 'left' ? match.team1Placeholder : match.team2Placeholder);
                                if (team) {
                                  const medallion = (
                                    <div className={`w-24 h-24 bg-gradient-to-br ${colorScheme.bgGradient} rounded-full flex items-center justify-center text-4xl shadow-[0_15px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_15px_30px_rgb(0,0,0,0.3)] ring-4 ring-white dark:ring-[#141414] group-hover/team:scale-110 transition-all duration-500`}>
                                      {team.flag}
                                    </div>
                                  );
                                  if (!canReset) return medallion;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleKnockoutTeamPick(match.id, side === 'left' ? 'team1' : 'team2', '')}
                                      title="Click để chọn lại đội"
                                      className="relative group/reset focus:outline-none focus:ring-4 focus:ring-[#8A1538]/20 rounded-full"
                                    >
                                      {medallion}
                                      <div className="absolute inset-0 rounded-full bg-slate-900/0 group-hover/reset:bg-slate-900/55 transition-colors duration-200 flex flex-col items-center justify-center opacity-0 group-hover/reset:opacity-100">
                                        <span className="text-white text-2xl font-black leading-none">×</span>
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/90 mt-0.5">Chọn lại</span>
                                      </div>
                                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#8A1538] text-white text-[11px] font-black flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-[#141414] opacity-0 group-hover/reset:opacity-100 transition-opacity">×</div>
                                    </button>
                                  );
                                }
                                const isLeft = side === 'left';
                                const ringGrad = isLeft
                                  ? 'from-sky-500 to-blue-600'
                                  : 'from-[#D6284B] to-[#8A1538]';
                                const innerGrad = isLeft
                                  ? 'from-sky-50 to-blue-100 dark:from-sky-500/15 dark:to-blue-600/15'
                                  : 'from-rose-50 to-pink-100 dark:from-rose-500/15 dark:to-pink-600/15';
                                const tokenText = isLeft
                                  ? 'text-blue-600 dark:text-sky-300'
                                  : 'text-[#8A1538] dark:text-rose-300';
                                const tbdText = isLeft
                                  ? 'text-sky-500/80 dark:text-sky-400/80'
                                  : 'text-[#8A1538]/70 dark:text-rose-400/80';
                                return (
                                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24">
                                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${ringGrad} opacity-90 shadow-[0_15px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_30px_rgba(0,0,0,0.4)] p-[3px] ring-4 ring-white dark:ring-[#141414]`}>
                                      <div className={`w-full h-full rounded-full bg-gradient-to-br ${innerGrad} flex flex-col items-center justify-center group-hover/team:rotate-[8deg] transition-transform duration-500`}>
                                        <span className={`font-display font-black text-lg sm:text-xl md:text-2xl leading-none ${tokenText} drop-shadow-sm`}>{token}</span>
                                        <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.25em] ${tbdText} mt-0.5`}>TBD</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <motion.div
                                  layout
                                  initial={{ opacity: 0, y: 20 }}
                                  whileInView={{ opacity: 1, y: 0 }}
                                  viewport={{ once: true }}
                                  key={match.id}
                                  className="relative w-full bg-white dark:bg-[#141414] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm hover:shadow-[0_20px_50px_rgb(0,0,0,0.06)] hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 group"
                                >
                                  <div className={`absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent dark:from-[#1A1A1A]/50 pointer-events-none transition-colors duration-300`}></div>
                                  <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-80`}></div>
                                  <div className={`absolute top-6 left-0 w-8 h-[2px] bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-40`}></div>
                                  <div className={`absolute top-6 right-0 w-8 h-[2px] bg-gradient-to-r ${groupColor.from} ${groupColor.to} opacity-40`}></div>

                                  <div className="relative p-3 sm:p-6 md:p-8">
                                    <div className="flex items-center justify-between mb-5 sm:mb-8 gap-2 sm:gap-3">
                                      <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${groupColor.text} px-2 sm:px-3 py-1.5 rounded-full border ${groupColor.border} bg-white dark:bg-[#141414] shadow-sm min-w-0`}>
                                        <span className={`${groupColor.bg} w-5 h-5 rounded-full flex items-center justify-center -ml-1.5 shrink-0`}>M{match.id.replace('M', '')}</span>
                                        <span className="truncate max-w-[60px] sm:max-w-[120px]">{match.location}</span>
                                      </div>
                                      <div className="hidden sm:flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">
                                        <Trophy className="w-3 h-3" />
                                        Bracket
                                      </div>
                                      <div className={`text-[10px] font-bold ${groupColor.text} ${groupColor.bg} px-2 sm:px-3 py-1 rounded-full uppercase tracking-widest border ${groupColor.border} whitespace-nowrap shrink-0`}>
                                        <span className="sm:hidden">{new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric' }).format(date)}</span>
                                        <span className="hidden sm:inline">{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}</span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-11 items-center gap-2">
                                      {/* Team 1 */}
                                      <div className="col-span-4 flex flex-col items-center text-center gap-2 sm:gap-3 relative z-10 hover:-translate-y-1 transition-transform group/team">
                                        {renderTeamMedallion(team1, t1Token, t1Color, 'left')}
                                        <div className="space-y-1.5 mt-1 sm:mt-2 w-full">
                                          <div className={`font-display font-black text-sm sm:text-lg md:text-xl ${team1 ? t1Color.text : 'text-blue-700 dark:text-sky-200'} leading-tight tracking-tight drop-shadow-sm break-words`}>
                                            {getTeamName(match.team1Id, match.team1Placeholder, false)}
                                          </div>
                                          {!team1 && (() => {
                                            const sourceGroups = t1Letters;
                                            if (!sourceGroups.length) {
                                              if (!t1Source.candidates.length) {
                                                return (
                                                  <div className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-blue-600/80 dark:text-sky-400/80 bg-blue-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-full">
                                                    <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></span>
                                                    Chờ đối thủ
                                                  </div>
                                                );
                                              }
                                              return (
                                                <div className="relative block w-full max-w-full">
                                                  <select
                                                    value=""
                                                    onChange={(e) => handleKnockoutTeamPick(match.id, 'team1', e.target.value)}
                                                    className="appearance-none w-full text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-sky-300 bg-blue-50 dark:bg-sky-500/10 hover:bg-blue-100 dark:hover:bg-sky-500/20 border border-blue-200 dark:border-sky-500/30 pl-2 sm:pl-3 pr-6 sm:pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-sm truncate"
                                                  >
                                                    <option value="">{t1Source.label}</option>
                                                    {t1Source.candidates.map(t => (
                                                      <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                    ))}
                                                  </select>
                                                  <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-500 rotate-90 pointer-events-none" />
                                                </div>
                                              );
                                            }
                                            const labelText = sourceGroups.length === 1
                                              ? `Chọn đội bảng ${sourceGroups[0]}`
                                              : `Chọn từ ${sourceGroups.length} bảng (${sourceGroups.join('/')})`;
                                            return (
                                              <div className="relative block w-full max-w-full">
                                                <select
                                                  value=""
                                                  onChange={(e) => handleKnockoutTeamPick(match.id, 'team1', e.target.value)}
                                                  className="appearance-none w-full text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-sky-300 bg-blue-50 dark:bg-sky-500/10 hover:bg-blue-100 dark:hover:bg-sky-500/20 border border-blue-200 dark:border-sky-500/30 pl-2 sm:pl-3 pr-6 sm:pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-sm truncate"
                                                >
                                                  <option value="">{labelText}</option>
                                                  {sourceGroups.map(g => {
                                                    const list = teams.filter(t => t.group === g);
                                                    if (!list.length) return null;
                                                    return (
                                                      <optgroup key={g} label={`Bảng ${g}`}>
                                                        {list.map(t => (
                                                          <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                        ))}
                                                      </optgroup>
                                                    );
                                                  })}
                                                </select>
                                                <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-500 rotate-90 pointer-events-none" />
                                              </div>
                                            );
                                          })()}
                                          {groupAssignment.group1.length > 0 && (
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                              {groupAssignment.group1.map(p => (
                                                <span key={p} className="text-[10px] font-black text-white bg-blue-600/90 shadow-[0_4px_10px_rgba(37,99,235,0.3)] px-2.5 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Score/Time */}
                                      <div className="col-span-3 flex flex-col items-center justify-center pt-2">
                                        <div className="flex flex-col items-center gap-4">
                                          {match.status !== 'finished' && (
                                            <div className="font-mono text-xl font-black tracking-tight bg-slate-900 text-white px-5 py-2 rounded-2xl shadow-xl ring-4 ring-slate-100 dark:ring-white/5 flex items-center gap-2">
                                              <span className="w-1.5 h-1.5 bg-[#8A1538] rounded-full animate-pulse"></span>
                                              {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(date)}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1 sm:gap-2 group/score">
                                            <input
                                              type="number"
                                              value={match.score1 ?? ''}
                                              className={`w-10 h-12 sm:w-14 sm:h-16 md:w-16 md:h-20 text-center bg-slate-100 dark:bg-[#0A0A0A] border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:border-[#8A1538] focus:ring-4 sm:focus:ring-8 focus:ring-[#8A1538]/5 focus:bg-white dark:focus:bg-[#111] outline-none font-display font-black text-xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white transition-all shadow-inner group-hover/score:shadow-lg`}
                                              placeholder="-"
                                              onChange={(e) => handleScoreChange(match.id, e.target.value, match.score2?.toString() || '')}
                                            />
                                            <span className="text-base sm:text-2xl text-slate-300 dark:text-slate-700 font-black animate-pulse">:</span>
                                            <input
                                              type="number"
                                              value={match.score2 ?? ''}
                                              className={`w-10 h-12 sm:w-14 sm:h-16 md:w-16 md:h-20 text-center bg-slate-100 dark:bg-[#0A0A0A] border-2 border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:border-[#8A1538] focus:ring-4 sm:focus:ring-8 focus:ring-[#8A1538]/5 focus:bg-white dark:focus:bg-[#111] outline-none font-display font-black text-xl sm:text-3xl md:text-4xl text-slate-900 dark:text-white transition-all shadow-inner group-hover/score:shadow-lg`}
                                              placeholder="-"
                                              onChange={(e) => handleScoreChange(match.id, match.score1?.toString() || '', e.target.value)}
                                            />
                                          </div>
                                          <div className="flex items-center gap-1.5 mt-1">
                                            <span className="h-[1px] w-3 bg-gradient-to-r from-transparent to-amber-500/60"></span>
                                            <span className="text-[9px] font-black uppercase tracking-[0.3em] bg-gradient-to-r from-amber-500 to-[#8A1538] bg-clip-text text-transparent">VS</span>
                                            <span className="h-[1px] w-3 bg-gradient-to-l from-transparent to-[#8A1538]/60"></span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Team 2 */}
                                      <div className="col-span-4 flex flex-col items-center text-center gap-2 sm:gap-3 relative z-10 hover:-translate-y-1 transition-transform group/team">
                                        {renderTeamMedallion(team2, t2Token, t2Color, 'right')}
                                        <div className="space-y-1.5 mt-1 sm:mt-2 w-full">
                                          <div className={`font-display font-black text-sm sm:text-lg md:text-xl ${team2 ? t2Color.text : 'text-[#8A1538] dark:text-rose-200'} leading-tight tracking-tight drop-shadow-sm break-words`}>
                                            {getTeamName(match.team2Id, match.team2Placeholder, false)}
                                          </div>
                                          {!team2 && (() => {
                                            const sourceGroups = t2Letters;
                                            if (!sourceGroups.length) {
                                              if (!t2Source.candidates.length) {
                                                return (
                                                  <div className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-[#8A1538]/80 dark:text-rose-400/80 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                                                    <span className="w-1 h-1 rounded-full bg-[#8A1538] animate-pulse"></span>
                                                    Chờ đối thủ
                                                  </div>
                                                );
                                              }
                                              return (
                                                <div className="relative block w-full max-w-full">
                                                  <select
                                                    value=""
                                                    onChange={(e) => handleKnockoutTeamPick(match.id, 'team2', e.target.value)}
                                                    className="appearance-none w-full text-[10px] font-black uppercase tracking-[0.2em] text-[#8A1538] dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 pl-2 sm:pl-3 pr-6 sm:pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-[#8A1538]/20 transition-all shadow-sm truncate"
                                                  >
                                                    <option value="">{t2Source.label}</option>
                                                    {t2Source.candidates.map(t => (
                                                      <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                    ))}
                                                  </select>
                                                  <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8A1538] rotate-90 pointer-events-none" />
                                                </div>
                                              );
                                            }
                                            const labelText = sourceGroups.length === 1
                                              ? `Chọn đội bảng ${sourceGroups[0]}`
                                              : `Chọn từ ${sourceGroups.length} bảng (${sourceGroups.join('/')})`;
                                            return (
                                              <div className="relative block w-full max-w-full">
                                                <select
                                                  value=""
                                                  onChange={(e) => handleKnockoutTeamPick(match.id, 'team2', e.target.value)}
                                                  className="appearance-none w-full text-[10px] font-black uppercase tracking-[0.2em] text-[#8A1538] dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 pl-2 sm:pl-3 pr-6 sm:pr-7 py-1 rounded-full cursor-pointer outline-none focus:ring-4 focus:ring-[#8A1538]/20 transition-all shadow-sm truncate"
                                                >
                                                  <option value="">{labelText}</option>
                                                  {sourceGroups.map(g => {
                                                    const list = teams.filter(t => t.group === g);
                                                    if (!list.length) return null;
                                                    return (
                                                      <optgroup key={g} label={`Bảng ${g}`}>
                                                        {list.map(t => (
                                                          <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
                                                        ))}
                                                      </optgroup>
                                                    );
                                                  })}
                                                </select>
                                                <ChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8A1538] rotate-90 pointer-events-none" />
                                              </div>
                                            );
                                          })()}
                                          {groupAssignment.group2.length > 0 && (
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                              {groupAssignment.group2.map(p => (
                                                <span key={p} className="text-[10px] font-black text-white bg-[#8A1538]/90 shadow-[0_4px_10px_rgba(138,21,56,0.3)] px-2.5 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {matchView === 'by_date' && (() => {
                  // Group matches by date (YYYY-MM-DD) and sort chronologically
                  const byDate = [...matches]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .reduce((acc, m) => {
                      const d = new Date(m.date);
                      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(m);
                      return acc;
                    }, {} as Record<string, Match[]>);
                  const dateKeys = Object.keys(byDate);
                  if (!dateKeys.length) return null;

                  // Pick a default tab: today if available, else first upcoming, else first
                  const todayKey = (() => {
                    const t = new Date();
                    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
                  })();
                  const defaultKey = dateKeys.includes(todayKey)
                    ? todayKey
                    : (dateKeys.find(k => k >= todayKey) || dateKeys[0]);
                  const activeKey = selectedDateKey && byDate[selectedDateKey] ? selectedDateKey : defaultKey;
                  const dateMatches = byDate[activeKey] || [];
                  const activeIdx = dateKeys.indexOf(activeKey);

                  const weekdayShort = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                  const monthShort = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

                  const parseKey = (k: string) => {
                    const [y, m, d] = k.split('-').map(Number);
                    return new Date(y, m - 1, d);
                  };
                  const activeDateObj = parseKey(activeKey);
                  const finishedCount = dateMatches.filter(m => m.status === 'finished').length;

                  return (
                    <div className="space-y-8">
                      {/* Horizontal day tabs */}
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => activeIdx > 0 && setSelectedDateKey(dateKeys[activeIdx - 1])}
                            disabled={activeIdx <= 0}
                            className="w-9 h-9 rounded-xl bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-[#8A1538] hover:border-[#8A1538]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                            aria-label="Ngày trước"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div
                            id="date-tabs-scroll"
                            className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mb-2"
                            style={{ scrollbarWidth: 'none' }}
                          >
                            {dateKeys.map((key) => {
                              const isActive = key === activeKey;
                              const d = parseKey(key);
                              const wd = weekdayShort[d.getDay()];
                              const dayNum = d.getDate();
                              const monNum = d.getMonth() + 1;
                              const isToday = key === todayKey;
                              const dayMatches = byDate[key];
                              const totalCount = dayMatches.length;
                              const doneCount = dayMatches.filter(m => m.status === 'finished').length;
                              const allDone = doneCount === totalCount;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setSelectedDateKey(key)}
                                  className={`relative snap-start shrink-0 min-w-[78px] px-4 py-2.5 rounded-2xl border-2 transition-all duration-300 group/dt ${
                                    isActive
                                      ? 'bg-gradient-to-br from-[#A41A45] via-[#8A1538] to-[#5C0E25] text-white border-transparent shadow-[0_12px_28px_-8px_rgba(138,21,56,0.55)] -translate-y-0.5'
                                      : 'bg-white dark:bg-[#141414] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#8A1538]/30 hover:bg-rose-50/40 dark:hover:bg-rose-500/5'
                                  }`}
                                >
                                  {isActive && (
                                    <motion.div
                                      layoutId="date-tab-pill"
                                      className="absolute inset-0 rounded-2xl ring-2 ring-white/30 pointer-events-none"
                                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                                    />
                                  )}
                                  <div className="relative flex flex-col items-center leading-tight">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.22em] ${isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>
                                      {wd}
                                    </span>
                                    <span className="font-display font-black text-xl mt-0.5">{dayNum}</span>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                                      Th{monNum}
                                    </span>
                                  </div>
                                  {/* Top-right indicator */}
                                  {isToday && (
                                    <span className={`absolute -top-1.5 -right-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ring-2 ${isActive ? 'bg-amber-300 text-amber-900 ring-white/40' : 'bg-amber-400 text-amber-900 ring-white dark:ring-[#0A0A0A]'}`}>
                                      Nay
                                    </span>
                                  )}
                                  {/* Bottom badge: match count / status */}
                                  <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-black px-1.5 py-0.5 rounded-full ring-2 whitespace-nowrap ${
                                    isActive
                                      ? 'bg-white text-[#8A1538] ring-[#8A1538]/30'
                                      : allDone
                                      ? 'bg-emerald-500 text-white ring-white dark:ring-[#0A0A0A]'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-white dark:ring-[#0A0A0A]'
                                  }`}>
                                    {allDone && !isActive ? '✓' : `${doneCount}/${totalCount}`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => activeIdx < dateKeys.length - 1 && setSelectedDateKey(dateKeys[activeIdx + 1])}
                            disabled={activeIdx >= dateKeys.length - 1}
                            className="w-9 h-9 rounded-xl bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-[#8A1538] hover:border-[#8A1538]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                            aria-label="Ngày sau"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Active day header */}
                      <motion.div
                        key={activeKey}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="space-y-8"
                      >
                        <div className="flex flex-wrap items-end justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#A41A45] via-[#8A1538] to-[#5C0E25] flex flex-col items-center justify-center text-white shadow-[0_12px_28px_-8px_rgba(138,21,56,0.55)] rotate-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.22em] opacity-80 leading-none">{weekdayShort[activeDateObj.getDay()]}</span>
                                <span className="font-display font-black text-2xl leading-none mt-1">{activeDateObj.getDate()}</span>
                              </div>
                              {activeKey === todayKey && (
                                <span className="absolute -top-2 -right-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 ring-2 ring-white dark:ring-[#0A0A0A]">Hôm nay</span>
                              )}
                            </div>
                            <div>
                              <h2 className="font-display text-3xl sm:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">
                                {monthShort[activeDateObj.getMonth()]}
                              </h2>
                              <p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">
                                {new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(activeDateObj)}, {activeDateObj.getDate()} {monthShort[activeDateObj.getMonth()].toLowerCase()} {activeDateObj.getFullYear()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border bg-slate-50 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                              {dateMatches.length} trận
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                              finishedCount === dateMatches.length
                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                : finishedCount > 0
                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}>
                              {finishedCount === dateMatches.length ? 'Đã xong' : `${finishedCount}/${dateMatches.length} hoàn thành`}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {dateMatches.map(match => {
                            const mDate = new Date(match.date);
                            const groupColor = getGroupColor(match.group);
                            const t1Color = getTeamColor(match.team1Id);
                            const t2Color = getTeamColor(match.team2Id);
                            const groupAssignment = getMatchAssignment(match);
                            const isKnockout = !groupsList.includes(match.group);

                            // Theme per knockout round
                            const knockoutThemes: Record<string, { from: string; via: string; to: string; chip: string; ring: string; glow: string; label: string; subLabel: string; icon: typeof Trophy }> = {
                              'Vòng 1/16': { from: 'from-sky-600', via: 'via-sky-500', to: 'to-indigo-600', chip: 'bg-sky-500/15 text-sky-100 ring-sky-300/30', ring: 'ring-sky-400/40', glow: 'shadow-[0_18px_40px_-12px_rgba(2,132,199,0.55)]', label: 'Vòng 1/16', subLabel: 'Round of 32', icon: Shuffle },
                              'Vòng 1/8':  { from: 'from-cyan-600', via: 'via-teal-500', to: 'to-emerald-600', chip: 'bg-cyan-500/15 text-cyan-100 ring-cyan-300/30', ring: 'ring-cyan-400/40', glow: 'shadow-[0_18px_40px_-12px_rgba(8,145,178,0.55)]', label: 'Vòng 1/8', subLabel: 'Round of 16', icon: Shuffle },
                              'Tứ kết':    { from: 'from-violet-600', via: 'via-purple-500', to: 'to-fuchsia-600', chip: 'bg-violet-500/15 text-violet-100 ring-violet-300/30', ring: 'ring-violet-400/40', glow: 'shadow-[0_18px_40px_-12px_rgba(124,58,237,0.55)]', label: 'Tứ kết', subLabel: 'Quarter-final', icon: Trophy },
                              'Bán kết':   { from: 'from-fuchsia-600', via: 'via-pink-500', to: 'to-rose-600', chip: 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-300/30', ring: 'ring-fuchsia-400/40', glow: 'shadow-[0_18px_40px_-12px_rgba(192,38,211,0.55)]', label: 'Bán kết', subLabel: 'Semi-final', icon: Trophy },
                              'Tranh hạng 3': { from: 'from-amber-600', via: 'via-orange-500', to: 'to-rose-500', chip: 'bg-amber-500/15 text-amber-100 ring-amber-300/30', ring: 'ring-amber-400/40', glow: 'shadow-[0_18px_40px_-12px_rgba(234,88,12,0.55)]', label: 'Tranh hạng 3', subLabel: 'Bronze Final', icon: Trophy },
                              'Chung kết': { from: 'from-amber-500', via: 'via-yellow-500', to: 'to-[#8A1538]', chip: 'bg-amber-400/20 text-amber-100 ring-amber-300/40', ring: 'ring-amber-400/50', glow: 'shadow-[0_22px_50px_-12px_rgba(217,119,6,0.7)]', label: 'Chung kết', subLabel: 'Grand Final', icon: Trophy },
                            };
                            const ko = isKnockout ? (knockoutThemes[match.group] || knockoutThemes['Vòng 1/16']) : null;

                            if (isKnockout && ko) {
                              const KoIcon = ko.icon;
                              const team1Name = getTeamName(match.team1Id, match.team1Placeholder, false);
                              const team2Name = getTeamName(match.team2Id, match.team2Placeholder, false);
                              const isFinal = match.group === 'Chung kết';
                              return (
                                <motion.div
                                  whileHover={{ y: -4 }}
                                  key={match.id}
                                  className={`relative bg-white dark:bg-[#141414] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-[0_24px_60px_rgb(0,0,0,0.10)] transition-all duration-300 overflow-hidden group`}
                                >
                                  {/* Banner */}
                                  <div className={`relative bg-gradient-to-br ${ko.from} ${ko.via} ${ko.to} px-5 py-4 text-white overflow-hidden`}>
                                    {/* decorative trophy */}
                                    <KoIcon className="absolute -right-3 -bottom-4 w-24 h-24 opacity-15 -rotate-12" />
                                    {/* sheen */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                                    <div className="relative z-10 flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[9px] font-black uppercase tracking-[0.22em] px-2 py-0.5 rounded-full ring-1 backdrop-blur-sm ${ko.chip}`}>{match.id}</span>
                                          {isFinal && <span className="text-[9px] font-black uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-amber-300 text-amber-900 ring-1 ring-amber-200">Final</span>}
                                        </div>
                                        <h3 className="font-display font-black italic text-2xl leading-none mt-2 uppercase tracking-tight">{ko.label}</h3>
                                        <p className="text-[9px] font-bold uppercase tracking-[0.28em] opacity-80 mt-1.5">{ko.subLabel}</p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <div className="text-[9px] font-bold uppercase tracking-[0.25em] opacity-75">Venue</div>
                                        <div className="text-[11px] font-black uppercase tracking-wider mt-0.5 truncate max-w-[110px]">{match.location}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Body */}
                                  <div className="p-5">
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                      {/* Team 1 */}
                                      <div className="flex flex-col items-center text-center gap-2 min-w-0">
                                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${t1Color.bgGradient} flex items-center justify-center text-3xl shadow-[inset_0_-2px_6px_rgba(0,0,0,0.08),0_4px_10px_rgba(0,0,0,0.06)] ring-2 ring-white dark:ring-[#141414]`}>
                                          {teams.find(t => t.id === match.team1Id)?.flag || '🏳️'}
                                        </div>
                                        <span
                                          className={`font-display font-black text-xs leading-tight line-clamp-2 ${match.team1Id ? t1Color.text : 'text-slate-400 dark:text-slate-500 italic'}`}
                                          title={team1Name}
                                        >
                                          {team1Name}
                                        </span>
                                      </div>

                                      {/* VS / score */}
                                      <div className="flex flex-col items-center gap-1.5">
                                        <input
                                          type="number"
                                          value={match.score1 ?? ''}
                                          className={`w-12 h-11 text-center bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:dark:border-slate-600 rounded-xl focus:border-transparent ${t1Color.ring} outline-none font-display font-black text-xl transition-all shadow-inner text-slate-900 dark:text-white`}
                                          placeholder="-"
                                          onChange={(e) => handleScoreChange(match.id, e.target.value, match.score2?.toString() || '')}
                                        />
                                        <span className="text-[9px] font-black tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase">vs</span>
                                        <input
                                          type="number"
                                          value={match.score2 ?? ''}
                                          className={`w-12 h-11 text-center bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:dark:border-slate-600 rounded-xl focus:border-transparent ${t2Color.ring} outline-none font-display font-black text-xl transition-all shadow-inner text-slate-900 dark:text-white`}
                                          placeholder="-"
                                          onChange={(e) => handleScoreChange(match.id, match.score1?.toString() || '', e.target.value)}
                                        />
                                      </div>

                                      {/* Team 2 */}
                                      <div className="flex flex-col items-center text-center gap-2 min-w-0">
                                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${t2Color.bgGradient} flex items-center justify-center text-3xl shadow-[inset_0_-2px_6px_rgba(0,0,0,0.08),0_4px_10px_rgba(0,0,0,0.06)] ring-2 ring-white dark:ring-[#141414]`}>
                                          {teams.find(t => t.id === match.team2Id)?.flag || '🏳️'}
                                        </div>
                                        <span
                                          className={`font-display font-black text-xs leading-tight line-clamp-2 ${match.team2Id ? t2Color.text : 'text-slate-400 dark:text-slate-500 italic'}`}
                                          title={team2Name}
                                        >
                                          {team2Name}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="mt-5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                      {match.status !== 'finished' ? (
                                        <span className="font-mono text-xs font-bold tracking-tight bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md inline-flex items-center gap-1.5">
                                          <Calendar className="w-3 h-3 opacity-60" />
                                          {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(mDate)}
                                        </span>
                                      ) : (
                                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md uppercase tracking-wider">Đã xong</span>
                                      )}
                                      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">Knockout</span>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            }

                            return (
                              <motion.div
                                whileHover={{ y: -4 }}
                                key={match.id}
                                className={`relative bg-white dark:bg-[#141414] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-[0_20px_50px_rgb(0,0,0,0.06)] transition-all duration-300 overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700`}
                              >
                                <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${groupColor.from} ${groupColor.to} opacity-70 group-hover:opacity-100 transition-opacity duration-300`}></div>
                                <div className="pl-2">
                                  <div className="flex justify-between items-center mb-6">
                                    <span className={`text-[9px] font-black tracking-widest ${groupColor.text} ${groupColor.bg} border ${groupColor.border} px-2 py-1 rounded-md uppercase`}>
                                      {groupsList.includes(match.group) ? `Bảng ${match.group}` : match.group}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{match.location}</span>
                                  </div>

                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between group/team">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${t1Color.bgGradient} flex items-center justify-center text-lg shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.05)] ring-2 ring-white dark:ring-[#141414] group-hover/team:scale-110 transition-transform shrink-0`}>
                                          {teams.find(t => t.id === match.team1Id)?.flag || '🏳️'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <span className={`font-display font-bold text-sm ${t1Color.text} truncate block leading-tight`}>{getTeamName(match.team1Id, match.team1Placeholder, false)}</span>
                                          {groupAssignment.group1.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {groupAssignment.group1.map(p => (
                                                <span key={p} className="text-[9px] font-black text-white bg-blue-600/90 shadow-[0_2px_6px_rgba(37,99,235,0.3)] px-2 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <input
                                        type="number"
                                        value={match.score1 ?? ''}
                                        className={`w-12 h-12 text-center bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:dark:border-slate-600 rounded-xl focus:border-transparent ${t1Color.ring} outline-none font-display font-black text-xl transition-all shadow-inner text-slate-900 dark:text-white shrink-0 ml-2`}
                                        placeholder="-"
                                        onChange={(e) => handleScoreChange(match.id, e.target.value, match.score2?.toString() || '')}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between group/team">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${t2Color.bgGradient} flex items-center justify-center text-lg shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.05)] ring-2 ring-white dark:ring-[#141414] group-hover/team:scale-110 transition-transform shrink-0`}>
                                          {teams.find(t => t.id === match.team2Id)?.flag || '🏳️'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <span className={`font-display font-bold text-sm ${t2Color.text} truncate block leading-tight`}>{getTeamName(match.team2Id, match.team2Placeholder, false)}</span>
                                          {groupAssignment.group2.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {groupAssignment.group2.map(p => (
                                                <span key={p} className="text-[9px] font-black text-white bg-[#8A1538]/90 shadow-[0_2px_6px_rgba(138,21,56,0.3)] px-2 py-0.5 rounded-full uppercase tracking-tighter">{p}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <input
                                        type="number"
                                        value={match.score2 ?? ''}
                                        className={`w-12 h-12 text-center bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:dark:border-slate-600 rounded-xl focus:border-transparent ${t2Color.ring} outline-none font-display font-black text-xl transition-all shadow-inner text-slate-900 dark:text-white shrink-0 ml-2`}
                                        placeholder="-"
                                        onChange={(e) => handleScoreChange(match.id, match.score1?.toString() || '', e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between min-h-[24px]">
                                    {match.status !== 'finished' ? (
                                      <span className="font-mono text-sm font-bold tracking-tight bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md">
                                        {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(mDate)}
                                      </span>
                                    ) : (
                                      <span className={`font-mono text-sm font-bold ${groupColor.text} ${groupColor.bg} px-2 py-1 rounded-md uppercase tracking-wider`}>
                                        Đã xong
                                      </span>
                                    )}
                                    <Calendar className={`w-4 h-4 ${groupColor.icon} opacity-60`} />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'standings' && (
              <div className="space-y-8 sm:space-y-12">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                       <span className="w-8 h-1 bg-amber-500 rounded-full"></span>
                       <span className="text-[10px] font-black uppercase text-amber-500 tracking-[0.3em]">Qualification Path</span>
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[0.9]">Bảng Xếp Hạng</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium text-lg max-w-xl">Cuộc đua giành tấm vé vào vòng knock-out đầy kịch tính</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {groupsList.map(group => {
                    const standings = calculateStandings(group);
                    const groupColor = getGroupColor(group);
                    return (
                      <motion.div 
                        key={group} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-[#121212] rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-100 dark:border-slate-800/60 overflow-hidden flex flex-col group hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300"
                      >
                        {/* Compact header */}
                        <div className={`relative bg-gradient-to-r ${groupColor.from} ${groupColor.to} px-5 py-4 text-white overflow-hidden`}>
                          <Trophy className="absolute -right-2 -bottom-3 w-16 h-16 opacity-15 -rotate-12" />
                          <div className="relative z-10 flex items-center justify-between">
                            <div>
                              <h2 className="text-xl font-display font-black italic leading-none">Bảng {group}</h2>
                              <p className="text-[9px] uppercase font-bold opacity-70 tracking-[0.25em] mt-1">Group Standings</p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
                              {standings.length} đội
                            </span>
                          </div>
                        </div>

                        {/* Compact table */}
                        <div className="px-3 py-2">
                          <table className="w-full text-sm table-fixed">
                            <thead>
                              <tr className="text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 dark:border-slate-800/40">
                                <th className="w-6 px-1 py-3 text-center">#</th>
                                <th className="px-1 py-3 text-left">Đội</th>
                                <th className="w-8 px-1 py-3 text-center">Tr</th>
                                <th className="w-10 px-1 py-3 text-center">HS</th>
                                <th className="w-10 px-1 py-3 text-right">Đ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                              {standings.map((stat, idx) => {
                                const team = teams.find(t => t.id === stat.teamId);
                                const isQualified = idx < 2;
                                return (
                                  <tr key={stat.teamId} className={`group/row transition-colors hover:bg-slate-50 dark:hover:bg-white/5`}>
                                    <td className="px-1 py-3 text-center">
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${isQualified ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'}`}>
                                        {idx + 1}
                                      </span>
                                    </td>
                                    <td className="px-1 py-3">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-base shrink-0">{team?.flag}</span>
                                        <span className={`truncate text-[12px] uppercase tracking-tight ${isQualified ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-600 dark:text-slate-300'}`}>
                                          {team?.name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-1 py-3 text-center font-mono font-bold text-[12px] text-slate-500 dark:text-slate-400">
                                      {stat.played}
                                    </td>
                                    <td className={`px-1 py-3 text-center font-mono font-black text-[12px] ${stat.goalDifference > 0 ? 'text-emerald-500' : stat.goalDifference < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                      {stat.goalDifference > 0 ? `+${stat.goalDifference}` : stat.goalDifference}
                                    </td>
                                    <td className="px-1 py-3 text-right">
                                      <span className={`inline-block min-w-[28px] py-0.5 px-2 rounded-md font-display font-black text-[13px] ${isQualified ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {stat.points}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Compact footer */}
                        <div className="px-5 py-3 bg-slate-50/60 dark:bg-white/5 border-t border-slate-100 dark:border-slate-800/60 mt-auto flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Top 2 đi tiếp</span>
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Knock-out</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'players' && (() => {
              const playerCount = playersInput.split('\n').filter(p => p.trim()).length;
              const finishedMatches = matches.filter(m => m.status === 'finished').length;
              const totalMatches = matches.length;
              const groupsCount = Object.keys(groupAssignments).length;
              // Per-match (by_match) mode stats: đếm toàn bộ matchAssignments (gồm cả vòng bảng + knockout)
              const groupStageMatches = matches.filter(m => groupsList.includes(m.group));
              const allMatchAssignedCount = matches.filter(m => matchAssignments[m.id]).length;
              const groupStageAssignedCount = groupStageMatches.filter(m => matchAssignments[m.id]).length;
              const isPerMatchMode = groupStageAssignedCount > 0 || allMatchAssignedCount > 0;
              const hasAnyAssignment = groupsCount > 0 || isPerMatchMode;
              const totalPot = (() => {
                let pot = 0;
                matches.filter(m => m.status === 'finished').forEach(m => {
                  const a = getMatchAssignment(m);
                  if (a.group1.length === 0 && a.group2.length === 0) return;
                  const t1Won = (m.score1 || 0) > (m.score2 || 0);
                  const t2Won = (m.score2 || 0) > (m.score1 || 0);
                  const isDraw = !t1Won && !t2Won;
                  const v = t1Won || t2Won ? penalties.win + penalties.loss : penalties.draw * 2;
                  pot += v * Math.min(a.group1.length, a.group2.length);
                  void isDraw;
                });
                return pot;
              })();
              const avatarColors = ['from-rose-400 to-rose-600','from-amber-400 to-amber-600','from-emerald-400 to-emerald-600','from-sky-400 to-sky-600','from-violet-400 to-violet-600','from-pink-400 to-pink-600','from-orange-400 to-orange-600','from-teal-400 to-teal-600','from-indigo-400 to-indigo-600','from-fuchsia-400 to-fuchsia-600','from-lime-400 to-lime-600','from-cyan-400 to-cyan-600'];
              const getAvatarColor = (name: string) => avatarColors[Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % avatarColors.length];
              const playerList = playersInput.split('\n').map(p => p.trim()).filter(Boolean);
              return (
              <div className="space-y-10">
                {/* Hero Header */}
                <div className="relative bg-gradient-to-br from-white via-rose-50/30 to-amber-50/20 dark:from-[#141414] dark:via-[#1A0F12] dark:to-[#141414] rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 lg:p-12 border border-slate-100 dark:border-slate-800/60 shadow-[0_30px_60px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#8A1538]/8 to-transparent rounded-full -mr-32 -mt-32 blur-3xl"></div>
                  <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-gradient-to-br from-amber-300/10 to-transparent rounded-full -mb-32 blur-3xl"></div>

                  <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-1 bg-[#8A1538] rounded-full"></span>
                        <span className="text-[10px] font-black uppercase text-[#8A1538] tracking-[0.3em]">Player Management</span>
                      </div>
                      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[0.9]">Người Chơi</h1>
                      <p className="text-slate-500 dark:text-slate-400 font-medium text-lg max-w-xl">Phân chia anh tài theo từng bảng đấu cạnh tranh</p>
                    </div>

                    <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto">
                      {/* Mode selector */}
                      <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-[#0F0F0F] border border-slate-200 dark:border-slate-800 self-stretch lg:self-end">
                        {([
                          { id: 'by_group', label: 'Theo Bảng', sub: '1 chia / bảng', icon: Users },
                          { id: 'by_match', label: 'Theo Trận', sub: '1 chia / trận', icon: Shuffle },
                        ] as const).map(opt => {
                          const active = assignmentMode === opt.id;
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAssignmentMode(opt.id)}
                              className={`relative flex-1 lg:flex-none px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-1.5 ${
                                active
                                  ? 'bg-white dark:bg-[#1A1A1A] text-[#8A1538] dark:text-rose-300 shadow-sm ring-1 ring-[#8A1538]/20'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                              title={opt.sub}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleRandomizeAssignments}
                        className="group relative bg-[#8A1538] hover:bg-[#A61A45] text-white px-6 sm:px-8 py-3 sm:py-4 rounded-[2rem] font-black uppercase text-[10px] sm:text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-2 sm:gap-3 overflow-hidden shadow-[0_15px_35px_rgba(138,21,56,0.3)] hover:scale-105 active:scale-95 whitespace-nowrap w-full lg:w-auto"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Shuffle className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        <span>Chia Nhóm Ngẫu Nhiên</span>
                      </button>
                    </div>
                  </div>

                  {/* Stats Strip */}
                  <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-10">
                    {[
                      { label: 'Tuyển thủ', value: playerCount, sub: 'Đang tham gia', icon: Users, grad: 'from-emerald-500 to-teal-600', text: 'text-emerald-600 dark:text-emerald-400' },
                      isPerMatchMode
                        ? { label: 'Trận đã chia', value: allMatchAssignedCount, sub: `/ ${matches.length} trận`, icon: Shuffle, grad: 'from-amber-500 to-orange-600', text: 'text-amber-600 dark:text-amber-400' }
                        : { label: 'Bảng đã chia', value: groupsCount, sub: `/ ${groupsList.length} bảng`, icon: Shuffle, grad: 'from-[#8A1538] to-[#D6284B]', text: 'text-[#8A1538] dark:text-rose-400' },
                      { label: 'Trận đã đá', value: finishedMatches, sub: `/ ${totalMatches} trận`, icon: Calendar, grad: 'from-blue-500 to-sky-600', text: 'text-blue-600 dark:text-sky-400' },
                      { label: 'Tổng quỹ cược', value: `${totalPot}K`, sub: 'Đã giao dịch', icon: Trophy, grad: 'from-amber-500 to-orange-600', text: 'text-amber-600 dark:text-amber-400' },
                    ].map(s => (
                      <div key={s.label} className="relative bg-white/80 dark:bg-[#0F0F0F]/80 backdrop-blur-sm border border-slate-100 dark:border-slate-800/60 rounded-2xl p-4 sm:p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all group/stat overflow-hidden">
                        <div className={`absolute -top-6 -right-6 w-20 h-20 bg-gradient-to-br ${s.grad} opacity-5 rounded-full blur-xl group-hover/stat:opacity-10 transition-opacity`}></div>
                        <div className="relative flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-1">{s.label}</div>
                            <div className={`font-display text-2xl sm:text-3xl font-black ${s.text} tracking-tight`}>{s.value}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">{s.sub}</div>
                          </div>
                          <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center shadow-md`}>
                            <s.icon className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
                  <div className="lg:col-span-1 space-y-10">
                    <section className="bg-white dark:bg-[#121212] rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-slate-100 dark:border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.02)] relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#8A1538]/5 rounded-bl-[4rem] -mr-8 -mt-8 transition-all group-hover:bg-[#8A1538]/10 group-hover:w-28 group-hover:h-28"></div>
                      <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white mb-2 italic">Cài đặt cược</h2>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] mb-8 block">
                        Số tiền áp dụng cho mỗi trận đấu
                      </p>
                      
                      <div className="space-y-5">
                        {[
                          { key: 'win', label: 'Trận Thắng', color: 'text-emerald-500', dot: 'bg-emerald-500', ring: 'focus:ring-emerald-500/10 focus:border-emerald-500' },
                          { key: 'draw', label: 'Trận Hòa', color: 'text-amber-500', dot: 'bg-amber-500', ring: 'focus:ring-amber-500/10 focus:border-amber-500' },
                          { key: 'loss', label: 'Trận Thua', color: 'text-[#8A1538]', dot: 'bg-[#8A1538]', ring: 'focus:ring-[#8A1538]/10 focus:border-[#8A1538]' },
                        ].map((field) => (
                          <div key={field.key} className="group/item">
                            <div className="flex items-center justify-between mb-2 px-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${field.dot}`}></span>
                                <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider transition-colors group-hover/item:text-slate-900 dark:group-hover/item:text-white">{field.label}</span>
                              </div>
                              <span className={`text-[10px] font-black ${field.color} opacity-60`}>NGHÌN ĐỒNG (K)</span>
                            </div>
                            <div className="relative">
                              <input 
                                type="number" 
                                value={(penalties as any)[field.key]}
                                onChange={e => setPenalties({...penalties, [field.key]: parseInt(e.target.value) || 0})}
                                className={`w-full bg-slate-50 dark:bg-[#0A0A0A] border-2 border-slate-100 dark:border-slate-800 rounded-2xl pl-6 pr-14 py-4 text-left font-display font-black text-xl text-slate-900 dark:text-white focus:ring-8 outline-none transition-all ${field.ring}`}
                              />
                              <span className={`absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black ${field.color} uppercase tracking-wider pointer-events-none`}>K</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="bg-white dark:bg-[#121212] rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-slate-100 dark:border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.02)] relative overflow-hidden group flex flex-col">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-[4rem] -mr-8 -mt-8 transition-all group-hover:bg-emerald-500/10 group-hover:w-28 group-hover:h-28"></div>
                      <div className="flex items-start justify-between mb-2">
                        <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white italic">Danh sách tuyển thủ</h2>
                        <div className="shrink-0 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                          <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{playerList.length} người</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] mb-6 leading-relaxed">
                        Mỗi dòng một người • Chia đều tự động
                      </p>

                      {/* Avatar preview chips */}
                      {playerList.length > 0 && (
                        <div className="mb-5 flex flex-wrap gap-2 pb-5 border-b border-dashed border-slate-200 dark:border-slate-800">
                          {playerList.slice(0, 16).map((name, i) => (
                            <div key={`${name}-${i}`} className="group/chip flex items-center gap-1.5 bg-slate-50 dark:bg-[#0A0A0A] border border-slate-100 dark:border-slate-800 rounded-full pr-3 pl-1 py-1 hover:border-emerald-500/30 hover:bg-white dark:hover:bg-[#0F0F0F] transition-all">
                              <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-white text-[10px] font-black shadow-sm`}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{name}</span>
                            </div>
                          ))}
                          {playerList.length > 16 && (
                            <div className="flex items-center px-3 py-1 rounded-full bg-slate-100 dark:bg-[#0A0A0A] text-[10px] font-black text-slate-500 uppercase tracking-wider">+{playerList.length - 16}</div>
                          )}
                        </div>
                      )}

                      <div className="relative flex-1">
                        <textarea
                          className="w-full h-[260px] text-sm font-medium p-6 bg-slate-50 dark:bg-[#0A0A0A] border-2 border-slate-100 dark:border-slate-800 rounded-3xl focus:bg-white dark:focus:bg-[#0A0A0A] focus:border-emerald-500/50 focus:ring-8 focus:ring-emerald-500/5 outline-none resize-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700"
                          placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;..."
                          value={playersInput}
                          onChange={(e) => setPlayersInput(e.target.value)}
                        />
                      </div>
                    </section>
                  </div>
                  
                  <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-[#121212] rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 md:p-10 border border-slate-100 dark:border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.04)] min-h-full">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
                        <div>
                          <h3 className="font-display text-3xl font-black text-slate-900 dark:text-white italic tracking-tight">Kết Quả Phân Nhóm</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Hệ thống chia bảng đấu công bằng</p>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                          {assignmentHistories.length > 0 && (
                            <div className="relative group/select w-full sm:w-auto">
                              <select 
                                className="appearance-none w-full sm:w-auto bg-slate-50 dark:bg-[#0A0A0A] border-2 border-slate-100 dark:border-slate-800 rounded-2xl pl-4 sm:pl-6 pr-10 sm:pr-12 py-3 sm:py-3.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none focus:border-[#8A1538] focus:ring-8 focus:ring-[#8A1538]/5 transition-all cursor-pointer"
                                onChange={(e) => {
                                  const history = assignmentHistories.find(h => h.id === e.target.value);
                                  if (history) {
                                    setPlayers(history.players);
                                    setPlayersInput(history.players.join('\n'));
                                    setGroupAssignments(history.assignments || {});
                                    setMatchAssignments(history.matchAssignments || {});
                                  }
                                }}
                              >
                                <option value="">LỊCH SỬ CHIA</option>
                                {assignmentHistories.map(h => (
                                  <option key={h.id} value={h.id}>{h.name.toUpperCase()}</option>
                                ))}
                              </select>
                              <ChevronRight className="absolute right-3.5 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" />
                            </div>
                          )}
                          <div className="flex items-center gap-2.5 bg-slate-900 dark:bg-white px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl shadow-lg ring-4 ring-slate-100 dark:ring-white/5 w-full sm:w-auto justify-center sm:justify-start">
                            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[#8A1538]/15 dark:bg-[#8A1538]/20 shrink-0">
                              <Shuffle className="w-3.5 h-3.5 text-rose-300 dark:text-[#8A1538]" />
                            </span>
                            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                              {isPerMatchMode ? (
                                <>
                                  <span className="font-display font-black text-base sm:text-lg text-white dark:text-slate-900 leading-none">{allMatchAssignedCount}</span>
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase text-white/60 dark:text-slate-500 tracking-[0.2em]">/ {matches.length} trận đã chia</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-display font-black text-base sm:text-lg text-white dark:text-slate-900 leading-none">{Object.keys(groupAssignments).length}</span>
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase text-white/60 dark:text-slate-500 tracking-[0.2em]">/ {groupsList.length} bảng đã chia</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {hasAnyAssignment ? (
                        <div className="space-y-10">
                          {/* Premium Summary Dashboard */}
                          <div className="bg-slate-900 dark:bg-[#1A1A1A] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group/summary">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#8A1538]/20 to-transparent rounded-full -mr-32 -mt-32 transition-transform duration-1000 group-hover/summary:scale-110"></div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10 border-b border-white/5 pb-8">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(238,173,25,0.4)]">
                                  <Trophy className="w-6 h-6 text-slate-900" />
                                </div>
                                <div>
                                  <h3 className="font-display text-xl font-black italic">Bảng Tài Chính</h3>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Cập nhật theo tỉ số dự đoán</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative z-10">
                              {(() => {
                                const stats: Record<string, { amount: number; win: number; draw: number; loss: number }> = {};
                                players.forEach(p => stats[p] = { amount: 0, win: 0, draw: 0, loss: 0 });

                                const ensure = (p: string) => {
                                  if (!stats[p]) stats[p] = { amount: 0, win: 0, draw: 0, loss: 0 };
                                };

                                matches.filter(m => m.status === 'finished').forEach(m => {
                                  const assignment = getMatchAssignment(m);
                                  if (assignment.group1.length === 0 && assignment.group2.length === 0) return;
                                  
                                  const t1Won = (m.score1 || 0) > (m.score2 || 0);
                                  const t2Won = (m.score2 || 0) > (m.score1 || 0);
                                  const isDraw = (m.score1 || 0) === (m.score2 || 0);
                                  
                                  assignment.group1.forEach(p => {
                                    ensure(p);
                                    if (t1Won) { stats[p].amount += penalties.win; stats[p].win += 1; }
                                    else if (t2Won) { stats[p].amount += penalties.loss; stats[p].loss += 1; }
                                    else if (isDraw) { stats[p].amount += penalties.draw; stats[p].draw += 1; }
                                  });
                                  
                                  assignment.group2.forEach(p => {
                                    ensure(p);
                                    if (t2Won) { stats[p].amount += penalties.win; stats[p].win += 1; }
                                    else if (t1Won) { stats[p].amount += penalties.loss; stats[p].loss += 1; }
                                    else if (isDraw) { stats[p].amount += penalties.draw; stats[p].draw += 1; }
                                  });
                                });

                                const sorted = Object.entries(stats).sort((a,b) => b[1].amount - a[1].amount);
                                const maxAbs = Math.max(1, ...sorted.map(([, s]) => Math.abs(s.amount)));
                                const podiumStyle = [
                                  { ring: 'ring-2 ring-amber-400/60', badge: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950', glow: 'shadow-[0_0_30px_rgba(251,191,36,0.25)]', label: '🥇' },
                                  { ring: 'ring-2 ring-slate-300/40', badge: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800', glow: 'shadow-[0_0_25px_rgba(203,213,225,0.15)]', label: '🥈' },
                                  { ring: 'ring-2 ring-orange-400/40', badge: 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950', glow: 'shadow-[0_0_25px_rgba(249,115,22,0.2)]', label: '🥉' },
                                ];
                                return sorted.map(([name, s], idx) => {
                                  const amount = s.amount;
                                  const total = s.win + s.draw + s.loss;
                                  const podium = idx < 3 && amount > 0 ? podiumStyle[idx] : null;
                                  const barPct = Math.min(100, Math.abs(amount) / maxAbs * 100);
                                  return (
                                  <motion.div 
                                    whileHover={{ y: -4 }}
                                    key={name} 
                                    className={`relative bg-white/5 backdrop-blur-sm border border-white/10 p-3 sm:p-5 rounded-2xl sm:rounded-3xl transition-all hover:bg-white/10 group/stat ${podium ? `${podium.ring} ${podium.glow}` : ''}`}
                                  >
                                    {podium && (
                                      <div className={`absolute -top-2 -right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full ${podium.badge} flex items-center justify-center text-xs sm:text-sm font-black shadow-lg ring-2 ring-slate-900`}>
                                        {podium.label}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-white text-[10px] font-black shadow-sm shrink-0`}>
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest truncate flex-1 min-w-0">{name}</p>
                                    </div>
                                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                                       <div className="flex items-baseline gap-1 min-w-0">
                                         <span className={`text-xl sm:text-2xl font-display font-black tracking-tight ${amount > 0 ? 'text-emerald-400' : amount < 0 ? 'text-[#D6284B]' : 'text-slate-400'}`}>
                                           {amount > 0 ? `+${amount}` : amount}
                                         </span>
                                         <span className="text-[10px] font-bold text-slate-600 uppercase">k</span>
                                       </div>
                                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider shrink-0">{total} tr</span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${amount > 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : amount < 0 ? 'bg-gradient-to-r from-rose-500 to-[#8A1538]' : 'bg-slate-700'}`}
                                        style={{ width: `${barPct}%` }}
                                      ></div>
                                    </div>
                                    <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-white/5 grid grid-cols-3 gap-0.5 sm:gap-1 text-center">
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight sm:tracking-wider text-emerald-400/70">Thắng</span>
                                        <span className="text-sm font-mono font-black text-emerald-400">{s.win}</span>
                                      </div>
                                      <div className="flex flex-col min-w-0 border-x border-white/5">
                                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight sm:tracking-wider text-amber-400/70">Hòa</span>
                                        <span className="text-sm font-mono font-black text-amber-400">{s.draw}</span>
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight sm:tracking-wider text-[#D6284B]/80">Thua</span>
                                        <span className="text-sm font-mono font-black text-[#D6284B]">{s.loss}</span>
                                      </div>
                                    </div>
                                  </motion.div>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 pt-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="h-[1px] w-8 bg-slate-200 dark:bg-slate-700"></div>
                              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                                {isPerMatchMode ? 'Chi tiết phân trận theo ngày' : 'Chi tiết phân bảng'}
                              </span>
                              {showGroupBreakdown && !isPerMatchMode && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                                  <ArrowLeftRight className="w-2.5 h-2.5" />
                                  Click vào tên để chuyển nhóm
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => setShowGroupBreakdown(v => !v)}
                              className="group/btn flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl ring-4 ring-slate-100 dark:ring-white/5 transition-all hover:-translate-y-0.5"
                            >
                              <span>
                                {showGroupBreakdown
                                  ? (isPerMatchMode ? 'Ẩn theo ngày' : 'Ẩn 12 bảng')
                                  : (isPerMatchMode ? 'Xem theo ngày' : 'Xem 12 bảng')}
                              </span>
                              <ChevronRight className={`w-4 h-4 transition-transform ${showGroupBreakdown ? '-rotate-90' : 'rotate-90'}`} />
                            </button>
                          </div>

                          <AnimatePresence initial={false}>
                          {showGroupBreakdown && isPerMatchMode && (() => {
                            // Gom tất cả các trận (vòng bảng + knockout) có matchAssignment theo ngày
                            const assignedGroupMatches = matches
                              .filter(m => matchAssignments[m.id])
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                            const byDate: Record<string, typeof assignedGroupMatches> = {};
                            assignedGroupMatches.forEach(m => {
                              const d = new Date(m.date);
                              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                              if (!byDate[key]) byDate[key] = [];
                              byDate[key].push(m);
                            });
                            const dateKeys = Object.keys(byDate).sort();
                            const weekdayShort = ['CN','T2','T3','T4','T5','T6','T7'];
                            return (
                              <motion.div
                                key="by-date-breakdown"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-8 overflow-hidden"
                              >
                                {dateKeys.map(key => {
                                  const dayMatches = byDate[key];
                                  const d = new Date(dayMatches[0].date);
                                  return (
                                    <motion.div
                                      key={key}
                                      initial={{ opacity: 0, y: 8 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-[#0F0F0F] shadow-sm"
                                    >
                                      {/* Date header */}
                                      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-[#141414] dark:to-[#0F0F0F]">
                                        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#A41A45] via-[#8A1538] to-[#5C0E25] flex flex-col items-center justify-center text-white shadow-[0_8px_20px_-6px_rgba(138,21,56,0.45)] shrink-0">
                                          <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-80 leading-none">{weekdayShort[d.getDay()]}</span>
                                          <span className="font-display font-black text-base leading-none mt-0.5">{d.getDate()}</span>
                                        </div>
                                        <div className="min-w-0">
                                          <div className="font-display font-black text-base text-slate-800 dark:text-slate-100 uppercase tracking-tight leading-none">
                                            {new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(d)}, {d.getDate()}/{d.getMonth() + 1}/{d.getFullYear()}
                                          </div>
                                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mt-1">
                                            {dayMatches.length} trận đã chia
                                          </div>
                                        </div>
                                      </div>

                                      {/* Matches */}
                                      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {dayMatches.map(m => {
                                          const a = matchAssignments[m.id]!;
                                          const gc = getGroupColor(m.group);
                                          const t1 = teams.find(t => t.id === m.team1Id);
                                          const t2 = teams.find(t => t.id === m.team2Id);
                                          const t1Name = getTeamName(m.team1Id, m.team1Placeholder, false);
                                          const t2Name = getTeamName(m.team2Id, m.team2Placeholder, false);
                                          const mDate = new Date(m.date);
                                          const timeStr = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(mDate);
                                          return (
                                            <div key={m.id} className="p-4 sm:p-5">
                                              {/* Match meta row */}
                                              <div className="flex items-center justify-between gap-3 mb-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className={`text-[9px] font-black tracking-widest ${gc.text} ${gc.bg} border ${gc.border} px-2 py-0.5 rounded-md uppercase shrink-0`}>
                                                    {groupsList.includes(m.group) ? `Bảng ${m.group}` : m.group}
                                                  </span>
                                                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">{m.location}</span>
                                                </div>
                                                <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#1A1A1A] px-2 py-0.5 rounded-md shrink-0">{timeStr}</span>
                                              </div>

                                              {/* Teams + chips */}
                                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-start">
                                                {/* Side 1 */}
                                                <div className="space-y-2">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-lg shrink-0">{t1?.flag || '🏳️'}</span>
                                                    <span className="font-display font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{t1Name}</span>
                                                  </div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {a.side1.length > 0 ? a.side1.map(p => (
                                                      <button
                                                        type="button"
                                                        key={p}
                                                        onClick={() => {
                                                          // chuyển sang side2
                                                          setMatchAssignments(prev => {
                                                            const cur = prev[m.id];
                                                            if (!cur) return prev;
                                                            return {
                                                              ...prev,
                                                              [m.id]: {
                                                                side1: cur.side1.filter(x => x !== p),
                                                                side2: [...cur.side2, p],
                                                              },
                                                            };
                                                          });
                                                        }}
                                                        title={`Chuyển ${p} sang đội đối thủ`}
                                                        className="group/chip relative inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-blue-50 dark:bg-sky-500/10 hover:bg-blue-100 dark:hover:bg-sky-500/20 px-2 py-1 pr-5 rounded-lg border border-blue-100 dark:border-sky-500/20 hover:border-blue-300 dark:hover:border-sky-400/40 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                                      >
                                                        <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${getAvatarColor(p)} text-white text-[8px] font-black flex items-center justify-center`}>{p.charAt(0).toUpperCase()}</span>
                                                        {p}
                                                        <ArrowLeftRight className="absolute right-1 w-2.5 h-2.5 text-blue-500 opacity-0 group-hover/chip:opacity-100 transition-opacity" />
                                                      </button>
                                                    )) : <span className="text-[10px] italic text-slate-400 dark:text-slate-600">(trống)</span>}
                                                  </div>
                                                </div>

                                                {/* VS divider */}
                                                <div className="hidden sm:flex flex-col items-center justify-center pt-1">
                                                  <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">VS</span>
                                                </div>

                                                {/* Side 2 */}
                                                <div className="space-y-2">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-lg shrink-0">{t2?.flag || '🏳️'}</span>
                                                    <span className="font-display font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{t2Name}</span>
                                                  </div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {a.side2.length > 0 ? a.side2.map(p => (
                                                      <button
                                                        type="button"
                                                        key={p}
                                                        onClick={() => {
                                                          setMatchAssignments(prev => {
                                                            const cur = prev[m.id];
                                                            if (!cur) return prev;
                                                            return {
                                                              ...prev,
                                                              [m.id]: {
                                                                side1: [...cur.side1, p],
                                                                side2: cur.side2.filter(x => x !== p),
                                                              },
                                                            };
                                                          });
                                                        }}
                                                        title={`Chuyển ${p} sang đội đối thủ`}
                                                        className="group/chip relative inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 px-2 py-1 pr-5 rounded-lg border border-rose-100 dark:border-rose-500/20 hover:border-rose-300 dark:hover:border-rose-400/40 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8A1538]/30"
                                                      >
                                                        <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${getAvatarColor(p)} text-white text-[8px] font-black flex items-center justify-center`}>{p.charAt(0).toUpperCase()}</span>
                                                        {p}
                                                        <ArrowLeftRight className="absolute right-1 w-2.5 h-2.5 text-[#8A1538] opacity-0 group-hover/chip:opacity-100 transition-opacity" />
                                                      </button>
                                                    )) : <span className="text-[10px] italic text-slate-400 dark:text-slate-600">(trống)</span>}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </motion.div>
                            );
                          })()}
                          {showGroupBreakdown && !isPerMatchMode && (
                          <motion.div
                            key="group-breakdown"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-10 overflow-hidden"
                          >
                          {groupsList.map(group => {
                            const data = groupAssignments[group];
                            if (!data) return null;
                            const gc = getGroupColor(group);
                            return (
                              <motion.div 
                                key={group} 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-[#0F0F0F] shadow-sm hover:shadow-lg transition-all"
                              >
                                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${gc.from} ${gc.to}`}></div>
                                <div className="px-6 py-3.5 font-display font-bold text-sm uppercase tracking-widest flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gc.from} ${gc.to} flex items-center justify-center text-white font-black text-xs shadow-md`}>{group}</div>
                                    <span className="text-slate-700 dark:text-slate-200">Bảng {group}</span>
                                  </div>
                                  <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${gc.text} ${gc.bg} px-2 py-0.5 rounded-full`}>{data.group1.length + data.group2.length} người</div>
                                </div>
                                  <div className="relative grid grid-cols-2">
                                    <div className="absolute left-1/2 top-3 bottom-3 -translate-x-1/2 z-10 hidden sm:flex flex-col items-center justify-center">
                                      <div className="w-px h-full bg-gradient-to-b from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>
                                      <div className="absolute bg-white dark:bg-[#0F0F0F] border border-slate-200 dark:border-slate-700 w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider shadow-sm">VS</div>
                                    </div>
                                    <div className="p-5 space-y-3">
                                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-sky-400 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                        <span>Nhóm 1</span>
                                        <span className="ml-auto opacity-40 normal-case tracking-normal">{data.group1.length}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {data.group1.map(p => (
                                          <button
                                            type="button"
                                            key={p}
                                            onClick={() => handleMovePlayerBetweenGroups(group, p, 'group1')}
                                            title={`Chuyển ${p} sang Nhóm 2`}
                                            className="group/chip relative inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-blue-50 dark:bg-sky-500/10 hover:bg-blue-100 dark:hover:bg-sky-500/20 px-2 py-1 pr-6 rounded-lg border border-blue-100 dark:border-sky-500/20 hover:border-blue-300 dark:hover:border-sky-400/40 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                          >
                                            <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${getAvatarColor(p)} text-white text-[8px] font-black flex items-center justify-center`}>{p.charAt(0).toUpperCase()}</span>
                                            {p}
                                            <ArrowLeftRight className="absolute right-1.5 w-2.5 h-2.5 text-blue-500 opacity-0 group-hover/chip:opacity-100 transition-opacity" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="p-5 space-y-3 border-l border-slate-100 dark:border-slate-800">
                                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#8A1538] dark:text-rose-400 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#8A1538]"></span>
                                        <span>Nhóm 2</span>
                                        <span className="ml-auto opacity-40 normal-case tracking-normal">{data.group2.length}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {data.group2.map(p => (
                                          <button
                                            type="button"
                                            key={p}
                                            onClick={() => handleMovePlayerBetweenGroups(group, p, 'group2')}
                                            title={`Chuyển ${p} sang Nhóm 1`}
                                            className="group/chip relative inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 px-2 py-1 pr-6 rounded-lg border border-rose-100 dark:border-rose-500/20 hover:border-rose-300 dark:hover:border-rose-400/40 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8A1538]/30"
                                          >
                                            <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${getAvatarColor(p)} text-white text-[8px] font-black flex items-center justify-center`}>{p.charAt(0).toUpperCase()}</span>
                                            {p}
                                            <ArrowLeftRight className="absolute right-1.5 w-2.5 h-2.5 text-[#8A1538] opacity-0 group-hover/chip:opacity-100 transition-opacity" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                              </motion.div>
                            );
                          })}
                          </motion.div>
                          )}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
                          <div className="w-24 h-24 bg-slate-50 dark:bg-[#1A1A1A] rounded-[2rem] flex items-center justify-center text-slate-300 dark:text-slate-600">
                             <Users className="w-12 h-12" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-display font-bold text-xl text-slate-800 dark:text-slate-200 tracking-tight">Chưa có kết quả phân nhóm</p>
                            <p className="text-sm text-slate-400 dark:text-slate-500">Hãy nhập danh sách tuyển thủ bên trái và bấm Quay Random</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="bg-white dark:bg-[#141414] border-t border-slate-200 dark:border-slate-800 py-10 mt-20 mb-20 lg:mb-0">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-[#8A1538] p-1.5 rounded-md">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <span className="font-display font-black text-xl uppercase tracking-tighter">WC 2026 Prediction</span>
          </div>

          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] text-center">
            © 2026 · Developed with ❤️ for <span className="font-extrabold text-emerald-500 dark:text-emerald-400">Sống Khỏe</span> Group
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] z-50">
        <nav className="flex items-center justify-around h-16">
          {[
            { id: 'matches', label: 'Match', icon: Calendar, color: 'rose' },
            { id: 'standings', label: 'Rank', icon: Trophy, color: 'amber' },
            { id: 'players', label: 'Teams', icon: Users, color: 'emerald' },
          ].map((item) => {
            const isActive = activeTab === item.id;
            let activeColor = 'text-[#8A1538]';
            let iconColor = 'text-slate-400 dark:text-slate-500';
            
            if (item.color === 'rose') {
                activeColor = 'text-[#8A1538] dark:text-rose-400';
                iconColor = isActive ? 'text-[#8A1538] dark:text-rose-400' : 'text-slate-400 dark:text-slate-500';
            } else if (item.color === 'amber') {
                activeColor = 'text-amber-600 dark:text-amber-400';
                iconColor = isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500';
            } else if (item.color === 'emerald') {
                activeColor = 'text-emerald-600 dark:text-emerald-400';
                iconColor = isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500';
            }

            return (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                  isActive ? activeColor : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <item.icon className={`w-5 h-5 ${iconColor}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <AnimatePresence>
        {showResetModal && (
          <motion.div
            key="reset-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[110] flex items-center justify-center p-4"
            onClick={() => !resetting && setShowResetModal(false)}
          >
            <motion.div
              key="reset-modal"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-white dark:bg-[#111] rounded-[2rem] shadow-[0_40px_90px_-20px_rgba(138,21,56,0.45)] border border-rose-100/60 dark:border-rose-500/10 overflow-hidden"
            >
              {/* Top gradient bar */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-[#D6284B] to-[#8A1538]"></div>
              {/* Decorative glow blobs */}
              <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-rose-500/15 blur-3xl"></div>
              <div className="pointer-events-none absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl"></div>

              {/* Close */}
              <button
                type="button"
                onClick={() => !resetting && setShowResetModal(false)}
                disabled={resetting}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative p-8 sm:p-10">
                {/* Icon */}
                <div className="flex items-start gap-5 mb-6">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-rose-400/40 to-amber-400/30 blur-xl"></div>
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D6284B] via-[#A41A45] to-[#5C0E25] flex items-center justify-center shadow-[0_12px_28px_-6px_rgba(138,21,56,0.55)] ring-4 ring-white dark:ring-[#111]">
                      <AlertTriangle className="w-8 h-8 text-white drop-shadow" strokeWidth={2.25} />
                    </div>
                  </div>
                  <div className="pt-1">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-100 dark:border-rose-500/20 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                      Hành động không thể hoàn tác
                    </div>
                    <h3 className="font-display text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                      Reset toàn bộ dữ liệu?
                    </h3>
                  </div>
                </div>

                <p className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 mb-6">
                  Toàn bộ <span className="font-bold text-slate-900 dark:text-white">tỉ số</span> và <span className="font-bold text-slate-900 dark:text-white">phân nhóm người chơi</span> sẽ bị xóa để đồng bộ lại lịch thi đấu mới nhất từ hệ thống.
                </p>

                {/* What gets cleared */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0A0A0A] p-4 mb-7 space-y-2.5">
                  {[
                    { label: 'Tỉ số tất cả các trận', removed: true },
                    { label: 'Phân nhóm người chơi (vòng bảng & loại trực tiếp)', removed: true },
                    { label: 'Danh sách người chơi', removed: false },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3 text-[13px]">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-black ${
                        row.removed
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                          : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                      }`}>
                        {row.removed ? '×' : '✓'}
                      </span>
                      <span className={`${row.removed ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'} font-medium`}>
                        {row.label}
                      </span>
                      <span className={`ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        row.removed
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {row.removed ? 'Xóa' : 'Giữ lại'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    disabled={resetting}
                    className="flex-1 px-5 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1A1A1A] border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#222] active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={performReset}
                    disabled={resetting}
                    className="flex-1 px-5 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider text-white bg-gradient-to-br from-[#D6284B] via-[#A41A45] to-[#6B0F2A] shadow-[0_12px_28px_-8px_rgba(138,21,56,0.6)] hover:shadow-[0_16px_36px_-8px_rgba(138,21,56,0.75)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {resetting ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                        Đang reset...
                      </>
                    ) : (
                      <>
                        <Shuffle className="w-4 h-4" />
                        Xác nhận Reset
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white dark:bg-[#111] rounded-[3rem] p-10 w-full max-w-md shadow-[0_30px_70px_rgba(0,0,0,0.2)] border border-white/20 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#8A1538] via-[#D6284B] to-[#8A1538]"></div>
            
            <div className="flex items-center gap-5 mb-10">
              <div className="bg-[#8A1538]/10 p-4 rounded-[1.5rem]">
                <Save className="w-8 h-8 text-[#8A1538]" />
              </div>
              <div>
                <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white leading-tight italic">Lưu Lịch Sử</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Ghi lại khoảnh khắc chia bảng</p>
                <span className={`inline-flex items-center gap-1.5 mt-2 text-[10px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full ring-1 ${
                  assignmentMode === 'by_match'
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-300/40'
                    : 'bg-[#8A1538]/8 dark:bg-rose-500/10 text-[#8A1538] dark:text-rose-300 ring-[#8A1538]/20'
                }`}>
                  <Shuffle className="w-3 h-3" />
                  {assignmentMode === 'by_match' ? 'Chế độ: Theo từng trận' : 'Chế độ: Theo bảng'}
                </span>
              </div>
            </div>
            
            <div className="mb-10">
              <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-[0.2em] px-1">
                Tên Phiên Bản
              </label>
              <div className="relative group">
                <input 
                  autoFocus
                  value={newSaveName}
                  onChange={e => setNewSaveName(e.target.value)}
                  placeholder="VD: Tuần 01 - Nhóm A"
                  className="w-full bg-slate-50 dark:bg-[#0A0A0A] border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-6 py-5 text-lg font-display font-black text-slate-900 dark:text-white outline-none focus:border-[#8A1538] focus:ring-8 focus:ring-[#8A1538]/5 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSaveName.trim()) {
                      confirmRandomize();
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={confirmRandomize}
                disabled={!newSaveName.trim()}
                className="flex-[1.5] px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white bg-[#8A1538] hover:bg-[#A61A45] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed shadow-[0_15px_30px_rgba(138,21,56,0.3)] transition-all active:scale-95"
              >
                Xác nhận lưu
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

