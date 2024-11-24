import { simpleGit, SimpleGit } from 'simple-git';
import * as readline from 'readline';
import { resolve } from 'path';

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

  constructor(repoPath: string, statsManager: StatisticsManager) {
    this.git = simpleGit(resolve(repoPath));
    this.statsManager = statsManager;
  }

  async analyzeRepository(onProgress: (current: number, total: number) => void): Promise<void> {
    const log = await this.git.log();
    const totalCommits = log.all.length;

    for (let i = 0; i < totalCommits; i++) {
      const commit = log.all[i];
      onProgress(i + 1, totalCommits);

      const date = new Date(commit.date);
      const dateStr = date.toISOString().split('T')[0];
      const changes = await this.git.show([commit.hash, '--stat']);
      const match = changes.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

      if (match) {
        const insertions = parseInt(match[2] || '0');
        const deletions = parseInt(match[3] || '0');
        this.statsManager.addCommitStats({
          date: dateStr,
          changes: insertions + deletions
        });
      }
    }
  }
}

class CLI {
  private rl: readline.Interface;
  private statsManager: StatisticsManager;
  private currentAnalyzer: GitAnalyzer | null = null;

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

  private async getRepoPath(): Promise<string> {
    if (process.argv[2]) {
      return process.argv[2];
    }

    return new Promise((resolve) => {
      this.rl.question('Enter repository path (or press Enter for current directory): ', (input) => {
        resolve(input || process.cwd());
      });
    });
  }

  private async switchRepository(path: string): Promise<void> {
    console.log(`\nAnalyzing repository at: ${path}`);
    this.statsManager.clear();
    this.currentAnalyzer = new GitAnalyzer(path, this.statsManager);
    await this.currentAnalyzer.analyzeRepository((current, total) => this.updateProgress(current, total));
    console.log('\nAnalysis complete!\n');
  }

  private async commandLoop(): Promise<void> {
    printHelp();
    
    while (true) {
      const command = await new Promise<string>((resolve) => {
        this.rl.question('\nEnter command: ', resolve);
      });

      switch (command.toLowerCase()) {
        case 'day':
          printChart(this.statsManager.getStats());
          break;
        case 'month':
          printChart(this.statsManager.aggregateStats('month'));
          break;
        case 'year':
          printChart(this.statsManager.aggregateStats('year'));
          break;
        case 'repo':
          const newPath = await this.getRepoPath();
          await this.switchRepository(newPath);
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
}

function printChart(stats: Map<string, number>) {
  const dates = Array.from(stats.keys()).sort();
  const values = dates.map(date => stats.get(date) || 0);
  const maxValue = Math.max(...values);
  const maxValueWidth = maxValue.toString().length;

  console.log('\nGit Changes Chart:\n');

  dates.forEach((date) => {
    const value = stats.get(date) || 0;
    const bar = '█'.repeat(Math.floor((value / maxValue) * 50));
    console.log(`${date} │${bar} ${value}`);
  });

  console.log('─'.repeat(10) + '┴' + '─'.repeat(50 + maxValueWidth));
  console.log(' '.repeat(11) + '0' + ' '.repeat(47) + maxValue);
}

function printHelp() {
  console.log(`
Available commands:
  day   - Show changes by day (YYYY-MM-DD)
  month - Show changes by month (YYYY-MM)
  year  - Show changes by year (YYYY)
  repo  - Switch to a different repository
  help  - Show this help message
  exit  - Exit the program
`);
}

new CLI().start();