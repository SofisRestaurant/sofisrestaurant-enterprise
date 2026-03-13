// src/pages/Gallery/Gallery.tsx

const GALLERY_TILE_IDS = [
  'gallery-tile-1',
  'gallery-tile-2',
  'gallery-tile-3',
  'gallery-tile-4',
  'gallery-tile-5',
  'gallery-tile-6',
  'gallery-tile-7',
  'gallery-tile-8',
  'gallery-tile-9',
  'gallery-tile-10',
  'gallery-tile-11',
  'gallery-tile-12',
] as const;

export default function Gallery() {
  return (
    <div className="py-12">
      <div className="container">
        <h1 className="mb-12 text-center text-4xl font-bold">Gallery</h1>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {GALLERY_TILE_IDS.map((tileId) => (
            <div key={tileId} className="aspect-square rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );
}