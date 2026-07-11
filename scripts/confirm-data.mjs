/**
 * Phase 1 data + tools proof. Run: npm run confirm-data
 * Shows the tools returning REAL data from the ICAR files.
 */
import { listCrops, resolveCrop, getCropKnowledge } from "../server/tools/cropKnowledge.js";
import { getDiseaseKnowledge } from "../server/tools/diseaseKnowledge.js";
import { getKvkContact } from "../server/tools/kvk.js";
import { preloadKnowledge, knowledgeSummary } from "../server/knowledge.js";

const line = (s = "") => console.log(s);

line("=== KrishiCall data + tools proof ===\n");

line("0) PRELOAD ALL CROPS INTO MEMORY (startup step):");
const m = preloadKnowledge();
line("   " + knowledgeSummary());
line("   per-crop resident in memory:");
for (const c of m.crops.crops) {
  line(`     - ${c.name.padEnd(18)} ${String(c.files)} file(s)  ${String(c.chars).padStart(7)} chars`);
}
line(`     - General/Soil        ${m.crops.general.files} file(s)  ${String(m.crops.general.chars).padStart(7)} chars`);
line(`   disease sets in memory: ${m.diseases.crops.map((d) => d.name + "(" + d.images + " imgs)").join(", ")}`);
line(`   total chars in memory : ${m.totalCharsInMemory}`);


line("1) Crops available: " + listCrops().join(", "));

line("\n2) Crop name resolution (LLM maps messy/multilingual -> canonical; server = deterministic alias map, NO fuzzy):");
for (const q of ["moongphali", "shenga", "sarson", "til", "surajmukhi", "soyabean", "banana"]) {
  line(`   ${q.padEnd(12)} -> ${resolveCrop(q) ?? "(no match -> LLM re-asks farmer)"}`);
}

line("\n3) get_crop_knowledge('soybean'):");
const crop = getCropKnowledge("soybean");
line(`   ok=${crop.ok} crop=${crop.crop} files=${crop.files.length} generalAttached=${!!crop.general}`);
line("   first file: " + crop.files[0].name + " (" + crop.files[0].content.length + " chars)");

line("\n4) get_disease_knowledge('Sunflower') — first 400 chars:");
const dis = getDiseaseKnowledge("Sunflower");
line(`   ok=${dis.ok} files=${dis.files.length} images=${dis.images.length}`);
line("   " + dis.files[0].content.replace(/\s+/g, " ").slice(0, 400) + " ...");
line("   images: " + dis.images.map((i) => i.filename).join(", "));

line("\n5) get_disease_knowledge('Groundnut') — expected fallback:");
const dg = getDiseaseKnowledge("Groundnut");
line(`   ok=${dg.ok}  (falls back to crop knowledge pest/disease section)`);

line("\n6) get_kvk_contact:");
for (const d of ["Bengaluru Rural", "mysore", "SomewhereElse"]) {
  const k = getKvkContact(d);
  line(`   ${d.padEnd(16)} -> ${k.contact.name} | ${k.contact.phone} | matched=${k.matched}`);
}

line("\n=== proof complete ===");
