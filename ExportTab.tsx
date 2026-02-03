import React from 'react';
import { Episode, Scene } from '../types';
import { ASSETS_URL } from '../config';

interface Props {
  episode: Episode | null;
  scenes: Scene[];
}

export const ExportTab: React.FC<Props> = ({ episode, scenes }) => {
  if (!episode) return <div className="p-8">No episode data.</div>;

  const handleDownload = () => {
    const data = {
      episode,
      scenes: scenes.map(s => ({
        ...s,
        video_url: s.latest_version ? `${ASSETS_URL}/${episode.id}/scene${s.id}_v${s.latest_version}.mp4` : null,
        local_path: s.latest_version ? `outputs/${episode.id}/scene${s.id}_v${s.latest_version}.mp4` : null
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `episode_${episode.id}_metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 text-center space-y-6">
      <div className="bg-green-50 text-green-800 p-6 rounded-lg border border-green-200">
        <h2 className="text-2xl font-bold mb-2">Ready to Assemble</h2>
        <p className="mb-6">
          You have {scenes.filter(s => s.latest_version && s.latest_version > 0).length} / {scenes.length} scenes generated.
        </p>
        <button
          onClick={handleDownload}
          className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform hover:scale-105"
        >
          Download Metadata JSON
        </button>
      </div>
      <p className="text-gray-500 text-sm">
        Video files are located in <code>/outputs/{episode.id}/</code> on the server.
      </p>
    </div>
  );
};