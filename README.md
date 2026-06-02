> **Work state:** SCAFFOLD · **Progress:** `███░░░░░░░ 30%`
> Type-safe TypeScript HTTP client framework (npm `@kooshapari/quillts`). GOAL: the org-shared TS HTTP surface (interceptors/retries/mocking) replacing per-app fetch wrappers; early. Naming drift — repo "Quillr"/README "quill"/install shows nonexistent `@quill/http` — to reconcile. · updated 2026-06-02

# quill

Type-safe HTTP client for TypeScript with interceptors and retries.

## Features

- **Type-safe**: Full TypeScript inference
- **Interceptors**: Transform requests/responses
- **Retry**: Automatic retry with backoff
- **Mocking**: Built-in test utilities

## Installation

```bash
npm install @quill/http
```

## Usage

```typescript
import { createClient } from '@quill/http';

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' },
});

const user = await api.get<User>('/users/123');
await api.post('/users', { name: 'Alice' });
```

## License

MIT

/// @trace QUILL-001

/// @trace QUILL-001
