import Link from 'next/link';

const gameModes = [
  {
    id: 'jeopardy',
    title: 'Jeopardy',
    description: 'Play classic Jeopardy games from the J-Archive with original clues and categories.',
    icon: '📺',
    href: '/play/jeopardy',
    color: 'from-blue-600 to-blue-800',
  },
  {
    id: 'party',
    title: 'Party Mode',
    description: 'Mix of all question types: multiple choice, lists, grouping, ranking and more!',
    icon: '🎉',
    href: '/play/party',
    color: 'from-purple-600 to-pink-600',
  },
  {
    id: 'random',
    title: 'Random Questions',
    description: 'Get random questions by topic, difficulty, or type from our full question bank.',
    icon: '🎲',
    href: '/play/random',
    color: 'from-green-600 to-teal-600',
  },
  {
    id: 'database',
    title: 'Database',
    description: 'Browse all saved questions with their tags and type-specific metadata.',
    icon: '🗄️',
    href: '/database',
    color: 'from-cyan-600 to-blue-700',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            TriviaParty
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Challenge your knowledge with Jeopardy classics, party-style questions, and more.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto mb-16">
          {gameModes.map((mode) => (
            <Link key={mode.id} href={mode.href}>
              <div className={`bg-gradient-to-br ${mode.color} rounded-2xl p-8 cursor-pointer hover:scale-105 transition-transform duration-200 shadow-xl`}>
                <div className="text-5xl mb-4">{mode.icon}</div>
                <h2 className="text-2xl font-bold mb-2">{mode.title}</h2>
                <p className="text-white/80">{mode.description}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center">
          <h2 className="text-3xl font-bold mb-8 text-yellow-400">Question Types</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { icon: '🔤', label: 'Multiple Choice' },
              { icon: '✍️', label: 'Open Ended' },
              { icon: '📋', label: 'List' },
              { icon: '🗂️', label: 'Grouping' },
              { icon: '⚔️', label: 'This or That' },
              { icon: '📊', label: 'Ranking' },
              { icon: '🖼️', label: 'Media' },
              { icon: '🧩', label: 'Prompt' },
            ].map((type) => (
              <div key={type.label} className="bg-gray-800 rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">{type.icon}</div>
                <div className="text-sm text-gray-300">{type.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
