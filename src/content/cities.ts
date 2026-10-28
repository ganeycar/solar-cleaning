/**
 * Local service-area content. Each city has its own substance (local conditions,
 * typical homes, scheduling notes) rather than the same page with the name
 * swapped. Edit freely — keep claims general and accurate; do not add
 * statistics or savings figures you can't support.
 */
export interface CityContent {
  slug: string;
  name: string;
  county: string;
  headline: string;
  intro: string;
  localConditions: { title: string; body: string }[];
  schedulingNote: string;
  neighborhoodsNote: string;
}

export const CITIES: CityContent[] = [
  {
    slug: "vacaville",
    name: "Vacaville",
    county: "Solano County",
    headline: "Solar panel cleaning in Vacaville",
    intro:
      "Vacaville is our home base. We're local, so homes here get the shortest drive times and the most flexible scheduling we can offer.",
    localConditions: [
      { title: "Long, dry summers", body: "Months without rain mean dust builds up on panels with nothing to wash it off. A dry-season cleaning is the one most Vacaville homes benefit from." },
      { title: "Freeway and hillside dust", body: "Homes near the I-80 corridor and the open hillsides around town often collect road grime and fine dust faster than you'd expect." },
      { title: "Spring pollen", body: "Pollen from trees and grasslands can leave a sticky film that light rain smears rather than rinses." },
    ],
    schedulingNote: "As our launch city, Vacaville appointments are available first. Members here get first choice of dry-season dates.",
    neighborhoodsNote: "If several neighbors on your street want cleanings, ask about a neighborhood group booking — one trip, scheduled together.",
  },
  {
    slug: "fairfield",
    name: "Fairfield",
    county: "Solano County",
    headline: "Solar panel cleaning in Fairfield",
    intro:
      "Fairfield, the Solano County seat, is a short drive from our Vacaville base. We're opening appointments here as our schedule grows.",
    localConditions: [
      { title: "Delta breezes", body: "Afternoon winds through the Cordelia area and Suisun Valley carry dust and debris that settle on panels, especially on west-facing arrays." },
      { title: "Agricultural edges", body: "Homes bordering vineyards and open land in Suisun Valley and Green Valley can see heavier dust during harvest and field work." },
      { title: "Bird activity", body: "Proximity to open space and wetlands can mean more bird droppings, which block cells and don't wash away with rain." },
    ],
    schedulingNote: "Fairfield is on our expansion list. Submit a quote and we'll contact you as soon as appointments open.",
    neighborhoodsNote: "Group bookings with neighbors can help us open your area sooner.",
  },
  {
    slug: "suisun-city",
    name: "Suisun City",
    county: "Solano County",
    headline: "Solar panel cleaning in Suisun City",
    intro:
      "Suisun City sits beside one of the largest brackish marshes in the region. That setting shapes how panels get dirty here.",
    localConditions: [
      { title: "Marsh-side conditions", body: "Moist air off the Suisun Marsh can help dust and pollen stick to glass, forming a film that's harder to rinse than dry dust." },
      { title: "Birds and waterfowl", body: "Being close to wetlands and the waterfront often means more bird droppings on rooftop arrays." },
      { title: "Wind-carried debris", body: "Steady breezes move fine dust from surrounding open land onto roofs." },
    ],
    schedulingNote: "Suisun City is on our expansion list alongside Fairfield. Request a quote to be first in line.",
    neighborhoodsNote: "Townhome communities can ask about scheduling several homes in one visit.",
  },
  {
    slug: "dixon",
    name: "Dixon",
    county: "Solano County",
    headline: "Solar panel cleaning in Dixon",
    intro:
      "Dixon is surrounded by farmland, and many homes here have generous sun exposure — along with the dust that comes with an agricultural setting.",
    localConditions: [
      { title: "Farm-season dust", body: "Plowing and harvest seasons can coat panels in fine soil quickly, sometimes within weeks." },
      { title: "Hot, dry summers", body: "Little summer rain means dust accumulates through the season with nothing to rinse it." },
      { title: "Larger and ground-mounted arrays", body: "Rural and edge-of-town properties sometimes have ground-mounted systems. These are often easier to clean safely, and we quote them individually." },
    ],
    schedulingNote: "Dixon is on our expansion list. We'll open appointments as our route capacity grows.",
    neighborhoodsNote: "Ag and ranch properties with larger systems can request a site visit through our commercial form.",
  },
  {
    slug: "winters",
    name: "Winters",
    county: "Yolo County",
    headline: "Solar panel cleaning in Winters",
    intro:
      "Winters is a small, agricultural town along Putah Creek. Orchards and open land are part of daily life, and so is the dust they bring to rooftops.",
    localConditions: [
      { title: "Orchard and field dust", body: "Orchard work, harvest, and nearby field activity can leave a noticeable layer on panels." },
      { title: "Trees and pollen", body: "Mature trees around many homes drop pollen, leaves, and sap that can stick to glass." },
      { title: "Rural properties", body: "Larger lots sometimes mean longer hose runs or ground-mounted arrays — tell us about yours in the quote form." },
    ],
    schedulingNote: "Winters is on our expansion list. Travel to Winters may include a travel fee, shown in your quote once pricing is published.",
    neighborhoodsNote: "Neighbors booking together can reduce travel and help us schedule your area sooner.",
  },
  {
    slug: "davis",
    name: "Davis",
    county: "Yolo County",
    headline: "Solar panel cleaning in Davis",
    intro:
      "Davis is a bike-friendly, sustainability-minded city with plenty of rooftop solar. Its tree-lined streets and nearby farmland each affect how panels get dirty.",
    localConditions: [
      { title: "Mature street trees", body: "Shade trees are a Davis signature, but leaves, pollen, and sap can collect on arrays beneath them." },
      { title: "Surrounding farmland", body: "Dust from the agricultural land around the city can drift onto roofs, especially in late summer and fall." },
      { title: "Older and varied roofs", body: "Davis has a wide mix of home ages and roof types. If your roof is tile or you're not sure, we'll review access before quoting." },
    ],
    schedulingNote: "Davis is on our expansion list. Request a quote and we'll reach out as appointments open.",
    neighborhoodsNote: "Co-ops, HOAs, and neighbors can request a group booking.",
  },
];

export function getCity(slug: string): CityContent | undefined {
  return CITIES.find((c) => c.slug === slug);
}
