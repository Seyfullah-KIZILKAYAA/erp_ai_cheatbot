/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, Mic, Volume2, MicOff } from 'lucide-react'
import styles from './ChatInterface.module.css'
import DynamicWidget from './DynamicComponents'

interface Message {
    id: string
    role: 'user' | 'bot'
    content: string
    timestamp: Date
    data?: any
    ui_component?: 'table' | 'chart' | 'stat'
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
    const [isListening, setIsListening] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const recognitionRef = useRef<any>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // --- SESLİ KOMUT İŞLEMLERİ ---
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition
            const recognition = new SpeechRecognition()
            recognition.continuous = false; // Tek cümle alıp dursun
            recognition.interimResults = false;
            recognition.lang = 'tr-TR';

            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript
                setInputValue(transcript)
                setTimeout(() => handleSendMessage(null, transcript), 500) // 0.5sn sonra otomatik gönder
            }

            recognition.onend = () => {
                setIsListening(false)
            }

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error)
                setIsListening(false)
            }

            recognitionRef.current = recognition
        }
    }, [])

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("Tarayıcınız sesli komut özelliğini desteklemiyor.")
            return;
        }

        if (isListening) {
            recognitionRef.current.stop()
        } else {
            recognitionRef.current.start()
            setIsListening(true)
        }
    }

    const speakText = (text: string) => {
        if (!window.speechSynthesis) return;

        // Varsa önceki konuşmayı durdur
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        window.speechSynthesis.speak(utterance);
    }
    // ----------------------------

    const handleSendMessage = async (e: React.FormEvent | null, textOverride?: string) => {
        if (e) e.preventDefault()

        const finalContent = textOverride || inputValue
        if (!finalContent.trim()) return

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: finalContent,
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
                    message: userMessage.content,
                    history: messages
                })
            });

            const data = await response.json();

            // Cevabı SESLİ oku
            speakText(data.content);

            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: data.content,
                data: data.data,
                ui_component: data.ui_component,
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
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
                                {msg.role === 'bot' && <Bot size={20} style={{ flexShrink: 0, marginTop: '4px' }} />}
                                <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{msg.content}</div>
                                {msg.role === 'user' && <User size={20} style={{ flexShrink: 0, marginTop: '4px' }} />}
                            </div>

                            {/* [NEW] Dynamic Widget Rendering */}
                            {msg.role === 'bot' && msg.data && (
                                <div style={{ width: '100%', paddingLeft: '32px' }}>
                                    <DynamicWidget type={msg.ui_component || 'table'} data={msg.data} />
                                </div>
                            )}
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
                <button
                    type="button"
                    className={`${styles.micButton} ${isListening ? styles.micActive : ''}`}
                    onClick={toggleListening}
                    title="Sesli Konuş"
                >
                    {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <input
                    type="text"
                    className={styles.input}
                    placeholder={isListening ? "Dinliyorum..." : "Bir soru sorun..."}
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
