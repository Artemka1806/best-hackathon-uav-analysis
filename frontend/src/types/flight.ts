export interface UploadFlightResponse {
  filename: string
  message_types: string[]
  total_types: number
}

export type AnalyzeFlightResponse = {
  filename: string
} & Record<string, unknown>

export interface AiSummaryRequest {
  filename?: string | null
  ai_context_toon: string
}

export interface FlightLogQueryParams {
  msg_type?: string
  offset?: number
  limit?: number
}

export interface FlightMessageTypesResponse {
  filename: string
  message_types: string[]
  total: number
  offset: number
  limit: number
}

export interface FlightMessagePageResponse {
  filename: string
  message_type: string
  total: number
  offset: number
  limit: number
  data: Record<string, unknown> | unknown[]
}

export type FlightLogMessagesResponse =
  | FlightMessageTypesResponse
  | FlightMessagePageResponse

export interface EnuOrigin {
  type: 'origin'
  lat: number
  lon: number
  alt: number
}

export interface EnuPoint {
  e: number
  n: number
  u: number
  lat: number
  lon: number
  alt: number
  t: number
  roll?: number
  pitch?: number
  yaw?: number
}

export type EnuStreamMessage = EnuOrigin | EnuPoint

export interface FlightChatInitPayload {
  type: 'init'
  filename?: string | null
  ai_context_toon: string
  question?: string
}

export interface FlightChatQuestionPayload {
  type: 'question'
  question: string
}

export type FlightChatOutgoingMessage =
  | FlightChatInitPayload
  | FlightChatQuestionPayload

export interface FlightChatStartMessage {
  type: 'start'
}

export interface FlightChatChunkMessage {
  type: 'chunk'
  text: string
}

export interface FlightChatDoneMessage {
  type: 'done'
}

export interface FlightChatErrorMessage {
  type: 'error'
  message: string
}

export type FlightChatIncomingMessage =
  | FlightChatStartMessage
  | FlightChatChunkMessage
  | FlightChatDoneMessage
  | FlightChatErrorMessage
