/** The 14 major food allergens (reference data, mirrored to the DB by db:seed). */
export const ALLERGENS = {
  gluten: "Cereals containing gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soy: "Soy",
  milk: "Milk",
  nuts: "Tree nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphur dioxide / sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
} as const;
export type AllergenCode = keyof typeof ALLERGENS;
