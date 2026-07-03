// Capa LLM sobre Vercel AI SDK + AI Gateway.
// El Gateway es el proveedor global por defecto: routing + failover entre
// proveedores + tracking de costos, con salida estructurada validada por Zod.
// Auth: AI_GATEWAY_API_KEY (local) u OIDC de Vercel (en deploy). El modelo se
// elige por env (por defecto un modelo open-weight).
//   AI_GATEWAY_API_KEY   llave del Gateway (o OIDC en Vercel)
//   LLM_MODEL            id de chat en el Gateway (def. openai/gpt-oss-120b)
//   LLM_TRANSCRIBE_MODEL id de transcripción (def. openai/whisper-1)
import { generateText, Output, gateway, experimental_transcribe as transcribe } from 'ai';
import { z } from 'zod';
import { env } from './env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Contrato de respuesta del chat (validado por el modelo vía Output.object).
export const ChatReplySchema = z.object({
  reply: z.string().describe('Respuesta breve al usuario (2-5 frases).'),
  options: z.array(z.string()).max(4).optional().describe('Respuestas rápidas para el usuario (chips).'),
  links: z
    .array(z.object({ label: z.string(), href: z.string() }))
    .max(3)
    .optional()
    .describe('Deep-links del sitio (rutas que empiezan con /).'),
  cta: z.enum(['schedule', 'none']).optional().describe('"schedule" para invitar a agendar.'),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;

const chatModel = () => env('LLM_MODEL') || 'openai/gpt-oss-120b';
const transcribeModel = () => env('LLM_TRANSCRIBE_MODEL') || 'openai/whisper-1';

// true si hay llave de Gateway o corremos en Vercel (OIDC disponible).
export function llmConfigured(): boolean {
  return Boolean(env('AI_GATEWAY_API_KEY') || env('VERCEL'));
}

// Genera la respuesta del chat con salida estructurada y validada.
export async function generateChat(messages: ChatMessage[]): Promise<ChatReply> {
  const { output } = await generateText({
    model: chatModel(),
    temperature: 0.4,
    output: Output.object({ schema: ChatReplySchema }),
    messages,
    abortSignal: AbortSignal.timeout(20_000), // resiliencia: corta si el modelo tarda
  });
  return output;
}

// Transcribe audio (whisper) a través del Gateway.
export async function transcribeAudio(audio: Uint8Array): Promise<string> {
  const { text } = await transcribe({
    model: gateway.transcription(transcribeModel()),
    audio,
    abortSignal: AbortSignal.timeout(30_000),
  });
  return text ?? '';
}
