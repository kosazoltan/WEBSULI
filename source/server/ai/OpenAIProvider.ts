import OpenAI from 'openai';
import {
  IAIProvider,
  AIMessage,
  AIResponse,
  AIStreamChunk,
  AIProviderConfig,
  AIProviderError,
  AIProviderTimeoutError,
  AIProviderRateLimitError,
  AIProviderAuthError,
  AIProviderQuotaError,
  isQuotaExhausted,
  type ChatCallOptions,
} from './AIProvider';
import { collectStream, idleAbortSignal, type StreamEvent } from './stream-collect';

export class OpenAIProvider implements IAIProvider {
  readonly name: string;
  readonly model: string;
  private client: OpenAI;
  private timeout: number;
  private maxTokens?: number;
  private apiMode?: AIProviderConfig['apiMode'];
  private reasoningEffort?: AIProviderConfig['reasoningEffort'];
  private jsonMode?: boolean;
  get maxOutputTokens(): number | undefined { return this.maxTokens; }
  readonly supportsStreamingChat = true;

  constructor(config: AIProviderConfig, vendor: "openai" | "xai" = "openai") {
    this.name = vendor === "xai" ? "xAI" : "OpenAI";
    this.maxTokens = config.maxTokens;
    this.jsonMode = config.jsonMode;
    this.apiMode = config.apiMode;
    this.reasoningEffort = config.reasoningEffort;
    this.model = config.model;
    this.timeout = config.timeout || 60000; // Default 60s
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: vendor === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1",
      timeout: this.timeout,
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
    });
  }

  async chat(messages: AIMessage[], signal?: AbortSignal, options?: ChatCallOptions): Promise<AIResponse> {
    if (options?.stream) return this.chatStreamed(messages, signal, options, options.stream.idleMs);
    try {
      if (this.apiMode === 'responses') {
        const outputBudget = options?.maxTokens ?? this.maxTokens;
        const response = await this.client.responses.create({
          model: this.model, input: messages, store: false,
          ...(outputBudget ? { max_output_tokens: outputBudget } : {}),
          ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
        }, { signal });
        return { content: response.output_text ?? '', finishReason: response.status === 'completed' ? 'stop' : 'length',
          usage: response.usage ? { promptTokens: response.usage.input_tokens, completionTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens,
            ...(response.usage.input_tokens_details?.cached_tokens ? { cachedTokens: response.usage.input_tokens_details.cached_tokens } : {}) } : undefined };
      }
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          ...((options?.maxTokens ?? this.maxTokens) ? { max_completion_tokens: options?.maxTokens ?? this.maxTokens } : {}),
          // Spec 2026-09-30 (U2/C8): hívásonkénti szigorú séma, ha a hívó adja; különben a lépés JSON-módja (ha van).
          ...(options?.responseFormat ? { response_format: options.responseFormat as never } : this.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal }
      );

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new AIProviderError(this.name, 'No response from API');
      }

      return {
        content: choice.message.content || '',
        finishReason: choice.finish_reason || undefined,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
              ...(response.usage.prompt_tokens_details?.cached_tokens ? { cachedTokens: response.usage.prompt_tokens_details.cached_tokens } : {}),
            }
          : undefined,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Spec 2026-10-05-s10-adatvesztes-mentesseg: a `chat`-tel azonos kérés streamelve, tétlenségi őrrel — a Responses-módon is
   * (a mért lektor-időtúllépés, „[xAI] Request timed out.”, ott történt). Responses: a szöveg `response.output_text.delta`, a
   * gondolkodás-delta aktivitás, a zárás `response.completed` (stop) / `response.incomplete` (length); `response.failed` és
   * `error` → hiba a részleges szöveggel.
   */
  private async chatStreamed(messages: AIMessage[], signal: AbortSignal | undefined, options: ChatCallOptions, idleMs: number): Promise<AIResponse> {
    const outputBudget = options.maxTokens ?? this.maxTokens;
    const idle = idleAbortSignal(signal);
    let partial = '';
    const provider = this.name;
    try {
      let events: AsyncGenerator<StreamEvent>;
      if (this.apiMode === 'responses') {
        const stream = await this.client.responses.create({
          model: this.model, input: messages, store: false, stream: true,
          ...(outputBudget ? { max_output_tokens: outputBudget } : {}),
          ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
        }, { signal: idle.signal });
        events = (async function* () {
          for await (const ev of stream) {
            if (ev.type === 'response.output_text.delta') { partial += ev.delta; yield { text: ev.delta }; continue; }
            if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
              const u = ev.response.usage;
              yield { finishReason: ev.type === 'response.completed' ? 'stop' : 'length', ...(u ? { usage: { promptTokens: u.input_tokens, completionTokens: u.output_tokens, totalTokens: u.total_tokens,
                ...(u.input_tokens_details?.cached_tokens ? { cachedTokens: u.input_tokens_details.cached_tokens } : {}) } } : {}) };
              continue;
            }
            if (ev.type === 'response.failed' || ev.type === 'error') throw new AIProviderError(provider, 'A szolgáltató a stream közben hibát jelzett.');
            yield { activity: true };
          }
        })();
      } else {
        const stream = await this.client.chat.completions.create(
          {
            model: this.model,
            messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
            ...(outputBudget ? { max_completion_tokens: outputBudget } : {}),
            ...(options.responseFormat ? { response_format: options.responseFormat as never } : this.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: idle.signal }
        );
        events = (async function* () {
          for await (const chunk of stream) {
            const choice = chunk.choices?.[0];
            const text = choice?.delta?.content ?? '';
            if (text) partial += text;
            yield {
              ...(text ? { text } : {}),
              activity: true,
              ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
              ...(chunk.usage ? { usage: { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens, totalTokens: chunk.usage.total_tokens,
                ...(chunk.usage.prompt_tokens_details?.cached_tokens ? { cachedTokens: chunk.usage.prompt_tokens_details.cached_tokens } : {}) } } : {}),
            };
          }
        })();
      }
      return await collectStream(events, { idleMs, abort: idle.abort, provider });
    } catch (error: unknown) {
      if (error instanceof AIProviderError && error.name === 'AIProviderIdleTimeoutError') throw error;
      const mapped = error instanceof AIProviderError ? error : this.handleError(error);
      mapped.partialContent = (error as { partialContent?: string })?.partialContent ?? partial;
      throw mapped;
    }
  }

  async *streamChat(
    messages: AIMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          ...(this.maxTokens ? { max_completion_tokens: this.maxTokens } : {}),
          stream: true,
        },
        { signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield {
            type: 'content_delta',
            content: delta.content,
          };
        }
      }

      yield { type: 'done' };
    } catch (error: unknown) {
      if (signal?.aborted) {
        yield {
          type: 'error',
          message: 'Request aborted',
        };
        return;
      }
      throw this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple ping to check if API is reachable
      await this.client.models.list({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private handleError(error: unknown): AIProviderError {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new AIProviderTimeoutError(this.name, this.timeout);
    }
    // Handle abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      return new AIProviderTimeoutError(this.name, this.timeout);
    }

    // Handle OpenAI specific errors
    if (error instanceof OpenAI.APIError) {
      // Spec 2026-09-25: a kimerült keret nem sebességkorlát — saját, nem újrapróbálható hiba.
      if (isQuotaExhausted(error)) return new AIProviderQuotaError(this.name, String(error.code ?? error.type ?? "insufficient_quota"));
      if (error.status === 429) {
        return new AIProviderRateLimitError(this.name);
      }
      if (error.status === 401 || error.status === 403) {
        return new AIProviderAuthError(this.name);
      }
      return new AIProviderError(
        this.name,
        error.message || 'API error',
        error.status >= 500, // Retriable if server error
        error
      );
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return new AIProviderError(
      this.name,
      message || 'Unknown error',
      true,
      error instanceof Error ? error : undefined
    );
  }
}
