export interface CommitStats {
  date: string;
  timestamp: Date;
  insertions: number;
  deletions: number;
  hash?: string;
  message?: string;
}

export interface ChartData {
  dates: string[];
  values: number[];
  maxValue: number;
  dateWidth: number;
  avgValue: number;
  filteredValues: number[];
  totalChanges: number;
  maxValueWidth: number;
  insertions: number[];
  deletions: number[];
}

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
} as const;

export type ColorName = keyof typeof colors;
