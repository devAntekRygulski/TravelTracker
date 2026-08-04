/**
 * Country-name title art shown in add-photos mode.
 * Keys are Natural Earth numeric country ids (as strings).
 */
const COUNTRY_NAME_IMAGES: Record<string, string> = {
  '840': '/country_names/usa.png',
  '124': '/country_names/canada.png',
  '484': '/country_names/mexico.png',
};

export function getCountryNameImageSrc(countryId: string): string | null {
  return COUNTRY_NAME_IMAGES[countryId] ?? null;
}
