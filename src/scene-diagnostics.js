/**
 * User-visible renderer diagnostics for mobile browsers.
 * An exception during scene setup is not proof WebGL is unsupported.
 * No private world snapshot, user-agent fingerprint or credentials are included.
 */
export function describeSceneFailure(error,stage='initialization'){
  const name=String(error?.name||'Error').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,48)||'Error';
  const raw=String(error?.message||error||'Unknown renderer failure');
  const message=raw.replace(/[\r\n\t]+/g,' ').slice(0,260);
  const webgl=/webgl|webglrenderer|unable to create.*context|context lost|graphics context/i.test(message);
  const step=String(stage).replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,40)||'initialization';
  return {
    code:webgl?'MW3D-WEBGL':'MW3D-RUNTIME',
    title:webgl?'Prohlížeč nemohl vytvořit 3D grafický kontext':
      'Při vykreslování světa nastala chyba aplikace',
    detail:message,
    diagnostic:`${step} · ${name}: ${message}`,
    hint:webgl?'Zkus otevřít stránku přímo v Chrome a ověřit povolenou grafickou akceleraci.':
      'Svět na serveru běží dál; tato chyba se týká pouze 3D zobrazení.'
  };
}
