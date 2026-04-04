import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FlightAnalysis, ChatMessage } from '@/types/analysis';
import { Loader2, Send, Sparkles, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiDebriefProps {
  analysis: FlightAnalysis | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--uav-primary)]"
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [0.8, 1.1, 0.8],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function AiDebrief({ analysis }: AiDebriefProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const initialDebriefSent = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const socketUrl = import.meta.env.VITE_API_WS_URL
    ? `${import.meta.env.VITE_API_WS_URL}/api/ws/chat`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/chat`;

  const { sendMessage, lastJsonMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    if (lastJsonMessage) {
      const payload = lastJsonMessage as ChatMessage;

      if (payload.type === 'start') {
        setIsStreaming(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
      } else if (payload.type === 'chunk') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + (payload.text || '') }];
          }
          return prev;
        });
      } else if (payload.type === 'done') {
        setIsStreaming(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
      } else if (payload.type === 'error') {
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${payload.message || 'Unknown error'}` },
        ]);
      }
    }
  }, [lastJsonMessage]);

  useEffect(() => {
    if (analysis && readyState === ReadyState.OPEN && !initialDebriefSent.current) {
      initialDebriefSent.current = true;
      setMessages([]);
      sendMessage(JSON.stringify({
        type: 'init',
        filename: analysis.filename,
        ai_context_toon: analysis.ai_context_toon,
        question: 'Provide an initial debrief for this flight: summarize what happened, highlight the key metrics, explain any anomalies, and describe what they may indicate.',
      }));
    }
  }, [analysis, readyState, sendMessage]);

  useEffect(() => {
    if (analysis) {
      initialDebriefSent.current = false;
    }
  }, [analysis]);

  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !analysis || isStreaming || readyState !== ReadyState.OPEN) return;

    const question = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');

    sendMessage(JSON.stringify({
      type: 'question',
      filename: analysis.filename,
      ai_context_toon: analysis.ai_context_toon,
      question: question,
    }));
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '36px';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full transition-all duration-500",
      isStreaming && "glow-gold-border animate-glow-pulse-gold"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-[var(--uav-primary)]/10 shadow-[0_0_12px_rgba(107,227,255,0.2)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--uav-primary)]" />
          </div>
          <span className="text-xs font-bold text-[var(--uav-text-secondary)] uppercase tracking-wider">AI Debrief</span>
        </div>
        <AnimatePresence>
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center gap-2 text-[var(--uav-primary)]"
            >
              <TypingIndicator />
              <span className="text-[10px] font-medium">Thinking</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 p-3">
          {messages.length === 0 && !analysis && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-[var(--uav-muted)]/40" />
              </div>
              <p className="text-xs text-[var(--uav-muted)] max-w-[200px]">
                AI debrief will appear here after analysis
              </p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={cn(
                  "flex gap-2",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row",
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === 'user'
                    ? "bg-[var(--uav-accent)]/10 border border-[var(--uav-accent)]/20"
                    : "bg-[var(--uav-primary)]/10 border border-[var(--uav-primary)]/20",
                )}>
                  {msg.role === 'user'
                    ? <User className="w-3 h-3 text-[var(--uav-accent)]" />
                    : <Bot className="w-3 h-3 text-[var(--uav-primary)]" />
                  }
                </div>

                {/* Bubble */}
                <div className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                  msg.role === 'user'
                    ? "bg-[var(--uav-accent)]/[0.07] border border-[var(--uav-accent)]/10 text-[var(--uav-text)]"
                    : "bg-white/[0.03] border border-white/5 text-[var(--uav-text)]",
                )}>
                  <div
                    className="prose prose-invert prose-sm max-w-none
                      prose-p:leading-relaxed prose-p:my-1 prose-p:text-[13px]
                      prose-ul:my-1.5 prose-li:my-0 prose-li:text-[13px]
                      prose-h4:mt-2 prose-h4:mb-1 prose-h4:text-xs prose-h4:text-[var(--uav-primary)]
                      prose-strong:text-[var(--uav-text)] prose-strong:font-semibold
                      prose-code:text-[var(--uav-primary)] prose-code:text-xs prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded"
                    dangerouslySetInnerHTML={{ __html: msg.content }}
                  />
                  {msg.isStreaming && (
                    <motion.span
                      className="inline-block w-[3px] h-4 ml-0.5 bg-[var(--uav-primary)] rounded-full align-middle"
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={scrollEndRef} className="h-0" />
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-white/5 shrink-0">
        <div className="flex items-end gap-2 bg-[var(--uav-bg-subtle)] rounded-xl border border-white/5 p-1.5 focus-within:border-[var(--uav-primary)]/20 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            placeholder="Ask about the flight..."
            className="flex-1 bg-transparent border-0 text-xs text-[var(--uav-text)] placeholder:text-[var(--uav-muted)]/50 resize-none focus:outline-none px-2 py-1.5 min-h-[36px] max-h-[100px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={!analysis || isStreaming || readyState !== ReadyState.OPEN}
          />
          <Button
            type="submit"
            disabled={!analysis || isStreaming || !input.trim() || readyState !== ReadyState.OPEN}
            size="icon"
            className="h-8 w-8 rounded-lg bg-[var(--uav-primary)]/15 hover:bg-[var(--uav-primary)]/25 text-[var(--uav-primary)] border-0 shrink-0 transition-all duration-200 disabled:opacity-30"
          >
            {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
