import { simpleGit, SimpleGit } from 'simple-git';
import * as readline from 'readline';
import { resolve } from 'path';
import * as fs from 'fs';  // Add this import

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

interface CommitStats {
  date: string;
  changes: number;
}

let ignoredExtensions: string[] = [];

function isFileTypeSupported(filePath: string): boolean {
  if (filePath.toLowerCase().endsWith('package-lock.json')) return false;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? !ignoredExtensions.includes(ext) : true;
}

class StatisticsManager {
  private stats: Map<string, number> = new Map();

  addCommitStats({ date, changes }: CommitStats): void {
    this.stats.set(date, (this.stats.get(date) || 0) + changes);
  }

  aggregateStats(period: 'day' | 'month' | 'year'): Map<string, number> {
    const aggregated = new Map<string, number>();
    for (const [date, value] of this.stats.entries()) {
      const key = period === 'day' ? date :
        period === 'month' ? date.substring(0, 7) :
          date.substring(0, 4);
      aggregated.set(key, (aggregated.get(key) || 0) + value);
    }
    return aggregated;
  }

  getStats(): Map<string, number> {
    return this.stats;
  }

  clear(): void {
    this.stats.clear();
  }
}

class GitAnalyzer {
  private git: SimpleGit;
  private statsManager: StatisticsManager;
  private readonly BATCH_SIZE = 100; // Process commits in batches
  private repoPath: string;  // Add this line

  constructor(repoPath: string, statsManager: StatisticsManager) {
    this.repoPath = resolve(repoPath); // Resolve the full path
    this.git = simpleGit(this.repoPath);
    this.statsManager = statsManager;
  }

  setIgnoredExtensions(exts: string[]): void {
    ignoredExtensions = exts.map(ext => ext.toLowerCase().replace(/^\./, ''));
  }

  getIgnoredExtensions(): string[] {
    return [...ignoredExtensions];
  }

  private async processCommit(commit: any): Promise<void> {
    const dateStr = new Date(commit.date).toISOString().split('T')[0];
    const stats = await this.git.raw(['show', '--numstat', '--format=', commit.hash]);
    
    const changes = stats.trim().split('\n').reduce((total, line) => {
      if (!line) return total;
      const [ins, del, file] = line.split('\t');
      if (file && isFileTypeSupported(file)) {
        return total + (parseInt(ins) || 0) + (parseInt(del) || 0);
      }
      return total;
    }, 0);

    this.statsManager.addCommitStats({ date: dateStr, changes });
  }

  private async processBatch(commits: any[], startIndex: number, total: number, onProgress: (current: number, total: number) => void): Promise<void> {
    // Process commits sequentially to avoid Git connection issues
    for (let i = 0; i < commits.length; i++) {
      await this.processCommit(commits[i]);
      onProgress(startIndex + i + 1, total);
    }
  }

  async analyzeRepository(onProgress: (current: number, total: number) => void): Promise<void> {
    const log = await this.git.log();
    const totalCommits = log.all.length;

    for (let i = 0; i < totalCommits; i += this.BATCH_SIZE) {
      const batch = log.all.slice(i, i + this.BATCH_SIZE);
      await this.processBatch(batch, i, totalCommits, onProgress);
    }
  }

  getRepoPath(): string {
    return this.repoPath; // Return the full path instead of just basename
  }
}

interface ChartData {
  dates: string[];
  values: number[];
  maxValue: number;
  dateWidth: number;
  avgValue: number;
  filteredValues: number[];
  totalChanges: number;
  maxValueWidth: number;
}

