
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles } from 'lucide-react'
import styles from './ChatInterface.module.css'
import { supabase } from '@/lib/supabaseClient'

interface Message {
    id: string
    role: 'user' | 'bot'
    content: string
    timestamp: Date
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'bot',
            content: 'Merhaba! Ben ERP asistanınız. Size satışlar, stok durumu ve ürün performansı hakkında yardımcı olabilirim. Bugün ne öğrenmek istersiniz?',
            timestamp: new Date()
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!inputValue.trim()) return

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content, // inputValue boşaltıldığı için userMessage.content kullanıyoruz
                    history: messages // Sohbet geçmişini gönder
                })
            });

            const data = await response.json();

            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: data.content,
                timestamp: new Date()
            }

            setMessages(prev => [...prev, botMessage])
        } catch (err: any) {
            console.error('Chat API Error:', err)
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: 'Üzgünüm, bir iletişim hatası oluştu. Lütfen bağlantınızı kontrol edin.',
                timestamp: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '8px' }}>
                    <Bot size={24} color="white" />
                </div>
                <div>
                    <h2 className={styles.title}>ERP AI Asistanı</h2>
                    <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>Şirket verilerinizle konuşun</p>
                </div>
                <Sparkles size={20} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
            </header>

            <div className={styles.messagesArea}>
                {messages.map((msg) => (
                    <div key={msg.id} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.botMessage}`}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            {msg.role === 'bot' && <Bot size={20} style={{ flexShrink: 0, marginTop: '4px' }} />}
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            {msg.role === 'user' && <User size={20} style={{ flexShrink: 0, marginTop: '4px' }} />}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className={`${styles.message} ${styles.botMessage}`}>
                        <div className={styles.loading}>
                            <div className={styles.dot}></div>
                            <div className={styles.dot}></div>
                            <div className={styles.dot}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className={styles.inputArea} onSubmit={handleSendMessage}>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Bir soru sorun... (örn: En çok satılan ürün hangisi?)"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                />
                <button type="submit" className={styles.sendButton} disabled={isLoading}>
                    <Send size={20} />
                </button>
            </form>
        </div>
    )
}
