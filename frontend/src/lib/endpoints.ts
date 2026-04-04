import { api, buildQueryString, buildWsUrl } from '@/lib/api'
import type {
  AiSummaryRequest,
  AnalyzeFlightResponse,
  FlightChatIncomingMessage,
  FlightChatInitPayload,
  FlightChatQuestionPayload,
  FlightLogMessagesResponse,
  FlightLogQueryParams,
  UploadFlightResponse,
} from '@/types'

export const flightApi = {
  upload: (file: File) =>
    api.uploadFile<UploadFlightResponse>('/upload', file),

  analyze: (file: File) =>
    api.uploadFile<AnalyzeFlightResponse>('/analyze', file),

  aiSummaryStream: (payload: AiSummaryRequest) =>
    api.postStream('/ai-summary', payload),

  enuStream: (file: File) =>
    api.uploadStream('/upload/enu-stream', file),

  logMessages: (
    filename: string,
    params: FlightLogQueryParams = {},
  ) =>
    api.get<FlightLogMessagesResponse>(
      `/logs/${encodeURIComponent(filename)}/messages${buildQueryString(
        params as Record<string, unknown>,
      )}`,
    ),
}

export const flightWs = {
  chatUrl: () => buildWsUrl('/ws/chat'),
}

export type {
  FlightChatIncomingMessage,
  FlightChatInitPayload,
  FlightChatQuestionPayload,
}
