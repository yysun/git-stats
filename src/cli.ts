/**
 * Interactive CLI for git repository analysis
 * - Provides commands for visualizing git stats (day/month/year/commit)
 * - Generates ASCII charts with colored output (red for deletions, green for insertions, grey for outliers)
 * - Supports percentile filtering and file extension exclusion
 */

import * as readline from 'readline';
import { resolve } from 'path';
import { ChartData, colors, ColorName } from './types';
import { GitAnalyzer, StatisticsManager } from './git-analyzer';

// CLI-specific utility functions
function colorize(text: string, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`;
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
  commit [from]       - Show changes by commit with hash and message. Optional 'from' parameter can be a commit hash, branch name, or tag
  repo [path] [p]     - Switch to a different repository, optional percentile p (default 95)
  percentile <p>      - Update current percentile threshold (1-100)
  ignore <exts>       - Ignore files with extensions (comma-separated, e.g., "json,md,txt")
  help                - Show this help message
  exit                - Exit the program
`);
}

export class CLI {
  private rl: readline.Interface;
  private statsManager: StatisticsManager;
  private currentAnalyzer: GitAnalyzer | null = null;
  private lifespan: number = 0;
  private avgChangesPerDay: number = 0;
  private currentPercentile: number = 95;
  private lastChartType: 'day' | 'month' | 'year' | 'commit' = 'day';

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
    const filteredValues = values.filter(v => v <= percentileValue);
    const totalChanges = filteredValues.reduce((sum, val) => sum + val, 0);
    const avgValue = totalChanges / filteredValues.length;

