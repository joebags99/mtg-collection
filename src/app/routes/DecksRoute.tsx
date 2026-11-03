import { MyDecks } from '../../features/decks/MyDecks';
import { useAppState } from '../AppContext';

export function DecksRoute() {
  const { handleDecksChanged, decksReady } = useAppState();
  return <MyDecks onDecksChanged={handleDecksChanged} decksReady={decksReady} />;
}
