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
  day              - Show changes by day (YYYY-MM-DD)
  month            - Show changes by month (YYYY-MM)
  year             - Show changes by year (YYYY)
  repo [path] [p]  - Switch to a different repository, optional percentile p (default 90)
  help             - Show this help message
  exit             - Exit the program
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
        │    0        6082       12164       18245       24327
        │        │ avg: 3957

2019-05 │████████│███████████████████████████████████████   23407 17.3% p89
2019-06 │████████│███████████████                           11666 8.6% p78
2019-07 │        │                                              4 0.0% p0
2019-08 │        │                                              4 0.0% p0
2019-09 │███████ │                                           3639 2.7% p39
2019-11 │█       │                                            285 0.2% p11
2020-03 │████████│████                                       6310 4.7% p50
2021-05 │████████│█████████████████████████████████████████ 24327 17.9% p94
2021-06 │████████│██████████████████████████████████        20764 15.3% p83
2022-03 │████████│███████████████                           11627 8.6% p72
2022-04 │████████│█████████                                  8715 6.4% p61
2022-12 │████████│█████                                      6594 4.9% p56
2023-08 │██      │                                           1006 0.7% p28
2023-10 │█       │                                            529 0.4% p22
2024-08 │████████│███                                        5741 4.2% p44
2024-09 │████████│██████████                                 9263 6.8% p67
2024-10 │██      │                                           1184 0.9% p33
2024-11 │█       │                                            502 0.4% p17
        │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

Lifespan: 2008 days, Average changes per day: 290 (80th percentile)
```

## Dependencies

- asciichart: For generating ASCII charts
- simple-git: For git operations
- TypeScript: For static typing
- Nodemon: For development auto-reload

## License

MIT
