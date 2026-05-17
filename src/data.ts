import { Match, Team } from './types';

const rawGroups: Record<string, Array<{ name: string; flag: string }>> = {
  A: [
    { name: 'Mexico', flag: '🇲🇽' },
    { name: 'Nam Phi', flag: '🇿🇦' },
    { name: 'Hàn Quốc', flag: '🇰🇷' },
    { name: 'CH Séc', flag: '🇨🇿' },
  ],
  B: [
    { name: 'Canada', flag: '🇨🇦' },
    { name: 'Bosnia & Herzegovina', flag: '🇧🇦' },
    { name: 'Qatar', flag: '🇶🇦' },
    { name: 'Thụy Sĩ', flag: '🇨🇭' },
  ],
  C: [
    { name: 'Brazil', flag: '🇧🇷' },
    { name: 'Maroc', flag: '🇲🇦' },
    { name: 'Haiti', flag: '🇭🇹' },
    { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  ],
  D: [
    { name: 'Mỹ', flag: '🇺🇸' },
    { name: 'Paraguay', flag: '🇵🇾' },
    { name: 'Úc', flag: '🇦🇺' },
    { name: 'Thổ Nhĩ Kỳ', flag: '🇹🇷' },
  ],
  E: [
    { name: 'Đức', flag: '🇩🇪' },
    { name: 'Curacao', flag: '🇨🇼' },
    { name: 'Bờ Biển Ngà', flag: '🇨🇮' },
    { name: 'Ecuador', flag: '🇪🇨' },
  ],
  F: [
    { name: 'Hà Lan', flag: '🇳🇱' },
    { name: 'Nhật Bản', flag: '🇯🇵' },
    { name: 'Thuỵ Điển', flag: '🇸🇪' },
    { name: 'Tunisia', flag: '🇹🇳' },
  ],
  G: [
    { name: 'Bỉ', flag: '🇧🇪' },
    { name: 'Ai Cập', flag: '🇪🇬' },
    { name: 'Iran', flag: '🇮🇷' },
    { name: 'New Zealand', flag: '🇳🇿' },
  ],
  H: [
    { name: 'Tây Ban Nha', flag: '🇪🇸' },
    { name: 'Cabo Verde', flag: '🇨🇻' },
    { name: 'Saudi Arabia', flag: '🇸🇦' },
    { name: 'Uruguay', flag: '🇺🇾' },
  ],
  I: [
    { name: 'Pháp', flag: '🇫🇷' },
    { name: 'Senegal', flag: '🇸🇳' },
    { name: 'Iraq', flag: '🇮🇶' },
    { name: 'Na Uy', flag: '🇳🇴' },
  ],
  J: [
    { name: 'Argentina', flag: '🇦🇷' },
    { name: 'Algeria', flag: '🇩🇿' },
    { name: 'Áo', flag: '🇦🇹' },
    { name: 'Jordan', flag: '🇯🇴' },
  ],
  K: [
    { name: 'Bồ Đào Nha', flag: '🇵🇹' },
    { name: 'CHDC Congo', flag: '🇨🇩' },
    { name: 'Uzbekistan', flag: '🇺🇿' },
    { name: 'Colombia', flag: '🇨🇴' },
  ],
  L: [
    { name: 'Anh', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { name: 'Croatia', flag: '🇭🇷' },
    { name: 'Ghana', flag: '🇬🇭' },
    { name: 'Panama', flag: '🇵🇦' },
  ],
};

export const initialTeams: Team[] = [];
export const initialMatches: Match[] = [];

let matchIdCounter = 1;

// Helper to create date in Hanoi time (GMT+7)
function createHanoiDate(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}:00+07:00`).toISOString();
}

// Map teams to groupTeams
const teamMap: Record<string, Team[]> = {};
Object.entries(rawGroups).forEach(([groupName, teamsList]) => {
  const groupTeams = teamsList.map((t, index) => ({
    id: `${groupName}${index + 1}`,
    name: t.name,
    group: groupName,
    flag: t.flag,
  }));
  initialTeams.push(...groupTeams);
  teamMap[groupName] = groupTeams;
});

const groupSchedules: Record<string, Array<{ teams: [number, number], date: string, time: string, location: string }>> = {
  A: [
    { teams: [0, 1], date: '2026-06-12', time: '02:00', location: 'Mexico' },
    { teams: [2, 3], date: '2026-06-12', time: '09:00', location: 'Mexico' },
    { teams: [3, 1], date: '2026-06-18', time: '23:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-19', time: '08:00', location: 'Mexico' },
    { teams: [3, 0], date: '2026-06-25', time: '08:00', location: 'Mexico' },
    { teams: [1, 2], date: '2026-06-25', time: '08:00', location: 'Mexico' },
  ],
  B: [
    { teams: [0, 1], date: '2026-06-13', time: '02:00', location: 'Canada' },
    { teams: [2, 3], date: '2026-06-14', time: '02:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-19', time: '02:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-19', time: '05:00', location: 'Canada' },
    { teams: [3, 0], date: '2026-06-25', time: '02:00', location: 'Canada' },
    { teams: [1, 2], date: '2026-06-25', time: '02:00', location: 'United States' },
  ],
  C: [
    { teams: [0, 1], date: '2026-06-14', time: '05:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-14', time: '08:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-20', time: '05:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-20', time: '07:30', location: 'United States' },
    { teams: [3, 0], date: '2026-06-25', time: '05:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-25', time: '05:00', location: 'United States' },
  ],
  D: [
    { teams: [0, 1], date: '2026-06-13', time: '08:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-14', time: '11:00', location: 'Canada' },
    { teams: [0, 2], date: '2026-06-20', time: '02:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-20', time: '10:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-26', time: '09:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-26', time: '09:00', location: 'United States' },
  ],
  E: [
    { teams: [0, 1], date: '2026-06-15', time: '00:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-15', time: '06:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-21', time: '03:00', location: 'Canada' },
    { teams: [3, 1], date: '2026-06-21', time: '07:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-26', time: '03:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-26', time: '03:00', location: 'United States' },
  ],
  F: [
    { teams: [0, 1], date: '2026-06-15', time: '03:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-15', time: '09:00', location: 'Mexico' },
    { teams: [0, 2], date: '2026-06-21', time: '00:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-21', time: '11:00', location: 'Mexico' },
    { teams: [1, 2], date: '2026-06-26', time: '06:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-26', time: '06:00', location: 'United States' },
  ],
  G: [
    { teams: [0, 1], date: '2026-06-16', time: '02:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-16', time: '08:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-22', time: '02:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-22', time: '08:00', location: 'Canada' },
    { teams: [1, 2], date: '2026-06-27', time: '10:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-27', time: '10:00', location: 'Canada' },
  ],
  H: [
    { teams: [0, 1], date: '2026-06-15', time: '23:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-16', time: '05:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-21', time: '23:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-22', time: '05:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-27', time: '07:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-27', time: '07:00', location: 'Mexico' },
  ],
  I: [
    { teams: [0, 1], date: '2026-06-17', time: '02:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-17', time: '05:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-23', time: '04:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-23', time: '07:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-27', time: '02:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-27', time: '02:00', location: 'Canada' },
  ],
  J: [
    { teams: [0, 1], date: '2026-06-17', time: '08:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-17', time: '11:00', location: 'United States' },
    { teams: [0, 2], date: '2026-06-23', time: '00:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-23', time: '10:00', location: 'United States' },
    { teams: [1, 2], date: '2026-06-28', time: '09:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-28', time: '09:00', location: 'United States' },
  ],
  K: [
    { teams: [0, 1], date: '2026-06-18', time: '00:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-18', time: '09:00', location: 'Mexico' },
    { teams: [0, 2], date: '2026-06-24', time: '00:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-24', time: '09:00', location: 'Mexico' },
    { teams: [3, 0], date: '2026-06-28', time: '06:30', location: 'United States' },
    { teams: [1, 2], date: '2026-06-28', time: '06:30', location: 'United States' },
  ],
  L: [
    { teams: [0, 1], date: '2026-06-18', time: '03:00', location: 'United States' },
    { teams: [2, 3], date: '2026-06-18', time: '06:00', location: 'Canada' },
    { teams: [0, 2], date: '2026-06-24', time: '03:00', location: 'United States' },
    { teams: [3, 1], date: '2026-06-24', time: '06:00', location: 'Canada' },
    { teams: [1, 2], date: '2026-06-28', time: '04:00', location: 'United States' },
    { teams: [3, 0], date: '2026-06-28', time: '04:00', location: 'United States' },
  ],
};

// Clear and rebuild based on groupSchedules
Object.entries(groupSchedules).forEach(([groupName, schedule]) => {
  const groupTeams = teamMap[groupName];
  schedule.forEach((matchInfo) => {
    initialMatches.push({
      id: `M${matchIdCounter++}`,
      team1Id: groupTeams[matchInfo.teams[0]].id,
      team2Id: groupTeams[matchInfo.teams[1]].id,
      score1: null,
      score2: null,
      status: 'pending',
      date: createHanoiDate(matchInfo.date, matchInfo.time),
      group: groupName,
      location: matchInfo.location,
    });
  });
});

// Knockout Stage - Vòng 1/16 (Round of 32)
const round32MatchesRaw = [
  { p1: 'Nhì bảng A', p2: 'Nhì bảng B', date: '2026-06-29', time: '02:00', loc: 'United States' },
  { p1: 'Nhất bảng C', p2: 'Nhì bảng F', date: '2026-06-30', time: '00:00', loc: 'United States' },
  { p1: 'Nhất bảng E', p2: 'Hạng ba bảng A/B/C/D/F', date: '2026-06-30', time: '03:30', loc: 'United States' },
  { p1: 'Nhất bảng F', p2: 'Nhì bảng C', date: '2026-06-30', time: '08:00', loc: 'Mexico' },
  { p1: 'Nhì bảng E', p2: 'Nhì bảng I', date: '2026-07-01', time: '00:00', loc: 'United States' },
  { p1: 'Nhất bảng I', p2: 'Hạng ba bảng C/D/F/G/H', date: '2026-07-01', time: '04:00', loc: 'United States' },
  { p1: 'Nhất bảng A', p2: 'Hạng ba bảng C/E/F/H/I', date: '2026-07-01', time: '08:00', loc: 'Mexico' },
  { p1: 'Nhất bảng L', p2: 'Hạng ba bảng E/H/I/J/K', date: '2026-07-01', time: '23:00', loc: 'United States' },
  { p1: 'Nhất bảng G', p2: 'Hạng ba bảng A/E/H/I/J', date: '2026-07-02', time: '03:00', loc: 'United States' },
  { p1: 'Nhất bảng D', p2: 'Hạng ba bảng B/E/F/L', date: '2026-07-02', time: '07:00', loc: 'United States' },
  { p1: 'Nhất bảng H', p2: 'Nhì bảng J', date: '2026-07-03', time: '02:00', loc: 'United States' },
  { p1: 'Nhì bảng K', p2: 'Nhì bảng L', date: '2026-07-03', time: '06:00', loc: 'Canada' },
  { p1: 'Nhất bảng B', p2: 'Hạng ba bảng E/F/G/H/I', date: '2026-07-03', time: '10:00', loc: 'Canada' },
  { p1: 'Nhì bảng D', p2: 'Nhì bảng G', date: '2026-07-04', time: '01:00', loc: 'United States' },
  { p1: 'Nhất bảng J', p2: 'Nhì bảng H', date: '2026-07-04', time: '05:00', loc: 'United States' },
  { p1: 'Nhất bảng K', p2: 'Hạng ba bảng D/E/I/J/L', date: '2026-07-04', time: '08:30', loc: 'United States' },
];

round32MatchesRaw.forEach((m) => {
  initialMatches.push({
    id: `M${matchIdCounter++}`,
    team1Id: null,
    team2Id: null,
    team1Placeholder: m.p1,
    team2Placeholder: m.p2,
    score1: null,
    score2: null,
    status: 'pending',
    date: createHanoiDate(m.date, m.time),
    group: 'Vòng 1/16',
    location: m.loc,
  });
});

// Vòng 1/8 (Round of 16)
let currentDate = new Date('2026-07-05T15:00:00Z');
for (let i = 1; i <= 8; i++) {
  initialMatches.push({
    id: `M${matchIdCounter++}`,
    team1Id: null,
    team2Id: null,
    team1Placeholder: `Thắng Vòng 1/16 - T${i*2 + 71}`,
    team2Placeholder: `Thắng Vòng 1/16 - T${i*2 + 72}`,
    score1: null,
    score2: null,
    status: 'pending',
    date: new Date(currentDate).toISOString(),
    group: 'Vòng 1/8',
    location: 'Canada',
  });
  currentDate.setHours(currentDate.getHours() + 4);
}

// Tứ kết
currentDate = new Date('2026-07-09T15:00:00Z');
for (let i = 1; i <= 4; i++) {
  initialMatches.push({
    id: `M${matchIdCounter++}`,
    team1Id: null,
    team2Id: null,
    team1Placeholder: `Thắng Vòng 1/8 - T${i*2 + 87}`,
    team2Placeholder: `Thắng Vòng 1/8 - T${i*2 + 88}`,
    score1: null,
    score2: null,
    status: 'pending',
    date: new Date(currentDate).toISOString(),
    group: 'Tứ kết',
    location: 'Mexico',
  });
  currentDate.setHours(currentDate.getHours() + 8);
}

currentDate = new Date('2026-07-14T20:00:00Z');
for (let i = 1; i <= 2; i++) {
  initialMatches.push({
    id: `M${matchIdCounter++}`,
    team1Id: null,
    team2Id: null,
    team1Placeholder: `Thắng Tứ kết ${i*2 - 1}`,
    team2Placeholder: `Thắng Tứ kết ${i*2}`,
    score1: null,
    score2: null,
    status: 'pending',
    date: new Date(currentDate).toISOString(),
    group: 'Bán kết',
    location: 'United States',
  });
  currentDate.setDate(currentDate.getDate() + 1);
}

currentDate = new Date('2026-07-18T20:00:00Z');
initialMatches.push({
  id: `M${matchIdCounter++}`,
  team1Id: null,
  team2Id: null,
  team1Placeholder: `Thua Bán kết 1`,
  team2Placeholder: `Thua Bán kết 2`,
  score1: null,
  score2: null,
  status: 'pending',
  date: new Date(currentDate).toISOString(),
  group: 'Tranh hạng 3',
  location: 'United States',
});

currentDate = new Date('2026-07-19T20:00:00Z');
initialMatches.push({
  id: `M${matchIdCounter++}`,
  team1Id: null,
  team2Id: null,
  team1Placeholder: `Thắng Bán kết 1`,
  team2Placeholder: `Thắng Bán kết 2`,
  score1: null,
  score2: null,
  status: 'pending',
  date: new Date(currentDate).toISOString(),
  group: 'Chung kết',
  location: 'United States',
});
