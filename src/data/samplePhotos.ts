export type SamplePhoto = {
  id: string;
  src: string;
  alt: string;
};

/** Placeholder trip photos shown for every country in add-photos mode. */
export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: 'waterfall',
    src: '/sample-photos/waterfall-3.jpg',
    alt: 'Waterfall in nature',
  },
  {
    id: 'forest',
    src: '/sample-photos/forest.jpg',
    alt: 'Sunlight through a forest',
  },
  {
    id: 'mountain',
    src: '/sample-photos/mountain.jpg',
    alt: 'Snowy mountain peaks',
  },
  {
    id: 'beach',
    src: '/sample-photos/beach.jpg',
    alt: 'Sandy beach shoreline',
  },
  {
    id: 'road',
    src: '/sample-photos/road.jpg',
    alt: 'Open road through hills',
  },
  {
    id: 'food',
    src: '/sample-photos/food.jpg',
    alt: 'Local meal on a table',
  },
  {
    id: 'desert',
    src: '/sample-photos/desert.jpg',
    alt: 'Sand dunes in a desert',
  },
];
