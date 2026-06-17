> **Work-state:** beta — `[#######---] 70%`
>
> Type-safe TypeScript HTTP client with interceptors, retries, and mocking. Core features complete. Pending: advanced middleware chain, streaming request/response support, edge-case error handling.

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
