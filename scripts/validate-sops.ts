/** `npm run validate-sops`: check data/sops.yaml + data/taxonomy.yaml without starting the app. */
import { loadSettings } from "@/lib/config";
import { loadPolicies, PolicyError } from "@/lib/sop/schema";

const { sopsPath, taxonomyPath } = loadSettings();
try {
  const { policies } = loadPolicies(sopsPath, taxonomyPath);
  console.log(`OK: ${policies.sops.length} SOPs valid`);
  for (const s of policies.sops) console.log(`  ${s.id}  ${s.severity.padEnd(8)} p${String(s.priority).padEnd(4)} ${s.category.padEnd(18)} ${s.title}`);
} catch (err) {
  console.error(err instanceof PolicyError ? err.message : err);
  process.exitCode = 1;
}
