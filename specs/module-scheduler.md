# Module: Scheduler

## Scope

Runs periodic jobs to check for food items approaching expiration and dispatches alerts through the adapter. Knows nothing about Telegram, LLMs, or OCR — only uses `FoodRepository` and `BotAdapter` interfaces.

## Files

| File                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `src/scheduler/alerts.ts`       | Alert scheduler implementation       |
| `tests/scheduler/alerts.test.ts`| Unit tests with mocked dependencies  |

## Dependencies (all injected)

- `FoodRepository` interface — to query expiring items and record sent alerts
- `BotAdapter` interface — to send alert messages
- `I18nService` interface — to localize alert messages per user's language
- `node-cron` — cron-based job scheduling
- Receives `ALERT_CRON_SCHEDULE` from config

## src/scheduler/alerts.ts

### Constructor

Receives:
- `repository: FoodRepository`
- `adapter: BotAdapter`
- `i18n: I18nService`
- `cronSchedule: string` (default: `'0 9 * * *'` — daily at 9 AM)

### Method: `start(): void`

- Registers a cron job using `node-cron`
- On each tick, calls `checkAndAlert()`

### Method: `stop(): void`

- Stops the cron job

### Method: `checkAndAlert(): Promise<void>`

This is the core logic, also callable directly for testing.

**Algorithm:**

```
for each threshold in [3, 2, 1]:
    targetDate = today + threshold days
    items = repository.getUnalertedItemsForDay(targetDate, threshold)
    for each item in items:
        alertText = i18n.t(item.chatId, 'expiryAlert', {
            productName: item.productName,
            expiryDate: item.expiryDate,
            daysUntil: threshold
        })
        consumeLabel = i18n.t(item.chatId, 'btnConsume')
        await adapter.sendAlert(item.chatId, {
            foodItemId: item.id,
            productName: item.productName,
            expiryDate: item.expiryDate,
            daysUntilExpiry: threshold,
            localizedText: alertText,
            localizedConsumeLabel: consumeLabel
        })
        await repository.recordAlertSent(item.id, threshold)
```

Alert messages are localized per-user — the scheduler resolves the user's locale via `I18nService` before sending.

**Key behaviors:**
- Alerts are sent for 3, 2, and 1 days before expiry (separate alerts)
- `getUnalertedItemsForDay` ensures no duplicate alerts — if the scheduler runs multiple times per day, the same alert is not sent twice
- `recordAlertSent` is called immediately after successful send — if send fails, it won't be recorded and will retry on next tick
- Each item is processed independently — one failure doesn't block others

### Error Handling

- If `adapter.sendAlert()` fails for one item, log the error and continue with remaining items
- If `repository` calls fail, log and abort the current tick (will retry next schedule)
- Never let an unhandled exception crash the scheduler — wrap the entire tick in try/catch

## Alert Thresholds

The 3-2-1 day thresholds are defined as a constant array within this module. If the user requests different thresholds in the future, this is the only place to change.

```typescript
const ALERT_THRESHOLDS_DAYS = [3, 2, 1] as const
```

## Edge Cases

- **Item expires today (0 days)**: Not alerted by default (the 1-day alert was yesterday). Could add a "expired today" alert as a future enhancement.
- **Item already expired**: Skipped — `targetDate` is always in the future
- **Bot was offline for days**: On restart, the scheduler runs its next tick — it will send any unsent alerts for items expiring within the threshold window. Alerts for past dates (that were missed) will NOT be sent since targetDate is computed from today.
- **Multiple items for same user**: Each gets its own alert message (not batched). Batching is a future optimization.

## Testing Strategy

- Mock `FoodRepository` and `BotAdapter`
- Test `checkAndAlert()` directly (don't test cron scheduling itself)
- Test that alerts are sent for items at each threshold
- Test that `recordAlertSent` is called after each successful send
- Test that a failed send for one item doesn't block others
- Test that already-alerted items are not re-alerted (via mock returning empty for those)

## Tasks

1. Implement `AlertScheduler` class with constructor and start/stop
2. Implement `checkAndAlert()` logic with threshold iteration
3. Add error handling (per-item and per-tick)
4. Write unit tests covering normal flow and error cases
