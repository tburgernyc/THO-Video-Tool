import { useState, useEffect } from 'react';
import { ConfigTab } from './ConfigTab';
import { ScriptTab } from './ScriptTab';
import { CharactersTab } from './CharactersTab';
import { ScenesTab } from './ScenesTab';
import { VideosTab } from './VideosTab';
import { ExportTab } from './ExportTab';
import { Episode, Character, Scene, SystemStatus } from './types';
import { API_URL } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('Config');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial Data Fetch
  useEffect(() => {
    const init = async () => {
      try {
        // Check Status
        try {
          const statusRes = await fetch(`${API_URL}/status`);
          const statusData = await statusRes.json();
          setStatus(statusData);
        } catch (e) {
          console.warn("Status check failed", e);
          setStatus({ gpu: false, generatorOnline: false, dbConnected: false });
        }

        // Check Episodes
        try {
          const epRes = await fetch(`${API_URL}/episodes/latest`);
          if (epRes.ok) {
            const epData = await epRes.json();
            setEpisode(epData.episode);
            setCharacters(epData.characters);
            setScenes(epData.scenes);
          }
        } catch (e) {
          console.warn("No episodes found or fetch failed", e);
        }
      } catch (err) {
        setError("Failed to initialize application.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Polling for status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        setStatus({ gpu: false, generatorOnline: false, dbConnected: false });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    if (!episode) return;
    try {
      const res = await fetch(`${API_URL}/episodes/${episode.id}`);
      const data = await res.json();
      setCharacters(data.characters);
      setScenes(data.scenes);
    } catch (e) {
      console.error(e);
    }
  };

  const tabs = [
    { id: 'Config', label: 'Config' },
    { id: 'Script', label: 'Script' },
    { id: 'Characters', label: 'Characters' },
    { id: 'Scenes', label: 'Scenes' },
    { id: 'Videos', label: 'Videos' },
    { id: 'Export', label: 'Export' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold">Connecting to Studio...</h2>
          <p className="text-slate-400 mt-2 text-sm">Waiting for Orchestrator & Generator</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-md shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <h1 className="text-xl font-bold tracking-tight">Human Override Studio <span className="text-blue-400">LTX2</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
           <div className="flex items-center gap-1">
             <span className={`w-2 h-2 rounded-full ${status?.dbConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
             API
           </div>
           <div className="flex items-center gap-1">
             <span className={`w-2 h-2 rounded-full ${status?.generatorOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
             GENERATOR
           </div>
           <div className="flex items-center gap-1">
             <span className={`w-2 h-2 rounded-full ${status?.gpu ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
             GPU
           </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shrink-0 px-4">
        <div className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px] p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
          
          {activeTab === 'Config' && <ConfigTab status={status} />}
          
          {activeTab === 'Script' && (
            <ScriptTab 
              episode={episode} 
              setEpisode={setEpisode} 
              onAnalyzeComplete={refreshData}
            />
          )}
          
          {activeTab === 'Characters' && <CharactersTab characters={characters} />}
          
          {activeTab === 'Scenes' && (
            <ScenesTab 
              scenes={scenes} 
              episodeId={episode?.id} 
              onPromptsGenerated={refreshData}
            />
          )}
          
          {activeTab === 'Videos' && (
            <VideosTab 
              episodeId={episode?.id} 
              scenes={scenes}
            />
          )}
          
          {activeTab === 'Export' && <ExportTab episode={episode} scenes={scenes} />}
        </div>
      </main>
    </div>
  );
}