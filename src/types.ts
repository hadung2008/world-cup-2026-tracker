export type Team = {
  id: string;
  name: string;
  group: string;
  flag: string;
};

export type Match = {
  id: string;
  team1Id: string | null;
  team2Id: string | null;
  team1Placeholder?: string;
  team2Placeholder?: string;
  score1: number | null;
  score2: number | null;
  status: 'pending' | 'finished';
  date: string;
  group: string;
  location?: string;
};

export type TeamStats = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type MatchAssignment = {
  side1: string[];
  side2: string[];
};

export type GroupAssignmentHistory = {
  id: string;
  name: string;
  players: string[];
  assignments: Record<string, { group1: string[], group2: string[] }>;
  matchAssignments?: Record<string, MatchAssignment>;
  timestamp: number;
};
