import React from 'react';
import { CubeVariation } from '../../lib/cube/specifications';

interface CubeThumbnailProps {
  variation: CubeVariation;
  selected: boolean;
  onClick: () => void;
}

export const CubeThumbnail: React.FC<CubeThumbnailProps> = ({ variation, selected, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`w-[70px] h-[70px] rounded-md cursor-pointer border-2 overflow-hidden ${
        selected ? 'border-primary bg-primary' : 'border-transparent bg-ink-100'
      }`}
    >
      <img
        src={`/thumbnails/${variation.id}.png`}
        alt={variation.id}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
