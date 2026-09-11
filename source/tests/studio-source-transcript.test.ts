import assert from "node:assert/strict";
import test from "node:test";
import { conceptSchema } from "../shared/knowledge-map-schema";
import { attachSourceTranscripts, checkSourceQuotes, repairSourceQuotes } from "../server/studio/source-transcript";
import { scopeContentParts } from "../server/studio/one-step";

const exact = "Összeköti egymással a növény szerveit, szállítja közöttük a tápanyagokat.";
const paraphrase = "Összeköti egymással a növény szerveit, és szállítja közöttük a tápanyagokat.";
const files = attachSourceTranscripts([{name:"plant.jpg",kind:"image",content:"data:image/jpeg;base64,AA=="}], [{name:"plant.jpg",text:exact}]);
const concept = conceptSchema.parse({ id:"stem",term:"szár",definition:exact,quote:paraphrase,sourceRef:{file:"plant.jpg"},type:"fact",examWeight:"core" });

test("a kivonatoló ugyanazt a képátiratot kapja, mint az idézetellenőr", async () => {
  assert.deepEqual(await scopeContentParts(files), [{type:"text",text:exact}]);
  assert.equal(checkSourceQuotes([concept], files)[0].verbatimOk,false);
  const checked = await repairSourceQuotes([concept], files, async failed => {
    assert.deepEqual(failed.map(c=>c.id), ["stem"]);
    return [{id:"stem",quote:exact,definition:"Nem írható felül",examWeight:"extra"}];
  });
  assert.equal(checked[0].verbatimOk,true);
  assert.equal(checked[0].quote,exact);
  assert.equal(checked[0].definition,exact);
  assert.equal(checked[0].examWeight,"core");
});

test("nem kap engedélyt másik fájlból vett vagy kitalált idézet; két javítás után pending marad", async () => {
  let attempts=0;
  const checked=await repairSourceQuotes([concept], [...files,{name:"other.txt",kind:"text",content:paraphrase,extractedText:paraphrase}], async ()=>{
    attempts++; return [{id:"stem",quote:paraphrase,sourceRef:{file:"other.txt"}}];
  });
  assert.equal(attempts,2);
  assert.equal(checked[0].verbatimOk,false);
  assert.equal(checked[0].sourceRef.file,"plant.jpg");
});

test("pontos idézetért nincs új modellhívás; duplikált ID nem javíthat", async()=>{
  const good={...concept,quote:exact};
  const result=await repairSourceQuotes([good],files,async()=>{throw new Error("Unexpected paid call");});
  assert.equal(result[0].verbatimOk,true);
  const duplicate=await repairSourceQuotes([concept],files,async()=>[{id:"stem",quote:exact},{id:"stem",quote:exact}]);
  assert.equal(duplicate[0].verbatimOk,false);
});

test("üres vagy hiányzó képátirat nem indíthat kivonatolást", ()=>{
  assert.throws(()=>attachSourceTranscripts([{name:"missing.jpg",kind:"image",content:"data:image/jpeg;base64,AA=="}],[]), /átirata hiányzik/);
  assert.throws(()=>attachSourceTranscripts([{name:"binary.pdf",kind:"pdf",content:"data:application/pdf;base64,AA=="}],[]), /átirata hiányzik/);
  assert.equal(attachSourceTranscripts([{name:"book.txt",kind:"text",content:exact}],[])[0].extractedText,exact);
});

test("egy modellhiba nem jelent sikeres javítást", async()=>{
  await assert.rejects(repairSourceQuotes([concept],files,async()=>{throw new Error("provider failed");}),/provider failed/);
});
