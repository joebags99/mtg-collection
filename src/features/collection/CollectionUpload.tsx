import { useState, type ChangeEvent } from 'react';
import { LoadingOverlay } from '../../components/ui';
import { apiPost, apiUpload } from '../../lib/api';
import { clearCollection, loadCollection, saveCollection } from '../../lib/storage';
import type { CollectionSummary } from '../../types/api';

export interface UploadedCollection {
  count: number;
  cards?: Record<string, number>;
}

interface Props {
  onUploaded: (data: UploadedCollection) => void;
  collectionCount: number;
}

export function CollectionUpload({ onUploaded, collectionCount }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CollectionSummary | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiUpload<CollectionSummary>('/api/collection/upload', file);
      setResult(data);
      saveCollection(data.cards);
      onUploaded(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiPost<CollectionSummary>('/api/collection/text', { text });
      setResult(data);
      saveCollection(data.cards);
      onUploaded(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleClear = () => {
    clearCollection();
    setResult(null);
    onUploaded({ count: 0 });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Upload Collection</h2>
      <p className="text-gray-400">
        Upload a CSV export from <strong>Archidekt</strong> or <strong>Moxfield</strong>,
        or paste a card list. Your collection is saved locally in your browser.
      </p>

      {collectionCount > 0 && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
          <p className="text-blue-300">
            Collection loaded: <strong>{collectionCount}</strong> unique cards
            {loadCollection() && <span className="text-blue-400/70 text-sm ml-2">(saved in browser)</span>}
          </p>
          <button onClick={handleClear} className="text-red-400 hover:text-red-300 text-sm">
            Clear Collection
          </button>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-lg">CSV File Upload</h3>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFile}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-500"
        />
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-lg">Paste Card List</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1 Sol Ring\n1 Rhystic Study\n1 Swords to Plowshares\n...'}
          rows={8}
          className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm font-mono focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleText}
          disabled={loading || !text.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
        >
          {loading ? 'Processing...' : 'Upload'}
        </button>
      </div>

      {loading && <LoadingOverlay message="Processing your collection..." submessage="Validating card names and updating your collection." />}

      {error && <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>}

      {result && (
        <div className="bg-green-900/50 border border-green-700 rounded p-4">
          <p className="text-green-300 font-medium">
            Loaded {result.count} unique cards into your collection.
          </p>
        </div>
      )}
    </div>
  );
}
