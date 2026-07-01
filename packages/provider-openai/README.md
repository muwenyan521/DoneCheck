# @donecheck/provider-openai

Real OpenAI implementation of the `LLMProvider` contract from `@donecheck/core`.

## Usage

```ts
import { OpenAIProvider } from "@donecheck/provider-openai";

const provider = new OpenAIProvider();
const result = await provider.generateObject({
  prompt: { system: "You are a helper.", user: "Pick a file.", version: "v1" },
  schema: myZodSchema,
  schemaName: "MySchema",
});
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes (for `OpenAIProvider`) | — | OpenAI API key |
| `OPENAI_BASE_URL` | no | `undefined` (OpenAI default) | Override base URL (e.g. Azure, local proxy) |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Override model id |

## `createProvider` factory

```ts
import { createProvider } from "@donecheck/provider-openai";

const provider = createProvider();
```

- Returns `OpenAIProvider` when `OPENAI_API_KEY` is set.
- Falls back to a deterministic mock provider (warns to stderr) when the key is missing — useful for local dry-runs and CI smoke without a real key.

## Notes

- Uses OpenAI structured outputs (`zodResponseFormat`) for `generateObject`.
- `@donecheck/core` is a type-only dependency (the `LLMProvider` contract); it is never imported at runtime.
- Tests use an injected mock client; CI never calls the real model.

## License

MIT.
