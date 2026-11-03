import { useState, type ReactNode } from 'react';
import { AmbientBackground } from '../components/ui';
import type { Tab } from '../types/nav';

interface Guide {
  id: string;
  title: string;
  description: string;
  readTime: string;
  content: ReactNode;
}

const GUIDES: Guide[] = [
  {
    id: 'recommendations',
    title: 'Reading Your Commander Recommendations',
    description: 'Learn how to interpret the metrics and choose the best commander for your collection. Understand Match Percentage, synergy scores, and how to evaluate your options.',
    readTime: '5 min read',
    content: (
      <div className="space-y-6">
        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Understanding Match Percentage</h3>
          <p className="text-gray-300 mb-4">
            The match percentage shows how many cards from the average EDHREC decklist you already own.
            A higher percentage means you can build the deck with fewer purchases.
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li><span className="text-green-400">60%+</span> - Excellent match, very few cards needed</li>
            <li><span className="text-yellow-400">40-59%</span> - Good match, moderate investment needed</li>
            <li><span className="text-gray-400">Below 40%</span> - Lower match, more cards to acquire</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Cost to Complete</h3>
          <p className="text-gray-300 mb-4">
            This shows the estimated cost of cards you're missing based on current Scryfall prices.
            Use this to find budget-friendly options or identify expensive staples you might want to proxy.
          </p>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Filtering and Sorting</h3>
          <p className="text-gray-300 mb-4">
            Use the color filters to narrow down by color identity. Sort by match percentage to find
            your best options, or by price to find the cheapest decks to complete.
          </p>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Comparing Commanders</h3>
          <p className="text-gray-300">
            Can't decide between commanders? Use the compare feature to see them side by side.
            Select 2-3 commanders and compare their card overlap, unique cards, and completion costs.
          </p>
        </section>
      </div>
    ),
  },
  {
    id: 'exporting',
    title: 'Exporting Your Collection: Step-by-Step Guide',
    description: 'Detailed instructions for exporting your card collection from popular platforms like Archidekt, Moxfield, Manabox, and Dragon Shield Scanner.',
    readTime: '7 min read',
    content: (
      <div className="space-y-6">
        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">From Moxfield</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
            <li>Go to your collection page on Moxfield</li>
            <li>Click the "Export" button (download icon)</li>
            <li>Select "CSV" format</li>
            <li>Copy the contents or download the file</li>
            <li>Paste into MTG Commander Recommender</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">From Archidekt</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
            <li>Navigate to your collection</li>
            <li>Click "Export" in the menu</li>
            <li>Choose "Text" or "CSV" format</li>
            <li>Copy the exported list</li>
            <li>Paste into MTG Commander Recommender</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">From Manabox</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
            <li>Open Manabox app and go to your collection</li>
            <li>Tap the share/export button</li>
            <li>Select "Export as CSV" or "Plain text"</li>
            <li>Copy or share the exported list</li>
            <li>Paste into MTG Commander Recommender</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">From Dragon Shield Scanner</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
            <li>Open Dragon Shield app</li>
            <li>Go to your collection folder</li>
            <li>Tap "Export" or the share icon</li>
            <li>Choose CSV or text format</li>
            <li>Paste into MTG Commander Recommender</li>
          </ol>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Simple Card List</h3>
          <p className="text-gray-300 mb-4">
            You can also paste a simple list with one card per line. Quantities are optional:
          </p>
          <pre className="bg-gray-800 rounded p-4 text-sm text-gray-300 font-mono">
{`4 Lightning Bolt
2 Counterspell
Sol Ring
Arcane Signet`}
          </pre>
        </section>
      </div>
    ),
  },
  {
    id: 'deckbuilder',
    title: 'Using the Deck Builder',
    description: 'Learn how to customize your deck, adjust card counts, add lands, and export your finished decklist.',
    readTime: '4 min read',
    content: (
      <div className="space-y-6">
        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Starting a Build</h3>
          <p className="text-gray-300 mb-4">
            From the commander detail page, click "Open in Deck Builder" to start customizing your deck.
            The builder will pre-populate with the average decklist, highlighting cards you own.
          </p>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Adding and Removing Cards</h3>
          <p className="text-gray-300 mb-4">
            Click cards to toggle them in/out of your deck. The card counter at the top shows your
            current total. Commander decks need exactly 100 cards (including your commander).
          </p>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">View Modes</h3>
          <p className="text-gray-300 mb-4">
            Switch between Grid view (visual) and Stacks view (organized by type) to see your deck
            from different perspectives. Use the mana curve chart to balance your deck's costs.
          </p>
        </section>

        <section>
          <h3 className="text-xl font-bold text-amber-300 mb-3">Exporting Your Deck</h3>
          <p className="text-gray-300">
            When you're done, use the Export button to copy your decklist. You can import this into
            Moxfield, Archidekt, or any other deck building platform.
          </p>
        </section>
      </div>
    ),
  },
];

interface GuidesPageProps {
  onNavigate: (tab: Tab) => void;
}

export function GuidesPage({ onNavigate }: GuidesPageProps) {
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);
  const guide = selectedGuide ? GUIDES.find((g) => g.id === selectedGuide) : undefined;

  if (guide) {
    return (
      <div className="page-fade-in max-w-4xl mx-auto">
        <AmbientBackground />

        <button
          onClick={() => setSelectedGuide(null)}
          className="text-blue-400 hover:text-blue-300 mb-6 flex items-center gap-2"
        >
          <span>←</span> Back to Guides
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-200 mb-2">{guide.title}</h1>
          <p className="text-gray-500 text-sm">{guide.readTime}</p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          {guide.content}
        </div>
      </div>
    );
  }

  return (
    <div className="page-fade-in max-w-5xl mx-auto">
      <AmbientBackground />

      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-amber-200 mb-4">Commander Deck Building Guides</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Learn everything you need to know about building Commander decks,
          understanding your recommendations, and making the most of MTG Commander Recommender.
        </p>
      </div>

      {/* Guide Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {GUIDES.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGuide(g.id)}
            className="glass-panel rounded-xl p-6 text-left hover:bg-gray-800/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-white mb-3 group-hover:text-amber-200 transition-colors">
              {g.title}
            </h2>
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              {g.description}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{g.readTime}</span>
              <span className="text-blue-400 text-sm group-hover:translate-x-1 transition-transform">
                Read →
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Help Section */}
      <div className="glass-panel rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">Need More Help?</h2>
        <p className="text-gray-400">
          Have questions that aren't covered in our guides?{' '}
          <button onClick={() => onNavigate('about')} className="text-blue-400 hover:underline">
            Visit our About page
          </button>{' '}
          to learn more about MTG Commander Recommender.
        </p>
      </div>
    </div>
  );
}
