import { Outlet } from 'react-router-dom';
import { CollectionUpload } from '../../features/collection/CollectionUpload';
import { CollectionStats } from '../../features/collection/CollectionStats';
import { useAppState } from '../AppContext';
import { paths } from '../paths';
import { SegmentedNav } from '../SegmentedNav';

/** The Collection surface: upload on one segment, statistics on the other. */
export function CollectionRoute() {
  return (
    <div>
      <SegmentedNav segments={[
        { to: paths.collection, label: 'Upload', end: true },
        { to: paths.stats, label: 'Statistics' },
      ]} />
      <Outlet />
    </div>
  );
}

export function CollectionUploadRoute() {
  const { collectionCount, handleUploaded } = useAppState();
  return <CollectionUpload onUploaded={handleUploaded} collectionCount={collectionCount} />;
}

export function CollectionStatsRoute() {
  const { collectionCount } = useAppState();
  return <CollectionStats collectionCount={collectionCount} />;
}
