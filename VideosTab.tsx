import React, { useState, useEffect } from 'react';
import { Scene, Job } from './types';
import { API_URL, ASSETS_URL } from './config';

interface Props {
  scenes: Scene[];
  episodeId?: number;
}

export const VideosTab: React.FC<Props> = ({ scenes, episodeId }) => {
  const [jobs, setJobs] = useState<Record<number, Job>>({});
  const [files, setFiles] = useState<Record<number, File>>({});

  // Poll jobs
  useEffect(() => {
    const interval = setInterval(async () => {
      // Get all values properly typed
      const allJobs = Object.values(jobs) as Job[];
      const activeJobIds = allJobs
        .filter(j => ['queued', 'running'].includes(j.status))
        .map(j => j.id);

      if (activeJobIds.length === 0) return;

      const fetchJob = async (jid: string) => {
        try {
          const res = await fetch(`${API_URL}/jobs/${jid}`);
          return await res.json();
        } catch (e) {
          console.error("Poll failed", e);
          return null;
        }
      };

      const results = await Promise.all(activeJobIds.map(fetchJob));
      const successfulJobs = results.filter(job => job !== null) as Job[];

      if (successfulJobs.length > 0) {
        setJobs(prev => {
          const next = { ...prev };
          successfulJobs.forEach(job => {
            next[job.sceneId] = job;
          });
          return next;
        });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleFileChange = (sceneId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles({ ...files, [sceneId]: e.target.files[0] });
    }
  };

  const handleGenerate = async (scene: Scene) => {
    if (!episodeId) return;

    // Convert file to base64 if exists
    let imageBase64: string | undefined = undefined;
    if (files[scene.id]) {
      const reader = new FileReader();
      imageBase64 = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(files[scene.id]);
      });
    }

    try {
      const res = await fetch(`${API_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          sceneId: scene.id,
          prompt: scene.prompt,
          negativePrompt: scene.negative_prompt,
          imageBase64
        })
      });
      const data = await res.json();
      setJobs(prev => ({ ...prev, [scene.id]: data }));
    } catch (e) {
      alert("Failed to start job");
    }
  };

  if (!scenes.length) return <div className="p-8 text-center text-gray-500">No scenes available.</div>;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Video Generation</h2>
      
      <div className="grid grid-cols-1 gap-6">
        {scenes.map(scene => {
          const job = jobs[scene.id];
          const hasVideo = !job && scene.latest_version && scene.latest_version > 0;
          
          // Logic for video URL:
          // 1. If we have a persistent video in DB (hasVideo), use standard schema.
          // 2. If we have a newly completed job, use its output_path (which already contains episodeId/filename).
          const videoUrl = hasVideo 
            ? `${ASSETS_URL}/${episodeId}/scene${scene.id}_v${scene.latest_version}.mp4` 
            : (job?.output_path ? `${ASSETS_URL}/${job.output_path}` : null);

          return (
            <div key={scene.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">
              {/* Controls Section */}
              <div className="p-5 flex-1 space-y-4">
                <div className="flex justify-between">
                   <h3 className="font-bold text-lg text-gray-800">Scene {scene.id}</h3>
                   {job?.status && (
                     <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                       job.status === 'completed' ? 'bg-green-100 text-green-700' :
                       job.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                     }`}>
                       {job.status}
                     </span>
                   )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{scene.description}</p>
                
                <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded truncate">
                  {scene.prompt || "No prompt generated"}
                </div>

                <div className="flex items-end gap-3 pt-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Initial Image (Optional)</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileChange(scene.id, e)}
                      className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <button 
                    onClick={() => handleGenerate(scene)}
                    disabled={!scene.prompt || (job && ['running','queued'].includes(job.status))}
                    className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {job && ['running','queued'].includes(job.status) ? 'Processing...' : (videoUrl ? 'Regenerate' : 'Generate')}
                  </button>
                </div>
                {job?.error && (
                   <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 mt-2">
                     Error: {job.error}
                   </div>
                )}
              </div>

              {/* Video Preview Section */}
              <div className="bg-black w-full md:w-80 h-48 md:h-auto flex items-center justify-center shrink-0">
                {videoUrl ? (
                  <video src={videoUrl} controls className="w-full h-full object-contain" />
                ) : (
                  <div className="text-gray-500 text-sm">No Video Generated</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};