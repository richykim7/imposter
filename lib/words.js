/**
 * Offline word packs — used when no LLM API key is set, or the API fails.
 * Keys are matched as substrings (case-insensitive) of the user's category.
 * Lookup order: most specific first; falls back to GENERIC.
 */

const PACKS = {
  countries: [
    'France', 'Japan', 'Brazil', 'Egypt', 'Canada', 'Australia', 'Mexico',
    'India', 'Germany', 'Italy', 'South Korea', 'Argentina', 'Norway',
    'Thailand', 'Kenya', 'Greece', 'Vietnam', 'Spain', 'Portugal', 'Iceland',
    'Morocco', 'Peru', 'Sweden', 'Turkey', 'Chile', 'Finland', 'Indonesia',
    'New Zealand', 'Switzerland', 'Singapore'
  ],
  cities: [
    'Paris', 'Tokyo', 'New York', 'London', 'Sydney', 'Cairo', 'Berlin',
    'Mumbai', 'Toronto', 'Rome', 'Buenos Aires', 'Cape Town', 'Bangkok',
    'Istanbul', 'Rio de Janeiro', 'Seoul', 'Barcelona', 'Lisbon', 'Reykjavik',
    'Marrakech', 'Lima', 'Stockholm', 'Athens', 'Hanoi', 'Vancouver',
    'Dubai', 'Mexico City', 'Prague', 'Amsterdam', 'Singapore'
  ],
  animals: [
    'Elephant', 'Tiger', 'Penguin', 'Kangaroo', 'Dolphin', 'Octopus', 'Eagle',
    'Giraffe', 'Wolf', 'Owl', 'Panda', 'Bear', 'Shark', 'Crocodile', 'Cheetah',
    'Koala', 'Hedgehog', 'Otter', 'Flamingo', 'Walrus', 'Lemur', 'Sloth',
    'Hippopotamus', 'Rhinoceros', 'Squirrel', 'Raccoon', 'Falcon', 'Lobster',
    'Jellyfish', 'Hummingbird'
  ],
  movies: [
    'The Matrix', 'Titanic', 'Inception', 'Forrest Gump', 'Jaws', 'Pulp Fiction',
    'The Godfather', 'Star Wars', 'Avatar', 'Jurassic Park', 'The Lion King',
    'Frozen', 'Toy Story', 'Spirited Away', 'Parasite', 'Gladiator',
    'The Dark Knight', 'Interstellar', 'Goodfellas', 'Shrek', 'Up',
    'Casablanca', 'Rocky', 'Fight Club', 'The Shining', 'Alien',
    'Back to the Future', 'The Departed', 'La La Land', 'Whiplash'
  ],
  food: [
    'Pizza', 'Sushi', 'Tacos', 'Pasta', 'Ramen', 'Burger', 'Curry', 'Pho',
    'Dumplings', 'Croissant', 'Pad Thai', 'Risotto', 'Lasagna', 'Paella',
    'Pancakes', 'Falafel', 'Ceviche', 'Gnocchi', 'Tiramisu', 'Bibimbap',
    'Empanadas', 'Gyoza', 'Hummus', 'Kimchi', 'Pierogi', 'Fondue',
    'Baklava', 'Crepes', 'Sashimi', 'Tortellini'
  ],
  sports: [
    'Soccer', 'Basketball', 'Tennis', 'Baseball', 'Cricket', 'Rugby', 'Hockey',
    'Volleyball', 'Golf', 'Swimming', 'Boxing', 'Surfing', 'Skiing',
    'Snowboarding', 'Skateboarding', 'Cycling', 'Climbing', 'Fencing',
    'Archery', 'Badminton', 'Table Tennis', 'Rowing', 'Wrestling', 'Judo',
    'Karate', 'Gymnastics', 'Marathon', 'Triathlon', 'Equestrian', 'Polo'
  ],
  fruits: [
    'Apple', 'Banana', 'Mango', 'Pineapple', 'Strawberry', 'Watermelon',
    'Orange', 'Peach', 'Pear', 'Cherry', 'Grape', 'Kiwi', 'Pomegranate',
    'Papaya', 'Lychee', 'Fig', 'Plum', 'Apricot', 'Coconut', 'Blueberry',
    'Raspberry', 'Blackberry', 'Cranberry', 'Dragon fruit', 'Passion fruit',
    'Guava', 'Persimmon', 'Star fruit', 'Durian', 'Jackfruit'
  ],
  vegetables: [
    'Carrot', 'Broccoli', 'Spinach', 'Tomato', 'Cucumber', 'Potato', 'Onion',
    'Bell Pepper', 'Eggplant', 'Zucchini', 'Cauliflower', 'Cabbage', 'Lettuce',
    'Kale', 'Asparagus', 'Celery', 'Mushroom', 'Garlic', 'Sweet Potato',
    'Pumpkin', 'Beet', 'Radish', 'Leek', 'Artichoke', 'Brussels Sprout',
    'Okra', 'Turnip', 'Parsnip', 'Fennel', 'Bok Choy'
  ],
  professions: [
    'Doctor', 'Teacher', 'Engineer', 'Chef', 'Artist', 'Lawyer', 'Pilot',
    'Astronaut', 'Firefighter', 'Police Officer', 'Nurse', 'Architect',
    'Carpenter', 'Plumber', 'Electrician', 'Journalist', 'Photographer',
    'Musician', 'Actor', 'Writer', 'Scientist', 'Veterinarian', 'Dentist',
    'Pharmacist', 'Farmer', 'Mechanic', 'Baker', 'Barber', 'Detective', 'Sailor'
  ],
  colors: [
    'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Turquoise',
    'Magenta', 'Maroon', 'Beige', 'Lavender', 'Teal', 'Crimson', 'Indigo',
    'Coral', 'Salmon', 'Olive', 'Mint', 'Mustard', 'Navy', 'Charcoal',
    'Ivory', 'Peach', 'Burgundy', 'Periwinkle', 'Mauve', 'Chartreuse',
    'Vermillion', 'Cyan'
  ],
  instruments: [
    'Piano', 'Guitar', 'Violin', 'Drums', 'Trumpet', 'Saxophone', 'Flute',
    'Cello', 'Clarinet', 'Harp', 'Accordion', 'Banjo', 'Mandolin', 'Ukulele',
    'Harmonica', 'Trombone', 'Oboe', 'Bassoon', 'Tuba', 'Xylophone',
    'Sitar', 'Bagpipes', 'Didgeridoo', 'Marimba', 'Theremin', 'Synthesizer',
    'Double Bass', 'French Horn', 'Bongos', 'Tambourine'
  ],
  drinks: [
    'Coffee', 'Tea', 'Lemonade', 'Cola', 'Orange Juice', 'Smoothie',
    'Milkshake', 'Hot Chocolate', 'Iced Tea', 'Latte', 'Cappuccino',
    'Espresso', 'Champagne', 'Margarita', 'Mojito', 'Sangria', 'Whiskey',
    'Beer', 'Wine', 'Cider', 'Kombucha', 'Matcha', 'Chai', 'Bubble Tea',
    'Eggnog', 'Hot Toddy', 'Sake', 'Pina Colada', 'Mai Tai', 'Bloody Mary'
  ]
};

