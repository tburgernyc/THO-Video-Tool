import React from 'react';
import { Character } from './types';

interface Props {
  characters: Character[];
}

export const CharactersTab: React.FC<Props> = ({ characters }) => {
  if (characters.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>No characters found. Analyze a script to extract characters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Cast of Characters</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map((char, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center mb-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                {char.name.charAt(0)}
              </div>
              <h3 className="ml-3 font-semibold text-lg text-gray-900">{char.name}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {char.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};