// Loads the site's seeded thread systems into the registry before each spec file, as the page's provider does (G-132).
import { loadThreadSystems } from "@/lib/threads/thread-brands";
import { SEEDED_SYSTEMS } from "../helpers/thread-systems";

loadThreadSystems(SEEDED_SYSTEMS);
