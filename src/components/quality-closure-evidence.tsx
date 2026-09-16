"use client";

import { useEffect, useState } from "react";

type ClosureEvidence={closureId:string;eventNumber:string;closureReason:string;closedAt:string;signerName:string;signerEmail:string;signatureId:string;meaning:string;meaningText:string;signedAt:string;authenticationEventId:string;authenticationMethod:string;authenticationOutcome:string;payloadHash:string};

export function QualityClosureEvidence({eventId}:{eventId:string}){
  const [evidence,setEvidence]=useState<ClosureEvidence|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;fetch(`/api/quality/events/${eventId}/closure`,{credentials:"same-origin",cache:"no-store"}).then(async response=>({response,body:await response.json().catch(()=>null)})).then(({response,body})=>{if(!active)return;if(response.ok)setEvidence(body?.data??null);else setError(body?.error??"Unable to load closure evidence");}).catch(()=>{if(active)setError("Unable to load closure evidence");});return()=>{active=false;};},[eventId]);
  if(error)return <p role="alert">{error}</p>;
  if(!evidence)return <p>Closure evidence is not available.</p>;
  return <div className="module-section-stack" aria-label="Immutable closure and electronic signature evidence">
    <h4>Closure & electronic-signature evidence</h4>
    <p>This is read-only historical evidence for the controlled final closure.</p>
    <dl>
      <dt>Event</dt><dd>{evidence.eventNumber}</dd>
      <dt>Closure reason</dt><dd>{evidence.closureReason}</dd>
      <dt>Closed / signed at</dt><dd>{new Date(evidence.signedAt).toLocaleString()}</dd>
      <dt>Signer</dt><dd>{evidence.signerName} · {evidence.signerEmail}</dd>
      <dt>Signature meaning</dt><dd>{evidence.meaning} — {evidence.meaningText}</dd>
      <dt>Reauthentication</dt><dd>{evidence.authenticationMethod} · {evidence.authenticationOutcome}</dd>
      <dt>Signature ID</dt><dd><code>{evidence.signatureId}</code></dd>
      <dt>Authentication event ID</dt><dd><code>{evidence.authenticationEventId}</code></dd>
      <dt>Signed payload SHA-256</dt><dd><code>{evidence.payloadHash}</code></dd>
    </dl>
  </div>;
}