class CLI {
  private rl: readline.Interface;
  private statsManager: StatisticsManager;
  private currentAnalyzer: GitAnalyzer | null = null;
  private lifespan: number = 0;
  private avgChangesPerDay: number = 0;
  private currentPercentile: number = 95;  // Changed from 90 to 95

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.statsManager = new StatisticsManager();
  }

  private updateProgress(current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const bars = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`Processing commits: ${bars} ${percentage}% (${current}/${total})`);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  private calculatePercentileRank(value: number, values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    return Math.round((index / sorted.length) * 100);
  }

  private calculateStats(values: number[]): {
    filteredValues: number[],
    avgValue: number,
    percentileValue: number
  } {
    if (values.length <= 1) {
      return {
        filteredValues: values,
        avgValue: values[0] || 0,
        percentileValue: values[0] || 0
      };
    }

    const percentileValue = this.calculatePercentile(values, this.currentPercentile);
    // Only include values below the percentile threshold
    const filteredValues = values.filter(v => v <= percentileValue);
    const totalChanges = filteredValues.reduce((sum, val) => sum + val, 0);
    // Calculate average based on number of active days (days with changes)
    const avgValue = totalChanges / filteredValues.length;

    return { filteredValues, avgValue, percentileValue };
  }

  private async analyzeCurrentRepository(percentile: number = this.currentPercentile): Promise<void> {
    if (!this.currentAnalyzer) {
      console.log('No repository currently loaded');
      return;
    }

    const path = this.currentAnalyzer.getRepoPath();
    if (!this.isValidGitRepository(path)) {
      console.log(`Error: '${path}' is not a valid Git repository`);
      return;
    }

    this.currentPercentile = percentile;
    console.log(`\nAnalyzing repository at: ${path}`);
    this.statsManager.clear();
    await this.currentAnalyzer.analyzeRepository((current, total) => this.updateProgress(current, total));

    // Calculate and display stats
    const stats = this.statsManager.getStats();
    const dates = Array.from(stats.keys()).sort();
    if (dates.length > 0) {
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      this.lifespan = getDaysBetweenDates(firstDate, lastDate);

      const changes = Array.from(stats.values()).filter(v => v > 0);
      const { avgValue } = this.calculateStats(changes);
      this.avgChangesPerDay = Math.round(avgValue);

      console.log('\n' + colorize('✓ Analysis complete!', 'green'));
      console.log(colorize('├─', 'dim') + ` Project lifespan: ${colorize(this.lifespan.toString(), 'cyan')} days`);
      console.log(colorize('├─', 'dim') + ` Average changes per active day (${colorize(percentile.toString(), 'yellow')}th percentile): ${colorize(this.avgChangesPerDay.toString(), 'cyan')}`);
      
      const ignoredExts = this.currentAnalyzer?.getIgnoredExtensions() || [];
      if (ignoredExts.length > 0) {
        console.log(colorize('└─', 'dim') + ` Ignored extensions: ${colorize(ignoredExts.map(ext => '.' + ext).join(', '), 'yellow')}`);
      }
      console.log(''); // Empty line for spacing
    } else {
      console.log('\nAnalysis complete!\n');
    }
  }

  async start(): Promise<void> {
    try {
      const repoPath = await this.getRepoPath();
      this.currentAnalyzer = new GitAnalyzer(repoPath, this.statsManager);
      await this.analyzeCurrentRepository();
      await this.commandLoop();
    } catch (error) {
      console.error('Error:', error);
      this.rl.close();
      process.exit(1);
    }
  }

  private async getRepoPath(cmdPath?: string): Promise<string> {
    const inputPath = cmdPath || process.argv[2] || await new Promise<string>((resolve) => {
      this.rl.question('Enter repository path (or press Enter for current directory): ', (input) => {
        resolve(input || process.cwd());
      });
    });

    const fullPath = resolve(inputPath);
    if (!this.isValidGitRepository(fullPath)) {
      throw new Error(`'${fullPath}' is not a valid Git repository`);
    }
    return fullPath;
  }

  private isValidGitRepository(path: string): boolean {
    try {
      const fullPath = resolve(path);
      const gitPath = `${fullPath}/.git`;
      return fs.existsSync(fullPath) && (
        fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()
      );
    } catch (error) {
      return false;
    }
  }

  private async commandLoop(): Promise<void> {
    printHelp();

    while (true) {
      const command = await this.safeExecute(async () => {
        const input = await new Promise<string>((resolve) => {
          this.rl.question('\nEnter command: ', resolve);
        });
        return input.trim().split(/\s+/);
      });

      if (!command) continue;

      // Use command pattern for better organization
      const [cmd, ...args] = command;
      await this.executeCommand(cmd.toLowerCase(), args);
    }
  }

  private async executeCommand(cmd: string, args: string[]): Promise<void> {
    const commands: Record<string, () => Promise<void>> = {
      day: async () => this.printChart(this.statsManager.getStats(), this.currentAnalyzer?.getRepoPath() || ''),
      month: async () => this.printChart(this.statsManager.aggregateStats('month'), this.currentAnalyzer?.getRepoPath() || ''),
      year: async () => this.printChart(this.statsManager.aggregateStats('year'), this.currentAnalyzer?.getRepoPath() || ''),
      repo: async () => {
        const newPath = await this.getRepoPath(args[0]);
        const percentile = args[1] ? parseInt(args[1], 10) : 95;
        if (isNaN(percentile) || percentile < 1 || percentile > 100) {
          console.log('Percentile must be a number between 1 and 100');
          return;
        }
        this.currentAnalyzer = new GitAnalyzer(newPath, this.statsManager);
        await this.analyzeCurrentRepository(percentile);
      },
      percentile: async () => {
        const p = parseInt(args[0], 10);
        if (isNaN(p) || p < 1 || p > 100) {
          console.log('Percentile must be a number between 1 and 100');
          return;
        }
        await this.analyzeCurrentRepository(p);
      },
      ignore: async () => {
        if (!this.currentAnalyzer) {
          console.log('No repository currently loaded');
          return;
        }
        const extensions = args[0]?.split(',').filter(Boolean) || [];
        this.currentAnalyzer.setIgnoredExtensions(extensions);
        await this.analyzeCurrentRepository(this.currentPercentile);
      },
      help: async () => {
        printHelp();
      },
      exit: async () => {
        this.rl.close();
        process.exit(0);
      }
    };

    if (cmd in commands) {
      await this.safeExecute(() => commands[cmd]());
    } else {
      console.log('Unknown command. Type "help" for available commands.');
    }
  }

  private prepareChartData(stats: Map<string, number>): ChartData {
    const dates = Array.from(stats.keys()).sort();
    const values = dates.map(date => stats.get(date) || 0);
    const maxValue = Math.max(...values);
    const { avgValue, filteredValues } = this.calculateStats(values);
    const totalChanges = values.reduce((sum, val) => sum + val, 0);
    
    return {
      dates,
      values,
      maxValue,
      dateWidth: Math.max(...dates.map(d => d.length)),
      avgValue,
      filteredValues,
      totalChanges,
      maxValueWidth: maxValue.toString().length
    };
  }

  private printChart(stats: Map<string, number>, repoPath: string): void {
    // Cache expensive calculations
    const memoizedPercentileRank = new Map<number, number>();
    const calculatePercentileRankCached = (value: number, values: number[]): number => {
      if (memoizedPercentileRank.has(value)) {
        return memoizedPercentileRank.get(value)!;
      }
      const rank = this.calculatePercentileRank(value, values);
      memoizedPercentileRank.set(value, rank);
      return rank;
    };

    // Pre-calculate common values
    const { 
      dates, values, maxValue, dateWidth, avgValue, 
      filteredValues, totalChanges, maxValueWidth 
    } = this.prepareChartData(stats);
    
    if (!dates.length) return;

    // ANSI color codes
    const reset = '\x1b[0m';
    const gray = '\x1b[90m';
    const cyan = '\x1b[36m';
    const yellow = '\x1b[33m';
    const red = '\x1b[31m';
    const green = '\x1b[32m';
    const blue = '\x1b[34m';  // Added for average line

    console.log(`\nGit Changes Chart for ${repoPath}:\n`);

    // Print scale
    const scaleWidth = 50;
    const avgPosition = Math.round((avgValue / maxValue) * scaleWidth);
    const scaleValues = Array.from({ length: 5 }, (_, i) => Math.round(maxValue * i / 4));
    const scaleSpacing = Math.floor(scaleWidth / 4);

    console.log(' '.repeat(dateWidth) + ' │' + gray + '┈'.repeat(scaleWidth) + reset);

    // Add average value to scale
    const scaleStr = scaleValues
      .map((v, i) => v.toString().padStart(maxValueWidth))
      .map((v, i) => ' '.repeat(i === 0 ? 0 : scaleSpacing - maxValueWidth) + v)
      .join('');
    console.log(' '.repeat(dateWidth) + ' │' + gray + scaleStr + reset);
    console.log(' '.repeat(dateWidth) + ' │' + ' '.repeat(avgPosition) + blue + '│' + reset + ` avg: ${Math.round(avgValue)}\n`);

    // Print bars
    dates.forEach((date) => {
      const value = stats.get(date) || 0;
      const barLength = Math.round((value / maxValue) * scaleWidth);
      const percentile = calculatePercentileRankCached(value, values);

      let barColor;
      if (percentile >= this.currentPercentile) {
        barColor = gray;
      } else if (value >= avgValue) {
        barColor = green;
      } else {
        barColor = red;
      }

      // Create the bar visualization with average line
      const barChars = new Array(scaleWidth).fill(' ');
      // Fill the bar portion
      for (let i = 0; i < barLength; i++) {
        barChars[i] = '█';
      }
      // Add the average line
      if (avgPosition >= 0 && avgPosition < scaleWidth) {
        barChars[avgPosition] = '│';
      }

      // Apply colors
      const lineWithAvg = barChars.map((char, pos) => {
        if (pos === avgPosition) {
          return blue + char + reset;
        }
        if (pos < barLength) {
          return barColor + char + reset;
        }
        return char;
      }).join('');

      const percentage = (value / totalChanges) * 100;
      const percentageStr = cyan + `${percentage.toFixed(1)}%` + reset;
      const percentileStr = yellow + `p${percentile}` + reset;

      console.log(
        `${date.padEnd(dateWidth)} │${lineWithAvg} ${value.toString().padStart(maxValueWidth)} ${percentageStr} ${percentileStr}`
      );
    });

    console.log(' '.repeat(dateWidth) + ' │' + gray + '┈'.repeat(scaleWidth) + reset);

    // Add summary line based on the date format
    const dateFormat = dates[0]?.length || 0;
    let periodType: string;
    let totalPeriods: number;

    if (dateFormat === 4) { // YYYY
      periodType = 'year';
      totalPeriods = this.lifespan / 365;
    } else if (dateFormat === 7) { // YYYY-MM
      periodType = 'month';
      totalPeriods = this.lifespan / 30;
    } else {
      periodType = 'day';
      totalPeriods = this.lifespan;
    }

    // Only count periods that have changes and are within the percentile
    const activePeriods = filteredValues.length;
    const avgPerPeriod = Math.round(filteredValues.reduce((sum, val) => sum + val, 0) / activePeriods);

    console.log('\n' + colorize('Statistics:', 'bright'));
    console.log(colorize('├─', 'dim') + ` Lifespan: ${colorize(this.lifespan.toString(), 'cyan')} days`);
    
    if (periodType !== 'day') {
      console.log(colorize('├─', 'dim') + ` Average changes per active day (${colorize(this.currentPercentile.toString(), 'yellow')}th percentile): ${colorize(this.avgChangesPerDay.toString(), 'cyan')}`);
    }
    
    console.log(colorize('├─', 'dim') + ` Average changes per active ${periodType} (${colorize(this.currentPercentile.toString(), 'yellow')}th percentile): ${colorize(avgPerPeriod.toString(), 'cyan')}`);
    
    const activePercentage = ((activePeriods / Math.ceil(totalPeriods)) * 100).toFixed(1);
    console.log(colorize('└─', 'dim') + ` Active ${periodType}s: ${colorize(activePeriods.toString(), 'cyan')} out of ${Math.ceil(totalPeriods)} (${colorize(activePercentage + '%', 'yellow')})`);
  }

  // Add error boundary
  private async safeExecute<T>(operation: () => Promise<T>): Promise<T | void> {
    try {
      return await operation();
    } catch (error) {
      console.error('Operation failed:', error instanceof Error ? error.message : 'Unknown error');
      return;
    }
  }
}

function getDaysBetweenDates(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function printHelp() {
  console.log(`
Available commands:
  day                 - Show changes by day (YYYY-MM-DD)
  month               - Show changes by month (YYYY-MM)
  year                - Show changes by year (YYYY)
  repo [path] [p]     - Switch to a different repository, optional percentile p (default 95)
  percentile <p>      - Update current percentile threshold (1-100)
  ignore <exts>       - Ignore files with extensions (comma-separated, e.g., "json,md,txt")
  help                - Show this help message
  exit                - Exit the program
`);
}

new CLI().start();