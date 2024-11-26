# Git Stats

A command-line tool that generates ASCII charts showing the number of line changes in a git repository over time.

## Installation

After cloned this project, you'll need to:

1. Run `npm install` to install dependencies
2. Run `npm run build` to compile TypeScript
3. Run `npm link` (optional) to use the command globally

Then, you can run it using:
- `npm start` (for the current directory)
- `npm start /path/to/repo` (for a specific repository)
- `git-stats` (if globally linked)

## Commands

```
Available commands:
  day                 - Show changes by day (YYYY-MM-DD)
  month               - Show changes by month (YYYY-MM)
  year                - Show changes by year (YYYY)
  repo [path] [p]     - Switch to a different repository, optional percentile p (default 95)
  percentile <p>      - Update current percentile threshold (1-100)
  ignore <exts>       - Ignore files with extensions (comma-separated, e.g., "json,md,txt")
  help                - Show this help message
  exit                - Exit the program
```

## Features

- Analyzes git repository history
- Generates ASCII chart of code changes by day, month, or year
- Shows total lines changed (insertions + deletions) per day, month, or year  
- Shows lifespan of the repository in days
- Shows average lines changed precentage and percentile
- Supports custom repository path input


## Example

Here is an example of the [apprun-site repository](https://github.com/yysun/apprun-site). It shows monthly changes using 80th percentile.

```
Git Changes Chart for apprun-site:

        │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
        │   0        1046        2093        3139        4185
        │                 │ avg: 1430

2019-05 │█████████████████│██████████████████               3027 11.8% p72
2019-06 │█████████████████│████████████████████████████     3838 14.9% p83
2019-07 │                 │                                    4 0.0% p0
2019-08 │                 │                                    4 0.0% p0
2019-09 │█                │                                   71 0.3% p22
2019-11 │█                │                                   68 0.3% p17
2020-03 │███              │                                  246 1.0% p39
2021-05 │█████████████████│██████████████████████           3379 13.1% p78
2021-06 │████████████████ │                                 1380 5.4% p56
2022-03 │█████████████████│████████████████████████████████ 4185 16.3% p94
2022-04 │███████████████  │                                 1263 4.9% p50
2022-12 │█████████████████│██                               1694 6.6% p61
2023-08 │                 │                                   25 0.1% p11
2023-10 │█                │                                   87 0.3% p28
2024-08 │█████████████████│██                               1704 6.6% p67
2024-09 │█████████████████│████████████████████████████████ 4176 16.2% p89
2024-10 │█                │                                  100 0.4% p33
2024-11 │██████           │                                  490 1.9% p44
        │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

Lifespan: 2008 days
Average changes per active day (95th percentile): 207
Average changes per active month (95th percentile): 1430
Active months: 18 out of 67 (26.9%)
```

## Dependencies

- asciichart: For generating ASCII charts
- simple-git: For git operations
- TypeScript: For static typing
- Nodemon: For development auto-reload

## License

MIT
