# Git Stats

A command-line tool that generates ASCII charts showing the number of line changes in a git repository over time.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd git-stats

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Install globally
npm link


I'll help you create a new Node.js CLI project. I'll create several necessary files.

### [package.json](file:///Users/esun/Documents/Projects/git-stats/package.json)


{
  "name": "git-stats",
  "version": "1.0.0",
  "description": "CLI tool to visualize git repository statistics",
  "main": "dist/index.js",
  "bin": {
    "git-stats": "./dist/index.js"
  },
  "scripts": {
    "start": "node dist/index.js",
    "dev": "nodemon --watch 'src/**/*.ts' --exec 'npm run build && npm start'",
    "build": "tsc",
    "clean": "rimraf dist"
  },
  "keywords": ["git", "statistics", "cli"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "asciichart": "^1.5.25",
    "simple-git": "^3.19.1"
  },
  "devDependencies": {
    "@types/node": "^18.15.11",
    "nodemon": "^2.0.22",
    "rimraf": "^5.0.0",
    "typescript": "^5.0.4"
  }
}
```

### [tsconfig.json](file:///Users/esun/Documents/Projects/git-stats/tsconfig.json)
```json
// filepath: /Users/esun/Documents/Projects/git-stats/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### [src/index.ts](file:///Users/esun/Documents/Projects/git-stats/src/index.ts)
```typescript
// filepath: /Users/esun/Documents/Projects/git-stats/src/index.ts
#!/usr/bin/env node

import { simpleGit } from 'simple-git';
import * as asciichart from 'asciichart';
import { resolve } from 'path';

async function main() {
    const repoPath = process.argv[2] || process.cwd();
    const git = simpleGit(resolve(repoPath));

    try {
        const log = await git.log();
        const stats = new Map<string, number>();

        for (const commit of log.all) {
            const date = commit.date.split(' ')[0];
            const changes = await git.show([commit.hash, '--stat']);
            const match = changes.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            
            if (match) {
                const insertions = parseInt(match[2] || '0');
                const deletions = parseInt(match[3] || '0');
                const totalChanges = insertions + deletions;
                
                stats.set(date, (stats.get(date) || 0) + totalChanges);
            }
        }

        const dates = Array.from(stats.keys()).sort();
        const values = dates.map(date => stats.get(date) || 0);

        console.log('\nGit Changes Over Time:\n');
        console.log(asciichart.plot(values, { height: 10 }));
        console.log('\nDates:', dates.join(', '));
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
```

### [README.md](file:///Users/esun/Documents/Projects/git-stats/README.md)
```markdown
// filepath: /Users/esun/Documents/Projects/git-stats/README.md
# Git Stats

A command-line tool that generates ASCII charts showing the number of line changes in a git repository over time.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd git-stats

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Install globally
npm link
```

## Usage

```bash
# Using npx
npx git-stats [path-to-repository]

# If installed globally
git-stats [path-to-repository]
```

If no path is provided, the current working directory will be used.

## Development

```bash
# Start development mode with auto-reload
npm run dev

# Build the project
npm run build

# Clean build files
npm run clean
```

## Features

- Analyzes git repository history
- Generates ASCII chart of daily code changes
- Shows total lines changed (insertions + deletions) per day
- Supports custom repository path input

## Dependencies

- asciichart: For generating ASCII charts
- simple-git: For git operations
- TypeScript: For static typing
- Nodemon: For development auto-reload

## License

MIT
```

After creating these files, you'll need to:

1. Run `npm install` to install dependencies
2. Run `npm run build` to compile TypeScript
3. Run `npm link` (optional) to use the command globally

The tool will create an ASCII chart showing the total number of line changes (additions + deletions) per day in the repository's history.

You can run it using:
- `npm start` (for the current directory)
- `npm start /path/to/repo` (for a specific repository)
- `git-stats` (if globally linked)

Made changes.