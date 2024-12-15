import { simpleGit, SimpleGit } from 'simple-git';
import { resolve } from 'path';
import * as fs from 'fs';
import { CommitStats } from './types';

export class StatisticsManager {
  private stats: Map<string, { insertions: number; deletions: number }> = new Map();
  private commitStats: Map<string, CommitStats> = new Map();
  private commitOrder: string[] = []; // Store commit hashes in order

  addCommitStats({ date, timestamp, insertions, deletions, hash, message }: CommitStats): void {
    const existing = this.stats.get(date) || { insertions: 0, deletions: 0 };
    this.stats.set(date, {
      insertions: existing.insertions + insertions,
      deletions: existing.deletions + deletions
    });
    if (hash) {
      this.commitStats.set(hash, { date, timestamp, insertions, deletions, hash, message });
      this.commitOrder.push(hash);
    }
  }

  aggregateStats(period: 'day' | 'month' | 'year' | 'commit'): Map<string, { insertions: number; deletions: number }> {
    if (period === 'commit') {
      const orderedCommits = this.commitOrder.map(hash => {
        const stats = this.commitStats.get(hash)!;
        return [
          `${stats.date} ${stats.hash?.substring(0, 7)} ${stats.message?.split('\n')[0].substring(0, 50)}`,
          { insertions: stats.insertions, deletions: stats.deletions }
        ] as [string, { insertions: number; deletions: number }];
      });
      return new Map(orderedCommits);
    }

    const aggregated = new Map<string, { insertions: number; deletions: number }>();
    for (const [date, value] of this.stats.entries()) {
      const key = period === 'day' ? date :
        period === 'month' ? date.substring(0, 7) :
          date.substring(0, 4);
      const existing = aggregated.get(key) || { insertions: 0, deletions: 0 };
      aggregated.set(key, {
        insertions: existing.insertions + value.insertions,
        deletions: existing.deletions + value.deletions
      });
    }
    return aggregated;
  }

  getStats(): Map<string, { insertions: number; deletions: number }> {
    return this.stats;
  }

  clear(): void {
    this.stats.clear();
    this.commitStats.clear();
    this.commitOrder = [];
  }
}

export class GitAnalyzer {
  private git: SimpleGit;
  private statsManager: StatisticsManager;
  private readonly BATCH_SIZE = 100; // Process commits in batches
  private repoPath: string;
  private ignoredExtensions: string[] = [];

  constructor(repoPath: string, statsManager: StatisticsManager) {
    this.repoPath = resolve(repoPath);
    this.git = simpleGit(this.repoPath);
    this.statsManager = statsManager;
  }

  setIgnoredExtensions(exts: string[]): void {
    this.ignoredExtensions = exts.map(ext => ext.toLowerCase().replace(/^\./, ''));
  }

  getIgnoredExtensions(): string[] {
    return [...this.ignoredExtensions];
  }

  private isFileTypeSupported(filePath: string): boolean {
    if (filePath.toLowerCase().endsWith('package-lock.json')) return false;
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext ? !this.ignoredExtensions.includes(ext) : true;
  }

  private async processCommit(commit: any): Promise<void> {
    const timestamp = new Date(commit.date);
    const dateStr = timestamp.toISOString().split('T')[0];
    const stats = await this.git.raw(['show', '--numstat', '--format=', commit.hash]);
    
    let totalInsertions = 0;
    let totalDeletions = 0;

    stats.trim().split('\n').forEach(line => {
      if (!line) return;
      const [ins, del, file] = line.split('\t');
      if (file && this.isFileTypeSupported(file)) {
        totalInsertions += parseInt(ins) || 0;
        totalDeletions += parseInt(del) || 0;
      }
    });

    this.statsManager.addCommitStats({ 
      date: dateStr, 
      timestamp,
      insertions: totalInsertions,
      deletions: totalDeletions,
      hash: commit.hash,
      message: commit.message
    });
  }

  private async processBatch(commits: any[], startIndex: number, total: number, onProgress: (current: number, total: number) => void): Promise<void> {
    // Process commits sequentially to avoid Git connection issues
    for (let i = 0; i < commits.length; i++) {
      await this.processCommit(commits[i]);
      onProgress(startIndex + i + 1, total);
    }
  }

  async analyzeRepository(onProgress: (current: number, total: number) => void, fromRef?: string): Promise<void> {
    // Use --reverse to get commits in ascending order (oldest first)
    const logOptions: any = { '--reverse': null };
    if (fromRef) {
      logOptions.from = fromRef;
    }
    const log = await this.git.log(logOptions);
    const totalCommits = log.all.length;

    for (let i = 0; i < totalCommits; i += this.BATCH_SIZE) {
      const batch = log.all.slice(i, i + this.BATCH_SIZE);
      await this.processBatch(batch, i, totalCommits, onProgress);
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  isValidGitRepository(path: string): boolean {
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
}
