# Git Stats

A command-line tool that generates ASCII charts showing the number of line changes in a git repository over time.

## Installation

After creating these files, you'll need to:

1. Run `npm install` to install dependencies
2. Run `npm run build` to compile TypeScript
3. Run `npm link` (optional) to use the command globally

The tool will create an ASCII chart showing the total number of line changes (additions + deletions) per day in the repository's history.

You can run it using:
- `npm start` (for the current directory)
- `npm start /path/to/repo` (for a specific repository)
- `git-stats` (if globally linked)

## Commands

```
Available commands:
  day        - Show changes by day (YYYY-MM-DD)
  month      - Show changes by month (YYYY-MM)
  year       - Show changes by year (YYYY)
  repo [path]- Switch to a different repository
  help       - Show this help message
  exit       - Exit the program
```

## Features

- Analyzes git repository history
- Generates ASCII chart of code changes by day, month, or year
- Shows total lines changed (insertions + deletions) per day, month, or year  
- Shows lifespan of the repository in days
- Shows average lines changed per day
- Supports custom repository path input

## Dependencies

- asciichart: For generating ASCII charts
- simple-git: For git operations
- TypeScript: For static typing
- Nodemon: For development auto-reload

## License

MIT