    return { filteredValues, avgValue, percentileValue };
  }

  private async analyzeCurrentRepository(percentile: number = this.currentPercentile, fromRef?: string): Promise<void> {
    if (!this.currentAnalyzer) {
      console.log('No repository currently loaded');
      return;
    }

    const path = this.currentAnalyzer.getRepoPath();
    if (!this.currentAnalyzer.isValidGitRepository(path)) {
      console.log(`Error: '${path}' is not a valid Git repository`);
      return;
    }

    this.currentPercentile = percentile;
    console.log(`\nAnalyzing repository at: ${path}`);
    this.statsManager.clear();
    await this.currentAnalyzer.analyzeRepository((current, total) => this.updateProgress(current, total), fromRef);

    // Calculate and display stats
    const stats = this.statsManager.getStats();
    const dates = Array.from(stats.keys()).sort();
    if (dates.length > 0) {
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      this.lifespan = getDaysBetweenDates(firstDate, lastDate);

      const changes = Array.from(stats.values()).map(v => v.insertions + v.deletions).filter(v => v > 0);
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
    const tempAnalyzer = new GitAnalyzer(fullPath, new StatisticsManager());
    if (!tempAnalyzer.isValidGitRepository(fullPath)) {
      throw new Error(`'${fullPath}' is not a valid Git repository`);
    }
    return fullPath;
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

      const [cmd, ...args] = command;
      await this.executeCommand(cmd.toLowerCase(), args);
    }
  }

  private async executeCommand(cmd: string, args: string[]): Promise<void> {
    const commands: Record<string, () => Promise<void>> = {
      day: async () => {
        this.lastChartType = 'day';
        this.printChart(this.statsManager.getStats(), this.currentAnalyzer?.getRepoPath() || '');
      },
      month: async () => {
        this.lastChartType = 'month';
        this.printChart(this.statsManager.aggregateStats('month'), this.currentAnalyzer?.getRepoPath() || '');
      },
      year: async () => {
        this.lastChartType = 'year';
        this.printChart(this.statsManager.aggregateStats('year'), this.currentAnalyzer?.getRepoPath() || '');
      },
      commit: async () => {
        this.lastChartType = 'commit';
        const fromRef = args[0];
        await this.analyzeCurrentRepository(this.currentPercentile, fromRef);
        this.printChart(this.statsManager.aggregateStats('commit'), this.currentAnalyzer?.getRepoPath() || '');
      },
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
        
        // Reprint the last viewed chart type
        switch (this.lastChartType) {
          case 'day':
            this.printChart(this.statsManager.getStats(), this.currentAnalyzer?.getRepoPath() || '');
            break;
          case 'month':
            this.printChart(this.statsManager.aggregateStats('month'), this.currentAnalyzer?.getRepoPath() || '');
            break;
          case 'year':
            this.printChart(this.statsManager.aggregateStats('year'), this.currentAnalyzer?.getRepoPath() || '');
            break;
          case 'commit':
            this.printChart(this.statsManager.aggregateStats('commit'), this.currentAnalyzer?.getRepoPath() || '');
            break;
        }
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

  private prepareChartData(stats: Map<string, { insertions: number; deletions: number }>): ChartData {
    const dates = Array.from(stats.keys());
    if (!dates[0]?.includes(' ')) {
      dates.sort();
    }

    const values = dates.map(date => {
      const stat = stats.get(date)!;
      return stat.insertions + stat.deletions;
    });

    const insertions = dates.map(date => stats.get(date)!.insertions);
    const deletions = dates.map(date => stats.get(date)!.deletions);
    const maxValue = Math.max(...values);
    const { avgValue, filteredValues, percentileValue } = this.calculateStats(values);
    const totalChanges = values.reduce((sum, val) => sum + val, 0);

    return {
      dates,
      values,
      maxValue,
      dateWidth: Math.max(...dates.map(d => d.length)),
      avgValue,
      filteredValues,
      totalChanges,
      maxValueWidth: maxValue.toString().length,
      insertions,
      deletions,
      percentileValue
    };
  }

  private printChart(stats: Map<string, { insertions: number; deletions: number }>, repoPath: string): void {
    const memoizedPercentileRank = new Map<number, number>();
    const calculatePercentileRankCached = (value: number, values: number[]): number => {
      if (memoizedPercentileRank.has(value)) {
        return memoizedPercentileRank.get(value)!;
      }
      const rank = this.calculatePercentileRank(value, values);
      memoizedPercentileRank.set(value, rank);
      return rank;
    };

    const {
      dates, values, maxValue, dateWidth, avgValue,
      filteredValues, totalChanges, maxValueWidth,
      insertions, deletions, percentileValue
    } = this.prepareChartData(stats);

    if (!dates.length) return;

    const reset = colors.reset;
    const gray = colors.dim;
    const cyan = colors.cyan;
    const yellow = colors.yellow;
    const red = colors.red;
    const green = colors.green;
    const blue = colors.blue;

    console.log(`\nGit Changes Chart for ${repoPath}:\n`);

    const scaleWidth = 50;
    const avgPosition = Math.round((avgValue / maxValue) * scaleWidth);
    const scaleValues = Array.from({ length: 5 }, (_, i) => Math.round(maxValue * i / 4));
    const scaleSpacing = Math.floor(scaleWidth / 4);

    console.log(' '.repeat(dateWidth) + ' │' + gray + '┈'.repeat(scaleWidth) + reset);

    const scaleStr = scaleValues
      .map((v, i) => v.toString().padStart(maxValueWidth))
      .map((v, i) => ' '.repeat(i === 0 ? 0 : scaleSpacing - maxValueWidth) + v)
      .join('');
    console.log(' '.repeat(dateWidth) + ' │' + gray + scaleStr + reset);
    console.log(' '.repeat(dateWidth) + ' │' + ' '.repeat(avgPosition) + blue + '│' + reset + ` avg: ${Math.round(avgValue)}\n`);

    dates.forEach((date, index) => {
      const value = values[index];
      const ins = insertions[index];
      const del = deletions[index];
      const totalBarLength = Math.round((value / maxValue) * scaleWidth);
      const insBarLength = Math.round((ins / maxValue) * scaleWidth);
      const delBarLength = Math.round((del / maxValue) * scaleWidth);
      const percentile = calculatePercentileRankCached(value, values);

      const barChars = new Array(scaleWidth).fill(' ');

      if (value > percentileValue) {
        // For values above percentile threshold, show entire bar in grey
        for (let i = 0; i < totalBarLength && i < scaleWidth; i++) {
          barChars[i] = gray + '█' + reset;
        }
      } else {
        // Fill deletions (red) first
        for (let i = 0; i < delBarLength; i++) {
          barChars[i] = red + '█' + reset;
        }

        // Fill insertions (green) after
        for (let i = delBarLength; i < delBarLength + insBarLength && i < scaleWidth; i++) {
          barChars[i] = green + '█' + reset;
        }
      }

      // Add average line
      if (avgPosition >= 0 && avgPosition < scaleWidth) {
        barChars[avgPosition] = blue + '│' + reset;
      }

      const lineWithAvg = barChars.join('');
      const percentage = (value / totalChanges) * 100;
      const percentageStr = cyan + `${percentage.toFixed(1)}%` + reset;
      const percentileStr = yellow + `p${percentile}` + reset;

      console.log(
        `${date.padEnd(dateWidth)} │${lineWithAvg} ${value.toString().padStart(maxValueWidth)} ${percentageStr} ${percentileStr}`
      );
    });

    console.log(' '.repeat(dateWidth) + ' │' + gray + '┈'.repeat(scaleWidth) + reset);

    const dateFormat = dates[0]?.length || 0;
    let periodType: string;
    let totalPeriods: number;

    if (dateFormat === 4) {
      periodType = 'year';
      totalPeriods = this.lifespan / 365;
    } else if (dateFormat === 7) {
      periodType = 'month';
      totalPeriods = this.lifespan / 30;
    } else if (dates[0]?.includes(' ')) {
      periodType = 'commit';
      totalPeriods = dates.length;
    } else {
      periodType = 'day';
      totalPeriods = this.lifespan;
    }

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

  private async safeExecute<T>(operation: () => Promise<T>): Promise<T | void> {
    try {
      return await operation();
    } catch (error) {
      console.error('Operation failed:', error instanceof Error ? error.message : 'Unknown error');
      return;
    }
  }
}
