/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, Mic, Volume2, VolumeX, MicOff, Plus, MessageSquare, Trash2, X, Menu, FileText, ShoppingCart, Users, Package, FileText as FileTextIcon, LayoutDashboard, Loader2, CheckCircle2, Zap, BarChart3, Settings, Paperclip } from 'lucide-react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import styles from './ChatInterface.module.css'
import DynamicWidget from './DynamicComponents'
import SettingsPanel from './SettingsPanel'
import WriteConfirmation from './WriteConfirmation'
import ConnectionWizard from './ConnectionWizard'
import { AppSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from '@/lib/types/settings'


interface Message {
    id: string
    role: 'user' | 'bot'
    content: string
    timestamp: Date
    data?: any
    ui_component?: 'table' | 'chart' | 'stat' | 'trend' | 'forecast_chart' | 'segment_chart' | 'write_confirmation'
    metadata?: {
        agent?: string
        confidence?: number
        reasoning?: string
    }
}


interface ChatSession {
    id: string
    title: string
    messages: Message[]
    timestamp: number
}

const SESSIONS_KEY = 'erp_chat_sessions';
const SPEECH_KEY = 'erp_speech_enabled';
const MEMORY_SESSION_KEY = 'erp_memory_session_id';
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
    const [dashboardStats, setDashboardStats] = useState<any>(null)
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [reasoningSteps, setReasoningSteps] = useState<string[]>([])
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [isListening, setIsListening] = useState(false)
    const [isSpeechEnabled, setIsSpeechEnabled] = useState(true)

    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [isDashboardOpen, setIsDashboardOpen] = useState(true)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isConnectionWizardOpen, setIsConnectionWizardOpen] = useState(false)

    // Settings state with localStorage persistence
    const [appSettings, setAppSettings] = useState<AppSettings>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                try { return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }; } catch { /* ignore */ }
            }
        }
        return DEFAULT_SETTINGS;
    })

    // Memory session ID for entity tracking
    const [memorySessionId] = useState(() => {
        if (typeof window !== 'undefined') {
            let sid = localStorage.getItem(MEMORY_SESSION_KEY);
            if (!sid) {
                sid = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem(MEMORY_SESSION_KEY, sid);
            }
            return sid;
        }
        return `session-${Date.now()}`;
    })

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const recognitionRef = useRef<any>(null)

    // --- Auth & Persistence Logic ---
    useEffect(() => {
        // Check connection status on mount
        fetch('/api/connection')
            .then(res => res.json())
            .then(data => {
                if (!data.configured && !data.connected) {
                    setIsConnectionWizardOpen(true);
                }
            })
            .catch(() => {
                // If API fails, still show wizard for first-time setup
                if (!appSettings.connection?.configured) {
                    setIsConnectionWizardOpen(true);
                }
            });

        // Fetch Dashboard Stats
        fetch('/api/dashboard')
            .then(res => res.json())
            .then(data => setDashboardStats(data))
            .catch(err => console.error("Dashboard fetch error:", err));

        const savedSpeechPref = localStorage.getItem(SPEECH_KEY);
        if (savedSpeechPref !== null) {
            setIsSpeechEnabled(savedSpeechPref === 'true');
        }

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

    // Save settings & apply theme
    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
        document.documentElement.setAttribute('data-theme', appSettings.appearance.theme);
        // Sync dashboard visibility from settings
        setIsDashboardOpen(appSettings.dashboard.showLivePanel);
    }, [appSettings]);

    // Apply theme on mount
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', appSettings.appearance.theme);
    }, []);

    const handleSettingsChange = (newSettings: AppSettings) => {
        setAppSettings(newSettings);
    };

    const handleFileUpload = async (file: File) => {
        if (!appSettings.fileOperations.uploadEnabled) return;

        const maxSize = appSettings.fileOperations.maxFileSizeMB * 1024 * 1024;
        if (file.size > maxSize) {
            const errorMsg: Message = {
                id: Date.now().toString(),
                role: 'bot',
                content: `Dosya boyutu cok buyuk. Maksimum ${appSettings.fileOperations.maxFileSizeMB} MB yuklenebilir.`,
                timestamp: new Date()
            };
            updateCurrentSessionMessages([...messages, errorMsg]);
            return;
        }

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
            const errorMsg: Message = {
                id: Date.now().toString(),
                role: 'bot',
                content: 'Sadece Excel (.xlsx, .xls) ve CSV (.csv) dosyalari destekleniyor.',
                timestamp: new Date()
            };
            updateCurrentSessionMessages([...messages, errorMsg]);
            return;
        }

        // Show user message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: `📎 Dosya yuklendi: ${file.name}`,
            timestamp: new Date()
        };
        const updatedMessages = [...messages, userMsg];
        updateCurrentSessionMessages(updatedMessages);
        setIsLoading(true);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            if (!data.length) {
                updateCurrentSessionMessages([...updatedMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'bot',
                    content: 'Dosya bos veya okunamiyor.',
                    timestamp: new Date()
                }]);
                return;
            }

            // Build analysis
            const rowCount = data.length;
            const columns = Object.keys(data[0] as object);
            const preview = data.slice(0, 50);

            // Numeric column stats
            const numericStats: string[] = [];
            columns.forEach(col => {
                const values = data.map((r: any) => Number(r[col])).filter(v => !isNaN(v) && v !== 0);
                if (values.length > rowCount * 0.5) {
                    const sum = values.reduce((a, b) => a + b, 0);
                    const avg = sum / values.length;
                    const max = Math.max(...values);
                    const min = Math.min(...values);
                    numericStats.push(
                        `- **${col}**: Toplam: ${sum.toLocaleString('tr-TR')}, Ort: ${avg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}, Min: ${min.toLocaleString('tr-TR')}, Max: ${max.toLocaleString('tr-TR')}`
                    );
                }
            });

            const tableData = preview.map((row: any, i: number) => ({ sira: i + 1, ...row }));

            const analysisContent =
                `## 📊 Dosya Analizi: ${file.name}\n\n` +
                `| Metrik | Deger |\n|--------|-------|\n` +
                `| Satir Sayisi | **${rowCount}** |\n` +
                `| Sutun Sayisi | **${columns.length}** |\n` +
                `| Sutunlar | ${columns.join(', ')} |\n\n` +
                (numericStats.length > 0
                    ? `### Sayisal Istatistikler\n${numericStats.join('\n')}\n\n`
                    : '') +
                `Ilk ${Math.min(50, rowCount)} satir asagida gosteriliyor:`;

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: analysisContent,
                data: tableData,
                ui_component: 'table',
                timestamp: new Date()
            };

            updateCurrentSessionMessages([...updatedMessages, botMsg]);
        } catch (err: any) {
            console.error('File parse error:', err);
            updateCurrentSessionMessages([...updatedMessages, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: 'Dosya islenirken hata olustu: ' + err.message,
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleCardClick = (prompt: string) => {
        if (window.innerWidth < 1024) setIsDashboardOpen(false);
        handleSendMessage(null, prompt);
    };

    const handleBriefing = () => {
        const prompt = "Bana bugünün şirket özetini çıkar: Toplam ciro, yeni müşteriler, stoktaki kritik ürünler ve bekleyen siparişler hakkında kısa, net ve yönetici özeti formatında bilgi ver. Sayısal verileri vurgula.";
        handleCardClick(prompt);
    };

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
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text("ERP AI Asistanı - Sohbet Raporu", 14, 22);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 14, 30);
        let yPos = 40;
        messages.forEach((msg) => {
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
            const textLines = doc.splitTextToSize(msg.content, 180);
            doc.text(textLines, 14, yPos);
            yPos += (textLines.length * 5) + 5;
            if (msg.role === 'bot' && msg.ui_component === 'table' && msg.data && Array.isArray(msg.data)) {
                const headers = Object.keys(msg.data[0]);
                const body = msg.data.map((row: any) => headers.map(h => String(row[h])));
                autoTable(doc, {
                    startY: yPos,
                    head: [headers],
                    body: body,
                    theme: 'striped',
                    styles: { fontSize: 8, font: 'helvetica' },
                    headStyles: { fillColor: [41, 128, 185] }
                });
                yPos = (doc as any).lastAutoTable.finalY + 10;
            }
        });
        doc.save(`ERP_Rapor_${Date.now()}.pdf`);
    };

    // --- Write Confirmation Handlers ---
    const markActionResolved = (actionId: string, status: 'confirmed' | 'cancelled') => {
        setSessions(prev => prev.map(s => {
            if (s.id !== currentSessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.data?.pendingAction?.actionId === actionId) {
                        return {
                            ...m,
                            data: {
                                ...m.data,
                                pendingAction: { ...m.data.pendingAction, resolved: status }
                            }
                        };
                    }
                    return m;
                })
            };
        }));
    };

    const advanceToConfirmStep = (actionId: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== currentSessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => {
                    if (m.data?.pendingAction?.actionId === actionId) {
                        return {
                            ...m,
                            content: `## ${m.data.title}\n\nAsagidaki veriler veritabanina kaydedilecek. Onayliyor musunuz?`,
                            data: {
                                ...m.data,
                                pendingAction: { ...m.data.pendingAction, step: 'confirm' }
                            }
                        };
                    }
                    return m;
                })
            };
        }));
    };

    const handleWriteAction = async (actionId: string, decision: 'confirm' | 'cancel') => {
        const currentSession = sessions.find(s => s.id === currentSessionId);
        if (!currentSession) return;

        const targetMsg = currentSession.messages.find(
            (m: Message) => m.data?.pendingAction?.actionId === actionId
        );
        if (!targetMsg) return;

        const pendingAction = targetMsg.data.pendingAction;

        if (decision === 'cancel') {
            markActionResolved(actionId, 'cancelled');
            if (pendingAction.step === 'missing_check') {
                const botMsg: Message = {
                    id: Date.now().toString(),
                    role: 'bot',
                    content: 'Tamam, lütfen eksik bilgileri ekleyerek tekrar deneyin.\n\nEksik alanlar:\n' +
                        pendingAction.missingFields.map((f: string) => `- **${f}**`).join('\n'),
                    timestamp: new Date()
                };
                setSessions(prev => prev.map(s => {
                    if (s.id !== currentSessionId) return s;
                    return { ...s, messages: [...s.messages, botMsg] };
                }));
            } else {
                const botMsg: Message = {
                    id: Date.now().toString(),
                    role: 'bot',
                    content: 'Islem iptal edildi. Kayit veritabanina yazilmadi.',
                    timestamp: new Date()
                };
                setSessions(prev => prev.map(s => {
                    if (s.id !== currentSessionId) return s;
                    return { ...s, messages: [...s.messages, botMsg] };
                }));
            }
            return;
        }

        // decision === 'confirm'
        if (pendingAction.step === 'missing_check') {
            advanceToConfirmStep(actionId);
            return;
        }

        // step === 'confirm' -> actually save to Odoo
        setIsLoading(true);
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '__WRITE_CONFIRM__',
                    history: [],
                    userContext: { username: 'Misafir' },
                    sessionId: memorySessionId,
                    writeEnabled: appSettings.dataOperations.writeEnabled,
                    writeAction: pendingAction
                })
            });

            const data = await response.json();
            markActionResolved(actionId, 'confirmed');

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: data.content,
                data: data.data,
                ui_component: data.ui_component,
                timestamp: new Date()
            };
            setSessions(prev => prev.map(s => {
                if (s.id !== currentSessionId) return s;
                return { ...s, messages: [...s.messages, botMsg] };
            }));
        } catch (err: any) {
            console.error('Write Confirm Error:', err);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: 'Kayıt sırasında hata oluştu. Lütfen tekrar deneyin.',
                timestamp: new Date()
            };
            setSessions(prev => prev.map(s => {
                if (s.id !== currentSessionId) return s;
                return { ...s, messages: [...s.messages, errorMsg] };
            }));
        } finally {
            setIsLoading(false);
        }
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
        setReasoningSteps([])
        setCurrentStepIndex(0)

        // Simulate Reasoning Steps
        const steps = [
            "Istek analiz ediliyor...",
            "Veritabanina baglaniliyor...",
            "Ilgili tablolar taraniyor...",
            "Veriler gorsellestiriliyor..."
        ];

        let stepInterval: any;
        let stepCount = 0;

        stepInterval = setInterval(() => {
            if (stepCount < steps.length) {
                setReasoningSteps(prev => {
                    const next = [...prev];
                    if (stepCount > 0) next[stepCount - 1] = next[stepCount - 1] + " done";
                    next.push(steps[stepCount]);
                    return next;
                });
                setCurrentStepIndex(stepCount);
                stepCount++;
            } else {
                clearInterval(stepInterval);
            }
        }, 800);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    history: messages,
                    userContext: {
                        username: 'Misafir'
                    },
                    sessionId: memorySessionId,
                    writeEnabled: appSettings.dataOperations.writeEnabled
                })
            });

            const data = await response.json();
            if (isSpeechEnabled) speakText(data.content);

            clearInterval(stepInterval);
            setReasoningSteps([]);
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: data.content,
                data: data.data,
                ui_component: data.ui_component,
                metadata: data.metadata,
                timestamp: new Date()
            }


            updateCurrentSessionMessages([...updatedMessages, botMessage]);
        } catch (err: any) {
            clearInterval(stepInterval);
            setReasoningSteps([]);
            console.error('Chat API Error:', err)
            updateCurrentSessionMessages([...updatedMessages, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: 'Iletisim hatasi olustu.',
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
                    <div className={styles.sidebarTitle}>Gecmis Sohbetler</div>
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            className={`${styles.sessionItem} ${currentSessionId === session.id ? styles.activeSession : ''}`}
                            onClick={() => setCurrentSessionId(session.id)}
                        >
                            <MessageSquare size={15} />
                            <span className={styles.sessionTitle}>{session.title}</span>
                            <button onClick={(e) => deleteSession(e, session.id)} className={styles.deleteButton}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* TOOLS SECTION */}
                <div className={styles.sidebarTools}>
                    <div className={styles.sidebarToolsTitle}>Araclar</div>

                    <Link href="/analytics" className={styles.toolItem}>
                        <div className={styles.toolIcon} style={{ background: 'rgba(91, 124, 250, 0.08)', color: '#5b7cfa' }}>
                            <BarChart3 size={16} />
                        </div>
                        <div className={styles.toolLabel}>
                            <span className={styles.toolName}>ERPO Analitik</span>
                            <span className={styles.toolDesc}>AI raporlama paneli</span>
                        </div>
                    </Link>

                    <button
                        className={`${styles.toolItem} ${isDashboardOpen ? styles.toolItemActive : ''}`}
                        onClick={() => setIsDashboardOpen(!isDashboardOpen)}
                    >
                        <div className={styles.toolIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                            <LayoutDashboard size={16} />
                        </div>
                        <div className={styles.toolLabel}>
                            <span className={styles.toolName}>Canli Panel</span>
                            <span className={styles.toolDesc}>ERP durum kartlari</span>
                        </div>
                    </button>

                    <button className={styles.toolItem} onClick={generateReport}>
                        <div className={styles.toolIcon} style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                            <FileText size={16} />
                        </div>
                        <div className={styles.toolLabel}>
                            <span className={styles.toolName}>PDF Rapor</span>
                            <span className={styles.toolDesc}>Sohbeti indir</span>
                        </div>
                    </button>

                    <button
                        className={styles.toolItem}
                        onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                    >
                        <div className={styles.toolIcon} style={{
                            background: isSpeechEnabled ? 'rgba(77, 171, 247, 0.1)' : 'rgba(93, 97, 128, 0.1)',
                            color: isSpeechEnabled ? '#4dabf7' : '#5d6180'
                        }}>
                            {isSpeechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </div>
                        <div className={styles.toolLabel}>
                            <span className={styles.toolName}>Sesli Okuma</span>
                            <span className={styles.toolDesc}>{isSpeechEnabled ? 'Acik' : 'Kapali'}</span>
                        </div>
                    </button>

                    <button
                        className={styles.toolItem}
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        <div className={styles.toolIcon} style={{ background: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8' }}>
                            <Settings size={16} />
                        </div>
                        <div className={styles.toolLabel}>
                            <span className={styles.toolName}>Ayarlar</span>
                            <span className={styles.toolDesc}>Tema, izinler, dosya</span>
                        </div>
                    </button>
                </div>

            </aside>

            {/* --- MAIN --- */}
            <div className={styles.container}>
                <header className={styles.header}>
                    {!isSidebarOpen && (
                        <button onClick={() => setIsSidebarOpen(true)} className={styles.menuButton}>
                            <Menu size={22} />
                        </button>
                    )}

                    <div className={styles.headerCenter}>
                        <Bot size={20} color="var(--primary)" />
                        <h2 className={styles.title}>ERP AI Asistan</h2>
                    </div>
                </header>

                <div className={styles.messagesArea}>
                    {messages.map((msg) => (
                        <div key={msg.id} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.botMessage}`}>
                            <div className={styles.messageContent}>
                                <div className={styles.messageRow}>
                                    {msg.role === 'bot' && (
                                        <div className={styles.botIcon}>
                                            <Bot size={18} />
                                            <button onClick={() => speakText(msg.content)} className={styles.messageSpeakButton} title="Sesli Dinle">
                                                <Volume2 size={13} />
                                            </button>
                                        </div>
                                    )}
                                    <div className={styles.messageText}>{msg.content}</div>
                                    {msg.role === 'user' && <User size={18} className={styles.userIcon} />}
                                </div>
                                {msg.role === 'bot' && msg.data && (
                                    <div className={styles.messageDataArea}>
                                        {msg.ui_component === 'write_confirmation' ? (
                                            <WriteConfirmation
                                                data={msg.data}
                                                onAction={handleWriteAction}
                                                disabled={isLoading || !!msg.data?.pendingAction?.resolved}
                                            />
                                        ) : (
                                            <DynamicWidget type={msg.ui_component || 'table'} data={msg.data} />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className={`${styles.message} ${styles.botMessage}`}>
                            <div className={styles.reasoningContainer}>
                                <div className={styles.reasoningHeader}>
                                    <Sparkles size={16} className={styles.sparkleIcon} />
                                    <span>Yapay Zeka Dusunuyor...</span>
                                </div>
                                <div className={styles.stepsList}>
                                    {reasoningSteps.map((step, index) => (
                                        <div key={index} className={`${styles.stepItem} ${index === currentStepIndex ? styles.stepActive : styles.stepDone}`}>
                                            {index < currentStepIndex ? <CheckCircle2 size={14} color="#10b981" /> : <Loader2 size={14} className={styles.stepLoader} />}
                                            <span>{typeof step === 'string' ? step.replace(" done", "") : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <form className={styles.inputArea} onSubmit={handleSendMessage}>
                    <button type="button" className={`${styles.micButton} ${isListening ? styles.micActive : ''}`} onClick={toggleListening}>
                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    {appSettings.fileOperations.uploadEnabled && (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                    e.target.value = '';
                                }}
                            />
                            <button
                                type="button"
                                className={styles.micButton}
                                onClick={() => fileInputRef.current?.click()}
                                title="Dosya Yukle (Excel/CSV)"
                            >
                                <Paperclip size={20} />
                            </button>
                        </>
                    )}
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

            {/* --- RIGHT SIDEBAR (DASHBOARD) --- */}
            <aside className={`${styles.rightSidebar} ${!isDashboardOpen ? styles.rightSidebarClosed : ''}`}>
                <div className={styles.sidebarHeader}>
                    <span className={styles.sidebarTitle}>Canli Durum</span>
                    <button onClick={() => setIsDashboardOpen(false)} className={styles.closeSidebarButton}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.dashboardList}>
                    {dashboardStats ? (
                        <>
                            {appSettings.dashboard.showBriefingCard && (
                                <div className={styles.briefingCard} onClick={handleBriefing}>
                                    <div className={styles.briefingHeader}>
                                        <div className={styles.briefingIcon}>
                                            <Zap size={18} fill="white" />
                                        </div>
                                        <span className={styles.briefingTitle}>Gunluk Ozet Al</span>
                                    </div>
                                    <div className={styles.briefingDesc}>Yapay zeka ile anlik durum analizi</div>
                                </div>
                            )}

                            <div className={styles.dashboardCardSmall} onClick={() => handleCardClick("Tum musterileri listele")}>
                                <div className={styles.cardHeaderSmall}>
                                    <div className={styles.cardIconSmall}>
                                        <Users size={16} />
                                    </div>
                                    <span className={styles.cardLabelSmall}>Musteriler</span>
                                </div>
                                <div className={styles.cardValueSmall}>{dashboardStats.customers || 0}</div>
                            </div>

                            <div className={styles.dashboardCardSmall} onClick={() => handleCardClick("Satis siparislerini listele")}>
                                <div className={styles.cardHeaderSmall}>
                                    <div className={styles.cardIconSmall} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                        <ShoppingCart size={16} />
                                    </div>
                                    <span className={styles.cardLabelSmall}>Siparisler</span>
                                </div>
                                <div className={styles.cardValueSmall}>{dashboardStats.orders || 0}</div>
                            </div>

                            <div className={styles.dashboardCardSmall} onClick={() => handleCardClick("Tum urunleri listele")}>
                                <div className={styles.cardHeaderSmall}>
                                    <div className={styles.cardIconSmall} style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                                        <Package size={16} />
                                    </div>
                                    <span className={styles.cardLabelSmall}>Urunler</span>
                                </div>
                                <div className={styles.cardValueSmall}>{dashboardStats.products || 0}</div>
                            </div>

                            <div className={styles.dashboardCardSmall} onClick={() => handleCardClick("Taslak teklifleri listele")}>
                                <div className={styles.cardHeaderSmall}>
                                    <div className={styles.cardIconSmall} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                                        <FileTextIcon size={16} />
                                    </div>
                                    <span className={styles.cardLabelSmall}>Teklifler</span>
                                </div>
                                <div className={styles.cardValueSmall}>{dashboardStats.quotations || 0}</div>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '16px', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '0.85rem' }}>Yukleniyor...</div>
                    )}
                </div>
            </aside>

            {/* --- SETTINGS PANEL --- */}
            {isSettingsOpen && (
                <SettingsPanel
                    settings={appSettings}
                    onSettingsChange={handleSettingsChange}
                    onClose={() => setIsSettingsOpen(false)}
                    onOpenConnectionWizard={() => setIsConnectionWizardOpen(true)}
                />
            )}

            {/* --- CONNECTION WIZARD --- */}
            {isConnectionWizardOpen && (
                <ConnectionWizard
                    onComplete={() => {
                        setIsConnectionWizardOpen(false);
                        setAppSettings(prev => ({
                            ...prev,
                            connection: { ...prev.connection, configured: true }
                        }));
                        // Refresh dashboard stats after new connection
                        fetch('/api/dashboard')
                            .then(res => res.json())
                            .then(data => setDashboardStats(data))
                            .catch(() => {});
                    }}
                    onClose={() => setIsConnectionWizardOpen(false)}
                    showClose={appSettings.connection?.configured === true}
                />
            )}
        </div>
    )
}
