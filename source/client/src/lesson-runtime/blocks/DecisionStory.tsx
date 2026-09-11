import { useRef, useState } from "react";
import { decisionStoryParamsSchema, type DecisionStoryParams } from "@shared/decision-story";

function Story({ story, caption }: { story: DecisionStoryParams; caption: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [history, setHistory] = useState([story.start]);
  const [choice, setChoice] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [sample, setSample] = useState(false);
  const node = story.nodes.find(n => n.id === history[history.length - 1])!;
  const selected = choice === null ? null : node.choices[choice];
  const next = () => { if (!selected) return; setHistory(h => [...h, selected.next]); setChoice(null); requestAnimationFrame(() => heading.current?.focus()); };
  return <figure className="decision-story-preview" data-anim="decisionStory">
    <div className="decision-story-art" aria-hidden="true"><span>?</span><i>↙</i><i>↘</i><b>1</b><b>2</b></div>
    <div><small>Szemléltető döntési helyzet</small><h3>{story.title}</h3><figcaption>{caption}</figcaption>
      <button type="button" onClick={() => dialog.current?.showModal()}>Végigjárom a történetet</button></div>
    <dialog ref={dialog} className="decision-story" aria-label={story.title}>
      <header><strong>{story.title}</strong><button type="button" aria-label="Történet bezárása" onClick={() => dialog.current?.close()}>×</button></header>
      <section className="decision-story-content">
        <p className="decision-story-step">{history.length}. állomás · Gondolkodj, dönts, magyarázz!</p>
        <h3 ref={heading} tabIndex={-1}>{node.text}</h3>
        {node.choices.length > 0 ? <><div className="decision-story-choices">{node.choices.map((c, i) => <button key={i} type="button" aria-pressed={choice === i} disabled={choice !== null && choice !== i} onClick={() => setChoice(i)}>{c.label}</button>)}</div>
          {selected && <p className="decision-story-feedback" role="status">{selected.feedback}</p>}</> : <>
          <label>Szerinted mi a tanulság? Mondd el, vagy írd le!<textarea maxLength={1500} value={reflection} onChange={e => setReflection(e.target.value)} /></label>
          <button type="button" aria-expanded={sample} onClick={() => setSample(!sample)}>Összevetem a magyarázattal</button>
          {sample && <p className="decision-story-feedback">{node.conclusion}</p>}
        </>}
      </section>
      <footer><button type="button" onClick={() => { setHistory([story.start]); setChoice(null); setReflection(""); setSample(false); }}>Másik utat próbálok</button>
        {node.choices.length ? <button type="button" disabled={!selected} onClick={next}>Tovább</button> : <button type="button" onClick={() => dialog.current?.close()}>Vissza a leckéhez</button>}</footer>
    </dialog>
  </figure>;
}
export function DecisionStory({ params, caption }: { params: Record<string, unknown>; caption: string }) {
  const parsed = decisionStoryParamsSchema.safeParse(params);
  if (!parsed.success) return <p role="status">A történet adatai hibásak. Folytasd a lecke magyarázatával!</p>;
  return <Story key={JSON.stringify(parsed.data)} story={parsed.data} caption={caption} />;
}