const GENERIC = [
  'Sunflower', 'Telescope', 'Orchestra', 'Lightning', 'Compass', 'Mountain',
  'Rainbow', 'Volcano', 'Library', 'Castle', 'Pyramid', 'Lighthouse',
  'Tornado', 'Glacier', 'Comet', 'Galaxy', 'Garden', 'Festival', 'Carnival',
  'Treasure', 'Bonfire', 'Meadow', 'Forest', 'Desert', 'Ocean', 'River',
  'Bridge', 'Tunnel', 'Fountain', 'Statue'
];

function pickPackForCategory(category) {
  const c = (category || '').toLowerCase();
  for (const key of Object.keys(PACKS)) {
    if (c.includes(key)) return PACKS[key];
    // common singular/plural variants
    if (key.endsWith('s') && c.includes(key.slice(0, -1))) return PACKS[key];
  }
  // some common synonyms
  if (c.includes('country') || c.includes('nation')) return PACKS.countries;
  if (c.includes('city') || c.includes('capital')) return PACKS.cities;
  if (c.includes('animal') || c.includes('mammal') || c.includes('creature')) return PACKS.animals;
  if (c.includes('film') || c.includes('movie')) return PACKS.movies;
  if (c.includes('dish') || c.includes('meal') || c.includes('cuisine')) return PACKS.food;
  if (c.includes('sport') || c.includes('game')) return PACKS.sports;
  if (c.includes('drink') || c.includes('beverage') || c.includes('cocktail')) return PACKS.drinks;
  if (c.includes('job') || c.includes('career') || c.includes('occupation')) return PACKS.professions;
  if (c.includes('color') || c.includes('colour')) return PACKS.colors;
  if (c.includes('instrument') || c.includes('music')) return PACKS.instruments;
  return GENERIC;
}

module.exports = { PACKS, GENERIC, pickPackForCategory };
