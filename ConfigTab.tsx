import React from 'react';
import { SystemStatus } from './types';

interface Props {
  status: SystemStatus | null;
}

export const ConfigTab: React.FC<Props> = ({ status }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">System Status</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-2">Backend Services</h3>
          <ul className="space-y-2">
            <li className="flex items-center justify-between">
              <span>Orchestrator API</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${status?.dbConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {status?.dbConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Generator Service</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${status?.generatorOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {status?.generatorOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </li>
          </ul>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-2">Hardware & Resources</h3>
          <ul className="space-y-2">
            <li className="flex items-center justify-between">
              <span>GPU Acceleration</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${status?.gpu ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {status?.gpu ? 'CUDA ACTIVE' : 'REMOTE FALLBACK'}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Disk Space</span>
              <span className="text-sm font-mono text-gray-600">
                {status?.diskSpace || 'Unknown'}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Pipeline Configuration</h3>
        <p className="text-sm text-gray-500 mb-4">
          Settings are loaded from <code>.env</code> files. Restart services to apply changes.
        </p>
        <div className="bg-gray-900 text-gray-300 p-4 rounded-md font-mono text-sm overflow-x-auto">
          <p>MODEL_ID: LTX-2 (Distilled)</p>
          <p>ASPECT_RATIO: 16:9 (Default)</p>
          <p>RESOLUTION: 768x512</p>
          <p>FPS: 24</p>
        </div>
      </div>
    </div>
  );
};