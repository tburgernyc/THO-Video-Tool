import React, { useState } from 'react';
import { Scene } from './types';
import { API_URL } from './config';

interface Props {
  scenes: Scene[];
  episodeId?: number;
  onPromptsGenerated: () => void;
}

export const ScenesTab: React.FC<Props> = ({ scenes, episodeId, onPromptsGenerated }) => {
  const [loading, setLoading] = useState(false);

  const handleGeneratePrompts = async () => {
    if (!episodeId) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/episodes/${episodeId}/prompts`, {
        method: 'POST',
      });
      onPromptsGenerated();
    } catch (e) {
      alert('Failed to generate prompts');
    } finally {
      setLoading(false);
    }
  };

  if (scenes.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>No scenes found. Analyze a script first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">Scene Breakdown</h2>
        <button
          onClick={handleGeneratePrompts}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Generating Prompts...' : 'Generate AI Prompts'}
        </button>
      </div>

      <div className="space-y-4">
        {scenes.map((scene) => (
          <div key={scene.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-start mb-2">
              <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-1 rounded">
                SCENE {scene.id}
              </span>
              <div className="flex space-x-1">
                 {scene.characters.map((c, i) => (
                   <span key={i} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{c}</span>
                 ))}
              </div>
            </div>
            
            <p className="text-gray-800 mb-4 font-medium">{scene.description}</p>
            
            {scene.prompt ? (
              <div className="bg-white border border-gray-200 p-3 rounded text-sm">
                <div className="mb-2">
                  <span className="text-xs font-bold text-indigo-600 uppercase">Prompt</span>
                  <p className="text-gray-600 mt-1">{scene.prompt}</p>
                </div>
                {scene.negative_prompt && (
                  <div>
                    <span className="text-xs font-bold text-red-500 uppercase">Negative Prompt</span>
                    <p className="text-gray-500 mt-1">{scene.negative_prompt}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded text-sm text-yellow-700 italic">
                Prompts not generated yet.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};