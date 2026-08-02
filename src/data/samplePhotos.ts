export type SamplePhoto = {
  id: string;
  src: string;
  alt: string;
};

/** Placeholder trip photos shown behind the first-upload blur overlay. */
export const SAMPLE_PHOTOS: SamplePhoto[] = [
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
    id: 'food',
    src: '/sample-photos/food.jpg',
    alt: 'Local meal on a table',
  },
  {
    id: 'desert',
    src: '/sample-photos/desert.jpg',
    alt: 'Desert landscape',
  },
  {
    id: 'road',
    src: '/sample-photos/road.jpg',
    alt: 'Open road trip',
  },
  {
    id: 'waterfall',
    src: '/sample-photos/waterfall-3.jpg',
    alt: 'Waterfall in nature',
  },
];
