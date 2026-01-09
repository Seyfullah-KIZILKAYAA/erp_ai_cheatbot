/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, Mic, Volume2, VolumeX, MicOff, Plus, MessageSquare, Trash2, X, Menu, FileText, Download } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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

interface ChatSession {
    id: string
    title: string
    messages: Message[]
    timestamp: number
}

const SESSIONS_KEY = 'erp_chat_sessions';
const SPEECH_KEY = 'erp_speech_enabled';
const MAX_SESSIONS = 15;

export default function ChatInterface() {
    const initialMessage: Message = {
        id: '1',
        role: 'bot',
        content: 'Merhaba! Ben ERP asistanınız. Size satışlar, stok durumu ve ürün performansı hakkında yardımcı olabilirim. Bugün ne öğrenmek istersiniz?',
        timestamp: new Date()
    };

    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string>('')
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [isSpeechEnabled, setIsSpeechEnabled] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const recognitionRef = useRef<any>(null)

    // --- Persistence Logic ---
    useEffect(() => {
        // Load Audio Setting
        const savedSpeechPref = localStorage.getItem(SPEECH_KEY);
        if (savedSpeechPref !== null) {
            setIsSpeechEnabled(savedSpeechPref === 'true');
        }

        // Load Sessions
        const savedSessions = localStorage.getItem(SESSIONS_KEY);
        if (savedSessions) {
            try {
                const parsed = JSON.parse(savedSessions);
                const loadedSessions = parsed.map((s: any) => ({
                    ...s,
                    messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
                }));
                setSessions(loadedSessions);
                if (loadedSessions.length > 0) {
                    setCurrentSessionId(loadedSessions[0].id);
                } else {
                    createNewChat();
                }
            } catch (e) {
                console.error("Session load error:", e);
                createNewChat();
            }
        } else {
            createNewChat();
        }
    }, []);

    useEffect(() => {
        if (sessions.length > 0) {
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        }
    }, [sessions]);

    useEffect(() => {
        localStorage.setItem(SPEECH_KEY, isSpeechEnabled.toString());
        if (!isSpeechEnabled && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }, [isSpeechEnabled]);

    const createNewChat = () => {
        const newId = Date.now().toString();
        const newSession: ChatSession = {
            id: newId,
            title: `Sohbet ${sessions.length + 1}`,
            messages: [initialMessage],
            timestamp: Date.now()
        };
        setSessions(prev => [newSession, ...prev.slice(0, MAX_SESSIONS - 1)]);
        setCurrentSessionId(newId);
    };

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = sessions.filter(s => s.id !== id);
        setSessions(updated);
        if (currentSessionId === id) {
            if (updated.length > 0) {
                setCurrentSessionId(updated[0].id);
            } else {
                createNewChat();
            }
        }
    };

    const currentSession = sessions.find(s => s.id === currentSessionId) || { messages: [initialMessage] };
    const messages = currentSession.messages;

    const updateCurrentSessionMessages = (newMessages: Message[]) => {
        setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
                const firstUserMsg = newMessages.find(m => m.role === 'user');
                return {
                    ...s,
                    messages: newMessages,
                    title: firstUserMsg ? (firstUserMsg.content.length > 25 ? firstUserMsg.content.slice(0, 25) + '...' : firstUserMsg.content) : s.title
                };
            }
            return s;
        }));
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // --- Voice Logic ---
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition
            const recognition = new SpeechRecognition()
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'tr-TR';

            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript
                setInputValue(transcript)
                setTimeout(() => handleSendMessage(null, transcript), 500)
            }

            recognition.onend = () => setIsListening(false)
            recognition.onerror = () => setIsListening(false)
            recognitionRef.current = recognition
        }
    }, [])

    const toggleListening = () => {
        if (!recognitionRef.current) return alert("Sesli komut desteklenmiyor.");
        if (isListening) recognitionRef.current.stop();
        else { recognitionRef.current.start(); setIsListening(true); }
    }

    const speakText = (text: string) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        window.speechSynthesis.speak(utterance);
    }

    const generateReport = () => {
        const doc = new jsPDF();

        // Font setup (basic support for Turkish characters might need a custom font, 
        // using standard font for now, might have issues with some chars)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text("ERP AI Asistanı - Sohbet Raporu", 14, 22);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 14, 30);

        let yPos = 40;

        messages.forEach((msg, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(msg.role === 'user' ? '#2563eb' : '#000000');
            const role = msg.role === 'user' ? 'Kullanıcı:' : 'Asistan:';
            doc.text(role, 14, yPos);
            yPos += 7;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor('#333333');

            // Text wrapping
            const textLines = doc.splitTextToSize(msg.content, 180);
            doc.text(textLines, 14, yPos);
            yPos += (textLines.length * 5) + 5;

            // If there is table data
            if (msg.role === 'bot' && msg.ui_component === 'table' && msg.data && Array.isArray(msg.data)) {
                const headers = Object.keys(msg.data[0]);
                const body = msg.data.map((row: any) => headers.map(h => {
                    const val = row[h];
                    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                    return String(val);
                }));

                autoTable(doc, {
                    startY: yPos,
                    head: [headers],
                    body: body,
                    theme: 'striped',
                    styles: { fontSize: 8, font: 'helvetica' },
                    headStyles: { fillColor: [41, 128, 185] }
                });

                // autoTable updates lastAutoTable.finalY
                yPos = (doc as any).lastAutoTable.finalY + 10;
            }
        });

        doc.save(`ERP_Rapor_${Date.now()}.pdf`);
    };

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

        const updatedMessages = [...messages, userMessage];
        updateCurrentSessionMessages(updatedMessages);
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

            // Auto speak if enabled
            if (isSpeechEnabled) speakText(data.content);

            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: data.content,
                data: data.data,
                ui_component: data.ui_component,
                timestamp: new Date()
            }

            updateCurrentSessionMessages([...updatedMessages, botMessage]);
        } catch (err: any) {
            console.error('Chat API Error:', err)
            updateCurrentSessionMessages([...updatedMessages, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: 'İletişim hatası oluştu.',
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className={styles.layout}>
            {/* --- SIDEBAR --- */}
            <aside className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarClosed : ''}`}>
                <div className={styles.sidebarHeader}>
                    <button onClick={createNewChat} className={styles.newChatSidebarButton}>
                        <Plus size={18} />
                        <span>Yeni Sohbet</span>
                    </button>
                    <button onClick={() => setIsSidebarOpen(false)} className={styles.closeSidebarButton}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.sessionList}>
                    <div className={styles.sidebarTitle}>Geçmiş Sohbetler</div>
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            className={`${styles.sessionItem} ${currentSessionId === session.id ? styles.activeSession : ''}`}
                            onClick={() => setCurrentSessionId(session.id)}
                        >
                            <MessageSquare size={16} />
                            <span className={styles.sessionTitle}>{session.title}</span>
                            <button onClick={(e) => deleteSession(e, session.id)} className={styles.deleteButton}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            {/* --- MAIN --- */}
            <div className={styles.container}>
                <header className={styles.header}>
                    {!isSidebarOpen && (
                        <button onClick={() => setIsSidebarOpen(true)} className={styles.menuButton}>
                            <Menu size={24} />
                        </button>
                    )}

                    <div className={styles.headerCenter}>
                        <div style={{ background: 'var(--primary)', padding: '6px', borderRadius: '6px' }}>
                            <Bot size={20} color="white" />
                        </div>
                        <h2 className={styles.title}>ERP AI Asistanı</h2>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            onClick={generateReport}
                            className={styles.actionButton}
                            title="Rapor Oluştur (PDF)"
                        >
                            <FileText size={20} />
                        </button>
                        <button
                            onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                            className={`${styles.actionButton} ${!isSpeechEnabled ? styles.disabledAction : ''}`}
                            title={isSpeechEnabled ? "Otomatik Okumayı Kapat" : "Otomatik Okumayı Aç"}
                        >
                            {isSpeechEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </button>
                        <Sparkles size={20} className={styles.sparkleIcon} />
                    </div>
                </header>

                <div className={styles.messagesArea}>
                    {messages.map((msg) => (
                        <div key={msg.id} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.botMessage}`}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
                                    {msg.role === 'bot' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <Bot size={20} style={{ flexShrink: 0, marginTop: '4px' }} />
                                            <button
                                                onClick={() => speakText(msg.content)}
                                                className={styles.messageSpeakButton}
                                                title="Sesli Dinle"
                                            >
                                                <Volume2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{msg.content}</div>
                                    {msg.role === 'user' && <User size={20} style={{ flexShrink: 0, marginTop: '4px' }} />}
                                </div>
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
                    <button type="button" className={`${styles.micButton} ${isListening ? styles.micActive : ''}`} onClick={toggleListening}>
                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder={isListening ? "Dinliyorum..." : "Soru sorun..."}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button type="submit" className={styles.sendButton} disabled={isLoading}><Send size={20} /></button>
                </form>
            </div>
        </div>
    )
}
