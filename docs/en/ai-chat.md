# AI chat

[Manual](README.md) · [Deutsch](../de/ai-chat.md) · [Project overview](../../README.en.md)

## Setup and use

In the profile, select OpenAI, Google Gemini or Anthropic Claude, enter a personal API key and choose a model. The model list is retrieved from the provider; a model name can also be entered manually. Server-configured keys and default models may serve as fallbacks. Use the connection test to check access.

Open the chat from the aquarium details. Suggested questions help you get started. On mobile devices, the dialog uses the available screen and accounts for the on-screen keyboard.

Sent questions appear immediately in the conversation. While processing, the chat shows actual server stages and waits for the AI response. These status messages are not the model’s private reasoning. If a request fails, the question is restored to the input for retrying.

## Context and history

The server adds tank dimensions, volume, water type, equipment, residents and the last ten measurements with assessments and trends. Aquarium chat history is stored per tank. Older conversation turns are summarized for the model context; summaries may lose details.

## Data transfer and keys

Sending a chat request transfers messages and tank context to the selected provider. Personal keys are encrypted with AES-256-GCM in SQLite or MongoDB. Their first and last four characters are stored separately and displayed as `abcd...wxyz`; very short keys appear as `***`. Existing plaintext keys migrate automatically at startup (database schema 7). Deleting a key also clears its identification fields. Decryption takes place only for provider requests. New backups contain encrypted keys; restoring older plaintext backups encrypts them before insertion. Back up the original encryption key separately; see [installation](installation.md#personal-ai-key-encryption). Existing archives are not rewritten. Costs, available models and provider-side processing depend on the provider and account.

## Chat after a diagnosis

The optional chat following the diagnosis assistant also includes answers and suspected diagnoses. It neither loads nor saves aquarium chat history; messages are discarded when its dialog closes. External provider retention policies still apply. See the [health module](health.md) for details.
