
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <ChatInterface />
    </main>
  );
}
