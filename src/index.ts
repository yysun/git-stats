import { simpleGit, SimpleGit } from 'simple-git';
import * as readline from 'readline';
import { resolve, basename } from 'path';

interface CommitStats {
  date: string;
  changes: number;
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
  private readonly BATCH_SIZE = 50; // Process commits in batches
  private repoPath: string;  // Add this line

  constructor(repoPath: string, statsManager: StatisticsManager) {
    this.repoPath = repoPath;  // Add this line
    this.git = simpleGit(resolve(repoPath));
    this.statsManager = statsManager;
  }

  private async processCommit(commit: any): Promise<void> {
    const date = new Date(commit.date);
    const dateStr = date.toISOString().split('T')[0];
    const stats = await this.git.raw(['show', '--numstat', '--format=', commit.hash]);

    let insertions = 0;
    let deletions = 0;

    stats.trim().split('\n').forEach(line => {
      if (line) {
        const [ins, del] = line.split('\t').map(n => parseInt(n) || 0);
        insertions += ins;
        deletions += del;
      }
    });

    this.statsManager.addCommitStats({
      date: dateStr,
      changes: insertions + deletions
    });
  }

  private async processBatch(commits: any[], startIndex: number, total: number, onProgress: (current: number, total: number) => void): Promise<void> {
    await Promise.all(
      commits.map(async (commit, index) => {
        await this.processCommit(commit);
        onProgress(startIndex + index + 1, total);
      })
    );
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
    return basename(this.repoPath);
  }
}

class CLI {
  private rl: readline.Interface;
  private statsManager: StatisticsManager;
  private currentAnalyzer: GitAnalyzer | null = null;
  private lifespan: number = 0;
  private avgChangesPerDay: number = 0;
  private currentPercentile: number = 90;  // Add this line

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
    const filteredValues = values.filter(v => v < percentileValue);
    const avgValue = filteredValues.length > 0 
      ? filteredValues.reduce((sum, val) => sum + val, 0) / filteredValues.length
      : 0;
    return { filteredValues, avgValue, percentileValue };
  }

  async start(): Promise<void> {
    try {
      const repoPath = await this.getRepoPath();
      await this.switchRepository(repoPath);
      await this.commandLoop();
    } catch (error) {
      console.error('Error:', error);
      this.rl.close();
      process.exit(1);
    }
  }

  private async getRepoPath(cmdPath?: string): Promise<string> {
    if (cmdPath || process.argv[2]) {
      return cmdPath || process.argv[2];
    }

    return new Promise((resolve) => {
      this.rl.question('Enter repository path (or press Enter for current directory): ', (input) => {
        resolve(input || process.cwd());
      });
    });
  }

  private async switchRepository(path: string, percentile: number = 90): Promise<void> {
    this.currentPercentile = percentile;  // Add this line
    console.log(`\nAnalyzing repository at: ${path}`);
    this.statsManager.clear();
    this.currentAnalyzer = new GitAnalyzer(path, this.statsManager);
    await this.currentAnalyzer.analyzeRepository((current, total) => this.updateProgress(current, total));

    // Calculate and display lifespan and average changes
    const stats = this.statsManager.getStats();
    const dates = Array.from(stats.keys()).sort();
    if (dates.length > 0) {
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      this.lifespan = getDaysBetweenDates(firstDate, lastDate);

      const changes = Array.from(stats.values());
      const { avgValue } = this.calculateStats(changes);
      this.avgChangesPerDay = Math.round(avgValue);

      console.log('\nAnalysis complete!');
      console.log(`Project lifespan: ${this.lifespan} days`);
      console.log(`Average changes per active day (${percentile}th percentile): ${this.avgChangesPerDay}\n`);
    } else {
      console.log('\nAnalysis complete!\n');
    }
  }

  private async commandLoop(): Promise<void> {
    printHelp();

    while (true) {
      const input = await new Promise<string>((resolve) => {
        this.rl.question('\nEnter command: ', resolve);
      });

      const [command, ...args] = input.trim().split(/\s+/);

      switch (command.toLowerCase()) {
        case 'day':
          this.printChart(this.statsManager.getStats(), this.currentAnalyzer?.getRepoPath() || '');
          break;
        case 'month':
          this.printChart(this.statsManager.aggregateStats('month'), this.currentAnalyzer?.getRepoPath() || '');
          break;
        case 'year':
          this.printChart(this.statsManager.aggregateStats('year'), this.currentAnalyzer?.getRepoPath() || '');
          break;
        case 'repo':
          const newPath = await this.getRepoPath(args[0]);
          const percentile = args[1] ? parseInt(args[1], 10) : 90;
          if (isNaN(percentile) || percentile < 1 || percentile > 100) {
            console.log('Percentile must be a number between 1 and 100');
            break;
          }
          await this.switchRepository(newPath, percentile);
          break;
        case 'help':
          printHelp();
          break;
        case 'exit':
          this.rl.close();
          return;
        default:
          console.log('Unknown command. Type "help" for available commands.');
      }
    }
  }

  private printChart(stats: Map<string, number>, repoPath: string): void {
    const dates = Array.from(stats.keys()).sort();
    const values = dates.map(date => stats.get(date) || 0);
    const maxValue = Math.max(...values);
    const { avgValue } = this.calculateStats(values);
    const totalChanges = values.reduce((sum, val) => sum + val, 0);
    const maxValueWidth = maxValue.toString().length;
    const dateWidth = Math.max(...dates.map(d => d.length));

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
      const percentile = this.calculatePercentileRank(value, values);

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

    // Add summary line
    if (this.lifespan > 0) {
      console.log(`\nLifespan: ${this.lifespan} days, Average changes per day: ${this.avgChangesPerDay} (${this.currentPercentile}th percentile)`);
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
  day              - Show changes by day (YYYY-MM-DD)
  month            - Show changes by month (YYYY-MM)
  year             - Show changes by year (YYYY)
  repo [path] [p]  - Switch to a different repository, optional percentile p (default 90)
  help             - Show this help message
  exit             - Exit the program
`);
}

new CLI().start();