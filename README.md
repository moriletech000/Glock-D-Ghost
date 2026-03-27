# Glock 'D' Ghoost 👻🔫

A browser-based 2D shooter game where you fight waves of ghosts across 10 levels, ending in a boss battle. Built with HTML5 Canvas and Firebase.

---

## Gameplay

- Shoot incoming ghosts before they reach you
- Survive all 10 levels to win
- Level 10 spawns a boss enemy
- You have 3 lives — ghosts and boss lasers cost you one on contact

## Ghost Types

| Type   | Color   | Trait                        |
|--------|---------|------------------------------|
| Normal | Green   | Standard speed               |
| Fast   | Cyan    | 1.8x speed, smaller size     |
| Tank   | Orange  | Slow, 3 HP, large size       |
| Zigzag | Magenta | Moves in a wave pattern      |

New ghost types unlock as you progress through levels.

## Controls

### Desktop
| Action      | Input                        |
|-------------|------------------------------|
| Move        | `A` / `D` or Arrow Keys      |
| Shoot       | Click (aims toward cursor)   |

### Mobile
| Action      | Input                        |
|-------------|------------------------------|
| Move        | Left joystick (bottom-left)  |
| Shoot       | Tap anywhere on screen       |

## Scoring & Levels

- Kill ghosts to earn points and progress
- Each level requires more kills to advance
- Difficulty increases with each level (faster spawns, tougher ghosts)

## Leaderboard API

The leaderboard reads and writes to a Firebase Firestore collection called `leaderboard`. Here's how each operation works and how to interact with it.

### Data Structure

Each entry in the `leaderboard` collection looks like this:

```json
{
  "name": "PlayerName",
  "score": 1500,
  "level": 7,
  "timestamp": 1711500000000
}
```

### How It Works in the Game

| Action | When it happens | What it does |
|--------|----------------|--------------|
| Load leaderboard | On page load + when leaderboard screen opens | Fetches top 10 scores ordered by `score` descending |
| Save score | When game ends (game over or victory) | Checks if player name exists — updates if yes, creates new entry if no |

### Manually Querying the Leaderboard

You can read leaderboard data directly from Firestore using the Firebase REST API — no SDK needed:

```
GET https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/documents/leaderboard
```

To filter and sort (top 10 by score), use the Firestore `runQuery` endpoint:

```bash
POST https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/documents:runQuery
Content-Type: application/json

{
  "structuredQuery": {
    "from": [{ "collectionId": "leaderboard" }],
    "orderBy": [{ "field": { "fieldPath": "score" }, "direction": "DESCENDING" }],
    "limit": 10
  }
}
```

### Adding a Score Manually

```bash
POST https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/documents/leaderboard
Content-Type: application/json

{
  "fields": {
    "name":      { "stringValue": "PlayerName" },
    "score":     { "integerValue": 1500 },
    "level":     { "integerValue": 7 },
    "timestamp": { "integerValue": 1711500000000 }
  }
}
```

> Note: The REST API requires your Firebase project to have public read rules, or you'll need to pass an auth token via `Authorization: Bearer YOUR_TOKEN`.

---

## Leaderboard

Scores are saved to a global Firebase leaderboard (top 10). If Firebase is unavailable, scores fall back to local storage.

## How to Run

Just open `shooter.html` in a browser — no build step needed.

```bash
# Or serve locally with any static server, e.g.:
npx serve .
```

## Tech Stack

- HTML5 Canvas
- Vanilla JavaScript
- Firebase Firestore (leaderboard)
- Web Audio API (sound effects)
