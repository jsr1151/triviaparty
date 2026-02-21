import type { JeopardyClueData } from '@/types/jeopardy';

interface TagSeed {
  label: string;
  keywords: string[];
}

interface MainTopicSeed {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
  subtags: TagSeed[];
}

export interface QuestionTagOption {
  id: string;
  label: string;
}

export interface QuestionTagGroup {
  id: string;
  label: string;
  emoji: string;
  options: QuestionTagOption[];
}

interface FlatTagRule {
  id: string;
  mainId: string;
  mainLabel: string;
  mainEmoji: string;
  subLabel: string;
  keywords: string[];
}

const TAG_SEEDS: MainTopicSeed[] = [
  {
    id: 'science',
    label: 'Science',
    emoji: '🔬',
    keywords: ['science', 'scientific', 'research', 'laboratory', 'experiment'],
    subtags: [
      { label: 'Chemistry', keywords: ['atom', 'chemical', 'molecule', 'acid', 'base', 'periodic table'] },
      { label: 'Physics', keywords: ['force', 'motion', 'velocity', 'quantum', 'relativity', 'energy'] },
      { label: 'Mathematics', keywords: ['math', 'algebra', 'geometry', 'calculus', 'equation', 'theorem', 'prime'] },
      { label: 'Astronomy', keywords: ['planet', 'star', 'galaxy', 'solar system', 'moon', 'nebula', 'cosmos'] },
      { label: 'Anatomy', keywords: ['organ', 'skeleton', 'muscle', 'artery', 'heart', 'brain', 'anatomy'] },
      { label: 'Biology', keywords: ['biology', 'cell', 'genetic', 'evolution', 'species', 'dna'] },
      { label: 'Animal Kingdom', keywords: ['animal', 'mammal', 'bird', 'reptile', 'fish', 'wildlife', 'zoo'] },
      { label: 'Nature', keywords: ['forest', 'river', 'ecosystem', 'climate', 'weather', 'natural world'] },
      { label: 'Psychology', keywords: ['psychology', 'behavior', 'cognitive', 'mind', 'personality', 'emotion'] },
      { label: 'Technology', keywords: ['computer', 'software', 'internet', 'device', 'ai', 'algorithm', 'tech'] },
      { label: 'Academia', keywords: ['university', 'college', 'professor', 'campus', 'scholar', 'academic'] },
    ],
  },
  {
    id: 'arts',
    label: 'Arts',
    emoji: '🎨',
    keywords: ['art', 'artist', 'creative', 'aesthetic'],
    subtags: [
      { label: 'Visual Arts', keywords: ['painting', 'sculpture', 'gallery', 'museum', 'canvas', 'portrait'] },
      { label: 'Literature', keywords: ['novel', 'poem', 'author', 'book', 'literature', 'prose'] },
      { label: 'Comics', keywords: ['comic', 'graphic novel', 'superhero', 'manga panel'] },
      { label: 'English', keywords: ['grammar', 'english language', 'vocabulary', 'spelling'] },
      { label: 'Foreign Language', keywords: ['spanish', 'french', 'german', 'latin', 'translation', 'language'] },
      { label: 'Art Process', keywords: ['draw', 'sketch', 'design', 'composition', 'brushstroke'] },
      { label: 'Beauty/Fashion', keywords: ['fashion', 'style', 'runway', 'couture', 'beauty', 'cosmetic'] },
      { label: 'Culinary', keywords: ['cook', 'recipe', 'kitchen', 'chef', 'cuisine', 'ingredient'] },
      { label: 'Instruments', keywords: ['guitar', 'piano', 'violin', 'trumpet', 'drum', 'instrument'] },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    emoji: '🎬',
    keywords: ['entertainment', 'pop culture', 'showbiz'],
    subtags: [
      { label: 'Movies', keywords: ['film', 'movie', 'box office', 'director', 'cinema'] },
      { label: 'Television', keywords: ['tv', 'television', 'series', 'sitcom', 'episode', 'network'] },
      { label: 'Music', keywords: ['song', 'album', 'band', 'singer', 'chart', 'lyrics'] },
      { label: 'Cartoons', keywords: ['cartoon', 'animated', 'animation'] },
      { label: 'Golden Age', keywords: ['classic hollywood', 'golden age', 'silver screen'] },
      { label: 'Anime', keywords: ['anime', 'manga', 'otaku'] },
      { label: 'Social Media', keywords: ['instagram', 'tiktok', 'youtube', 'tweet', 'viral', 'influencer'] },
      { label: 'Celebrities', keywords: ['celebrity', 'actor', 'actress', 'star', 'famous person'] },
      { label: "Children's Entertainment", keywords: ['kids show', 'children', 'sesame', 'nickelodeon', 'disney channel'] },
    ],
  },
  {
    id: 'sports',
    label: 'Sports',
    emoji: '🏅',
    keywords: ['sport', 'athlete', 'competition', 'tournament', 'league'],
    subtags: [
      { label: 'Board Games', keywords: ['chess', 'checkers', 'monopoly', 'board game'] },
      { label: 'Card Games', keywords: ['poker', 'bridge', 'blackjack', 'card game'] },
      { label: 'Recreation', keywords: ['hobby', 'recreation', 'pastime'] },
      { label: 'Olympics', keywords: ['olympic', 'medal', 'summer games', 'winter games'] },
      { label: 'Field Sports', keywords: ['soccer', 'football', 'baseball', 'rugby', 'cricket', 'lacrosse'] },
      { label: 'Court/Arena Sports', keywords: ['basketball', 'tennis', 'volleyball', 'hockey', 'arena'] },
      { label: 'Motor Sports', keywords: ['formula 1', 'nascar', 'motogp', 'rally', 'motor sport'] },
      { label: 'Water/Ice Sports', keywords: ['swimming', 'diving', 'surfing', 'skiing', 'ice skating', 'snowboard'] },
      { label: 'General Sports', keywords: ['sports trivia', 'team record', 'athletics'] },
      { label: 'Sports Franchises', keywords: ['franchise', 'club', 'team name', 'mascot'] },
      { label: 'Fitness', keywords: ['fitness', 'workout', 'exercise', 'training'] },
      { label: 'World Records', keywords: ['world record', 'guinness', 'fastest', 'longest'] },
    ],
  },
  {
    id: 'history',
    label: 'History',
    emoji: '📜',
    keywords: ['history', 'historical', 'era', 'century', 'civilization'],
    subtags: [
      { label: 'U.S. History', keywords: ['american history', 'colonies', 'civil war', 'founding fathers'] },
      { label: 'Presidents/VPs', keywords: ['president', 'vice president', 'white house'] },
      { label: 'NA/SA History', keywords: ['canada history', 'latin america', 'south america history'] },
      { label: 'European History', keywords: ['europe history', 'british empire', 'france history', 'romanov'] },
      { label: 'Asian History', keywords: ['china history', 'japan history', 'india history', 'dynasty'] },
      { label: 'Global History', keywords: ['world history', 'international history'] },
      { label: 'Warzone', keywords: ['war', 'battle', 'military', 'conflict', 'siege'] },
      { label: 'Ancient History', keywords: ['ancient', 'pharaoh', 'mesopotamia', 'rome', 'greece'] },
      { label: 'Modern History', keywords: ['20th century', '21st century', 'modern era'] },
      { label: 'Government', keywords: ['government', 'congress', 'parliament', 'constitution', 'policy'] },
      { label: 'World Religion', keywords: ['religion', 'church', 'temple', 'islam', 'christianity', 'buddhism'] },
      { label: 'Business', keywords: ['company', 'corporation', 'market', 'industry', 'economy'] },
      { label: 'Laws', keywords: ['law', 'legal', 'court', 'justice', 'supreme court'] },
    ],
  },
  {
    id: 'geography',
    label: 'Geography',
    emoji: '🌍',
    keywords: ['geography', 'map', 'country', 'capital', 'region', 'continent'],
    subtags: [
      { label: 'NA/SA Geo', keywords: ['north america', 'south america', 'andes', 'caribbean'] },
      { label: 'European Geo', keywords: ['europe', 'balkan', 'scandinavia', 'alps'] },
      { label: 'African Geo', keywords: ['africa', 'sahara', 'nile', 'sub-saharan'] },
      { label: 'Asian Geo', keywords: ['asia', 'himalaya', 'southeast asia', 'middle east'] },
      { label: 'Oceanic Geo', keywords: ['oceania', 'australia', 'pacific islands', 'new zealand'] },
      { label: 'U.S. Geo', keywords: ['u.s. state', 'united states', 'america geography', 'appalachian'] },
      { label: 'Global Geo', keywords: ['world map', 'global geography', 'international borders'] },
      { label: 'Flags', keywords: ['flag', 'tricolor', 'emblem', 'coat of arms'] },
      { label: 'Transportation', keywords: ['railway', 'airport', 'subway', 'shipping', 'transport'] },
    ],
  },
  {
    id: 'mix-up',
    label: 'Mix-Up',
    emoji: '🌀',
    keywords: ['misc', 'mixed bag', 'oddball'],
    subtags: [
      { label: 'Game Shows', keywords: ['game show', 'host', 'wheel of fortune', 'price is right'] },
      { label: 'Holidays', keywords: ['holiday', 'christmas', 'halloween', 'easter', 'thanksgiving'] },
      { label: 'Ancient Sports', keywords: ['gladiator', 'chariot', 'ancient olympics'] },
      { label: 'Medical Care', keywords: ['medicine', 'doctor', 'hospital', 'treatment'] },
      { label: 'Amusement Parks', keywords: ['theme park', 'roller coaster', 'disneyland', 'ride'] },
      { label: 'Theater', keywords: ['theater', 'broadway', 'play', 'stage', 'drama'] },
      { label: 'Orchestral', keywords: ['orchestra', 'symphony', 'conductor', 'concerto'] },
      { label: 'Sensation/Perception', keywords: ['sense', 'perception', 'vision', 'hearing'] },
      { label: 'Art History', keywords: ['renaissance', 'baroque', 'impressionism', 'art movement'] },
      { label: 'Philosophy', keywords: ['philosophy', 'ethics', 'logic', 'stoic', 'existential'] },
      { label: 'Architecture', keywords: ['architecture', 'building', 'skyscraper', 'cathedral', 'arch'] },
      { label: 'Inventions', keywords: ['inventor', 'invention', 'patent', 'prototype'] },
      { label: 'Anthropology/Culture', keywords: ['culture', 'anthropology', 'custom', 'folklore'] },
      { label: 'Earth Science', keywords: ['geology', 'volcano', 'earthquake', 'mineral', 'tectonic'] },
      { label: 'Mythology', keywords: ['myth', 'mythology', 'god', 'goddess', 'legend'] },
    ],
  },
  {
    id: 'video-games',
    label: 'Video Games',
    emoji: '🎮',
    keywords: ['video game', 'gaming', 'gamer', 'arcade'],
    subtags: [
      { label: 'Consoles', keywords: ['console', 'playstation', 'xbox', 'nintendo', 'sega'] },
      { label: 'Retro Games', keywords: ['retro', '8-bit', '16-bit', 'arcade classic'] },
      { label: 'Adventure Games', keywords: ['adventure game', 'platformer', 'quest game'] },
      { label: 'Racing Games', keywords: ['racing game', 'kart', 'driving sim'] },
      { label: 'RPGs & Open World', keywords: ['rpg', 'open world', 'side quest', 'level up'] },
      { label: 'Horror Games', keywords: ['survival horror', 'jump scare', 'horror game'] },
      { label: 'Simulation Games', keywords: ['simulation game', 'simulator', 'sandbox'] },
      { label: 'General Games', keywords: ['video game character', 'boss battle', 'speedrun'] },
      { label: 'Fighting Games', keywords: ['fighting game', 'combo', 'street fighter', 'tekken'] },
      { label: 'Pokemon', keywords: ['pokemon', 'pikachu', 'pokeball', 'gym leader'] },
      { label: 'Party Games', keywords: ['party game', 'minigame'] },
      { label: 'As Seen on TV', keywords: ['tv adaptation', 'licensed game'] },
      { label: 'Sports Games', keywords: ['fifa', 'madden', 'nba 2k', 'sports game'] },
      { label: 'Music/Rhythm Games', keywords: ['rhythm game', 'guitar hero', 'dance game'] },
      { label: 'Puzzle Games', keywords: ['puzzle game', 'tetris', 'match-3'] },
      { label: 'Shooter Games', keywords: ['fps', 'shooter', 'battle royale', 'sniper'] },
      { label: 'Mobile Games', keywords: ['mobile game', 'app game', 'ios game', 'android game'] },
    ],
  },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normaliseText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const FLAT_RULES: FlatTagRule[] = TAG_SEEDS.flatMap(group =>
  group.subtags.map(sub => ({
    id: `${group.id}/${slugify(sub.label)}`,
    mainId: group.id,
    mainLabel: group.label,
    mainEmoji: group.emoji,
    subLabel: sub.label,
    keywords: [...group.keywords, ...sub.keywords].map(normaliseText),
  })),
);

const RULE_BY_ID = new Map(FLAT_RULES.map(rule => [rule.id, rule]));

export const QUESTION_TAG_GROUPS: QuestionTagGroup[] = TAG_SEEDS.map(group => ({
  id: group.id,
  label: group.label,
  emoji: group.emoji,
  options: group.subtags.map(sub => ({
    id: `${group.id}/${slugify(sub.label)}`,
    label: sub.label,
  })),
}));

export function getQuestionTagGroups(): QuestionTagGroup[] {
  return QUESTION_TAG_GROUPS;
}

export function formatQuestionTagLabel(tag: string): string {
  const rule = RULE_BY_ID.get(tag);
  if (!rule) return tag;
  return `${rule.mainEmoji} ${rule.mainLabel} · ${rule.subLabel}`;
}

export function isKnownQuestionTag(tag: string): boolean {
  return RULE_BY_ID.has(tag);
}

export function guessQuestionTagsFromText(input: string, maxTags = 8): string[] {
  if (!input.trim()) return [];
  const text = normaliseText(input);

  const scored = FLAT_RULES
    .map(rule => {
      const hits = rule.keywords.reduce((sum, keyword) => {
        if (!keyword) return sum;
        return text.includes(keyword) ? sum + 1 : sum;
      }, 0);
      return { id: rule.id, hits };
    })
    .filter(item => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, maxTags)
    .map(item => item.id);

  return Array.from(new Set(scored));
}

export function guessQuestionTagsForClue(clue: JeopardyClueData, maxTags = 8): string[] {
  const input = `${clue.category} ${clue.question} ${clue.answer}`;
  return guessQuestionTagsFromText(input, maxTags);
}
