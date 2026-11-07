/**
 * Hand-written place lists (countries in fi/sv/en with common inflections, and Turku-region districts and
 * archipelago places that occur in the synthetic package). Municipalities come from `municipalities.ts`,
 * generated from training-split synthetic data (see that file's header).
 */
export const COUNTRY_FORMS: readonly string[] = [
  "britannia", "britanniaan", "britanniassa", "britanniasta", "englanti", "englannissa", "englantiin", "englannista",
  "england", "storbritannien", "the uk", "uk", "united kingdom", "great britain",
  "yhdysvallat", "yhdysvalloissa", "yhdysvaltoihin", "yhdysvalloista", "usa", "usassa", "usaan", "the us", "the usa", "united states",
  "sveitsi", "sveitsissä", "sveitsiin", "sveitsistä", "switzerland", "schweiz",
  "turkki", "turkissa", "turkkiin", "turkista", "turkey", "turkiet",
  "egypti", "egyptissä", "egyptiin", "egyptistä", "egypt", "egypten",
  "thaimaa", "thaimaassa", "thaimaahan", "thaimaasta", "thailand",
  "norja", "norjassa", "norjaan", "norjasta", "norway", "norge",
  "ruotsi", "ruotsissa", "ruotsiin", "ruotsista", "sweden", "sverige",
  "espanja", "espanjassa", "espanjaan", "espanjasta", "spain", "spanien",
  "viro", "virossa", "viroon", "virosta", "estonia", "estland",
  "saksa", "saksassa", "saksaan", "saksasta", "germany", "tyskland",
  "kreikka", "kreikassa", "kreikkaan", "kreikasta", "greece", "grekland",
  "italia", "italiassa", "italiaan", "italiasta", "italy", "italien",
  "ranska", "ranskassa", "ranskaan", "ranskasta", "france", "frankrike",
  "venäjä", "venäjällä", "venäjälle", "venäjältä", "russia", "ryssland",
  "tanska", "tanskassa", "denmark", "danmark", "portugali", "portugalissa", "portugal",
  "kanariansaaret", "kanariansaarilla", "kanarialla", "canary islands", "kanarieöarna",
  "japani", "japanissa", "japan", "kiina", "kiinassa", "china", "kina", "intia", "intiassa", "india", "indien",
  "marokko", "marokossa", "morocco", "marocko", "kroatia", "kroatiassa", "croatia", "kroatien",
  "kypros", "kyproksella", "cyprus", "cypern", "malta", "maltalla", "puola", "puolassa", "poland", "polen",
];

export const DISTRICTS: readonly string[] = [
  "hirvensalo", "hirvensalossa", "hirvensaloon", "hirvensalosta",
  "ruissalo", "ruissalossa", "ruissaloon", "ruissalosta",
  "kupittaa", "kupittaalla", "kupittaan", "kupittaalle",
  "nauvo", "nauvossa", "nauvoon", "nauvosta", "nagu",
  "korppoo", "korppoossa", "korpo", "iniö", "iniössä", "houtskär", "houtskari", "houtskarissa",
  "rymättylä", "rymättylässä", "kakskerta", "kakskerrassa", "runosmäki", "runosmäessä", "varissuo", "varissuolla",
  "kemiö", "kemiössä", "dragsfjärd", "västanfjärd", "velkua", "merimasku", "askainen", "lemu",
];

/** Organisations seen as affiliation-revealing in the synthetic package (operators, banks, care providers).
 *  Derived from training-split synthetic data: optimistic on the train split. */
export const KNOWN_ORGS: readonly string[] = [
  "aurajoki regional hospital", "saaristo bank", "saarni net", "kuohu mobile", "pohjoislinja", "vire telecom",
  "southwest joint service centre", "meridian logistics",
];
