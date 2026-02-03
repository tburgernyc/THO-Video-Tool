import React, { useState } from 'react';
import { Episode } from '../types';
import { API_URL } from '../config';

interface Props {
  episode: Episode | null;
  setEpisode: (ep: Episode) => void;
  onAnalyzeComplete: () => void;
}

export const ScriptTab: React.FC<Props> = ({ episode, setEpisode, onAnalyzeComplete }) => {
  const [scriptText, setScriptText] = useState(episode?.script || '');
  const [title, setTitle] = useState(episode?.title || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!scriptText.trim()) return;
    setIsAnalyzing(true);
    try {
      // Create/Update Episode
      const res = await fetch(`${API_URL}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, script: scriptText }),
      });
      const data = await res.json();
      setEpisode(data.episode);

      // Analyze
      await fetch(`${API_URL}/episodes/${data.episode.id}/analyze`, {
        method: 'POST',
      });
      
      onAnalyzeComplete();
    } catch (e) {
      alert('Analysis failed. Check console.');
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-800">Script & Analysis</h2>
      
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Episode Title</label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., The Midnight Glitch"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Screenplay / Script</label>
          <textarea
            className="w-full h-96 p-3 border border-gray-300 rounded shadow-sm font-mono text-sm focus:ring-blue-500 focus:border-blue-500"
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="INT. LAB - DAY..."
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !scriptText}
          className={`flex items-center px-6 py-2 rounded-md text-white font-medium shadow-sm transition-colors
            ${isAnalyzing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
          `}
        >
          {isAnalyzing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing with Gemini...
            </>
          ) : (
            'Analyze Script'
          )}
        </button>
      </div>
    </div>
  );
};