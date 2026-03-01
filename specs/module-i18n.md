# Module: Internationalization (i18n)

## Scope

Provides localized strings for all user-facing messages. Supports English (`en`) and Ukrainian (`uk`). The bot engine and scheduler use this module to produce messages — they never contain hardcoded user-facing text.

## Files

| File                          | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `src/i18n/index.ts`           | `I18nService` implementation, locale loader |
| `src/i18n/locales/en.ts`      | English translations                        |
| `src/i18n/locales/uk.ts`      | Ukrainian translations                      |
| `tests/i18n/index.test.ts`    | Unit tests                                  |

## Dependencies

- None (pure module, no external libraries)
- Used by: Bot Engine, Scheduler

## Design

### Locale Files

Each locale file exports an object conforming to a `TranslationMap` type. All keys must be present in every locale — TypeScript enforces completeness at compile time.

```typescript
interface TranslationMap {
  // General
  welcome: string
  help: string
  unknownCommand: string

  // Photo processing
  analyzingPhoto: string
  extractionFailed: string
  noDateFound: string
  confirmExtraction: (params: { productName: string; expiryDate: string; rawText: string }) => string
  itemAdded: (params: { productName: string; expiryDate: string }) => string

  // List
  noActiveItems: string
  listHeader: string
  listItem: (params: { productName: string; expiryDate: string; daysUntil: number }) => string

  // Actions
  itemConsumed: (params: { productName: string }) => string
  itemDeleted: (params: { productName: string }) => string

  // Alerts
  expiryAlert: (params: { productName: string; expiryDate: string; daysUntil: number }) => string

  // Buttons
  btnConsume: string
  btnDelete: string
  btnYes: string
  btnNo: string

  // Language
  selectLanguage: string
  languageChanged: string
}
```

Translation values are either plain strings or functions that accept interpolation parameters and return a string. This keeps interpolation type-safe.

### I18nService

```typescript
interface I18nService {
  t(chatId: string, key: keyof TranslationMap, params?: Record<string, unknown>): string
  setLocale(chatId: string, locale: Locale): void
  getLocale(chatId: string): Locale
}

type Locale = 'en' | 'uk'
```

- `t()` — returns the translated string for the given key and chat's locale. If the value is a function, calls it with `params`.
- `setLocale()` — sets the locale for a chat. Persisted in the database (via storage module).
- `getLocale()` — returns the current locale for a chat. Defaults to `en` if not set.

### Locale Persistence

User language preference must survive bot restarts. Two options:

**Approach: Store in `food_items`-adjacent table**

A new `user_preferences` table (see Storage module update):

| Column     | Type          | Constraints          |
| ---------- | ------------- | -------------------- |
| `chat_id`  | `varchar(64)` | PK                   |
| `locale`   | `varchar(5)`  | NOT NULL, default `'en'` |

The `I18nService` holds an in-memory cache (`Map<string, Locale>`) and syncs with the DB:
- On `getLocale()`: check cache first, fallback to DB query, fallback to default `'en'`
- On `setLocale()`: update cache + persist to DB
- On startup: no need to preload — lazy load per chat

## User Interaction: Language Selection

### `/lang` Command

- Bot replies with a message and two inline buttons: "English 🇬🇧" / "Українська 🇺🇦"
- On button tap, engine calls `i18n.setLocale(chatId, selectedLocale)`
- Bot confirms in the newly selected language

### `/start` Command (updated)

- After the welcome message, if this is the first interaction (no locale set), prompt for language selection
- Subsequent `/start` calls skip the language prompt

## Testing Strategy

- Test that every key in `TranslationMap` exists in both `en.ts` and `uk.ts`
- Test that `t()` returns correct strings for both locales
- Test interpolation with function-type values
- Test locale cache behavior (set, get, default fallback)
- No DB needed in unit tests — mock the persistence layer

## Tasks

1. Define `TranslationMap` type and `Locale` type
2. Write `src/i18n/locales/en.ts` with all English translations
3. Write `src/i18n/locales/uk.ts` with all Ukrainian translations
4. Implement `I18nService` with in-memory cache and DB sync
5. Write unit tests
