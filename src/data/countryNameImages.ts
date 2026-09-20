/**
 * Country-name title art shown in add-photos mode.
 * Keys are Natural Earth numeric country ids (as strings).
 */
const COUNTRY_NAME_IMAGES: Record<string, string> = {
  '840': '/country_names/usa.png',
  '124': '/country_names/canada.png',
  '484': '/country_names/mexico.png',
  '084': '/country_names/belize.png',
  '250': '/country_names/france.png',
  '304': '/country_names/greenland.png',
  '320': '/country_names/guatemala.png',
  '340': '/country_names/honduras.png',
  '352': '/country_names/iceland.png',
  '620': '/country_names/portugal.png',
  '724': '/country_names/spain.png',
  '826': '/country_names/unitedkingdom.png',
};

export function getCountryNameImageSrc(countryId: string): string | null {
  return COUNTRY_NAME_IMAGES[countryId] ?? null;
}
