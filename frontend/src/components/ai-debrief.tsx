import React, { useState, useEffect, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FlightAnalysis, ChatMessage } from '@/types/analysis';
import { Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiDebriefProps {
  analysis: FlightAnalysis | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function AiDebrief({ analysis }: AiDebriefProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const initialDebriefSent = useRef(false);

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
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + (payload.text || '') },
            ];
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

  return (
    <div className="flex flex-col gap-2 h-full min-h-[400px]">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-xs font-bold text-[#8eb1bc] uppercase tracking-widest">AI Flight Debrief</h3>
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-[#f4c95d] text-[10px] animate-pulse">
            <div className="w-1.5 h-1.5 rounded-full bg-[#f4c95d] shadow-[0_0_8px_rgba(244,201,93,0.5)]" />
            Streaming...
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-[#0d1a22] rounded-xl border border-white/5 p-2.5">
        <div className="flex flex-col gap-2 pb-1">
          {messages.length === 0 && !analysis && (
            <div className="text-sm text-[#8eb1bc] italic">
              AI debrief will appear here after analysis.
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "p-2.5 rounded-xl text-sm leading-snug border",
                msg.role === 'user' 
                  ? "bg-[#f4c95d]/10 border-[#f4c95d]/20 text-[#fff3cd] self-end max-w-[90%]" 
                  : "bg-white/5 border-white/10 text-[#eef6f8] self-start max-w-[90%]"
              )}
            >
              <div className="font-bold mb-0.5 text-[10px] uppercase tracking-tighter opacity-50">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div 
                className="prose prose-invert prose-sm max-w-none text-[#eef6f8] prose-p:leading-normal prose-p:my-0.5 prose-ul:my-1 prose-li:my-0 prose-h4:mt-1.5 prose-h4:mb-0.5" 
                dangerouslySetInnerHTML={{ __html: msg.content }} 
              />
              {msg.isStreaming && <span className="inline-block w-2 h-3.5 ml-1 bg-[#f4c95d] animate-pulse align-middle" />}
            </div>
          ))}
          <div ref={scrollEndRef} className="h-0" />
        </div>
      </ScrollArea>

      <form onSubmit={handleSend} className="flex gap-1.5 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="min-h-[44px] max-h-[100px] bg-[#0b171f] border-white/10 text-[#eef6f8] text-xs py-2"
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
          className="bg-[#f4c95d] hover:bg-[#da8f3b] text-[#152028] font-bold h-auto px-2.5 shrink-0"
        >
          {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </form>
    </div>
  );
}
