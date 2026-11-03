import { AmbientBackground } from '../components/ui';

export function AboutPage() {
  return (
    <div className="page-fade-in max-w-4xl mx-auto">
      <AmbientBackground />

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-warn mb-2">About MTG Commander Recommender</h1>
        <p className="text-ink-muted">Turn your card collection into your next Commander deck</p>
        <div className="h-px bg-gradient-to-r from-accent/50 to-transparent mt-4" />
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-warn mb-4">What is MTG Commander Recommender?</h2>
          <p className="text-ink leading-relaxed mb-4">
            MTG Commander Recommender is a free tool designed for Magic: The Gathering players who want to build
            Commander (EDH) decks using cards they already own.
          </p>
          <p className="text-ink leading-relaxed mb-4">
            Instead of browsing decklists and buying singles, MTG Commander Recommender analyzes your existing
            collection and recommends commanders that synergize with the cards you have. It's the perfect solution
            for players looking to:
          </p>
          <ul className="list-disc list-inside text-ink space-y-2 ml-4">
            <li>Build new decks without buying more cards</li>
            <li>Find unexpected commanders that match their collection</li>
            <li>Discover synergies they didn't know existed</li>
            <li>Make the most of their bulk collection</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-warn mb-4">How It Works</h2>

          <div className="space-y-6">
            <div className="panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-ink mb-2">Step 1: Export Your Collection</h3>
              <p className="text-ink">
                Export your card collection from popular tools like Archidekt, Moxfield, Manabox, or Dragon Shield.
                MTG Commander Recommender supports CSV exports and simple card lists.
              </p>
            </div>

            <div className="panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-ink mb-2">Step 2: Paste and Analyze</h3>
              <p className="text-ink">
                Paste your collection into MTG Commander Recommender. The algorithm compares your cards against
                the synergy data for over 1,500 commanders.
              </p>
            </div>

            <div className="panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-ink mb-2">Step 3: Get Recommendations</h3>
              <p className="text-ink">
                See which commanders you can build with your existing cards. View match percentages, estimated
                costs to complete, and detailed decklists.
              </p>
            </div>

            <div className="panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-ink mb-2">Step 4: Build Your Deck</h3>
              <p className="text-ink">
                Use the deck builder to customize your deck, adjust card counts, and export your final list
                to your favorite deck building platform.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-warn mb-4">Data Sources</h2>
          <p className="text-ink leading-relaxed">
            MTG Commander Recommender uses data from <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">EDHREC</a> for
            average decklists and synergy scores, and <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Scryfall</a> for
            card data and pricing information.
          </p>
        </section>

        <section className="panel rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-ink mb-2">Ready to Start?</h2>
          <p className="text-ink mb-4">
            Upload your collection and discover which commanders are waiting to be built!
          </p>
        </section>
      </div>
    </div>
  );
}
